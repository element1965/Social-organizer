import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processReNotify } from './re-notify.worker';
import { processCycleClose } from './cycle-close.worker';
import { processSpecialNotify } from './special-notify.worker';
import { processExpireNotifications } from './expire-notifications.worker';
import { processCheckBlock } from './check-block.worker';

let connection: IORedis | null = null;

function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function setupQueues(): void {
  const redis = getRedisConnection();

  // --- Re-notify: каждые 12 часов ---
  const reNotifyQueue = new Queue('collection:re-notify', { connection: redis });
  new Worker('collection:re-notify', processReNotify, { connection: redis });
  reNotifyQueue.upsertJobScheduler('re-notify-scheduler', {
    every: 12 * 60 * 60 * 1000, // 12 часов
  }, { name: 're-notify' });

  // --- Cycle close: каждый час ---
  const cycleCloseQueue = new Queue('collection:cycle-close', { connection: redis });
  new Worker('collection:cycle-close', processCycleClose, { connection: redis });
  cycleCloseQueue.upsertJobScheduler('cycle-close-scheduler', {
    every: 60 * 60 * 1000, // 1 час
  }, { name: 'cycle-close' });

  // --- Special notify: каждый час ---
  const specialNotifyQueue = new Queue('user:special-notify', { connection: redis });
  new Worker('user:special-notify', processSpecialNotify, { connection: redis });
  specialNotifyQueue.upsertJobScheduler('special-notify-scheduler', {
    every: 60 * 60 * 1000,
  }, { name: 'special-notify' });

  // --- Expire notifications: каждый час ---
  const expireQueue = new Queue('notification:expire', { connection: redis });
  new Worker('notification:expire', processExpireNotifications, { connection: redis });
  expireQueue.upsertJobScheduler('expire-scheduler', {
    every: 60 * 60 * 1000,
  }, { name: 'expire-notifications' });

  // --- Check block: вызывается по событию, без расписания ---
  new Queue('collection:check-block', { connection: redis });
  new Worker('collection:check-block', processCheckBlock, { connection: redis });

  console.log('BullMQ: all queues and workers initialized');
}

/** Добавить задачу на проверку блокировки сбора */
export async function enqueueCheckBlock(collectionId: string): Promise<void> {
  const redis = getRedisConnection();
  const queue = new Queue('collection:check-block', { connection: redis });
  await queue.add('check-block', { collectionId });
}
