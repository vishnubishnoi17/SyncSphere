import { query } from '../db';

export interface SyncOperation {
  id: string;
  noteId?: string;
  operationType: 'create' | 'update' | 'delete' | 'restore';
  payload: Record<string, unknown>;
  timestamp: string;
  deviceId: string;
  clientVersion?: number;
}

export interface SyncRequest {
  deviceId?: string;
  lastSyncAt: string | null;
  operations: SyncOperation[];
}

export interface SyncResult {
  appliedOps: string[];
  conflictedOps: { opId: string; conflict: string; resolvedNote?: unknown }[];
  serverChanges: unknown[];
  newSyncAt: string;
}

export const processSync = async (userId: string, req: SyncRequest): Promise<SyncResult> => {
  if (!req.deviceId) {
    throw new Error('Device id is required for sync');
  }

  const appliedOps: string[] = [];
  const conflictedOps: SyncResult['conflictedOps'] = [];
  const newSyncAt = new Date().toISOString();

  for (const op of req.operations) {
    try {
      if (op.operationType === 'create') {
        await applyCreateOp(userId, req.deviceId, op);
        appliedOps.push(op.id);
      } else if (op.operationType === 'update') {
        const result = await applyUpdateOp(userId, req.deviceId, op);
        if (result.conflict) {
          conflictedOps.push({ opId: op.id, conflict: 'version_mismatch', resolvedNote: result.note });
        } else {
          appliedOps.push(op.id);
        }
      } else if (op.operationType === 'delete') {
        await applyDeleteOp(userId, req.deviceId, op);
        appliedOps.push(op.id);
      } else if (op.operationType === 'restore') {
        await applyRestoreOp(userId, req.deviceId, op);
        appliedOps.push(op.id);
      }
    } catch (err) {
      conflictedOps.push({ opId: op.id, conflict: (err as Error).message });
    }
  }

  const serverChanges = await getServerChangesSince(userId, req.lastSyncAt);
  await upsertSyncState(userId, req.deviceId, newSyncAt);

  return { appliedOps, conflictedOps, serverChanges, newSyncAt };
};

