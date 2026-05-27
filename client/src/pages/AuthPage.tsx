import React, { useState } from 'react';
import * as api from '../services/api';
import { useAuthStore } from '../state/authStore';
import { useNotesStore } from '../state/notesStore';
import { clearLocalWorkspaceData } from '../storage/db';

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuthStore();
  const resetNotes = useNotesStore((state) => state.reset);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await api.register({ email, password, name, deviceName: 'Web Browser' });
        if (user?.id !== res.user.id) {
          await clearLocalWorkspaceData();
          resetNotes();
        }
        login(res.user, res.accessToken, res.refreshToken, res.deviceId);
      } else {
        const res = await api.login({ email, password, deviceName: 'Web Browser' });
        if (user?.id !== res.user.id) {
          await clearLocalWorkspaceData();
          resetNotes();
        }
        login(res.user, res.accessToken, res.refreshToken, res.deviceId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(20,184,166,0.22),transparent_26rem),radial-gradient(circle_at_88%_82%,rgba(245,158,11,0.15),transparent_24rem)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/[0.04] to-transparent" />

      <div className="relative w-full max-w-5xl grid gap-8 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-medium text-teal-200 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
            Local-first sync workspace
          </div>
          <h1 className="text-5xl font-black tracking-tight leading-[0.95] max-w-lg">
            Notes that keep moving, even when your network does not.
          </h1>
          <p className="text-slate-400 mt-5 max-w-md leading-relaxed">
            Write offline, queue changes, resolve conflicts, and pick up from another device without losing the thread.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-8 max-w-lg">
            {[
              ['Offline', 'IndexedDB cache'],
              ['Realtime', 'Socket presence'],
              ['Safe sync', 'Operation log'],
            ].map(([label, sub]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="font-semibold text-white">{label}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-7 lg:text-left">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-amber-300 rounded-2xl flex items-center justify-center mx-auto lg:mx-0 mb-4 shadow-lg shadow-teal-950">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">SyncSphere</h1>
          <p className="text-slate-400 mt-2">Private local-first notes with real-time sync.</p>
        </div>

        <div className="bg-white/[0.06] border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="flex gap-2 mb-6 rounded-2xl bg-slate-950/70 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                type="button"
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-teal-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/70"
                  placeholder="Your name"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/70"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-teal-400/70"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-2.5 text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-colors shadow-lg shadow-teal-950/40"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-600 mt-4">
          Your cached workspace is isolated per signed-in account.
        </p>
        </div>
      </div>
    </div>
  );
};
