import React, { useEffect, useState } from 'react';
import { db } from '../storage/db';
import * as api from '../services/api';
import { useAuthStore } from '../state/authStore';
import type { Note } from '../types';

export const TrashPage: React.FC = () => {
  const userId = useAuthStore((state) => state.user?.id);
  const [deleted, setDeleted] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) {
      setDeleted([]);
      setLoading(false);
      return;
    }

    const all = await db.notes.where('user_id').equals(userId).toArray();
    setDeleted(all.filter(n => n.deleted).sort((a, b) => new Date(b.deleted_at || b.updated_at).getTime() - new Date(a.deleted_at || a.updated_at).getTime()));
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const handleRestore = async (note: Note) => {
    try {
      await api.restoreNote(note.id);
      const restored = { ...note, deleted: false, deleted_at: undefined };
      await db.notes.put(restored);
      await load();
    } catch { alert('Failed to restore note'); }
  };

  const handlePermanentDelete = async (note: Note) => {
    if (!confirm('Permanently delete this note? This cannot be undone.')) return;
    await db.notes.delete(note.id);
    await load();
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      <div className="px-6 py-4 border-b border-gray-800/60">
        <h2 className="text-lg font-semibold text-white">Trash</h2>
        <p className="text-xs text-gray-500 mt-0.5">{deleted.length} deleted {deleted.length === 1 ? 'note' : 'notes'}</p>
      </div>

      {deleted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Trash is empty</p>
            <p className="text-xs text-gray-600 mt-1">Deleted notes from this account will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 grid gap-3">
          {deleted.map(note => (
            <div key={note.id} className="bg-gray-900 border border-gray-800/60 rounded-xl p-4 flex items-start gap-4 group">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-300 truncate">{note.title || 'Untitled'}</p>
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                  {note.content?.replace(/<[^>]*>/g, '') || 'Empty note'}
                </p>
                <p className="text-xs text-gray-700 mt-2">
                  Deleted {note.deleted_at ? new Date(note.deleted_at).toLocaleString() : 'recently'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleRestore(note)}
                  className="text-xs bg-indigo-900/50 hover:bg-indigo-800 text-indigo-400 border border-indigo-800/50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  Restore
                </button>
                <button onClick={() => handlePermanentDelete(note)}
                  className="text-xs bg-red-950/50 hover:bg-red-900/50 text-red-500 border border-red-900/50 px-3 py-1.5 rounded-lg transition-colors">
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
