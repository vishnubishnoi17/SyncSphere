import React, { useEffect, useState } from 'react';
import * as api from '../services/api';
import { db } from '../storage/db';
import { useAuthStore } from '../state/authStore';

interface SyncStatus {
  devices: Array<{
    id: string;
    device_name: string;
    device_type: string;
    last_seen: string;
    last_sync_at?: string;
    pending_ops_count?: number;
  }>;
  totalConflicts: number;
}

export const SyncDashboard: React.FC = () => {
  const userId = useAuthStore((state) => state.user?.id);
  const deviceId = useAuthStore((state) => state.deviceId);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [totalNotes, setTotalNotes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await api.getSyncStatus() as SyncStatus;
        setStatus(s);
        const ops = deviceId ? await db.pendingOps.where('deviceId').equals(deviceId).count() : 0;
        setPendingOps(ops);
        const notes = userId ? await db.notes.where('user_id').equals(userId).and(n => !n.deleted).count() : 0;
        setTotalNotes(notes);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [deviceId, userId]);

  const StatCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
    <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-4 shadow-sm shadow-black/20">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Sync Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Account-scoped sync health, local queue, and active device sessions.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Notes" value={totalNotes} sub="in local DB" />
          <StatCard label="Pending Ops" value={pendingOps} sub="waiting to sync" color={pendingOps > 0 ? 'text-amber-400' : 'text-emerald-400'} />
          <StatCard label="Conflicts" value={status?.totalConflicts ?? 0} sub="total detected" color={status?.totalConflicts ? 'text-red-400' : 'text-emerald-400'} />
          <StatCard label="Devices" value={status?.devices.length ?? 0} sub="registered" />
        </div>

        {/* Architecture explainer */}
        <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
            Sync Architecture
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-center">
              <p className="text-indigo-400 font-medium">IndexedDB</p>
              <p>Local writes</p>
            </div>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-center">
              <p className="text-amber-400 font-medium">Offline Queue</p>
              <p>Pending ops</p>
            </div>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-center">
              <p className="text-emerald-400 font-medium">SyncEngine</p>
              <p>Push + pull</p>
            </div>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-center">
              <p className="text-purple-400 font-medium">PostgreSQL</p>
              <p>Source of truth</p>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-600 leading-relaxed">
            Conflict resolution strategy: <span className="text-indigo-400">field-level merge</span>. Local changes are queued offline, replayed safely, and pulled back into this account only.
          </div>
        </div>

        {/* Devices */}
        <div className="bg-gray-900 border border-gray-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60">
            <h3 className="text-sm font-semibold text-white">Device Sessions</h3>
          </div>
          {status?.devices.length === 0 ? (
            <p className="text-sm text-gray-600 p-4">No devices registered</p>
          ) : (
            <div className="divide-y divide-gray-800/40">
              {status?.devices.map(device => {
                const lastSeen = new Date(device.last_seen);
                const isRecent = Date.now() - lastSeen.getTime() < 5 * 60 * 1000;
                return (
                  <div key={device.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isRecent ? 'bg-emerald-500' : 'bg-gray-700'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-200">{device.device_name}</p>
                        <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{device.device_type}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Last seen: {lastSeen.toLocaleString()}
                        {device.last_sync_at && ` · Synced: ${new Date(device.last_sync_at).toLocaleString()}`}
                      </p>
                    </div>
                    {device.pending_ops_count != null && device.pending_ops_count > 0 && (
                      <span className="text-xs bg-amber-900/50 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full">
                        {device.pending_ops_count} pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
