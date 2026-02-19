import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processCycleClose } from './cycle-close.worker.js';
import { processExpireNotifications } from './expire-notifications.worker.js';
import { processCheckBlock } from './check-block.worker.js';
import { processTgBroadcast, type TgBroadcastMessage } from './tg-broadcast.worker.js';
import { processScheduledPost } from './scheduled-post.worker.js';
import { processAutoChain } from './auto-chain.worker.js';
import { processCleanupBlockedPending } from './cleanup-blocked-pending.worker.js';

let connection: IORedis | null = null;

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
  const cycleCloseQueue = new Queue('collection-cycle-close', { connection: redis });
  new Worker('collection-cycle-close', processCycleClose, { connection: redis });
  cycleCloseQueue.upsertJobScheduler('cycle-close-scheduler', {
    every: 60 * 60 * 1000, // 1 hour
  }, { name: 'cycle-close' });

  // --- Expire notifications: every hour ---
  const expireQueue = new Queue('notification-expire', { connection: redis });
  new Worker('notification-expire', processExpireNotifications, { connection: redis });
  expireQueue.upsertJobScheduler('expire-scheduler', {
    every: 60 * 60 * 1000,
  }, { name: 'expire-notifications' });

  // --- Check block: event-driven, no schedule ---
  new Queue('collection-check-block', { connection: redis });
  new Worker('collection-check-block', processCheckBlock, { connection: redis });

  // --- Telegram broadcast: event-driven, no schedule ---
  new Queue('telegram-broadcast', { connection: redis });
  new Worker('telegram-broadcast', processTgBroadcast, { connection: redis });

  // --- Scheduled posts: every minute ---
  const scheduledPostQueue = new Queue('broadcast-scheduled-post', { connection: redis });
  new Worker('broadcast-scheduled-post', processScheduledPost, { connection: redis });
  scheduledPostQueue.upsertJobScheduler('scheduled-post-scheduler', {
    every: 60 * 1000, // 1 minute
  }, { name: 'scheduled-post' });

  // --- Auto-chain: every 30 minutes ---
  const autoChainQueue = new Queue('broadcast-auto-chain', { connection: redis });
  new Worker('broadcast-auto-chain', processAutoChain, { connection: redis });
  autoChainQueue.upsertJobScheduler('auto-chain-scheduler', {
    every: 30 * 60 * 1000, // 30 minutes
  }, { name: 'auto-chain' });

  // --- Cleanup blocked pending: every hour ---
  const cleanupBlockedQueue = new Queue('cleanup-blocked-pending', { connection: redis });
  new Worker('cleanup-blocked-pending', processCleanupBlockedPending, { connection: redis });
  cleanupBlockedQueue.upsertJobScheduler('cleanup-blocked-pending-scheduler', {
    every: 60 * 60 * 1000, // 1 hour
  }, { name: 'cleanup-blocked-pending' });

  console.log('BullMQ: all queues and workers initialized');
}

/** Enqueue collection block check */
export async function enqueueCheckBlock(collectionId: string): Promise<void> {
  const redis = getRedisConnection();
  const queue = new Queue('collection-check-block', { connection: redis });
  await queue.add('check-block', { collectionId });
}

/** Enqueue Telegram broadcast messages */
export async function enqueueTgBroadcast(messages: TgBroadcastMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const redis = getRedisConnection();
  const queue = new Queue('telegram-broadcast', { connection: redis });
  await queue.add('tg-broadcast', { messages });
}
