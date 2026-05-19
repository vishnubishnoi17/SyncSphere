import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Note, ConflictInfo } from '../types';

// ─── Mirrors conflictResolver.ts exactly ─────────────────────────────────────
const pickLonger = (a: string, b: string): string => {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
};

const resolveConflict = (localNote: Note, serverNote: Note): ConflictInfo => {
  const resolvedNote: Note = { ...serverNote };
  resolvedNote.title = pickLonger(localNote.title, serverNote.title) || 'Untitled';
  resolvedNote.content = pickLonger(localNote.content, serverNote.content) || '';
  const tagSet = new Set([...(localNote.tags || []), ...(serverNote.tags || [])]);
  resolvedNote.tags = Array.from(tagSet);
  resolvedNote.is_starred = localNote.is_starred || serverNote.is_starred;
  resolvedNote.is_pinned = localNote.is_pinned || serverNote.is_pinned;
  resolvedNote.folder_id = serverNote.folder_id ?? localNote.folder_id;
  resolvedNote.version = serverNote.version + 1;
  resolvedNote._syncStatus = 'synced';
  resolvedNote._isDirty = false;
  return { noteId: localNote.id, localNote, serverNote, resolvedNote, strategy: 'field-level-merge' };
};

// ─── Word diff ────────────────────────────────────────────────────────────────
type DiffToken = { type: 'same' | 'added' | 'removed'; text: string };

function computeWordDiff(base: string, changed: string): DiffToken[] {
  const bWords = (base || '').split(/(\s+)/);
  const cWords = (changed || '').split(/(\s+)/);
  const result: DiffToken[] = [];
  const maxLen = Math.max(bWords.length, cWords.length);
  for (let i = 0; i < maxLen; i++) {
    const bw = bWords[i] ?? '';
    const cw = cWords[i] ?? '';
    if (bw === cw) result.push({ type: 'same', text: cw });
    else {
      if (bw) result.push({ type: 'removed', text: bw });
      if (cw) result.push({ type: 'added', text: cw });
    }
  }
  return result;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface LogEntry { id: number; ts: string; msg: string; type: 'info' | 'warn' | 'conflict' | 'resolve' | 'success' }
type DeviceStatus = 'synced' | 'offline' | 'syncing';

const BASE_NOTE: Note = {
  id: 'note_demo_001',
  user_id: 'user_demo',
  folder_id: null,
  title: 'Q3 Product Roadmap',
  content: 'Launch the new dashboard by end of quarter.',
  tags: ['product', 'q3'],
  is_starred: false,
  is_pinned: false,
  version: 4,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted: false,
  _isDirty: false,
  _syncStatus: 'synced',
};

const STEPS = [
  'Devices in sync',
  'Both offline — edit independently',
  'Edit both devices, then sync',
  'Syncing…',
  'Conflict resolved ✓',
];

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Sub-components ───────────────────────────────────────────────────────────
const StatusPill: React.FC<{ status: DeviceStatus }> = ({ status }) => {
  const map: Record<DeviceStatus, { border: string; color: string; label: string }> = {
    offline: { border: '#f97316', color: '#f97316', label: '● OFFLINE' },
    syncing: { border: '#38bdf8', color: '#38bdf8', label: '◌ SYNCING' },
    synced: { border: '#4ade80', color: '#4ade80', label: '● SYNCED' },
  };
  const s = map[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: `${s.border}18`, border: `1px solid ${s.border}`,
      color: s.color, fontSize: 10,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontWeight: 600, letterSpacing: '0.08em', transition: 'all 0.4s ease',
    }}>
      {s.label}
    </span>
  );
};

const TagChip: React.FC<{ tag: string; source: 'A' | 'B' | 'merged' }> = ({ tag, source }) => {
  const c = source === 'A' ? '#f97316' : source === 'B' ? '#38bdf8' : '#4ade80';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      border: `1px solid ${c}40`, background: `${c}15`,
      color: c, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
      margin: '2px 3px',
    }}>{tag}</span>
  );
};

