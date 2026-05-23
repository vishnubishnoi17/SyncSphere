import React, { useState, useRef } from 'react';

// ─── types (inlined so the demo is self-contained) ────────────────────────────
interface DemoNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  is_starred: boolean;
  is_pinned: boolean;
  version: number;
}

type Phase =
  | 'idle'
  | 'offline'
  | 'editing'
  | 'reconnecting'
  | 'resolving'
  | 'done';

interface FieldResult {
  field: string;
  deviceA: string;
  deviceB: string;
  resolved: string;
  strategy: string;
  winner: 'A' | 'B' | 'merge' | 'same';
}

// ─── pure conflict resolver (mirrors src/sync/conflictResolver.ts) ─────────────
function pickLonger(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function resolveConflict(noteA: DemoNote, noteB: DemoNote) {
  const resolved: DemoNote = { ...noteB };
  const results: FieldResult[] = [];

  // title
  const title = pickLonger(noteA.title, noteB.title) || 'Untitled';
  resolved.title = title;
  results.push({
    field: 'title',
    deviceA: noteA.title,
    deviceB: noteB.title,
    resolved: title,
    strategy: 'longer string wins',
    winner: noteA.title === noteB.title ? 'same' : title === noteA.title ? 'A' : 'B',
  });

  // content
  const content = pickLonger(noteA.content, noteB.content) || '';
  resolved.content = content;
  results.push({
    field: 'content',
    deviceA: noteA.content,
    deviceB: noteB.content,
    resolved: content,
    strategy: 'longer string wins',
    winner: noteA.content === noteB.content ? 'same' : content === noteA.content ? 'A' : 'B',
  });

  // tags - union merge
  const tagSet = new Set([...noteA.tags, ...noteB.tags]);
  const tags = Array.from(tagSet);
  resolved.tags = tags;
  results.push({
    field: 'tags',
    deviceA: noteA.tags.join(', ') || '—',
    deviceB: noteB.tags.join(', ') || '—',
    resolved: tags.join(', ') || '—',
    strategy: 'union (both survive)',
    winner: 'merge',
  });

  // is_starred - OR merge
  resolved.is_starred = noteA.is_starred || noteB.is_starred;
  results.push({
    field: 'starred',
    deviceA: noteA.is_starred ? 'yes' : 'no',
    deviceB: noteB.is_starred ? 'yes' : 'no',
    resolved: resolved.is_starred ? 'yes' : 'no',
    strategy: 'OR merge (if either set it, keep)',
    winner: noteA.is_starred === noteB.is_starred ? 'same' : 'merge',
  });

  resolved.version = noteB.version + 1;
  return { resolved, results };
}

// ─── preset scenarios ─────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    label: 'Meeting notes conflict',
    base: {
      id: 'demo-1',
      title: 'Q3 Planning',
      content: 'Attendees: Alice, Bob\n\nAgenda TBD',
      tags: ['work'],
      is_starred: false,
      is_pinned: false,
      version: 3,
    },
    deviceA: {
      title: 'Q3 Planning Meeting',
      content: 'Attendees: Alice, Bob, Carol\n\nAgenda:\n- Budget review\n- Roadmap discussion',
      tags: ['work', 'planning'],
      is_starred: true,
    },
    deviceB: {
      title: 'Q3 Planning',
      content: 'Attendees: Alice, Bob\n\nAgenda:\n- Budget review\n- Hiring update\n- OKR check-in',
      tags: ['work', 'q3', 'meeting'],
      is_starred: false,
    },
  },
  {
    label: 'Research note conflict',
    base: {
      id: 'demo-2',
      title: 'Paper notes',
      content: 'Read: intro section',
      tags: ['research'],
      is_starred: false,
      is_pinned: false,
      version: 1,
    },
    deviceA: {
      title: 'Paper notes — Attention Is All You Need',
      content: 'Read: intro section\n\nKey insight: attention mechanism replaces recurrence entirely',
      tags: ['research', 'ml'],
      is_starred: true,
    },
    deviceB: {
      title: 'Paper notes',
      content: 'Read: intro section\n\nFigure 1 shows the encoder-decoder structure.\nPositional encoding handles sequence order.',
      tags: ['research', 'transformers', 'reading'],
      is_starred: false,
    },
  },
];

