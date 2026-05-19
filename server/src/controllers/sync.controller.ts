import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as syncService from '../services/sync.service';

export const sync = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await syncService.processSync(req.userId!, {
      deviceId: req.deviceId || req.body.deviceId,
      lastSyncAt: req.body.lastSyncAt || null,
      operations: req.body.operations || [],
    });
    res.json(result);
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
};

export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ops = await syncService.getOperationHistory(req.params.noteId, req.userId!);
    res.json({ operations: ops });
  } catch {
    res.status(500).json({ error: 'Failed to get history' });
  }
};

export const getSyncStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = await syncService.getSyncStatus(req.userId!);
    res.json(status);
  } catch {
    res.status(500).json({ error: 'Failed to get sync status' });
  }
};
