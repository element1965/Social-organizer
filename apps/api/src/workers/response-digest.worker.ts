import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { sendResponseDigest } from '../services/notification.service.js';

/**
 * Sends one grouped "new responses" message to a collection's author (SO-45).
 * The job runs after the grouping window; it re-reads the actual state, so a closed collection,
 * responses the author has already seen or a repeated job send nothing.
 */
export async function processResponseDigest(job: Job<{ collectionId: string }>): Promise<void> {
  const result = await sendResponseDigest(getDb(), job.data.collectionId);
  console.log(`[ResponseDigest] ${job.data.collectionId}: ${result}`);
}
