import React, { useEffect } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { NoteList } from '../components/notes/NoteList';
import { NoteEditor } from '../components/notes/NoteEditor';
import { SyncIndicator } from '../components/sync/SyncIndicator';
import { useNotes } from '../hooks/useNotes';
import { useSync } from '../hooks/useSync';
import { useAuthStore } from '../state/authStore';
import { socketClient } from '../websocket/socketClient';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export const WorkspacePage: React.FC = () => {
  const { accessToken } = useAuthStore();
  const { notes, folders, activeNoteId, isLoading, loadFolders, refreshFromServer } = useNotes();
  useSync();

  useEffect(() => {
    if (accessToken) {
      socketClient.connect(WS_URL, accessToken);
      loadFolders();
      refreshFromServer();
    }
    return () => socketClient.disconnect();
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar folders={folders} />
      <NoteList notes={notes} isLoading={isLoading} />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-800">
          <SyncIndicator />
        </div>
        <NoteEditor note={activeNote} />
      </div>
    </div>
  );
};
