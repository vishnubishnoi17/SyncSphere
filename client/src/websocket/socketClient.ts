import { io, Socket } from 'socket.io-client';
import type { PresenceUser } from '../types';

type SocketCallback<T = unknown> = (data: T) => void;

class SocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private activeNoteId: string | null = null;
  private listeners = new Map<string, Set<SocketCallback>>();

  connect(serverUrl: string, token: string) {
    this.token = token;
    if (this.socket) {
      this.socket.auth = { token };
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    this.socket = io(serverUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });

    this.socket.on('connect', () => {
      console.log('[WS] Connected:', this.socket?.id);
      // Re-join active note room after reconnect
      if (this.activeNoteId) this.joinNote(this.activeNoteId);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[WS] Connection error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
    });

    this.attachRegisteredListeners();
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.activeNoteId = null;
  }

  // --- Note rooms ---
  joinNote(noteId: string) {
    if (this.activeNoteId && this.activeNoteId !== noteId) {
      this.leaveNote(this.activeNoteId);
    }
    this.activeNoteId = noteId;
    this.socket?.emit('note:join', noteId);
  }

  leaveNote(noteId: string) {
    this.socket?.emit('note:leave', noteId);
    if (this.activeNoteId === noteId) this.activeNoteId = null;
  }

  // --- Live editing ---
  sendEdit(noteId: string, delta: unknown, version: number) {
    this.socket?.emit('note:edit', { noteId, delta, version });
  }

  onRemoteEdit(cb: SocketCallback<{ noteId: string; delta: unknown; userId: string; timestamp: string }>) {
    return this.registerListener('note:remote_edit', cb);
  }

  // --- Cursor ---
  sendCursor(noteId: string, cursor: { line: number; ch: number }) {
    this.socket?.emit('cursor:update', { noteId, cursor });
  }

  onRemoteCursor(cb: SocketCallback<{ userId: string; socketId: string; cursor: { line: number; ch: number }; color: string }>) {
    return this.registerListener('cursor:remote', cb);
  }

  // --- Typing ---
  sendTypingStart(noteId: string) {
    this.socket?.emit('typing:start', noteId);
  }

  sendTypingStop(noteId: string) {
    this.socket?.emit('typing:stop', noteId);
  }

  onRemoteTyping(cb: SocketCallback<{ userId: string; userName: string; typing: boolean }>) {
    return this.registerListener('typing:remote', cb);
  }

  // --- Presence ---
  onPresenceUpdate(cb: SocketCallback<{ noteId: string; users: PresenceUser[] }>) {
    return this.registerListener('presence:update', cb);
  }

  // --- Cross-device sync notification ---
  notifySyncComplete(affectedNoteIds: string[]) {
    this.socket?.emit('sync:complete', { affectedNoteIds });
  }

  onSyncInvalidate(cb: SocketCallback<{ noteIds: string[]; fromDevice: string }>) {
    return this.registerListener('sync:invalidate', cb);
  }

  isConnected() {
    return this.socket?.connected ?? false;
  }

  private registerListener<T = unknown>(event: string, cb: SocketCallback<T>) {
    const listeners = this.listeners.get(event) ?? new Set<SocketCallback>();
    listeners.add(cb as SocketCallback);
    this.listeners.set(event, listeners);
    this.socket?.on(event, cb as SocketCallback);

    return () => {
      listeners.delete(cb as SocketCallback);
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
      this.socket?.off(event, cb as SocketCallback);
    };
  }

  private attachRegisteredListeners() {
    if (!this.socket) return;

    for (const [event, listeners] of this.listeners.entries()) {
      for (const listener of listeners) {
        this.socket.on(event, listener);
      }
    }
  }
}

export const socketClient = new SocketClient();
