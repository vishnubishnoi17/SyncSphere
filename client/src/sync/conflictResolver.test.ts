/**
 * Unit tests for src/sync/conflictResolver.ts
 *
 * Run: npx jest conflictResolver.test.ts
 */

import { resolveConflict, resolveLastWriteWins } from './conflictResolver';
import type { Note } from '../types';

// ─── test fixture factory ──────────────────────────────────────────────────────
const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  user_id: 'user-1',
  folder_id: null,
  title: 'Base title',
  content: 'Base content',
  tags: [],
  is_starred: false,
  is_pinned: false,
  version: 1,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted: false,
  _isDirty: false,
  _syncStatus: 'synced',
  ...overrides,
});

// ─── title resolution ──────────────────────────────────────────────────────────
describe('resolveConflict — title', () => {
  it('picks the longer title when both devices edited it', () => {
    const local = makeNote({ title: 'Q3 Planning' });
    const server = makeNote({ title: 'Q3 Planning Meeting Notes' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.title).toBe('Q3 Planning Meeting Notes');
  });

  it('picks local title when it is longer', () => {
    const local = makeNote({ title: 'Q3 Planning Meeting and Action Items' });
    const server = makeNote({ title: 'Q3 Planning' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.title).toBe('Q3 Planning Meeting and Action Items');
  });

  it('keeps the title when both are identical', () => {
    const local = makeNote({ title: 'Same title' });
    const server = makeNote({ title: 'Same title' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.title).toBe('Same title');
  });

  it('falls back to Untitled when both titles are empty', () => {
    const local = makeNote({ title: '' });
    const server = makeNote({ title: '' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.title).toBe('Untitled');
  });

  it('picks non-empty title when one side is empty', () => {
    const local = makeNote({ title: '' });
    const server = makeNote({ title: 'Server title' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.title).toBe('Server title');
  });
});

// ─── content resolution ────────────────────────────────────────────────────────
describe('resolveConflict — content', () => {
  it('picks the longer content', () => {
    const local = makeNote({ content: 'Short note.' });
    const server = makeNote({ content: 'This is a much longer note with more detail added by device B.' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.content).toBe('This is a much longer note with more detail added by device B.');
  });

  it('preserves multiline content correctly', () => {
    const multiline = 'Line 1\nLine 2\nLine 3\n- bullet a\n- bullet b';
    const local = makeNote({ content: multiline });
    const server = makeNote({ content: 'Short' });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.content).toBe(multiline);
  });
});

// ─── tag resolution ────────────────────────────────────────────────────────────
describe('resolveConflict — tags', () => {
  it('union-merges tags from both devices', () => {
    const local = makeNote({ tags: ['work', 'planning'] });
    const server = makeNote({ tags: ['work', 'q3', 'meeting'] });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.tags).toEqual(expect.arrayContaining(['work', 'planning', 'q3', 'meeting']));
    expect(resolvedNote.tags).toHaveLength(4);
  });

  it('deduplicates tags present in both devices', () => {
    const local = makeNote({ tags: ['shared', 'local-only'] });
    const server = makeNote({ tags: ['shared', 'server-only'] });
    const { resolvedNote } = resolveConflict(local, server);
    const sharedCount = resolvedNote.tags.filter(t => t === 'shared').length;
    expect(sharedCount).toBe(1);
  });

  it('handles empty tags on both sides', () => {
    const local = makeNote({ tags: [] });
    const server = makeNote({ tags: [] });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.tags).toEqual([]);
  });

  it('uses all server tags when local has none', () => {
    const local = makeNote({ tags: [] });
    const server = makeNote({ tags: ['important', 'review'] });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.tags).toEqual(['important', 'review']);
  });
});

// ─── boolean fields ────────────────────────────────────────────────────────────
describe('resolveConflict — boolean fields (OR merge)', () => {
  it('is_starred is true if either device starred it', () => {
    const local = makeNote({ is_starred: true });
    const server = makeNote({ is_starred: false });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.is_starred).toBe(true);
  });

  it('is_starred is false only when neither device starred it', () => {
    const local = makeNote({ is_starred: false });
    const server = makeNote({ is_starred: false });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.is_starred).toBe(false);
  });

  it('is_pinned is true if either device pinned it', () => {
    const local = makeNote({ is_pinned: false });
    const server = makeNote({ is_pinned: true });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.is_pinned).toBe(true);
  });
});

// ─── version handling ──────────────────────────────────────────────────────────
describe('resolveConflict — version', () => {
  it('uses server version in the resolved note', () => {
    const local = makeNote({ version: 3 });
    const server = makeNote({ version: 5 });
    const { resolvedNote } = resolveConflict(local, server);
    expect(resolvedNote.version).toBe(5);
  });
});

// ─── strategy metadata ─────────────────────────────────────────────────────────
describe('resolveConflict — ConflictInfo metadata', () => {
  it('returns strategy as field-level-merge', () => {
    const { strategy } = resolveConflict(makeNote(), makeNote());
    expect(strategy).toBe('field-level-merge');
  });

  it('returns the original local and server notes unchanged', () => {
    const local = makeNote({ title: 'Local' });
    const server = makeNote({ title: 'Server version with more words' });
    const result = resolveConflict(local, server);
    expect(result.localNote.title).toBe('Local');
    expect(result.serverNote.title).toBe('Server version with more words');
  });

  it('marks resolved note as synced', () => {
    const { resolvedNote } = resolveConflict(makeNote(), makeNote());
    expect(resolvedNote._syncStatus).toBe('synced');
    expect(resolvedNote._isDirty).toBe(false);
  });
});

// ─── last-write-wins fallback ──────────────────────────────────────────────────
describe('resolveLastWriteWins', () => {
  it('picks the note with the later updated_at timestamp', () => {
    const older = makeNote({ title: 'Old version', updated_at: '2024-01-01T10:00:00Z' });
    const newer = makeNote({ title: 'New version', updated_at: '2024-01-01T12:00:00Z' });
    const result = resolveLastWriteWins(older, newer);
    expect(result.title).toBe('New version');
  });

  it('picks local when local is more recent', () => {
    const local = makeNote({ title: 'Local recent', updated_at: '2024-06-01T15:00:00Z' });
    const server = makeNote({ title: 'Server old', updated_at: '2024-06-01T09:00:00Z' });
    const result = resolveLastWriteWins(local, server);
    expect(result.title).toBe('Local recent');
  });
});