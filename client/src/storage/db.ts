import Dexie, { Table } from 'dexie';
import type { Note, PendingOperation, Folder } from '../types';

export interface LocalSyncMeta {
  key: string;       // 'lastSyncAt' | 'deviceId' | ...
  value: string;
}

class SyncSphereDB extends Dexie {
  notes!: Table<Note, string>;
  pendingOps!: Table<PendingOperation, string>;
  folders!: Table<Folder, string>;
  syncMeta!: Table<LocalSyncMeta, string>;

  constructor() {
    super('SyncSphereDB');

    this.version(1).stores({
      notes: 'id, user_id, folder_id, updated_at, is_starred, is_pinned, deleted, _syncStatus',
      pendingOps: 'id, noteId, operationType, createdAt, retryCount',
      folders: 'id, user_id, name',
      syncMeta: 'key',
    });
  }
}

export const db = new SyncSphereDB();

// --- Meta helpers ---
export const getSyncMeta = async (key: string): Promise<string | null> => {
  const row = await db.syncMeta.get(key);
  return row?.value ?? null;
};

export const setSyncMeta = async (key: string, value: string): Promise<void> => {
  await db.syncMeta.put({ key, value });
};

// --- Note helpers ---
export const upsertNote = async (note: Note): Promise<void> => {
  const existing = await db.notes.get(note.id);
  // Don't overwrite a locally dirty note with a stale server version
  if (existing?._isDirty && existing.version >= note.version) return;
  await db.notes.put({ ...note, _syncStatus: 'synced', _isDirty: false });
};

export const upsertNotes = async (notes: Note[]): Promise<void> => {
  await db.transaction('rw', db.notes, async () => {
    for (const note of notes) {
      await upsertNote(note);
    }
  });
};

export const markNoteDirty = async (noteId: string): Promise<void> => {
  await db.notes.update(noteId, { _isDirty: true, _syncStatus: 'pending' });
};

export const markNoteConflict = async (noteId: string): Promise<void> => {
  await db.notes.update(noteId, { _syncStatus: 'conflict' });
};

export const markNoteSynced = async (noteId: string): Promise<void> => {
  await db.notes.update(noteId, { _isDirty: false, _syncStatus: 'synced' });
};

// --- Pending operation helpers ---
export const enqueueOperation = async (op: Omit<PendingOperation, 'retryCount'>): Promise<void> => {
  await db.pendingOps.put({ ...op, retryCount: 0 });
};

export const getPendingOps = async (): Promise<PendingOperation[]> => {
  return db.pendingOps.orderBy('createdAt').toArray();
};

export const removeOp = async (opId: string): Promise<void> => {
  await db.pendingOps.delete(opId);
};

export const incrementOpRetry = async (opId: string): Promise<void> => {
  const op = await db.pendingOps.get(opId);
  if (op) await db.pendingOps.update(opId, { retryCount: op.retryCount + 1, createdAt: Date.now() });
};

export const clearPendingOps = async (opIds: string[]): Promise<void> => {
  await db.pendingOps.bulkDelete(opIds);
};

export const clearLocalWorkspaceData = async (): Promise<void> => {
  await db.transaction('rw', db.notes, db.pendingOps, db.folders, db.syncMeta, async () => {
    await Promise.all([
      db.notes.clear(),
      db.pendingOps.clear(),
      db.folders.clear(),
      db.syncMeta.clear(),
    ]);
  });
};
