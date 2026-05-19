import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';

export interface CreateNoteInput {
  title?: string;
  content?: string;
  folderId?: string;
  tags?: string[];
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  folderId?: string | null;
  folder_id?: string | null;
  tags?: string[];
  isStarred?: boolean;
  is_starred?: boolean;
  isPinned?: boolean;
  is_pinned?: boolean;
}

export const getNotes = async (userId: string, includeDeleted = false) => {
  const sql = `
    SELECT n.*, f.name as folder_name, f.color as folder_color
    FROM notes n
    LEFT JOIN folders f ON n.folder_id = f.id
    WHERE n.user_id = $1 ${includeDeleted ? '' : 'AND n.deleted = FALSE'}
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `;
  const result = await query(sql, [userId]);
  return result.rows;
};

export const getNoteById = async (noteId: string, userId: string) => {
  const result = await query(
    `SELECT n.*, f.name as folder_name, f.color as folder_color
     FROM notes n
     LEFT JOIN folders f ON n.folder_id = f.id
     WHERE n.id = $1 AND n.user_id = $2`,
    [noteId, userId]
  );
  return result.rows[0] || null;
};

export const createNote = async (
  userId: string,
  deviceId: string | undefined,
  input: CreateNoteInput
) => {
  const id = uuidv4();
  const result = await query(
    `INSERT INTO notes (id, user_id, folder_id, title, content, tags, version)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     RETURNING *`,
    [id, userId, input.folderId || null, input.title || 'Untitled', input.content || '', input.tags || []]
  );
  const note = result.rows[0];

  await logOperation({ noteId: note.id, userId, deviceId, operationType: 'create', payload: input, baseVersion: 0, resultVersion: 1 });
  return note;
};

export const updateNote = async (
  noteId: string,
  userId: string,
  deviceId: string | undefined,
  input: UpdateNoteInput,
  clientVersion?: number
) => {
  const current = await getNoteById(noteId, userId);
  if (!current) throw new Error('Note not found');
  if (current.deleted) throw new Error('Cannot edit deleted note');

  const conflict = clientVersion !== undefined && clientVersion < current.version;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.title !== undefined) { updates.push(`title = $${idx++}`); values.push(input.title); }
  if (input.content !== undefined) { updates.push(`content = $${idx++}`); values.push(input.content); }
  const folderId = input.folderId ?? input.folder_id;
  const isStarred = input.isStarred ?? input.is_starred;
  const isPinned = input.isPinned ?? input.is_pinned;

  if (folderId !== undefined) { updates.push(`folder_id = $${idx++}`); values.push(folderId || null); }
  if (input.tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(input.tags); }
  if (isStarred !== undefined) { updates.push(`is_starred = $${idx++}`); values.push(isStarred); }
  if (isPinned !== undefined) { updates.push(`is_pinned = $${idx++}`); values.push(isPinned); }

  updates.push(`version = version + 1`);
  updates.push(`updated_at = NOW()`);
  values.push(noteId, userId);

  const result = await query(
    `UPDATE notes SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );
  const updated = result.rows[0];

  await logOperation({
    noteId,
    userId,
    deviceId,
    operationType: 'update',
    payload: input,
    baseVersion: clientVersion ?? current.version,
    resultVersion: updated.version,
    conflict,
  });

  return { note: updated, conflict };
};

export const deleteNote = async (noteId: string, userId: string, deviceId?: string) => {
  const result = await query(
    `UPDATE notes SET deleted = TRUE, deleted_at = NOW(), version = version + 1
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [noteId, userId]
  );
  if (result.rows.length === 0) throw new Error('Note not found');

  await logOperation({
    noteId,
    userId,
    deviceId,
    operationType: 'delete',
    payload: {},
    baseVersion: result.rows[0].version - 1,
    resultVersion: result.rows[0].version,
  });

  return result.rows[0];
};

export const restoreNote = async (noteId: string, userId: string) => {
  const result = await query(
    `UPDATE notes SET deleted = FALSE, deleted_at = NULL, version = version + 1
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [noteId, userId]
  );
  return result.rows[0];
};

export const searchNotes = async (userId: string, q: string) => {
  const result = await query(
    `SELECT * FROM notes
     WHERE user_id = $1 AND deleted = FALSE
       AND (title ILIKE $2 OR content ILIKE $2)
     ORDER BY updated_at DESC LIMIT 50`,
    [userId, `%${q}%`]
  );
  return result.rows;
};

export const getFolders = async (userId: string) => {
  const result = await query(
    'SELECT * FROM folders WHERE user_id = $1 AND deleted = FALSE ORDER BY name',
    [userId]
  );
  return result.rows;
};

export const createFolder = async (userId: string, name: string, color?: string) => {
  const result = await query(
    'INSERT INTO folders (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
    [userId, name, color || '#6366f1']
  );
  return result.rows[0];
};

export const deleteFolder = async (folderId: string, userId: string) => {
  await query('UPDATE notes SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2', [folderId, userId]);
  await query('UPDATE folders SET deleted = TRUE WHERE id = $1 AND user_id = $2', [folderId, userId]);
};

// --- Internal ---
interface LogOperationInput {
  noteId: string;
  userId: string;
  deviceId?: string;
  operationType: string;
  payload: unknown;
  baseVersion?: number;
  resultVersion?: number;
  conflict?: boolean;
}

const logOperation = async (input: LogOperationInput) => {
  await query(
    `INSERT INTO operations (note_id, user_id, device_id, operation_type, payload, base_version, result_version, conflict, applied_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      input.noteId,
      input.userId,
      input.deviceId || null,
      input.operationType,
      JSON.stringify(input.payload),
      input.baseVersion ?? null,
      input.resultVersion ?? null,
      input.conflict ?? false,
    ]
  );
};