const applyCreateOp = async (userId: string, deviceId: string, op: SyncOperation) => {
  const p = op.payload;
  const existing = await query('SELECT user_id FROM notes WHERE id = $1', [op.noteId || op.id]);
  if (existing.rows.length > 0) {
    if (existing.rows[0].user_id === userId) return; // idempotent replay from the same account
    throw new Error('Note id already exists');
  }
  const folderId = Object.prototype.hasOwnProperty.call(p, 'folderId')
    ? (p.folderId as string | null)
    : Object.prototype.hasOwnProperty.call(p, 'folder_id')
      ? (p.folder_id as string | null)
      : null;
  const isStarred = (p.isStarred as boolean | undefined) ?? (p.is_starred as boolean | undefined) ?? false;
  const isPinned = (p.isPinned as boolean | undefined) ?? (p.is_pinned as boolean | undefined) ?? false;

  await query(
    `INSERT INTO notes (id, user_id, folder_id, title, content, tags, is_starred, is_pinned, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      op.noteId || op.id,
      userId,
      folderId || null,
      (p.title as string) || 'Untitled',
      (p.content as string) || '',
      (p.tags as string[]) || [],
      isStarred,
      isPinned,
    ]
  );

  await query(
    `INSERT INTO operations (note_id, user_id, device_id, operation_type, payload, result_version, applied_at)
     VALUES ($1, $2, $3, 'create', $4, 1, NOW())`,
    [op.noteId || op.id, userId, deviceId, JSON.stringify(op.payload)]
  );
};

const applyUpdateOp = async (userId: string, deviceId: string, op: SyncOperation) => {
  const p = op.payload;

  const current = await query('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [op.noteId, userId]);
  if (current.rows.length === 0) {
    await applyCreateOp(userId, deviceId, { ...op, operationType: 'create' });
    return { conflict: false, note: null };
  }

  const serverNote = current.rows[0];
  const conflict = op.clientVersion !== undefined && op.clientVersion < serverNote.version;

  const mergedTitle = (p.title as string) ?? serverNote.title;
  const mergedContent = (p.content as string) ?? serverNote.content;
  const mergedTags = (p.tags as string[]) ?? serverNote.tags;
  const isStarred = (p.isStarred as boolean | undefined) ?? (p.is_starred as boolean | undefined) ?? null;
  const isPinned = (p.isPinned as boolean | undefined) ?? (p.is_pinned as boolean | undefined) ?? null;
  const hasFolderId = Object.prototype.hasOwnProperty.call(p, 'folderId') || Object.prototype.hasOwnProperty.call(p, 'folder_id');
  const folderId = Object.prototype.hasOwnProperty.call(p, 'folderId')
    ? (p.folderId as string | null)
    : (p.folder_id as string | null | undefined);

  const result = await query(
    `UPDATE notes
     SET title = $1, content = $2, tags = $3,
         is_starred = COALESCE($4, is_starred),
         is_pinned  = COALESCE($5, is_pinned),
         folder_id  = CASE WHEN $6::boolean THEN $7::uuid ELSE folder_id END,
         version    = version + 1,
         updated_at = NOW()
     WHERE id = $8 AND user_id = $9
     RETURNING *`,
    [
      mergedTitle,
      mergedContent,
      mergedTags,
      isStarred,
      isPinned,
      hasFolderId,
      folderId || null,
      op.noteId,
      userId,
    ]
  );

  await query(
    `INSERT INTO operations (note_id, user_id, device_id, operation_type, payload, base_version, result_version, conflict, applied_at)
     VALUES ($1, $2, $3, 'update', $4, $5, $6, $7, NOW())`,
    [op.noteId, userId, deviceId, JSON.stringify(p), op.clientVersion, result.rows[0]?.version, conflict]
  );

  return { conflict, note: result.rows[0] };
};

const applyDeleteOp = async (userId: string, deviceId: string, op: SyncOperation) => {
  const result = await query(
    `UPDATE notes SET deleted = TRUE, deleted_at = NOW(), version = version + 1
     WHERE id = $1 AND user_id = $2
     RETURNING version`,
    [op.noteId, userId]
  );
  if (result.rows.length === 0) throw new Error('Note not found');

  await query(
    `INSERT INTO operations (note_id, user_id, device_id, operation_type, payload, base_version, result_version, applied_at)
     VALUES ($1, $2, $3, 'delete', $4, $5, $6, NOW())`,
    [op.noteId, userId, deviceId, JSON.stringify(op.payload || {}), op.clientVersion ?? null, result.rows[0].version]
  );
};

const applyRestoreOp = async (userId: string, deviceId: string, op: SyncOperation) => {
  const result = await query(
    `UPDATE notes SET deleted = FALSE, deleted_at = NULL, version = version + 1
     WHERE id = $1 AND user_id = $2
     RETURNING version`,
    [op.noteId, userId]
  );
  if (result.rows.length === 0) throw new Error('Note not found');

  await query(
    `INSERT INTO operations (note_id, user_id, device_id, operation_type, payload, base_version, result_version, applied_at)
     VALUES ($1, $2, $3, 'restore', $4, $5, $6, NOW())`,
    [op.noteId, userId, deviceId, JSON.stringify(op.payload || {}), op.clientVersion ?? null, result.rows[0].version]
  );
};

const getServerChangesSince = async (userId: string, lastSyncAt: string | null) => {
  if (!lastSyncAt) {
    const result = await query(
      `SELECT n.*, f.name as folder_name, f.color as folder_color
       FROM notes n LEFT JOIN folders f ON n.folder_id = f.id
       WHERE n.user_id = $1 ORDER BY n.updated_at DESC`,
      [userId]
    );
    return result.rows;
  }

  const result = await query(
    `SELECT n.*, f.name as folder_name, f.color as folder_color
     FROM notes n LEFT JOIN folders f ON n.folder_id = f.id
     WHERE n.user_id = $1 AND n.updated_at > $2
     ORDER BY n.updated_at DESC`,
    [userId, lastSyncAt]
  );
  return result.rows;
};

const upsertSyncState = async (userId: string, deviceId: string, syncAt: string) => {
  await query(
    `INSERT INTO sync_state (user_id, device_id, last_sync_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, device_id) DO UPDATE SET last_sync_at = $3`,
    [userId, deviceId, syncAt]
  );
};

export const getOperationHistory = async (noteId: string, userId: string) => {
  const result = await query(
    `SELECT o.*, d.device_name
     FROM operations o
     LEFT JOIN devices d ON o.device_id = d.id
     WHERE o.note_id = $1 AND o.user_id = $2
     ORDER BY o.timestamp DESC LIMIT 50`,
    [noteId, userId]
  );
  return result.rows;
};

export const getSyncStatus = async (userId: string) => {
  const devicesResult = await query(
    `SELECT d.id, d.device_name, d.device_type, d.last_seen,
            ss.last_sync_at, ss.pending_ops_count
     FROM devices d
     LEFT JOIN sync_state ss ON d.id = ss.device_id AND ss.user_id = d.user_id
     WHERE d.user_id = $1 ORDER BY d.last_seen DESC`,
    [userId]
  );

  const conflictsResult = await query(
    `SELECT COUNT(*) as count FROM operations WHERE user_id = $1 AND conflict = TRUE`,
    [userId]
  );

  return {
    devices: devicesResult.rows,
    totalConflicts: parseInt(conflictsResult.rows[0].count, 10),
  };
};
