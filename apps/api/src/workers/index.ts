import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processCycleClose } from './cycle-close.worker.js';
import { processCycleRenewalReminder } from './cycle-renewal-reminder.worker.js';
import { processExpireNotifications } from './expire-notifications.worker.js';
import { processCheckBlock } from './check-block.worker.js';
import { processTgBroadcast, type TgBroadcastMessage } from './tg-broadcast.worker.js';
import { processScheduledPost } from './scheduled-post.worker.js';
import { processAutoChain } from './auto-chain.worker.js';
import { processCleanupBlockedPending } from './cleanup-blocked-pending.worker.js';
import { processOnboardingReminder } from './onboarding-reminder.worker.js';
import { processReviewClose } from './review-close.worker.js';
import { processInactiveCleanup } from './inactive-cleanup.worker.js';
import { processResponseDigest } from './response-digest.worker.js';

let connection: IORedis | null = null;

// Keep only recent job history. Without this BullMQ stores every finished job
// forever: the every-minute scheduler alone left ~380k completed jobs in Redis
// and filled its volume (COND-24).
const queueOpts = (redis: IORedis) => ({
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { age: 24 * 60 * 60, count: 100 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
  },
});

function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function setupQueues(): void {
  const redis = getRedisConnection();
  redis.on('connect', () => console.log('[Redis] Connected'));
  redis.on('error', (err) => console.error('[Redis] Error:', err.message));

  // --- Cycle close: every hour ---
  const cycleCloseQueue = new Queue('collection-cycle-close', queueOpts(redis));
  new Worker('collection-cycle-close', processCycleClose, { connection: redis });
  cycleCloseQueue.upsertJobScheduler('cycle-close-scheduler', {
    every: 60 * 60 * 1000, // 1 hour
  }, { name: 'cycle-close' });

  // --- Cycle renewal reminder (3 days before next cycle): every hour ---
  const cycleRenewalQueue = new Queue('collection-cycle-renewal-reminder', queueOpts(redis));
  new Worker('collection-cycle-renewal-reminder', processCycleRenewalReminder, { connection: redis });
  cycleRenewalQueue.upsertJobScheduler('cycle-renewal-reminder-scheduler', {
    every: 60 * 60 * 1000, // 1 hour
  }, { name: 'cycle-renewal-reminder' });

  // --- Expire notifications: every hour ---
  const expireQueue = new Queue('notification-expire', queueOpts(redis));
  new Worker('notification-expire', processExpireNotifications, { connection: redis });
  expireQueue.upsertJobScheduler('expire-scheduler', {
    every: 60 * 60 * 1000,
  }, { name: 'expire-notifications' });

  // --- Check block: event-driven, no schedule ---
  new Queue('collection-check-block', queueOpts(redis));
  new Worker('collection-check-block', processCheckBlock, { connection: redis });

  // --- Telegram broadcast: event-driven, no schedule ---
  new Queue('telegram-broadcast', queueOpts(redis));
  new Worker('telegram-broadcast', processTgBroadcast, { connection: redis });

  // --- Scheduled posts: every minute ---
  const scheduledPostQueue = new Queue('broadcast-scheduled-post', queueOpts(redis));
  new Worker('broadcast-scheduled-post', processScheduledPost, { connection: redis });
  scheduledPostQueue.upsertJobScheduler('scheduled-post-scheduler', {
    every: 60 * 1000, // 1 minute
  }, { name: 'scheduled-post' });

  // --- Auto-chain: every 30 minutes ---
  const autoChainQueue = new Queue('broadcast-auto-chain', queueOpts(redis));
  new Worker('broadcast-auto-chain', processAutoChain, { connection: redis });
  autoChainQueue.upsertJobScheduler('auto-chain-scheduler', {
    every: 30 * 60 * 1000, // 30 minutes
  }, { name: 'auto-chain' });

  // --- Cleanup blocked pending: every hour ---
  const cleanupBlockedQueue = new Queue('cleanup-blocked-pending', queueOpts(redis));
  new Worker('cleanup-blocked-pending', processCleanupBlockedPending, { connection: redis });
  cleanupBlockedQueue.upsertJobScheduler('cleanup-blocked-pending-scheduler', {
    every: 60 * 60 * 1000, // 1 hour
  }, { name: 'cleanup-blocked-pending' });

  // --- Onboarding reminder: every hour ---
  const onboardingReminderQueue = new Queue('onboarding-reminder', queueOpts(redis));
  new Worker('onboarding-reminder', processOnboardingReminder, { connection: redis });
  onboardingReminderQueue.upsertJobScheduler('onboarding-reminder-scheduler', {
    every: 60 * 60 * 1000, // 1 hour
  }, { name: 'onboarding-reminder' });

  // --- Circle review close: every 15 minutes. Without Redis, reads and votes close due reviews. ---
  const reviewCloseQueue = new Queue('collection-review-close', queueOpts(redis));
  new Worker('collection-review-close', processReviewClose, { connection: redis });
  reviewCloseQueue.upsertJobScheduler('review-close-scheduler', {
    every: 15 * 60 * 1000,
  }, { name: 'review-close' });

  // --- Inactive account cleanup (2 years without sign-ins): daily ---
  const inactiveCleanupQueue = new Queue('inactive-account-cleanup', queueOpts(redis));
  new Worker('inactive-account-cleanup', processInactiveCleanup, { connection: redis });
  inactiveCleanupQueue.upsertJobScheduler('inactive-account-cleanup-scheduler', {
    every: 24 * 60 * 60 * 1000, // 24 hours
  }, { name: 'inactive-account-cleanup' });

  // --- Responses to a collection, grouped into one message (SO-45): event-driven, delayed ---
  new Queue('response-digest', queueOpts(redis));
  new Worker('response-digest', processResponseDigest, { connection: redis });

  console.log('BullMQ: all queues and workers initialized');
}

/** Enqueue collection block check */
export async function enqueueCheckBlock(collectionId: string): Promise<void> {
  const redis = getRedisConnection();
  const queue = new Queue('collection-check-block', queueOpts(redis));
  await queue.add('check-block', { collectionId });
}

/** Enqueue Telegram broadcast messages */
export async function enqueueTgBroadcast(messages: TgBroadcastMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const redis = getRedisConnection();
  const queue = new Queue('telegram-broadcast', queueOpts(redis));
  await queue.add('tg-broadcast', { messages });
}

let responseDigestQueue: Queue | null = null;

/**
 * Plans the grouped "new responses" message for a collection (SO-45). One delayed job per collection and
 * time window (job id), so all intentions in the window become one message. Returns false without Redis.
 */
export async function enqueueResponseDigest(collectionId: string, delayMs: number): Promise<boolean> {
  if (!process.env.REDIS_URL) return false;
  if (!responseDigestQueue) responseDigestQueue = new Queue('response-digest', queueOpts(getRedisConnection()));
  const windowId = Math.floor(Date.now() / delayMs);
  await responseDigestQueue.add('response-digest', { collectionId }, { jobId: `resp-${collectionId}-${windowId}`, delay: delayMs });
  return true;
}
