import type { Note, ConflictInfo } from '../types';

/**
 * Field-level merge conflict resolution.
 *
 * Strategy:
 * 1. For each field, compare local and server versions.
 * 2. If both changed (vs a common base), pick the one with more content (length heuristic).
 * 3. If only one changed, accept that change.
 * 4. Tags: union merge (deduplicated).
 * 5. Boolean fields (isStarred, isPinned): OR merge (if either set it, keep it set).
 */

export const resolveConflict = (
  localNote: Note,
  serverNote: Note,
  _baseVersion?: number
): ConflictInfo => {
  const resolvedNote: Note = { ...serverNote }; // start from server as base

  // Title: pick longer (more content = more intentional edit)
  resolvedNote.title = pickLonger(localNote.title, serverNote.title) || 'Untitled';

  // Content: pick longer
  resolvedNote.content = pickLonger(localNote.content, serverNote.content) || '';

  // Tags: union merge
  const tagSet = new Set([...(localNote.tags || []), ...(serverNote.tags || [])]);
  resolvedNote.tags = Array.from(tagSet);

  // Boolean fields: OR merge
  resolvedNote.is_starred = localNote.is_starred || serverNote.is_starred;
  resolvedNote.is_pinned = localNote.is_pinned || serverNote.is_pinned;

  // Folder: prefer server (it's the authoritative source)
  resolvedNote.folder_id = serverNote.folder_id ?? localNote.folder_id;

  // Version: use server's (will be incremented on next push)
  resolvedNote.version = serverNote.version;

  resolvedNote._syncStatus = 'synced';
  resolvedNote._isDirty = false;

  return {
    noteId: localNote.id,
    localNote,
    serverNote,
    resolvedNote,
    strategy: 'field-level-merge',
  };
};

const pickLonger = (a: string, b: string): string => {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
};

/**
 * Last-write-wins resolver — simpler fallback.
 * Uses updated_at timestamps.
 */
export const resolveLastWriteWins = (localNote: Note, serverNote: Note): Note => {
  const localTime = new Date(localNote.updated_at).getTime();
  const serverTime = new Date(serverNote.updated_at).getTime();
  return localTime > serverTime ? localNote : serverNote;
};
