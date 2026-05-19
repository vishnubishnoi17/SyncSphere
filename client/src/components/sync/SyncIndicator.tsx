import React from 'react';
import { useNotesStore } from '../../state/notesStore';
import { syncEngine } from '../../sync/syncEngine';

export const SyncIndicator: React.FC = () => {
  const { syncStatus, lastSyncAt } = useNotesStore();
  const triggerSync = () => {
    syncEngine.triggerSync().catch(console.error);
  };

  const statusMap = {
    idle: { color: 'text-green-400', label: 'Synced', dot: 'bg-green-400' },
    syncing: { color: 'text-blue-400', label: 'Syncing...', dot: 'bg-blue-400 animate-pulse' },
    error: { color: 'text-red-400', label: 'Sync error', dot: 'bg-red-400' },
  };
  const s = statusMap[syncStatus];

  return (
    <button
      onClick={triggerSync}
      className={`flex items-center gap-2 text-xs ${s.color} hover:opacity-80 transition-opacity`}
      title="Click to sync now"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      <span>{s.label}</span>
      {lastSyncAt && syncStatus === 'idle' && (
        <span className="text-gray-600">
          · {new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </button>
  );
};
