import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNotesStore } from '../state/notesStore';
import { useAuthStore } from '../state/authStore';
import { db, enqueueOperation, upsertNote as dbUpsert, upsertNotes } from '../storage/db';
import * as api from '../services/api';
import { syncEngine } from '../sync/syncEngine';
import type { Note } from '../types';

const STARRED_VIEW_ID = '__starred__';

const loadFromDB = async (userId: string) => {
  const all = await db.notes.where('user_id').equals(userId).toArray();
  return all
    .filter((n) => !n.deleted)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
};

export const useNotes = () => {
  const store = useNotesStore();
  const { accessToken, deviceId, user } = useAuthStore();

  useEffect(() => {
    if (!accessToken || !user?.id) {
      store.reset();
      return;
    }
    store.setLoading(true);
    loadFromDB(user.id).then((notes) => { store.setNotes(notes); store.setLoading(false); });
  }, [accessToken, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFolders = useCallback(async () => {
    if (!user?.id) return;

    const local = await db.folders.where('user_id').equals(user.id).toArray();
    if (local.length > 0) store.setFolders(local);
    try {
      const { folders } = await api.fetchFolders();
      await db.folders.bulkPut(folders);
      store.setFolders(folders);
    } catch { /* offline */ }
  }, [store, user?.id]);

  const refreshLocalUI = useCallback(async () => {
    if (!user?.id) {
      store.setNotes([]);
      return;
    }
    const notes = await loadFromDB(user.id);
    store.setNotes(notes);
  }, [store, user?.id]);

  const createNote = useCallback(async (data: Partial<Note> = {}) => {
    if (!user?.id) throw new Error('Cannot create a note without an authenticated user');

    const id = uuidv4();
    const now = new Date().toISOString();
    const folderId = store.activeFolderId === STARRED_VIEW_ID ? null : store.activeFolderId;
    const isStarred = data.is_starred ?? store.activeFolderId === STARRED_VIEW_ID;
    const note: Note = {
      id,
      user_id: user.id,
      folder_id: folderId,
      title: data.title || 'Untitled',
      content: data.content || '',
      tags: data.tags || [],
      is_starred: isStarred,
      is_pinned: data.is_pinned ?? false,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted: false,
      _syncStatus: 'pending',
      _isDirty: true,
    };
    await dbUpsert(note);
    store.upsertNote(note);
    store.setActiveNote(id);
    await enqueueOperation({
      id: uuidv4(), noteId: id, operationType: 'create',
      payload: {
        title: note.title,
        content: note.content,
        tags: note.tags,
        folderId,
        is_starred: note.is_starred,
        is_pinned: note.is_pinned,
      },
      timestamp: now, deviceId: deviceId || '', clientVersion: 1, createdAt: Date.now(),
    });
    syncEngine.triggerSync().catch(console.error);
    return note;
  }, [deviceId, store, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateNote = useCallback(async (id: string, updates: Partial<Note>) => {
    const existing = await db.notes.get(id);
    if (!existing || existing.user_id !== user?.id) return;
    const updated: Note = { ...existing, ...updates, updated_at: new Date().toISOString(), _isDirty: true, _syncStatus: 'pending' };
    await db.notes.put(updated);
    store.upsertNote(updated);
    await enqueueOperation({
      id: uuidv4(), noteId: id, operationType: 'update',
      payload: updates as Record<string, unknown>,
      timestamp: updated.updated_at, deviceId: deviceId || '', clientVersion: existing.version, createdAt: Date.now(),
    });
    syncEngine.triggerSync().catch(console.error);
  }, [deviceId, store, user?.id]);

  const deleteNote = useCallback(async (id: string) => {
    const existing = await db.notes.get(id);
    if (!existing || existing.user_id !== user?.id) return;
    const deleted = { ...existing, deleted: true, deleted_at: new Date().toISOString(), _isDirty: true, _syncStatus: 'pending' as const };
    await db.notes.put(deleted);
    store.removeNote(id);
    if (store.activeNoteId === id) store.setActiveNote(null);
    await enqueueOperation({
      id: uuidv4(), noteId: id, operationType: 'delete',
      payload: {}, timestamp: new Date().toISOString(), deviceId: deviceId || '', clientVersion: existing.version, createdAt: Date.now(),
    });
    syncEngine.triggerSync().catch(console.error);
  }, [deviceId, store, user?.id]);

  const refreshFromServer = useCallback(async () => {
    try {
      const { notes } = await api.fetchNotes();
      await upsertNotes(notes);
      await refreshLocalUI();
    } catch { /* offline */ }
  }, [refreshLocalUI]);

  const filteredNotes = store.notes.filter((n) => {
    if (user?.id && n.user_id !== user.id) return false;
    if (n.deleted) return false;
    if (store.activeFolderId === STARRED_VIEW_ID && !n.is_starred) return false;
    if (store.activeFolderId && store.activeFolderId !== STARRED_VIEW_ID && n.folder_id !== store.activeFolderId) return false;
    if (store.searchQuery) {
      const q = store.searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    }
    return true;
  });

  return {
    notes: filteredNotes,
    folders: store.folders,
    activeNoteId: store.activeNoteId,
    isLoading: store.isLoading,
    syncStatus: store.syncStatus,
    lastSyncAt: store.lastSyncAt,
    setActiveNote: store.setActiveNote,
    setSearchQuery: store.setSearchQuery,
    setActiveFolderId: store.setActiveFolderId,
    loadFolders,
    createNote,
    updateNote,
    deleteNote,
    refreshFromServer,
  };
};
