export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Device {
  id: string;
  device_name: string;
  device_type: string;
  last_seen: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  folder_id: string | null;
  folder_name?: string;
  folder_color?: string;
  title: string;
  content: string;
  tags: string[];
  is_starred: boolean;
  is_pinned: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  deleted_at?: string;
  // local-only fields
  _localVersion?: number;
  _isDirty?: boolean;
  _syncStatus?: 'synced' | 'pending' | 'conflict';
}

export type OperationType = 'create' | 'update' | 'delete' | 'restore';

export interface PendingOperation {
  id: string;
  noteId: string;
  operationType: OperationType;
  payload: Record<string, unknown>;
  timestamp: string;
  deviceId: string;
  clientVersion?: number;
  retryCount: number;
  createdAt: number; // epoch ms for ordering
  lastAttemptAt?: number; // epoch ms for retry backoff bookkeeping
}

export interface SyncResult {
  appliedOps: string[];
  conflictedOps: { opId: string; conflict: string; resolvedNote?: Note }[];
  serverChanges: Note[];
  newSyncAt: string;
}

export interface PresenceUser {
  userId: string;
  userName?: string;
  socketId: string;
  cursor?: { line: number; ch: number };
  color: string;
}

export interface ConflictInfo {
  noteId: string;
  localNote: Note;
  serverNote: Note;
  resolvedNote: Note;
  strategy: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
}
