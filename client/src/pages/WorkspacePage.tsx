import React, { useEffect, useState } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { NoteList } from '../components/notes/NoteList';
import { NoteEditor } from '../components/notes/NoteEditor';
import { SyncIndicator } from '../components/sync/SyncIndicator';
import { TrashPage } from './TrashPage';
import { SyncDashboard } from './SyncDashboard';
import { HistoryPage } from './HistoryPage';
import { useNotes } from '../hooks/useNotes';
import { useSync } from '../hooks/useSync';
import { useAuthStore } from '../state/authStore';
import { useNotesStore } from '../state/notesStore';
import { socketClient } from '../websocket/socketClient';
import { clearLocalWorkspaceData } from '../storage/db';
import { WS_BASE } from '../config/env';

type View = 'notes' | 'trash' | 'sync';

export const WorkspacePage: React.FC = () => {
  const { accessToken, logout } = useAuthStore();
  const { reset } = useNotesStore();
  const { notes, folders, activeNoteId, isLoading, loadFolders, refreshFromServer } = useNotes();
  const [view, setView] = useState<View>('notes');
  const [historyNoteId, setHistoryNoteId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list');
  useSync();

  useEffect(() => {
    if (accessToken) {
      socketClient.connect(WS_BASE, accessToken);
      loadFolders();
      refreshFromServer();
    }
    return () => socketClient.disconnect();
  }, [accessToken]); // eslint-disable-line

  const handleShowNotes = () => {
    setHistoryNoteId(null);
    setView('notes');
    setMobileNavOpen(false);
  };

  const handleLogout = async () => {
    socketClient.disconnect();
    await clearLocalWorkspaceData();
    reset();
    logout();
  };

  const activeNote = notes.find(n => n.id === activeNoteId) || null;

  const historyNote = historyNoteId ? notes.find(n => n.id === historyNoteId) || null : null;

  return (
    <div className="flex h-dvh bg-slate-950 text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_32rem),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_28rem)]" />

      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl flex items-center gap-3 px-3">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 flex items-center justify-center"
          aria-label="Open navigation"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        {view === 'notes' && mobilePane === 'editor' && (
          <button
            onClick={() => setMobilePane('list')}
            className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 flex items-center justify-center"
            aria-label="Back to notes"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{view === 'notes' && mobilePane === 'editor' ? activeNote?.title || 'Untitled' : view === 'trash' ? 'Trash' : view === 'sync' ? 'Sync' : 'SyncSphere'}</p>
          <p className="text-[11px] text-slate-500 truncate">{view === 'notes' ? `${notes.length} synced workspace notes` : 'Local-first notes workspace'}</p>
        </div>
        <SyncIndicator />
      </div>

      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative h-full w-[82vw] max-w-80">
            <Sidebar
              folders={folders}
              onShowNotes={handleShowNotes}
              onShowTrash={() => { setHistoryNoteId(null); setView('trash'); setMobilePane('list'); setMobileNavOpen(false); }}
              onShowSyncDash={() => { setHistoryNoteId(null); setView('sync'); setMobilePane('list'); setMobileNavOpen(false); }}
              onLogout={handleLogout}
              view={view}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <Sidebar
        className="hidden md:flex"
        folders={folders}
        onShowNotes={handleShowNotes}
        onShowTrash={() => { setHistoryNoteId(null); setView('trash'); }}
        onShowSyncDash={() => { setHistoryNoteId(null); setView('sync'); }}
        onLogout={handleLogout}
        view={view}
      />

      {view === 'trash' ? (
        <div className="relative flex-1 pt-14 md:pt-0"><TrashPage /></div>
      ) : view === 'sync' ? (
        <div className="relative flex-1 pt-14 md:pt-0"><SyncDashboard /></div>
      ) : historyNoteId && historyNote ? (
        <>
          <NoteList notes={notes} isLoading={isLoading} className="hidden md:flex" onNoteSelect={() => setMobilePane('editor')} />
          <div className="relative flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
            <div className="hidden md:flex items-center justify-end px-4 py-2 border-b border-white/10">
              <SyncIndicator />
            </div>
            <HistoryPage
              noteId={historyNoteId}
              noteTitle={historyNote.title}
              onClose={() => setHistoryNoteId(null)}
            />
          </div>
        </>
      ) : (
        <>
          <NoteList
            notes={notes}
            isLoading={isLoading}
            className={`${mobilePane === 'list' ? 'flex' : 'hidden'} md:flex pt-14 md:pt-0`}
            onNoteSelect={() => setMobilePane('editor')}
          />
          <div className={`${mobilePane === 'editor' ? 'flex' : 'hidden'} relative flex-1 md:flex flex-col min-w-0 pt-14 md:pt-0`}>
            <div className="hidden md:flex items-center justify-end px-4 py-2 border-b border-white/10">
              <SyncIndicator />
            </div>
            <NoteEditor
              note={activeNote}
              onShowHistory={(id) => { setHistoryNoteId(id); }}
            />
          </div>
        </>
      )}
    </div>
  );
};
