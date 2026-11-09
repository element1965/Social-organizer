import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { closeDueReviews } from '../services/moderation.service.js';

/** Every 15 minutes: close circle reviews whose 48-hour window has ended. */
export async function processReviewClose(_job: Job): Promise<void> {
  const closed = await closeDueReviews(getDb());
  if (closed > 0) console.log(`[moderation] closed ${closed} review(s) on the deadline`);
}
