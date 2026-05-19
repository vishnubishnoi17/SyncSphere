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
import { ConflictSimulator } from './ConflictSimulator';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

type View = 'notes' | 'trash' | 'sync' | 'demo';

export const WorkspacePage: React.FC = () => {
  const { accessToken } = useAuthStore();
  const { activeFolderId } = useNotesStore();
  const { notes, folders, activeNoteId, isLoading, loadFolders, refreshFromServer } = useNotes();
  const [view, setView] = useState<View>('notes');
  const [historyNoteId, setHistoryNoteId] = useState<string | null>(null);
  useSync();

  useEffect(() => {
    if (accessToken) {
      socketClient.connect(WS_URL, accessToken);
      loadFolders();
      refreshFromServer();
    }
    return () => socketClient.disconnect();
  }, [accessToken]); // eslint-disable-line

  // Filter notes for starred view
  const filteredNotes = activeFolderId === '__starred__'
    ? notes.filter(n => n.is_starred)
    : notes;

  const activeNote = filteredNotes.find(n => n.id === activeNoteId) ||
    notes.find(n => n.id === activeNoteId) || null;

  const historyNote = historyNoteId ? notes.find(n => n.id === historyNoteId) || null : null;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar
        folders={folders}
        onShowTrash={() => setView('trash')}
        onShowSyncDash={() => setView('sync')}
        onShowDemo={() => setView('demo')}
        view={view}
      />

      {view === 'trash' ? (
        <TrashPage />
      ) : view === 'sync' ? (
        <SyncDashboard />
      ) : view === 'demo' ? (
        <div className="flex-1 overflow-hidden">
          <ConflictSimulator onClose={() => setView('notes')} />
        </div>
      ) : historyNoteId && historyNote ? (
        <>
          <NoteList notes={filteredNotes} isLoading={isLoading} />
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-end px-4 py-2 border-b border-gray-800/60">
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
          <NoteList notes={filteredNotes} isLoading={isLoading} />
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-end px-4 py-2 border-b border-gray-800/60">
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
