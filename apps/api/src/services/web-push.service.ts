import webpush from 'web-push';
import type { PrismaClient } from '@so/db';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@orginizer.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export { VAPID_PUBLIC_KEY };

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send Web Push notifications to all subscriptions of given users.
 * Automatically cleans up expired/invalid subscriptions (410/404).
 */
export async function sendWebPush(
  db: PrismaClient,
  userIds: string[],
  payload: WebPushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  if (userIds.length === 0) return;

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subscriptions.length === 0) return;

  const expiredIds: string[] = [];
  const jsonPayload = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
      );
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expiredIds.push(sub.id);
      }
    }
  }

  if (expiredIds.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { id: { in: expiredIds } },
    });
    console.log(`[WebPush] Cleaned up ${expiredIds.length} expired subscriptions`);
  }
}
