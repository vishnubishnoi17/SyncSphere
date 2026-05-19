import React, { useState, useRef } from 'react';
import { useNotes } from '../../hooks/useNotes';
import type { Note } from '../../types';

interface Props {
  note: Note;
}

export const TagInput: React.FC<Props> = ({ note }) => {
  const { updateNote } = useNotes();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = note.tags || [];

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag || tags.includes(tag) || tags.length >= 8) return;
    updateNote(note.id, { tags: [...tags, tag] });
    setInput('');
  };

  const removeTag = (tag: string) => {
    updateNote(note.id, { tags: tags.filter((t) => t !== tag) });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className="flex flex-wrap gap-1.5 items-center px-6 py-2 border-t border-gray-800/50 cursor-text min-h-[36px]"
      onClick={() => inputRef.current?.focus()}
    >
      <svg className="w-3.5 h-3.5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
      </svg>
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 bg-indigo-950 border border-indigo-800/60 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
          #{tag}
          <button onClick={() => removeTag(tag)} className="text-indigo-500 hover:text-white transition-colors leading-none">&times;</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input) addTag(input); }}
        placeholder={tags.length === 0 ? 'Add tags…' : ''}
        className="bg-transparent text-xs text-gray-400 placeholder-gray-700 focus:outline-none min-w-[60px] flex-1"
      />
    </div>
  );
};
