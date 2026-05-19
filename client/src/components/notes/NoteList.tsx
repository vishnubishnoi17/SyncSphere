import React from 'react';
import { useNotesStore } from '../../state/notesStore';
import { useNotes } from '../../hooks/useNotes';
import type { Note } from '../../types';

interface Props {
  notes: Note[];
  isLoading: boolean;
}

export const NoteList: React.FC<Props> = ({ notes, isLoading }) => {
  const { activeNoteId, searchQuery, setActiveNote, setSearchQuery } = useNotesStore();
  const { createNote } = useNotes();

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="px-3 py-3 border-b border-gray-800">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Loading...</div>}
        {!isLoading && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-gray-500 text-sm mb-3">No notes yet</p>
            <button onClick={() => createNote()} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">Create your first note</button>
          </div>
        )}
        {notes.map((note) => (
          <NoteItem key={note.id} note={note} isActive={note.id === activeNoteId} onClick={() => setActiveNote(note.id)} />
        ))}
      </div>
    </div>
  );
};

const NoteItem: React.FC<{ note: Note; isActive: boolean; onClick: () => void }> = ({ note, isActive, onClick }) => {
  const preview = note.content.replace(/[#*`_~]/g, '').slice(0, 80);
  const date = new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <button onClick={onClick} className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${isActive ? 'bg-gray-800 border-l-2 border-l-indigo-500' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-white truncate flex-1">{note.title || 'Untitled'}</span>
        <div className="flex items-center gap-1 shrink-0">
          {note._syncStatus === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" title="Pending sync" />}
          {note._syncStatus === 'conflict' && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="Conflict" />}
          {note.is_starred && <svg className="w-3 h-3 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>}
        </div>
      </div>
      <p className="text-xs text-gray-500 truncate">{preview || 'Empty note'}</p>
      <p className="text-xs text-gray-600 mt-1">{date}</p>
    </button>
  );
};
