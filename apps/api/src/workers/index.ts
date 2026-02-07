import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processCycleClose } from './cycle-close.worker.js';
import { processExpireNotifications } from './expire-notifications.worker.js';
import { processCheckBlock } from './check-block.worker.js';
import { processTgBroadcast, type TgBroadcastMessage } from './tg-broadcast.worker.js';

let connection: IORedis | null = null;

function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function setupQueues(): void {
  const redis = getRedisConnection();

  // --- Cycle close: каждый час ---
  const cycleCloseQueue = new Queue('collection:cycle-close', { connection: redis });
  new Worker('collection:cycle-close', processCycleClose, { connection: redis });
  cycleCloseQueue.upsertJobScheduler('cycle-close-scheduler', {
    every: 60 * 60 * 1000, // 1 час
  }, { name: 'cycle-close' });

  // --- Expire notifications: каждый час ---
  const expireQueue = new Queue('notification:expire', { connection: redis });
  new Worker('notification:expire', processExpireNotifications, { connection: redis });
  expireQueue.upsertJobScheduler('expire-scheduler', {
    every: 60 * 60 * 1000,
  }, { name: 'expire-notifications' });

  // --- Check block: вызывается по событию, без расписания ---
  new Queue('collection:check-block', { connection: redis });
  new Worker('collection:check-block', processCheckBlock, { connection: redis });

  // --- Telegram broadcast: вызывается по событию, без расписания ---
  new Queue('telegram:broadcast', { connection: redis });
  new Worker('telegram:broadcast', processTgBroadcast, { connection: redis });

  console.log('BullMQ: all queues and workers initialized');
}

/** Добавить задачу на проверку блокировки сбора */
export async function enqueueCheckBlock(collectionId: string): Promise<void> {
  const redis = getRedisConnection();
  const queue = new Queue('collection:check-block', { connection: redis });
  await queue.add('check-block', { collectionId });
}

/** Enqueue Telegram broadcast messages */
export async function enqueueTgBroadcast(messages: TgBroadcastMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const redis = getRedisConnection();
  const queue = new Queue('telegram:broadcast', { connection: redis });
  await queue.add('tg-broadcast', { messages });
}
