import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller';
import * as notesCtrl from '../controllers/notes.controller';
import * as syncCtrl from '../controllers/sync.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Auth
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/refresh', authCtrl.refresh);
router.get('/auth/me', authenticate, authCtrl.me);

// Notes
router.get('/notes', authenticate, notesCtrl.listNotes);
router.get('/notes/search', authenticate, notesCtrl.searchNotes);
router.get('/notes/:id', authenticate, notesCtrl.getNote);
router.post('/notes', authenticate, notesCtrl.createNote);
router.patch('/notes/:id', authenticate, notesCtrl.updateNote);
router.delete('/notes/:id', authenticate, notesCtrl.deleteNote);
router.post('/notes/:id/restore', authenticate, notesCtrl.restoreNote);

// Folders
router.get('/folders', authenticate, notesCtrl.listFolders);
router.post('/folders', authenticate, notesCtrl.createFolder);
router.delete('/folders/:id', authenticate, notesCtrl.deleteFolder);

// Sync
router.post('/sync', authenticate, syncCtrl.sync);
router.get('/sync/status', authenticate, syncCtrl.getSyncStatus);
router.get('/sync/history/:noteId', authenticate, syncCtrl.getHistory);

export default router;
