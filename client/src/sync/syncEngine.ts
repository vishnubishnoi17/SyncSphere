import { getSyncMeta, setSyncMeta, upsertNotes, markNoteConflict, db } from '../storage/db';
import { getDrainableOps, acknowledgeOps, failOp } from './offlineQueue';
import { resolveConflict } from './conflictResolver';
import type { Note, SyncResult, ConflictInfo } from '../types';
import { socketClient } from '../websocket/socketClient';

const SYNC_INTERVAL_MS = 30_000; // 30 seconds

interface SyncEngineCallbacks {
  onSyncStart?: () => void;
  onSyncComplete?: (result: SyncEngineResult) => void;
  onConflict?: (conflict: ConflictInfo) => void;
  onError?: (error: Error) => void;
  getAuthHeaders: () => Record<string, string>;
  getDeviceId: () => string;
  apiBase: string;
}

export interface SyncEngineResult {
  applied: number;
  conflicts: number;
  pulled: number;
  timestamp: string;
}

class SyncEngine {
  private callbacks: SyncEngineCallbacks | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private isOnline = navigator.onLine;

  init(callbacks: SyncEngineCallbacks) {
    this.callbacks = callbacks;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Immediate sync on init, then on interval
    this.scheduledSync();
    this.syncTimer = setInterval(() => this.scheduledSync(), SYNC_INTERVAL_MS);
  }

  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    this.callbacks = null;
    this.isSyncing = false;
  }

  private handleOnline = () => {
    this.isOnline = true;
    console.log('[SyncEngine] Back online — triggering sync');
    this.triggerSync();
  };

  private handleOffline = () => {
    this.isOnline = false;
    console.log('[SyncEngine] Offline — sync paused');
  };

  private scheduledSync() {
    if (this.isOnline) {
      this.triggerSync().catch(console.error);
    }
  }

  async triggerSync(): Promise<SyncEngineResult | null> {
    if (!this.callbacks || this.isSyncing || !this.isOnline) return null;

    this.isSyncing = true;
    this.callbacks.onSyncStart?.();

    try {
      const result = await this.performSync();
      this.callbacks.onSyncComplete?.(result);
      return result;
    } catch (err) {
      this.callbacks.onError?.(err as Error);
      return null;
    } finally {
      this.isSyncing = false;
    }
  }

  private async performSync(): Promise<SyncEngineResult> {
    if (!this.callbacks) throw new Error('SyncEngine not initialized');

    const deviceId = this.callbacks.getDeviceId();
    const lastSyncKey = `lastSyncAt:${deviceId}`;
    const lastSyncAt = await getSyncMeta(lastSyncKey);
    const pendingOps = (await getDrainableOps()).filter((op) => op.deviceId === deviceId);

    const body = {
      deviceId,
      lastSyncAt,
      operations: pendingOps.map((op) => ({
        id: op.id,
        noteId: op.noteId,
        operationType: op.operationType,
        payload: op.payload,
        timestamp: op.timestamp,
        deviceId: op.deviceId,
        clientVersion: op.clientVersion,
      })),
    };

    const response = await fetch(`${this.callbacks.apiBase}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.callbacks.getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Sync failed: ${response.status} ${errText}`);
    }

    const result: SyncResult = await response.json();

    // Acknowledge applied ops
    await acknowledgeOps(result.appliedOps);

    // Handle conflicts
    let conflictCount = 0;
    for (const conflicted of result.conflictedOps) {
      if (conflicted.resolvedNote) {
        // Server sent us a resolved version — apply it
        await upsertNotes([conflicted.resolvedNote as Note]);
        conflictCount++;
      } else {
        // We need to resolve locally
        const localNote = await db.notes.get(
          pendingOps.find((op) => op.id === conflicted.opId)?.noteId || ''
        );
        if (localNote) {
          // Mark as conflict for UI
          await markNoteConflict(localNote.id);
          conflictCount++;
        }
      }

      await failOp(conflicted.opId);
    }

    // Handle failed ops with backoff
    const failedOpIds = new Set(result.conflictedOps.map((c) => c.opId));
    for (const op of pendingOps) {
      if (!result.appliedOps.includes(op.id) && !failedOpIds.has(op.id)) {
        await failOp(op.id);
      }
    }

    // Apply server changes (pull)
    if (result.serverChanges.length > 0) {
      await upsertNotes(result.serverChanges as Note[]);
    }

    // Update sync timestamp
    await setSyncMeta(lastSyncKey, result.newSyncAt);

    const affectedOutboundNoteIds = Array.from(new Set([
      ...result.appliedOps.map((opId) => pendingOps.find((op) => op.id === opId)?.noteId),
      ...result.conflictedOps.map((conflicted) => pendingOps.find((op) => op.id === conflicted.opId)?.noteId),
    ].filter((noteId): noteId is string => Boolean(noteId))));

    if (affectedOutboundNoteIds.length > 0) {
      socketClient.notifySyncComplete(affectedOutboundNoteIds);
    }

    // Handle conflict resolution via field-level merge
    for (const conflicted of result.conflictedOps) {
      if (!conflicted.resolvedNote) {
        const serverNote = result.serverChanges.find(
          (n: Note) => n.id === pendingOps.find((op) => op.id === conflicted.opId)?.noteId
        );
        const localNote = await db.notes.get(
          pendingOps.find((op) => op.id === conflicted.opId)?.noteId || ''
        );
        if (localNote && serverNote) {
          const resolution = resolveConflict(localNote, serverNote as Note);
          await upsertNotes([resolution.resolvedNote]);
          this.callbacks.onConflict?.(resolution);
        }
      }
    }

    return {
      applied: result.appliedOps.length,
      conflicts: conflictCount,
      pulled: result.serverChanges.length,
      timestamp: result.newSyncAt,
    };
  }
}

// Singleton
export const syncEngine = new SyncEngine();
