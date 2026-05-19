import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNotesStore } from '../state/notesStore';
import { useAuthStore } from '../state/authStore';
import { db, enqueueOperation, upsertNote as dbUpsert, upsertNotes } from '../storage/db';
import * as api from '../services/api';
import { syncEngine } from '../sync/syncEngine';
import type { Note } from '../types';

const loadFromDB = async () => {
  const all = await db.notes.toArray();
  return all.filter((n) => !n.deleted).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
};

export const useNotes = () => {
  const store = useNotesStore();
  const { accessToken, deviceId, user } = useAuthStore();

  useEffect(() => {
    if (!accessToken) return;
    store.setLoading(true);
    loadFromDB().then((notes) => { store.setNotes(notes); store.setLoading(false); });
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFolders = useCallback(async () => {
    const local = await db.folders.toArray();
    if (local.length > 0) store.setFolders(local);
    try {
      const { folders } = await api.fetchFolders();
      await db.folders.bulkPut(folders);
      store.setFolders(folders);
    } catch { /* offline */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLocalUI = useCallback(async () => {
    const notes = await loadFromDB();
    store.setNotes(notes);
  }, [store]);

  const createNote = useCallback(async (data: Partial<Note> = {}) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const note: Note = {
      id,
      user_id: user?.id || '',
      folder_id: store.activeFolderId,
      title: data.title || 'Untitled',
      content: data.content || '',
      tags: data.tags || [],
      is_starred: false,
      is_pinned: false,
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
      payload: { title: note.title, content: note.content, tags: note.tags, folderId: note.folder_id },
      timestamp: now, deviceId: deviceId || '', clientVersion: 1, createdAt: Date.now(),
    });
    syncEngine.triggerSync().catch(console.error);
    return note;
  }, [deviceId, store, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateNote = useCallback(async (id: string, updates: Partial<Note>) => {
    const existing = await db.notes.get(id);
    if (!existing) return;
    const updated: Note = { ...existing, ...updates, updated_at: new Date().toISOString(), _isDirty: true, _syncStatus: 'pending' };
    await db.notes.put(updated);
    store.upsertNote(updated);
    await enqueueOperation({
      id: uuidv4(), noteId: id, operationType: 'update',
      payload: updates as Record<string, unknown>,
      timestamp: updated.updated_at, deviceId: deviceId || '', clientVersion: existing.version, createdAt: Date.now(),
    });
    syncEngine.triggerSync().catch(console.error);
  }, [deviceId, store]);

  const deleteNote = useCallback(async (id: string) => {
    const existing = await db.notes.get(id);
    if (!existing) return;
    const deleted = { ...existing, deleted: true, deleted_at: new Date().toISOString(), _isDirty: true, _syncStatus: 'pending' as const };
    await db.notes.put(deleted);
    store.removeNote(id);
    if (store.activeNoteId === id) store.setActiveNote(null);
    await enqueueOperation({
      id: uuidv4(), noteId: id, operationType: 'delete',
      payload: {}, timestamp: new Date().toISOString(), deviceId: deviceId || '', clientVersion: existing.version, createdAt: Date.now(),
    });
    syncEngine.triggerSync().catch(console.error);
  }, [deviceId, store]);

  const refreshFromServer = useCallback(async () => {
    try {
      const { notes } = await api.fetchNotes();
      await upsertNotes(notes);
      await refreshLocalUI();
    } catch { /* offline */ }
  }, [refreshLocalUI]);

  const filteredNotes = store.notes.filter((n) => {
    if (n.deleted) return false;
    if (store.activeFolderId && n.folder_id !== store.activeFolderId) return false;
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
