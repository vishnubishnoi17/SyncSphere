import { db, getPendingOps, removeOp, incrementOpRetry } from '../storage/db';
import type { PendingOperation } from '../types';

const MAX_RETRIES = 5;

export const backoffDelay = (retryCount: number): number =>
  Math.min(1000 * Math.pow(2, retryCount), 30_000);

/**
 * Returns ops that are ready to be sent:
 * - retryCount < MAX_RETRIES
 * - enough time has passed since last failure (exponential backoff)
 */
export const getDrainableOps = async (): Promise<PendingOperation[]> => {
  const ops = await getPendingOps();
  const now = Date.now();
  return ops.filter((op) => {
    if (op.retryCount >= MAX_RETRIES) return false;
    if (op.retryCount === 0) return true;

    const delay = backoffDelay(op.retryCount);
    const lastAttemptAt = op.lastAttemptAt ?? op.createdAt;
    return now - lastAttemptAt >= delay;
  });
};

export const acknowledgeOps = async (opIds: string[]): Promise<void> => {
  for (const id of opIds) await removeOp(id);
};

export const failOp = async (opId: string): Promise<void> => {
  await incrementOpRetry(opId);
};

export const enqueue = async (op: Omit<PendingOperation, 'retryCount'>): Promise<void> => {
  await db.pendingOps.put({
    ...op,
    retryCount: 0,
    lastAttemptAt: op.lastAttemptAt ?? op.createdAt,
  });
};

export const clearQueue = async (): Promise<void> => {
  await db.pendingOps.clear();
};
