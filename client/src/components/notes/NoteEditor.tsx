import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNotes } from '../../hooks/useNotes';
import { socketClient } from '../../websocket/socketClient';
import type { Note } from '../../types';

interface Props {
  note: Note | null;
}

export const NoteEditor: React.FC<Props> = ({ note }) => {
  const { updateNote, deleteNote } = useNotes();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNoteId = useRef<string | null>(null);

  useEffect(() => {
    if (note) {
      if (prevNoteId.current && prevNoteId.current !== note.id) {
        socketClient.leaveNote(prevNoteId.current);
      }
      setTitle(note.title);
      setContent(note.content);
      socketClient.joinNote(note.id);
      prevNoteId.current = note.id;
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback((id: string, t: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateNote(id, { title: t, content: c });
      socketClient.sendEdit(id, { title: t, content: c }, 0);
    }, 600);
  }, [updateNote]);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Select a note or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-500">
          {note._syncStatus === 'pending' ? '● Saving...' : note._syncStatus === 'conflict' ? '⚠ Conflict' : '✓ Saved'}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => updateNote(note.id, { is_starred: !note.is_starred })}
          className={`p-1.5 rounded transition-colors ${note.is_starred ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'}`}
          title={note.is_starred ? 'Unstar' : 'Star'}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill={note.is_starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={note.is_starred ? 0 : 1.5}>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        <button
          onClick={() => { if (confirm('Delete this note?')) deleteNote(note.id); }}
          className="p-1.5 rounded text-gray-600 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleSave(note.id, e.target.value, content); }}
          placeholder="Note title"
          className="w-full bg-transparent text-2xl font-bold text-white placeholder-gray-600 focus:outline-none mb-4"
        />
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); scheduleSave(note.id, title, e.target.value); }}
          placeholder="Start writing..."
          className="w-full bg-transparent text-gray-300 placeholder-gray-600 focus:outline-none resize-none text-base leading-relaxed"
          style={{ minHeight: '60vh' }}
        />
      </div>

      {/* Footer */}
      <div className="px-6 py-2 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-600">
        <span>v{note.version}</span>
        <span>Updated {new Date(note.updated_at).toLocaleString()}</span>
      </div>
    </div>
  );
};
