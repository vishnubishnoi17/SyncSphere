import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { configureAuthHandlers, setAuthToken } from '../services/api';
import type { AuthState, User } from '../types';

interface AuthStore extends AuthState {
  login: (user: User, accessToken: string, refreshToken: string, deviceId: string) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      deviceId: null,

      login: (user, accessToken, refreshToken, deviceId) => {
        setAuthToken(accessToken);
        set({ user, accessToken, refreshToken, deviceId });
      },

      logout: () => {
        setAuthToken(null);
        set({ user: null, accessToken: null, refreshToken: null, deviceId: null });
      },

      setAccessToken: (token) => {
        setAuthToken(token);
        set({ accessToken: token });
      },
    }),
    {
      name: 'syncsphere-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) setAuthToken(state.accessToken);
      },
    }
  )
);

configureAuthHandlers({
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onAccessTokenRefresh: (token) => useAuthStore.getState().setAccessToken(token),
  onAuthFailure: () => useAuthStore.getState().logout(),
});
