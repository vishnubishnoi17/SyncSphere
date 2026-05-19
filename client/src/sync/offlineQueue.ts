import { db, getPendingOps, removeOp, incrementOpRetry } from '../storage/db';
import type { PendingOperation } from '../types';

const MAX_RETRIES = 5;

export const getDrainableOps = async (): Promise<PendingOperation[]> => {
  const ops = await getPendingOps();
  return ops.filter((op) => op.retryCount < MAX_RETRIES);
};

export const acknowledgeOps = async (opIds: string[]): Promise<void> => {
  for (const id of opIds) {
    await removeOp(id);
  }
};

export const failOp = async (opId: string): Promise<void> => {
  await incrementOpRetry(opId);
};

export const backoffDelay = (retryCount: number): number => {
  return Math.min(1000 * Math.pow(2, retryCount), 30_000);
};

export const enqueue = async (op: Omit<PendingOperation, 'retryCount'>): Promise<void> => {
  await db.pendingOps.put({ ...op, retryCount: 0 });
};

export const clearQueue = async (): Promise<void> => {
  await db.pendingOps.clear();
};
