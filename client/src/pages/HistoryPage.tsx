import React, { useEffect, useState } from 'react';
import * as api from '../services/api';

interface Operation {
  id: string;
  operation_type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  base_version?: number;
  result_version?: number;
  conflict: boolean;
  device_name?: string;
}

interface Props {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
}

export const HistoryPage: React.FC<Props> = ({ noteId, noteTitle, onClose }) => {
  const [ops, setOps] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOperationHistory(noteId)
      .then(({ operations }) => setOps(operations))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [noteId]);

  const opColors: Record<string, string> = {
    create: 'text-emerald-400 bg-emerald-950 border-emerald-900',
    update: 'text-blue-400 bg-blue-950 border-blue-900',
    delete: 'text-red-400 bg-red-950 border-red-900',
    restore: 'text-purple-400 bg-purple-950 border-purple-900',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800/60 flex items-center gap-3">
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-lg font-semibold text-white">Operation History</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{noteTitle}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ops.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-600">No operation history yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs text-gray-600 mb-4">
              {ops.length} operations recorded · Each write is immutably logged for sync replay and conflict detection
            </p>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-800" />
              <div className="space-y-3">
                {ops.map((op, i) => (
                  <div key={op.id} className="relative pl-10">
                    <div className="absolute left-3 top-3 w-2.5 h-2.5 rounded-full bg-gray-800 border-2 border-gray-700" />
                    <div className={`border rounded-xl p-3 ${op.conflict ? 'border-red-900/60 bg-red-950/20' : 'border-gray-800/60 bg-gray-900'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${opColors[op.operation_type] || 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                          {op.operation_type}
                        </span>
                        {op.conflict && (
                          <span className="text-xs text-red-400 bg-red-950 border border-red-900 px-2 py-0.5 rounded">⚠ conflict</span>
                        )}
                        {op.base_version != null && op.result_version != null && (
                          <span className="text-xs text-gray-600">v{op.base_version} → v{op.result_version}</span>
                        )}
                        {op.device_name && (
                          <span className="text-xs text-gray-700">{op.device_name}</span>
                        )}
                        <span className="text-xs text-gray-700 ml-auto">
                          {new Date(op.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {op.payload && Object.keys(op.payload).length > 0 && (
                        <div className="text-xs text-gray-600 font-mono bg-gray-950 rounded-lg p-2 mt-1 overflow-x-auto">
                          {JSON.stringify(op.payload, null, 2).slice(0, 200)}
                          {JSON.stringify(op.payload).length > 200 && '…'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
