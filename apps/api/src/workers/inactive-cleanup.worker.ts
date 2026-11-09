import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { runInactiveCleanupLocked } from '../services/inactive-cleanup.service.js';

/**
 * Inactive account cleanup — runs daily.
 * Warns 30 and 7 days ahead, then deletes accounts without sign-ins for 2 years.
 */
export async function processInactiveCleanup(_job: Job): Promise<void> {
  console.log('[InactiveCleanup] Worker started');
  try {
    await runInactiveCleanupLocked(getDb());
  } catch (err) {
    console.error('[InactiveCleanup] CRASH:', err);
    throw err;
  }
}
