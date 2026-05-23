import type { Note } from '../types';

export type ConflictInfo = {
  noteId: string;
  resolvedNote: Note;
  strategy: 'field-level-merge';
  localNote: Note;
  serverNote: Note;
};

export function resolveConflict(local: Note, server: Note): ConflictInfo {
  // Title: pick longer, keep same, fallback to 'Untitled'
  let title = local.title.length >= server.title.length ? local.title : server.title;
  if (!title) {
    title = 'Untitled';
  }

  // Content: pick longer
  const content = local.content.length >= server.content.length ? local.content : server.content;

  // Tags: union-merge and deduplicate
  const tags = Array.from(new Set([...(local.tags || []), ...(server.tags || [])]));

  // Booleans: OR merge
  const is_starred = local.is_starred || server.is_starred;
  const is_pinned = local.is_pinned || server.is_pinned;

  const resolvedNote: Note = {
    ...server,
    ...local,
    title,
    content,
    tags,
    is_starred,
    is_pinned,
    version: server.version,
    _syncStatus: 'synced',
    _isDirty: false
  };

  return {
    noteId: local.id,
    resolvedNote,
    strategy: 'field-level-merge',
    localNote: local,
    serverNote: server
  };
}

export function resolveLastWriteWins(local: Note, server: Note): Note {
  const localTime = new Date(local.updated_at).getTime();
  const serverTime = new Date(server.updated_at).getTime();
  
  return localTime > serverTime ? local : server;
}