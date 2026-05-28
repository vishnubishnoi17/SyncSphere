import type { Note, Folder } from '../types';
import { API_BASE } from '../config/env';

let authToken: string | null = null;
let getRefreshToken: (() => string | null) | null = null;
let handleAccessTokenRefresh: ((token: string) => void) | null = null;
let handleAuthFailure: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const configureAuthHandlers = (handlers: {
  getRefreshToken: () => string | null;
  onAccessTokenRefresh: (token: string) => void;
  onAuthFailure: () => void;
}) => {
  getRefreshToken = handlers.getRefreshToken;
  handleAccessTokenRefresh = handlers.onAccessTokenRefresh;
  handleAuthFailure = handlers.onAuthFailure;
};

const buildHeaders = (includeContentType = true) => ({
  ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

const handle = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
};

const refreshAccessTokenInternal = async (): Promise<string | null> => {
  const refreshTokenValue = getRefreshToken?.();
  if (!refreshTokenValue) return null;

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Token refresh failed');
        }

        const body = await res.json() as { accessToken?: string };
        if (!body.accessToken) {
          throw new Error('No access token returned');
        }

        setAuthToken(body.accessToken);
        handleAccessTokenRefresh?.(body.accessToken);
        return body.accessToken;
      })
      .catch(() => {
        setAuthToken(null);
        handleAuthFailure?.();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
};

const request = async <T>(path: string, init: RequestInit = {}, retryOnAuth = true): Promise<T> => {
  const hasBody = init.body !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(hasBody),
      ...(init.headers || {}),
    },
  });

  if (res.status === 401 && retryOnAuth) {
    const refreshedToken = await refreshAccessTokenInternal();
    if (refreshedToken) {
      return request<T>(path, init, false);
    }
  }

  return handle<T>(res);
};

// Auth
export const register = (data: { email: string; password: string; name: string; deviceName?: string }) =>
  request<{
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  }>('/auth/register', { method: 'POST', body: JSON.stringify(data) });

export const login = (data: { email: string; password: string; deviceName?: string }) =>
  request<{
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  }>('/auth/login', { method: 'POST', body: JSON.stringify(data) });

export const refreshToken = (refreshToken: string) =>
  request<{ accessToken: string }>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  }, false);

export const getMe = () =>
  request<{ userId: string; email: string; devices: unknown[] }>('/auth/me');

// Notes
export const fetchNotes = () =>
  request<{ notes: Note[] }>('/notes');

export const fetchNote = (id: string) =>
  request<{ note: Note }>(`/notes/${id}`);

export const createNote = (data: Partial<Note>) =>
  request<{ note: Note }>('/notes', { method: 'POST', body: JSON.stringify(data) });

export const updateNote = (id: string, data: Partial<Note> & { version?: number }) =>
  request<{ note: Note; conflict: boolean }>(`/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteNote = (id: string) =>
  request<{ note: Note }>(`/notes/${id}`, { method: 'DELETE' });

export const restoreNote = (id: string) =>
  request<{ note: Note }>(`/notes/${id}/restore`, { method: 'POST' });

export const searchNotes = (q: string) =>
  request<{ notes: Note[] }>(`/notes/search?q=${encodeURIComponent(q)}`);

// Folders
export const fetchFolders = () =>
  request<{ folders: Folder[] }>('/folders');

export const createFolder = (name: string, color?: string) =>
  request<{ folder: Folder }>('/folders', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });

export const deleteFolder = (id: string) =>
  request<{ success: boolean }>(`/folders/${id}`, { method: 'DELETE' });

// Sync
export const syncWithServer = (body: unknown) =>
  request<unknown>('/sync', { method: 'POST', body: JSON.stringify(body) });

export const getSyncStatus = () =>
  request<unknown>('/sync/status');

export const getOperationHistory = (noteId: string) =>
  request<{ operations: unknown[] }>(`/sync/history/${noteId}`);
