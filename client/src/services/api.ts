import type { Note, Folder } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

const headers = () => ({
  'Content-Type': 'application/json',
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

const handle = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
};

// Auth
export const register = (data: { email: string; password: string; name: string; deviceName?: string }) =>
  fetch(`${API_BASE}/auth/register`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle<{
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  }>);

export const login = (data: { email: string; password: string; deviceName?: string }) =>
  fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle<{
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  }>);

export const refreshToken = (refreshToken: string) =>
  fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: headers(), body: JSON.stringify({ refreshToken }) }).then(
    handle<{ accessToken: string }>
  );

export const getMe = () =>
  fetch(`${API_BASE}/auth/me`, { headers: headers() }).then(handle<{ userId: string; email: string; devices: unknown[] }>);

// Notes
export const fetchNotes = () =>
  fetch(`${API_BASE}/notes`, { headers: headers() }).then(handle<{ notes: Note[] }>);

export const fetchNote = (id: string) =>
  fetch(`${API_BASE}/notes/${id}`, { headers: headers() }).then(handle<{ note: Note }>);

export const createNote = (data: Partial<Note>) =>
  fetch(`${API_BASE}/notes`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handle<{ note: Note }>);

export const updateNote = (id: string, data: Partial<Note> & { version?: number }) =>
  fetch(`${API_BASE}/notes/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(data) }).then(
    handle<{ note: Note; conflict: boolean }>
  );

export const deleteNote = (id: string) =>
  fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE', headers: headers() }).then(handle<{ note: Note }>);

export const restoreNote = (id: string) =>
  fetch(`${API_BASE}/notes/${id}/restore`, { method: 'POST', headers: headers() }).then(handle<{ note: Note }>);

export const searchNotes = (q: string) =>
  fetch(`${API_BASE}/notes/search?q=${encodeURIComponent(q)}`, { headers: headers() }).then(handle<{ notes: Note[] }>);

// Folders
export const fetchFolders = () =>
  fetch(`${API_BASE}/folders`, { headers: headers() }).then(handle<{ folders: Folder[] }>);

export const createFolder = (name: string, color?: string) =>
  fetch(`${API_BASE}/folders`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, color }) }).then(
    handle<{ folder: Folder }>
  );

export const deleteFolder = (id: string) =>
  fetch(`${API_BASE}/folders/${id}`, { method: 'DELETE', headers: headers() }).then(handle<{ success: boolean }>);

// Sync
export const syncWithServer = (body: unknown) =>
  fetch(`${API_BASE}/sync`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(handle<unknown>);

export const getSyncStatus = () =>
  fetch(`${API_BASE}/sync/status`, { headers: headers() }).then(handle<unknown>);

export const getOperationHistory = (noteId: string) =>
  fetch(`${API_BASE}/sync/history/${noteId}`, { headers: headers() }).then(handle<{ operations: unknown[] }>);
