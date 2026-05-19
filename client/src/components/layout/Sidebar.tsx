import React, { useState } from 'react';
import { useAuthStore } from '../../state/authStore';
import { useNotesStore } from '../../state/notesStore';
import { useNotes } from '../../hooks/useNotes';
import * as api from '../../services/api';
import { db } from '../../storage/db';
import type { Folder } from '../../types';

interface Props {
  folders: Folder[];
  onShowNotes: () => void;
  onShowTrash: () => void;
  onShowSyncDash: () => void;
  onLogout: () => void | Promise<void>;
  view: string;
}

export const Sidebar: React.FC<Props> = ({ folders, onShowNotes, onShowTrash, onShowSyncDash, onLogout, view }) => {
  const { user } = useAuthStore();
  const { activeFolderId, setActiveFolderId } = useNotesStore();
  const { createNote, loadFolders } = useNotes();
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#6366f1');

  const COLORS = ['#6366f1','#f43f5e','#f97316','#eab308','#22c55e','#06b6d4','#a855f7','#ec4899'];

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    await api.createFolder(folderName.trim(), folderColor);
    await loadFolders();
    setFolderName('');
    setShowNewFolder(false);
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Notes inside will be unfoldered.')) return;
    await api.deleteFolder(folderId);
    await db.folders.delete(folderId);
    if (activeFolderId === folderId) setActiveFolderId(null);
    onShowNotes();
    await loadFolders();
  };

  const selectNotesView = (folderId: string | null) => {
    setActiveFolderId(folderId);
    onShowNotes();
  };

  const navItem = (label: string, icon: React.ReactNode, onClick: () => void, active: boolean) => (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="w-60 bg-gray-950 border-r border-gray-800/60 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-white text-sm leading-none">SyncSphere</p>
            <p className="text-xs text-gray-600 mt-0.5">Local-first workspace</p>
          </div>
        </div>
      </div>

      {/* New Note */}
      <div className="px-3 pt-3 pb-1">
        <button onClick={() => { void createNote().then(onShowNotes); }}
          className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Note
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItem('All Notes',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
          () => selectNotesView(null),
          !activeFolderId && view === 'notes'
        )}
        {navItem('Starred',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>,
          () => selectNotesView('__starred__'),
          activeFolderId === '__starred__' && view === 'notes'
        )}
        {navItem('Trash',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
          onShowTrash,
          view === 'trash'
        )}
        {navItem('Sync Dashboard',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
          onShowSyncDash,
          view === 'sync'
        )}
        {/* Folders section */}
        <div className="pt-3">
          <div className="flex items-center justify-between px-3 py-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Folders</p>
            <button onClick={() => setShowNewFolder(!showNewFolder)}
              className="text-gray-600 hover:text-indigo-400 transition-colors" title="New folder">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>

          {showNewFolder && (
            <div className="px-2 py-2 bg-gray-900 rounded-lg mx-1 mb-2">
              <input
                value={folderName}
                onChange={e => setFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                placeholder="Folder name"
                autoFocus
                className="w-full bg-gray-800 text-white text-sm px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-2"
              />
              <div className="flex gap-1 mb-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setFolderColor(c)}
                    className={`w-4 h-4 rounded-full transition-transform ${folderColor === c ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-gray-900' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={handleCreateFolder} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded py-1 transition-colors">Create</button>
                <button onClick={() => setShowNewFolder(false)} className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded py-1 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {folders.filter(f => f.id !== '__starred__').map(folder => (
            <button key={folder.id} onClick={() => selectNotesView(folder.id)}
              className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === folder.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: folder.color }} />
              <span className="truncate flex-1 text-left">{folder.name}</span>
              <button onClick={(e) => handleDeleteFolder(e, folder.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </button>
          ))}
        </div>
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-800/60">
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 bg-indigo-700 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate font-medium">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button onClick={() => { void onLogout(); }} className="text-gray-600 hover:text-white transition-colors" title="Sign out">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
