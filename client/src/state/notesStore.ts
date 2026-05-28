import { create } from 'zustand';
import type { Note, Folder } from '../types';

interface NotesStore {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  searchQuery: string;
  activeFolderId: string | null;
  isLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;

  setNotes: (notes: Note[]) => void;
  upsertNote: (note: Note) => void;
  removeNote: (id: string) => void;
  setFolders: (folders: Folder[]) => void;
  setActiveNote: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setActiveFolderId: (id: string | null) => void;
  setLoading: (v: boolean) => void;
  setSyncStatus: (s: 'idle' | 'syncing' | 'error') => void;
  setLastSyncAt: (ts: string) => void;
  reset: () => void;
}

const sortNotes = (notes: Note[]) =>
  [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return Number(b.is_pinned) - Number(a.is_pinned);
    }

    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

export const useNotesStore = create<NotesStore>((set) => ({
  notes: [],
  folders: [],
  activeNoteId: null,
  searchQuery: '',
  activeFolderId: null,
  isLoading: false,
  syncStatus: 'idle',
  lastSyncAt: null,

  setNotes: (notes) => set({ notes: sortNotes(notes) }),
  upsertNote: (note) =>
    set((s) => ({
      notes: sortNotes(
        s.notes.some((n) => n.id === note.id)
          ? s.notes.map((n) => (n.id === note.id ? note : n))
          : [note, ...s.notes]
      ),
    })),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  setFolders: (folders) => set({ folders }),
  setActiveNote: (id) => set({ activeNoteId: id }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveFolderId: (activeFolderId) => set({ activeFolderId }),
  setLoading: (isLoading) => set({ isLoading }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  reset: () => set({
    notes: [],
    folders: [],
    activeNoteId: null,
    searchQuery: '',
    activeFolderId: null,
    isLoading: false,
    syncStatus: 'idle',
    lastSyncAt: null,
  }),
}));