// ─── sub-components ────────────────────────────────────────────────────────────
const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${color}`}
  >
    {children}
  </span>
);

const WinnerBadge: React.FC<{ winner: FieldResult['winner'] }> = ({ winner }) => {
  if (winner === 'same') return <Badge color="bg-gray-800 text-gray-400">unchanged</Badge>;
  if (winner === 'A') return <Badge color="bg-blue-900/60 text-blue-300">device A won</Badge>;
  if (winner === 'B') return <Badge color="bg-purple-900/60 text-purple-300">device B won</Badge>;
  return <Badge color="bg-emerald-900/60 text-emerald-300">merged</Badge>;
};

const DevicePanel: React.FC<{
  label: string;
  color: 'blue' | 'purple';
  note: { title: string; content: string; tags: string[]; is_starred: boolean };
  onChange: (field: string, value: string | string[] | boolean) => void;
  offline: boolean;
  editing: boolean;
}> = ({ label, color, note, onChange, offline, editing }) => {
  const borderColor = color === 'blue' ? 'border-blue-700/50' : 'border-purple-700/50';
  const headerColor = color === 'blue' ? 'bg-blue-900/30 text-blue-300' : 'bg-purple-900/30 text-purple-300';
  const dotColor = offline ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <div className={`flex-1 min-w-0 border ${borderColor} rounded-xl overflow-hidden bg-gray-900`}>
      {/* header */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${headerColor} border-b border-gray-800/50`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {offline && (
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800/50 px-2 py-0.5 rounded-full">
              offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-xs opacity-70">{offline ? 'no connection' : 'connected'}</span>
        </div>
      </div>

      {/* fields */}
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Title</label>
          <input
            type="text"
            value={note.title}
            onChange={e => onChange('title', e.target.value)}
            disabled={!editing}
            className="w-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white
              focus:outline-none focus:border-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Content</label>
          <textarea
            value={note.content}
            onChange={e => onChange('content', e.target.value)}
            disabled={!editing}
            rows={5}
            className="w-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white
              focus:outline-none focus:border-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors resize-none font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tags (comma separated)</label>
          <input
            type="text"
            value={note.tags.join(', ')}
            onChange={e => onChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            disabled={!editing}
            className="w-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white
              focus:outline-none focus:border-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`starred-${color}`}
            checked={note.is_starred}
            onChange={e => onChange('is_starred', e.target.checked)}
            disabled={!editing}
            className="accent-indigo-500 disabled:cursor-not-allowed"
          />
          <label htmlFor={`starred-${color}`} className="text-sm text-gray-400">Starred</label>
        </div>
      </div>
    </div>
  );
};

const MergeResultRow: React.FC<{ result: FieldResult; visible: boolean; delay: number }> = ({ result, visible, delay }) => (
  <tr
    className="transition-all duration-500"
    style={{ opacity: visible ? 1 : 0, transitionDelay: `${delay}ms` }}
  >
    <td className="py-2 px-3 text-xs font-mono text-gray-400 font-medium">{result.field}</td>
    <td className="py-2 px-3 text-xs text-blue-300 max-w-[140px] truncate" title={result.deviceA}>
      {result.deviceA}
    </td>
    <td className="py-2 px-3 text-xs text-purple-300 max-w-[140px] truncate" title={result.deviceB}>
      {result.deviceB}
    </td>
    <td className="py-2 px-3 text-xs text-emerald-300 max-w-[160px] truncate" title={result.resolved}>
      {result.resolved}
    </td>
    <td className="py-2 px-3">
      <WinnerBadge winner={result.winner} />
    </td>
    <td className="py-2 px-3 text-xs text-gray-600 hidden md:table-cell">{result.strategy}</td>
  </tr>
);