interface DiffViewProps { base: string; changed: string }
const DiffView: React.FC<DiffViewProps> = ({ base, changed }) => {
  if (base === changed) return <span style={{ color: '#e2e8f0' }}>{changed || <span style={{ color: '#334155' }}>—</span>}</span>;
  const diff = computeWordDiff(base, changed);
  return (
    <>
      {diff.map((tok, i) =>
        tok.type === 'same' ? <span key={i} style={{ color: '#e2e8f0' }}>{tok.text}</span>
        : tok.type === 'added' ? <span key={i} style={{ background: '#4ade8030', color: '#4ade80', borderRadius: 3, padding: '0 2px' }}>{tok.text}</span>
        : <span key={i} style={{ background: '#ef444420', color: '#f87171', textDecoration: 'line-through', borderRadius: 3, padding: '0 2px' }}>{tok.text}</span>
      )}
    </>
  );
};

interface FieldRowProps {
  label: string;
  valueA: string;
  valueB: string;
  resolved: string;
  showDiff: boolean;
  pickedFrom?: 'A' | 'B';
}
const FieldRow: React.FC<FieldRowProps> = ({ label, valueA, valueB, resolved, showDiff, pickedFrom }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 8 }}>
    {[
      { val: valueA, color: '#f97316', border: '#f9731635' },
      { val: valueB, color: '#38bdf8', border: '#38bdf835' },
    ].map(({ val, color, border }, i) => (
      <div key={i} style={{ padding: '7px 9px', borderRadius: 7, background: '#0d1117', border: `1px solid ${border}` }}>
        <div style={{ fontSize: 9, color, marginBottom: 3, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#e2e8f0', wordBreak: 'break-word' }}>{val || <span style={{ color: '#334155' }}>—</span>}</div>
      </div>
    ))}
    <div style={{ padding: '7px 9px', borderRadius: 7, background: '#091209', border: '1px solid #4ade8050', position: 'relative' }}>
      <div style={{ fontSize: 9, color: '#4ade80', marginBottom: 3, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>resolved</div>
      <div style={{ fontSize: 11, lineHeight: 1.6, wordBreak: 'break-word' }}>
        {showDiff
          ? <DiffView base={pickedFrom === 'A' ? valueB : valueA} changed={resolved} />
          : <span style={{ color: '#e2e8f0' }}>{resolved || <span style={{ color: '#334155' }}>—</span>}</span>
        }
      </div>
      {pickedFrom && (
        <div style={{
          position: 'absolute', top: 5, right: 7, fontSize: 8, color: '#4ade80',
          background: '#4ade8020', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em',
        }}>
          PICKED {pickedFrom}
        </div>
      )}
    </div>
  </div>
);

interface DevicePanelProps {
  which: 'A' | 'B';
  label: string;
  note: Note;
  status: DeviceStatus;
  onEdit: (delta: Partial<Note>) => void;
}
const DevicePanel: React.FC<DevicePanelProps> = ({ which, label, note, status, onEdit }) => {
  const color = which === 'A' ? '#f97316' : '#38bdf8';
  const editable = status === 'offline';

  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.currentTarget.value.trim().replace(',', '');
      if (val && !note.tags.includes(val)) {
        onEdit({ tags: [...note.tags, val] });
      }
      e.currentTarget.value = '';
    }
  };

  const bg = editable ? '#161b22' : '#0d1117';
  const bdr = editable ? `1px solid ${color}50` : '1px solid #1e293b';
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7,
    background: bg, border: bdr, color: '#e2e8f0', fontSize: 12, outline: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    cursor: editable ? 'text' : 'not-allowed', transition: 'all 0.2s', boxSizing: 'border-box',
  };

  return (
    <div style={{
      flex: 1, minWidth: 0, background: '#0d1117',
      border: `1px solid ${color}40`, borderRadius: 12, overflow: 'hidden',
      boxShadow: editable ? `0 0 20px ${color}20` : 'none', transition: 'all 0.3s',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${color}25`,
        background: `linear-gradient(135deg, ${color}10, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7, background: `${color}20`,
            border: `1px solid ${color}60`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 700, color,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{which}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{label}</div>
            <div style={{ fontSize: 9, color: '#475569' }}>device_{which.toLowerCase()}_sim · v{note.version}</div>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Fields */}
      <div style={{ padding: 14 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Title</div>
          <input
            value={note.title} disabled={!editable}
            onChange={e => onEdit({ title: e.target.value })}
            placeholder="Note title…" style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Content</div>
          <textarea
            value={note.content} disabled={!editable} rows={4}
            onChange={e => onEdit({ content: e.target.value })}
            placeholder="Write something…"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tags <span style={{ color: '#334155' }}>(Enter to add)</span></div>
          <div style={{ marginBottom: 5 }}>{note.tags.map(t => <TagChip key={t} tag={t} source={which} />)}</div>
          <input onKeyDown={handleTagKey} disabled={!editable} placeholder="Add tag…"
            style={{ ...inputStyle, fontSize: 11, padding: '5px 9px' }} />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {(['is_starred', 'is_pinned'] as const).map(field => (
            <label key={field} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
              color: note[field] ? color : '#475569',
              cursor: editable ? 'pointer' : 'not-allowed',
            }}>
              <input type="checkbox" checked={note[field]} disabled={!editable}
                onChange={e => onEdit({ [field]: e.target.checked })}
                style={{ accentColor: color }} />
              {field === 'is_starred' ? '★ Starred' : '📌 Pinned'}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
interface Props { onClose?: () => void }

export const ConflictSimulator: React.FC<Props> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [noteA, setNoteA] = useState<Note>({ ...BASE_NOTE });
  const [noteB, setNoteB] = useState<Note>({ ...BASE_NOTE });
  const [result, setResult] = useState<ConflictInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-28), { id: Date.now() + Math.random(), ts, msg, type }]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const getStatus = (): DeviceStatus => {
    if (step === 0) return 'synced';
    if (step === 1 || step === 2) return 'offline';
    if (step === 3) return 'syncing';
    return 'synced';
  };

  const handleNext = async () => {
    if (step === 0) {
      addLog('Network disconnected on both devices', 'warn');
      addLog('Writes will queue in IndexedDB locally', 'info');
      setStep(2);
    } else if (step === 2) {
      const changed = (n: Note) =>
        n.title !== BASE_NOTE.title || n.content !== BASE_NOTE.content ||
        JSON.stringify(n.tags) !== JSON.stringify(BASE_NOTE.tags) ||
        n.is_starred !== BASE_NOTE.is_starred || n.is_pinned !== BASE_NOTE.is_pinned;

      if (!changed(noteA) || !changed(noteB)) {
        addLog('⚠ Edit BOTH devices before syncing', 'warn');
        return;
      }
      setStep(3); setSyncing(true);
      addLog('Devices reconnected — draining offline queue…', 'info');
      await sleep(380);
      addLog(`Device A pushing op: update note v${noteA.version}`, 'info');
      await sleep(300);
      addLog(`Device B pushing op: update note v${noteB.version}`, 'info');
      await sleep(320);
      addLog('Server: clientVersion < serverVersion → CONFLICT DETECTED ⚡', 'conflict');
      await sleep(320);
      addLog('Running field-level merge strategy…', 'info');
      await sleep(200);

      const serverNote: Note = { ...noteA, version: noteA.version + 1 };
      const res = resolveConflict(noteB, serverNote);
      setResult(res);

      const fields: Array<[keyof Note, string]> = [
        ['title', 'content heuristic'],
        ['content', 'content heuristic'],
        ['tags', 'union merge'],
        ['is_starred', 'OR merge'],
        ['is_pinned', 'OR merge'],
      ];
      for (const [f, strat] of fields) {
        if (JSON.stringify(noteA[f]) !== JSON.stringify(noteB[f])) {
          if (f === 'tags') {
            addLog(`tags: union merge → [${res.resolvedNote.tags.join(', ')}]`, 'resolve');
          } else if (f === 'is_starred' || f === 'is_pinned') {
            addLog(`${f}: OR merge → ${res.resolvedNote[f]}`, 'resolve');
          } else {
            const winner = JSON.stringify(res.resolvedNote[f]) === JSON.stringify(noteA[f]) ? 'A' : 'B';
            addLog(`${f}: picked Device ${winner} (${strat})`, 'resolve');
          }
          await sleep(180);
        }
      }
      addLog(`Resolved → v${res.resolvedNote.version} · zero data lost ✓`, 'success');
      setSyncing(false); setStep(4);
    } else if (step === 4) {
      setStep(0); setNoteA({ ...BASE_NOTE }); setNoteB({ ...BASE_NOTE });
      setResult(null); setLogs([]);
    }
  };

  const status = getStatus();
  const canNext = !syncing && step !== 3;

  const logColor = (type: LogEntry['type']) => {
    if (type === 'conflict') return '#f472b6';
    if (type === 'resolve') return '#38bdf8';
    if (type === 'success') return '#4ade80';
    if (type === 'warn') return '#f97316';
    return '#475569';
  };
  const logIcon = (type: LogEntry['type']) => {
    if (type === 'conflict') return '⚡';
    if (type === 'resolve') return '→';
    if (type === 'success') return '✓';
    if (type === 'warn') return '⚠';
    return '›';
  };

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      background: '#0a0e17', color: '#e2e8f0',
      height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeInLog { from{opacity:0} to{opacity:1} }
        .sim-log-entry { animation: fadeInLog 0.2s ease; }
        .sim-resolved { animation: slideUp 0.4s ease; }
        .sim-input:focus { border-color: inherit !important; }
      `}</style>

      {/* Top bar */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid #1e293b', background: '#070b12',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff',
            background: 'linear-gradient(135deg, #f97316, #38bdf8)',
            boxShadow: '0 0 14px #f9731440',
          }}>S</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.04em' }}>SyncSphere</div>
            <div style={{ fontSize: 9, color: '#334155', letterSpacing: '0.07em' }}>CONFLICT SIMULATOR · DEMO MODE</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Step dots */}
          <span style={{ fontSize: 9, color: '#334155', marginRight: 3 }}>STEP {step + 1}/5</span>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 4,
              background: i < step ? '#4ade80' : i === step ? '#f97316' : '#1e293b',
              transition: 'all 0.3s ease',
            }} />
          ))}
          {onClose && (
            <button onClick={onClose} style={{
              marginLeft: 12, background: 'none', border: '1px solid #1e293b',
              color: '#475569', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>✕ Close</button>
          )}
        </div>
      </div>

      {/* Step bar */}
      <div style={{
        padding: '9px 18px', background: '#0d1117', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: step === 0 || step === 4 ? '#4ade80' : step === 3 ? '#38bdf8' : '#f97316',
            boxShadow: `0 0 7px ${step === 0 || step === 4 ? '#4ade80' : step === 3 ? '#38bdf8' : '#f97316'}`,
            animation: step === 3 ? 'pulse 0.8s infinite' : 'none',
          }} />
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{STEPS[step]}</span>
        </div>
        <button
          onClick={handleNext} disabled={!canNext}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: canNext ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#1e293b',
            color: canNext ? '#fff' : '#334155', fontSize: 11, fontWeight: 700,
            cursor: canNext ? 'pointer' : 'not-allowed',
            letterSpacing: '0.05em', fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: canNext ? '0 0 14px #f9731440' : 'none',
          }}
        >
          {syncing ? '⏳ RESOLVING…'
            : ['Go Offline →', '↑ Edit both, then sync', 'Sync Now →', 'Syncing…', '↺ Reset'][step]}
        </button>
      </div>

      {/* Device panels */}
      <div style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <DevicePanel which="A" label="Device A — your laptop" note={noteA} status={status}
          onEdit={delta => setNoteA(p => ({ ...p, ...delta }))} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 55, flexShrink: 0, width: 32 }}>
          <span style={{ fontSize: step === 2 ? 22 : 18, color: step === 0 ? '#4ade80' : step === 4 ? '#4ade80' : step === 3 ? '#38bdf8' : '#f97316' }}>
            {step === 0 ? '⇄' : step === 1 || step === 2 ? '⚡' : step === 3 ? '◌' : '✓'}
          </span>
          <div style={{ width: 1, height: 36, background: step >= 2 ? '#f9731440' : '#1e293b', transition: 'background 0.4s' }} />
        </div>

        <DevicePanel which="B" label="Device B — your phone" note={noteB} status={status}
          onEdit={delta => setNoteB(p => ({ ...p, ...delta }))} />
      </div>

      {/* Resolution panel */}
      {result && (
        <div className="sim-resolved" style={{
          margin: '0 18px 14px', background: '#091209',
          border: '1px solid #4ade8040', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '11px 14px', borderBottom: '1px solid #4ade8025',
            background: 'linear-gradient(135deg, #4ade8012, transparent)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14 }}>✓</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', letterSpacing: '0.04em' }}>
              FIELD-LEVEL MERGE COMPLETE
            </span>
            <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto' }}>
              strategy: field-level-merge · v{result.resolvedNote.version}
            </span>
          </div>
          <div style={{ padding: 14 }}>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 6 }}>
              {['Device A', 'Device B', 'Resolved'].map((lbl, i) => (
                <div key={lbl} style={{ fontSize: 9, color: i === 0 ? '#f97316' : i === 1 ? '#38bdf8' : '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 9 }}>
                  {lbl}
                </div>
              ))}
            </div>

            <FieldRow label="title"
              valueA={result.localNote.title} valueB={result.serverNote.title}
              resolved={result.resolvedNote.title}
              showDiff={result.localNote.title !== result.serverNote.title}
              pickedFrom={result.resolvedNote.title === result.serverNote.title ? 'B' : 'A'}
            />
            <FieldRow label="content"
              valueA={result.localNote.content} valueB={result.serverNote.content}
              resolved={result.resolvedNote.content}
              showDiff={result.localNote.content !== result.serverNote.content}
              pickedFrom={result.resolvedNote.content === result.serverNote.content ? 'B' : 'A'}
            />

            {/* Tags */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 8 }}>
              {[
                { tags: result.localNote.tags, src: 'A' as const, border: '#f9731635' },
                { tags: result.serverNote.tags, src: 'B' as const, border: '#38bdf835' },
                { tags: result.resolvedNote.tags, src: 'merged' as const, border: '#4ade8050' },
              ].map(({ tags, src, border }) => (
                <div key={src} style={{ padding: '7px 9px', borderRadius: 7, background: '#0d1117', border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 9, color: src === 'A' ? '#f97316' : src === 'B' ? '#38bdf8' : '#4ade80', marginBottom: 3, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>tags</div>
                  <div>{tags.length ? tags.map(t => <TagChip key={t} tag={t} source={src} />) : <span style={{ color: '#334155', fontSize: 10 }}>no tags</span>}</div>
                  {src === 'merged' && <div style={{ fontSize: 8, color: '#4ade8060', marginTop: 3 }}>union · deduped</div>}
                </div>
              ))}
            </div>

            {/* Booleans */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
              {(['is_starred', 'is_pinned'] as const).flatMap(field =>
                [result.localNote[field], result.serverNote[field], result.resolvedNote[field]].map((val, i) => (
                  <div key={`${field}-${i}`} style={{
                    padding: '6px 9px', borderRadius: 7, background: '#0d1117',
                    border: `1px solid ${i === 0 ? '#f9731628' : i === 1 ? '#38bdf828' : '#4ade8038'}`,
                    fontSize: 10, color: '#94a3b8',
                  }}>
                    <span style={{ color: '#334155' }}>{field}: </span>
                    <span style={{ color: val ? '#4ade80' : '#475569', fontWeight: 600 }}>{String(val)}</span>
                    {i === 2 && <span style={{ color: '#4ade8060', fontSize: 8, marginLeft: 3 }}>OR</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log panel */}
      <div style={{ margin: '0 18px 18px', background: '#070b12', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '7px 12px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['#ef4444', '#f59e0b', '#22c55e'].map(c => <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />)}
          </div>
          <span style={{ fontSize: 9, color: '#334155', letterSpacing: '0.06em' }}>sync.log · live output</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: '#1e293b' }}>{logs.length} events</span>
        </div>
        <div ref={logRef} style={{ padding: '8px 12px', height: 110, overflowY: 'auto', fontSize: 10, lineHeight: 1.9 }}>
          {logs.length === 0
            ? <span style={{ color: '#1e293b' }}>$ waiting for sync events…</span>
            : logs.map(log => (
                <div key={log.id} className="sim-log-entry" style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: '#1e293b', flexShrink: 0 }}>{log.ts}</span>
                  <span style={{ color: logColor(log.type) }}>{logIcon(log.type)} {log.msg}</span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
};
