import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { syncCollectionGoal } from '../services/collection-amount.js';

/** On an obligation event, bring a goal hold into line with active participation. */
export async function processCheckBlock(job: Job<{ collectionId: string }>): Promise<void> {
  await syncCollectionGoal(getDb(), job.data.collectionId);
}