// ─── main component ────────────────────────────────────────────────────────────
export const ConflictDemo: React.FC = () => {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = SCENARIOS[scenarioIdx];

  const makeNote = (base: typeof scenario.base, overrides: Partial<typeof scenario.deviceA>): DemoNote => ({
    ...base,
    ...overrides,
    id: base.id,
    is_pinned: base.is_pinned,
    version: base.version,
  });

  const [noteA, setNoteA] = useState<DemoNote>(() => makeNote(scenario.base, scenario.deviceA));
  const [noteB, setNoteB] = useState<DemoNote>(() => makeNote(scenario.base, scenario.deviceB));
  const [phase, setPhase] = useState<Phase>('idle');
  const [resolveResults, setResolveResults] = useState<FieldResult[]>([]);
  const [resolvedNote, setResolvedNote] = useState<DemoNote | null>(null);
  const [visibleRows, setVisibleRows] = useState(0);
  const [reconnectProgress, setReconnectProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = (idx = scenarioIdx) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const s = SCENARIOS[idx];
    setNoteA(makeNote(s.base, s.deviceA));
    setNoteB(makeNote(s.base, s.deviceB));
    setPhase('idle');
    setResolveResults([]);
    setResolvedNote(null);
    setVisibleRows(0);
    setReconnectProgress(0);
  };

  const changeScenario = (idx: number) => {
    setScenarioIdx(idx);
    reset(idx);
  };

  // step 1: go offline + start editing
  const handleGoOffline = () => {
    setPhase('editing');
  };

  // step 2: reconnect — simulate progress then resolve
  const handleReconnect = () => {
    setPhase('reconnecting');
    setReconnectProgress(0);

    const step = (progress: number) => {
      setReconnectProgress(progress);
      if (progress < 100) {
        timerRef.current = setTimeout(() => step(progress + 10), 80);
      } else {
        timerRef.current = setTimeout(() => {
          const { resolved, results } = resolveConflict(noteA, noteB);
          setResolvedNote(resolved);
          setResolveResults(results);
          setPhase('resolving');
          setVisibleRows(0);

          results.forEach((_, i) => {
            timerRef.current = setTimeout(() => {
              setVisibleRows(i + 1);
              if (i === results.length - 1) {
                timerRef.current = setTimeout(() => setPhase('done'), 600);
              }
            }, 300 + i * 400);
          });
        }, 200);
      }
    };
    step(0);
  };

  const updateA = (field: string, value: string | string[] | boolean) =>
    setNoteA(n => ({ ...n, [field]: value }));
  const updateB = (field: string, value: string | string[] | boolean) =>
    setNoteB(n => ({ ...n, [field]: value }));

  const isOffline = phase === 'editing';
  const isEditing = phase === 'editing';

  const stepLabels: { key: Phase; label: string; desc: string }[] = [
    { key: 'idle', label: '1. Setup', desc: 'Two devices, same note, synced' },
    { key: 'editing', label: '2. Offline edits', desc: 'Both devices edit independently' },
    { key: 'reconnecting', label: '3. Reconnect', desc: 'Devices come back online' },
    { key: 'resolving', label: '4. Merge', desc: 'Field-level conflict resolution' },
    { key: 'done', label: '5. Resolved', desc: 'Merged note ready' },
  ];

  const phaseOrder: Phase[] = ['idle', 'editing', 'reconnecting', 'resolving', 'done'];
  const currentPhaseIdx = phaseOrder.indexOf(phase);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-950">
      <div className="max-w-5xl mx-auto">

        {/* header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-indigo-900/50 text-indigo-400 border border-indigo-800/50 px-2 py-0.5 rounded-full font-medium">
                Interactive Demo
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">Conflict Resolution Demo</h2>
            <p className="text-sm text-gray-500 mt-1">
              Two devices edit the same note offline. Watch field-level merge resolve both edits — no data lost.
            </p>
          </div>
          <div className="flex gap-2">
            {SCENARIOS.map((s, i) => (
              <button
                key={i}
                onClick={() => changeScenario(i)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  scenarioIdx === i
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* progress stepper */}
        <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
          {stepLabels.map((s, i) => {
            const done = phaseOrder.indexOf(s.key) < currentPhaseIdx;
            const active = s.key === phase || (s.key === 'resolving' && phase === 'done');
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-col items-center min-w-[90px]">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : active
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-600'
                  }`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <p className={`text-xs mt-1 font-medium ${active ? 'text-white' : done ? 'text-emerald-400' : 'text-gray-600'}`}>
                    {s.label}
                  </p>
                  <p className="text-xs text-gray-700 text-center leading-tight max-w-[80px]">{s.desc}</p>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-[-18px] min-w-[24px] transition-colors ${done ? 'bg-emerald-600' : 'bg-gray-800'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* device panels */}
        <div className="flex gap-4 mb-4">
          <DevicePanel
            label="Device A — Laptop"
            color="blue"
            note={noteA}
            onChange={updateA}
            offline={isOffline}
            editing={isEditing}
          />
          <DevicePanel
            label="Device B — Phone"
            color="purple"
            note={noteB}
            onChange={updateB}
            offline={isOffline}
            editing={isEditing}
          />
        </div>

        {/* action buttons */}
        <div className="flex gap-3 mb-6 justify-center">
          {phase === 'idle' && (
            <button
              onClick={handleGoOffline}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <span>✈</span> Go offline & edit
            </button>
          )}
          {phase === 'editing' && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <span>↑</span> Reconnect & sync
            </button>
          )}
          {(phase === 'resolving' || phase === 'done' || phase === 'reconnecting') && (
            <button
              onClick={() => reset()}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors border border-gray-700"
            >
              ↺ Reset demo
            </button>
          )}
        </div>

        {/* reconnect progress */}
        {phase === 'reconnecting' && (
          <div className="mb-6 bg-gray-900 border border-gray-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-400">Syncing operations to server...</p>
              <p className="text-sm text-indigo-400 font-mono">{reconnectProgress}%</p>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-100"
                style={{ width: `${reconnectProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* merge result table */}
        {(phase === 'resolving' || phase === 'done') && resolveResults.length > 0 && (
          <div className="bg-gray-900 border border-gray-800/60 rounded-xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-white">Field-level merge in progress</h3>
              <span className="text-xs text-gray-600 ml-auto">strategy: field-level-merge</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800/60">
                    <th className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Field</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-blue-600 uppercase tracking-wide">Device A</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wide">Device B</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-emerald-600 uppercase tracking-wide">Resolved</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Winner</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide hidden md:table-cell">Strategy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {resolveResults.map((r, i) => (
                    <MergeResultRow key={r.field} result={r} visible={i < visibleRows} delay={0} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* resolved note */}
        {phase === 'done' && resolvedNote && (
          <div className="bg-gray-900 border border-emerald-800/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60 bg-emerald-900/10 flex items-center gap-2">
              <span className="text-emerald-400 text-base">✓</span>
              <h3 className="text-sm font-semibold text-emerald-300">Resolved note — no data lost</h3>
              <span className="text-xs text-gray-600 ml-auto">version {resolvedNote.version}</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-medium mb-1">Title</p>
                <p className="text-sm text-white font-medium">{resolvedNote.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-medium mb-1">Content</p>
                <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap bg-gray-800/50 rounded-lg p-3">
                  {resolvedNote.content}
                </pre>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-medium mb-1">Tags</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {resolvedNote.tags.map(t => (
                      <span key={t} className="text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-medium mb-1">Starred</p>
                  <p className="text-sm text-gray-300">{resolvedNote.is_starred ? '⭐ yes' : 'no'}</p>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-800/60 bg-gray-900/50">
              <p className="text-xs text-gray-600">
                Both devices will receive this resolved version on next sync pull.
                The longer title/content survived; tags were union-merged; starred is OR-merged.
                <span className="text-amber-600 ml-2">
                  Known tradeoff: intentional deletions lose to longer content — next step would be CRDT-based char-level merge.
                </span>
              </p>
            </div>
          </div>
        )}

        {/* explainer card (shown at idle/editing) */}
        {(phase === 'idle' || phase === 'editing') && (
          <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              How conflict resolution works in SyncSphere
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-300 font-medium mb-1">Typical apps (last-write-wins)</p>
                <p>Device B syncs last → Device A's edits are silently overwritten. You lose work with no warning.</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-emerald-300 font-medium mb-1">SyncSphere (field-level merge)</p>
                <p>Each field resolved independently. Longer content wins; tags are union-merged; booleans are OR-merged. Neither device loses its work.</p>
              </div>
            </div>
            {phase === 'idle' && (
              <p className="text-xs text-gray-600 mt-3">
                → Click <span className="text-white">Go offline & edit</span> to simulate both devices losing connection and editing independently.
              </p>
            )}
            {phase === 'editing' && (
              <p className="text-xs text-amber-600 mt-3">
                ✈ Both devices are offline. Edit the fields above however you like, then click <span className="text-white">Reconnect & sync</span>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};