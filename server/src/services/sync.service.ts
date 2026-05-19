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
  deviceId: string;
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
        await applyRestoreOp(userId, op);
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
  const existing = await query('SELECT id FROM notes WHERE id = $1', [op.noteId || op.id]);
  if (existing.rows.length > 0) return; // idempotent

  await query(
    `INSERT INTO notes (id, user_id, folder_id, title, content, tags, version)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      op.noteId || op.id,
      userId,
      (p.folderId as string) || null,
      (p.title as string) || 'Untitled',
      (p.content as string) || '',
      (p.tags as string[]) || [],
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
  const folderId = (p.folderId as string | null | undefined) ?? (p.folder_id as string | null | undefined) ?? null;

  const result = await query(
    `UPDATE notes
     SET title = $1, content = $2, tags = $3,
         is_starred = COALESCE($4, is_starred),
         is_pinned  = COALESCE($5, is_pinned),
         folder_id  = COALESCE($6, folder_id),
         version    = version + 1,
         updated_at = NOW()
     WHERE id = $7 AND user_id = $8
     RETURNING *`,
    [
      mergedTitle,
      mergedContent,
      mergedTags,
      isStarred,
      isPinned,
      folderId,
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

const applyDeleteOp = async (userId: string, _deviceId: string, op: SyncOperation) => {
  await query(
    `UPDATE notes SET deleted = TRUE, deleted_at = NOW(), version = version + 1
     WHERE id = $1 AND user_id = $2`,
    [op.noteId, userId]
  );
};

const applyRestoreOp = async (userId: string, op: SyncOperation) => {
  await query(
    `UPDATE notes SET deleted = FALSE, deleted_at = NULL, version = version + 1
     WHERE id = $1 AND user_id = $2`,
    [op.noteId, userId]
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
