import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import { useNotes } from '../../hooks/useNotes';
import { socketClient } from '../../websocket/socketClient';
import { TagInput } from './TagInput';
import { PresenceAvatars } from '../sync/PresenceAvatars';
import type { Note } from '../../types';

interface Props { note: Note | null; onShowHistory?: (noteId: string) => void; }

const Btn: React.FC<{ onClick: () => void; active?: boolean; title: string; children: React.ReactNode }> = ({ onClick, active, title, children }) => (
  <button onClick={onClick} title={title}
    className={"px-2 py-1 rounded text-xs font-mono transition-colors " + (active ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800")}>
    {children}
  </button>
);

export const NoteEditor: React.FC<Props> = ({ note, onShowHistory }) => {
  const { updateNote, deleteNote } = useNotes();
  const [title, setTitle] = useState('');
  const [typingIndicator, setTypingIndicator] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNoteId = useRef<string | null>(null);
  const activeNoteRef = useRef<Note | null>(null);
  const loading = useRef(false);
  const isTyping = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing… (supports bold, headings, lists, tasks, code)' }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
    ],
    editorProps: { attributes: { class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[55vh] text-gray-200 leading-relaxed' } },
    onUpdate: ({ editor }) => {
      if (!note || loading.current) return;
      scheduleSave(note.id, title, editor.getHTML());
      handleTyping(note.id);
    },
  });

  const noteId = note?.id ?? null;

  useEffect(() => {
    activeNoteRef.current = note;
  }, [note]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (isTyping.current && prevNoteId.current) {
        socketClient.sendTypingStop(prevNoteId.current);
      }
      if (localTypingTimer.current) clearTimeout(localTypingTimer.current);
      if (remoteTypingTimer.current) clearTimeout(remoteTypingTimer.current);
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!noteId || !editor) return;

    const activeNote = activeNoteRef.current;
    if (!activeNote || activeNote.id !== noteId) return;

    if (prevNoteId.current && prevNoteId.current !== noteId) {
      socketClient.leaveNote(prevNoteId.current);
    }

    loading.current = true;
    setTitle(activeNote.title);
    editor.commands.setContent(activeNote.content || '');

    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => {
      loading.current = false;
      loadingTimer.current = null;
    }, 80);

    socketClient.joinNote(noteId);
    prevNoteId.current = noteId;
    setTypingIndicator(null);

    return () => {
      socketClient.leaveNote(noteId);
      if (loadingTimer.current) {
        clearTimeout(loadingTimer.current);
        loadingTimer.current = null;
      }
      loading.current = false;
      if (prevNoteId.current === noteId) {
        prevNoteId.current = null;
      }
    };
  }, [editor, noteId]);

  // Listen for remote typing indicators
  useEffect(() => {
    if (!noteId) return;
    const unsub = socketClient.onRemoteTyping((data) => {
      if (data.typing) {
        setTypingIndicator(data.userName || 'Someone');
        if (remoteTypingTimer.current) clearTimeout(remoteTypingTimer.current);
        remoteTypingTimer.current = setTimeout(() => {
          setTypingIndicator(null);
          remoteTypingTimer.current = null;
        }, 3000);
      } else {
        setTypingIndicator(null);
      }
    });
    return () => {
      unsub();
      if (remoteTypingTimer.current) {
        clearTimeout(remoteTypingTimer.current);
        remoteTypingTimer.current = null;
      }
    };
  }, [noteId]);

  // Listen for remote edits
  useEffect(() => {
    if (!noteId) return;
    const unsub = socketClient.onRemoteEdit((data) => {
      if (data.noteId === noteId && editor && !loading.current) {
        // Reload note content from store on remote edit
        // (the sync engine will pull and upsert; this just signals the user)
        console.log('[WS] Remote edit received for', data.noteId);
      }
    });
    return () => {
      unsub();
    };
  }, [noteId, editor]);

  const handleTyping = useCallback((noteId: string) => {
    if (!isTyping.current) {
      isTyping.current = true;
      socketClient.sendTypingStart(noteId);
    }
    if (localTypingTimer.current) clearTimeout(localTypingTimer.current);
    localTypingTimer.current = setTimeout(() => {
      isTyping.current = false;
      socketClient.sendTypingStop(noteId);
      localTypingTimer.current = null;
    }, 2000);
  }, []);

  const scheduleSave = useCallback((id: string, t: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateNote(id, { title: t, content: c });
      socketClient.sendEdit(id, { title: t, content: c }, 0);
    }, 600);
  }, [updateNote]);

  if (!note) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">No note selected</p>
        <p className="text-xs text-gray-700 mt-1">Create a note or pick one from the list</p>
      </div>
    </div>
  );

  const words = editor?.storage.characterCount?.words() ?? 0;
  const chars = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-800/50">
        <span className={"flex items-center gap-1.5 text-xs " + (note._syncStatus === 'pending' ? "text-amber-400" : note._syncStatus === 'conflict' ? "text-red-400" : "text-emerald-500")}>
          <span className={"w-1.5 h-1.5 rounded-full " + (note._syncStatus === 'pending' ? "bg-amber-400 animate-pulse" : note._syncStatus === 'conflict' ? "bg-red-400" : "bg-emerald-500")} />
          {note._syncStatus === 'pending' ? 'Saving…' : note._syncStatus === 'conflict' ? 'Conflict resolved' : 'Saved'}
        </span>
        {note._syncStatus === 'conflict' && (
          <span className="text-xs bg-red-950 text-red-400 border border-red-900 px-2 py-0.5 rounded-full">⚠ Field-level merge applied</span>
        )}
        {typingIndicator && (
          <span className="text-xs text-indigo-400 animate-pulse flex items-center gap-1">
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            {typingIndicator} is typing
          </span>
        )}
        <div className="flex-1" />
        <PresenceAvatars noteId={note.id} />
        {onShowHistory && (
          <button onClick={() => onShowHistory(note.id)} className="text-xs text-gray-500 hover:text-indigo-400 transition-colors flex items-center gap-1" title="Version history">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            History
          </button>
        )}
        <button onClick={() => updateNote(note.id, { is_starred: !note.is_starred })}
          className={"p-1.5 rounded transition-colors " + (note.is_starred ? "text-yellow-400" : "text-gray-600 hover:text-gray-300")}>
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill={note.is_starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth={note.is_starred ? 0 : 1.5}>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        <button onClick={() => { if (confirm('Move to trash?')) deleteNote(note.id); }}
          className="p-1.5 rounded text-gray-600 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-gray-800/50 flex-wrap bg-gray-950/50">
          <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><b>B</b></Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><i>I</i></Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strike"><s>S</s></Btn>
          <Btn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight"><span className="text-yellow-300">▌</span></Btn>
          <Btn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">`c`</Btn>
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">H1</Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">H2</Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">H3</Btn>
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">• ul</Btn>
          <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">1. ol</Btn>
          <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Task list">☑ todo</Btn>
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">❝</Btn>
          <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">{"</>"}</Btn>
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo">↩</Btn>
          <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo">↪</Btn>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (note && editor) scheduleSave(note.id, e.target.value, editor.getHTML()); }}
          placeholder="Note title"
          className="w-full bg-transparent text-2xl font-bold text-white placeholder-gray-700 focus:outline-none mb-5 block"
        />
        <EditorContent editor={editor} />
      </div>

      {/* Tags */}
      <TagInput note={note} />

      {/* Footer */}
      <div className="px-6 py-1.5 border-t border-gray-800/50 flex items-center gap-3 text-xs text-gray-600">
        <span>v{note.version}</span>
        <span>{words}w · {chars}c</span>
        <div className="flex-1" />
        {note.folder_name && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: note.folder_color || '#6366f1' }} />
            {note.folder_name}
          </span>
        )}
        <span>{new Date(note.updated_at).toLocaleString()}</span>
      </div>
    </div>
  );
};
