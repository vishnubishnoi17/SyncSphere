const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeApiBase = (): string => {
  const raw = import.meta.env.VITE_API_URL?.trim();

  if (!raw) {
    if (import.meta.env.PROD) {
      throw new Error('VITE_API_URL is required for production deployments');
    }
    return 'http://localhost:3001/api';
  }

  const base = trimTrailingSlash(raw);
  return base.endsWith('/api') ? base : `${base}/api`;
};

const normalizeWsBase = (apiBase: string): string => {
  const raw = import.meta.env.VITE_WS_URL?.trim();
  if (raw) return trimTrailingSlash(raw);

  if (!import.meta.env.PROD) return 'http://localhost:3001';

  const apiUrl = new URL(apiBase);
  return apiUrl.origin;
};

export const API_BASE = normalizeApiBase();
export const WS_BASE = normalizeWsBase(API_BASE);
