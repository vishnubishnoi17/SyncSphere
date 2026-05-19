import React from 'react';
import { useAuthStore } from '../../state/authStore';
import { useNotesStore } from '../../state/notesStore';
import { useNotes } from '../../hooks/useNotes';
import type { Folder } from '../../types';

interface Props {
  folders: Folder[];
}

export const Sidebar: React.FC<Props> = ({ folders }) => {
  const { user, logout } = useAuthStore();
  const { activeFolderId, setActiveFolderId } = useNotesStore();
  const { createNote } = useNotes();

  return (
    <div className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-semibold text-white">SyncSphere</span>
        </div>
      </div>

      {/* New Note */}
      <div className="px-3 pt-3">
        <button
          onClick={() => createNote()}
          className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Note
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <button
          onClick={() => setActiveFolderId(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            !activeFolderId ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          All Notes
        </button>

        {folders.length > 0 && (
          <div className="pt-2">
            <p className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Folders</p>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeFolderId === folder.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: folder.color }} />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 bg-indigo-700 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="text-gray-500 hover:text-white transition-colors" title="Sign out">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
