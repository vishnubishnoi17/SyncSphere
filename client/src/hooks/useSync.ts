import { useEffect, useCallback } from 'react';
import { syncEngine } from '../sync/syncEngine';
import { useAuthStore } from '../state/authStore';
import { useNotesStore } from '../state/notesStore';
import { getSyncMeta } from '../storage/db';
import { API_BASE } from '../config/env';
import { socketClient } from '../websocket/socketClient';

export const useSync = () => {
  const { accessToken, deviceId } = useAuthStore();
  const { setSyncStatus, setLastSyncAt } = useNotesStore();

  useEffect(() => {
    if (!accessToken || !deviceId) return;

    syncEngine.init({
      apiBase: API_BASE,
      getAuthHeaders: () => ({ Authorization: `Bearer ${accessToken}` }),
      getDeviceId: () => deviceId,
      onSyncStart: () => setSyncStatus('syncing'),
      onSyncComplete: (result) => {
        setSyncStatus('idle');
        setLastSyncAt(result.timestamp);
      },
      onError: (err) => {
        console.error('[Sync] error:', err);
        setSyncStatus('error');
      },
    });

    // Load last sync timestamp from DB
    getSyncMeta(`lastSyncAt:${deviceId}`).then((ts) => {
      if (ts) setLastSyncAt(ts);
    });

    return () => syncEngine.destroy();
  }, [accessToken, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!deviceId) return;

    const unsubscribe = socketClient.onSyncInvalidate(({ fromDevice }) => {
      if (fromDevice === deviceId) return;
      syncEngine.triggerSync().catch(console.error);
    });

    return unsubscribe;
  }, [deviceId]);

  const triggerSync = useCallback(() => {
    syncEngine.triggerSync().catch(console.error);
  }, []);

  return { triggerSync };
};
