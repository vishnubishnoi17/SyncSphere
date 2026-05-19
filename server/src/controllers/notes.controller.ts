import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as notesService from '../services/notes.service';

export const listNotes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notes = await notesService.getNotes(req.userId!);
    res.json({ notes });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

export const getNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await notesService.getNoteById(req.params.id, req.userId!);
    if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json({ note });
  } catch {
    res.status(500).json({ error: 'Failed to fetch note' });
  }
};

export const createNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await notesService.createNote(req.userId!, req.deviceId, req.body);
    res.status(201).json({ note });
  } catch {
    res.status(500).json({ error: 'Failed to create note' });
  }
};

export const updateNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { version: clientVersion, ...updateData } = req.body;
    const result = await notesService.updateNote(
      req.params.id,
      req.userId!,
      req.deviceId,
      updateData,
      clientVersion
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    res.status(400).json({ error: message });
  }
};

export const deleteNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await notesService.deleteNote(req.params.id, req.userId!, req.deviceId);
    res.json({ note });
  } catch {
    res.status(500).json({ error: 'Failed to delete note' });
  }
};

export const restoreNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const note = await notesService.restoreNote(req.params.id, req.userId!);
    res.json({ note });
  } catch {
    res.status(500).json({ error: 'Failed to restore note' });
  }
};

export const searchNotes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = req.query.q as string;
    if (!q?.trim()) { res.json({ notes: [] }); return; }
    const notes = await notesService.searchNotes(req.userId!, q);
    res.json({ notes });
  } catch {
    res.status(500).json({ error: 'Search failed' });
  }
};

export const listFolders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const folders = await notesService.getFolders(req.userId!);
    res.json({ folders });
  } catch {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};

export const createFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, color } = req.body;
    if (!name) { res.status(400).json({ error: 'Name required' }); return; }
    const folder = await notesService.createFolder(req.userId!, name, color);
    res.status(201).json({ folder });
  } catch {
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await notesService.deleteFolder(req.params.id, req.userId!);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};
