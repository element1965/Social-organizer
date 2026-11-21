import webpush from 'web-push';
import type { PrismaClient } from '@so/db';
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS } from './push-endpoint.js';

/** A push service that does not answer in time is given up on; the next notification tries again. */
const PUSH_TIMEOUT_MS = 10_000;

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
 * Automatically cleans up expired/invalid subscriptions (410/404), and subscriptions whose endpoint is not
 * a known browser push service (stored before that check existed): those are never contacted (SEC-3).
 */
export async function sendWebPush(
  db: PrismaClient,
  userIds: string[],
  payload: WebPushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  if (userIds.length === 0) return;

  const all = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  // At most the newest MAX_PUSH_SUBSCRIPTIONS browsers of each account (SEC-3): accounts that piled up more
  // before the cap existed are trimmed the next time they register, and never fan out wider meanwhile
  const perUser = new Map<string, number>();
  const subscriptions = all.filter((sub) => {
    const n = (perUser.get(sub.userId) ?? 0) + 1;
    perUser.set(sub.userId, n);
    return n <= MAX_PUSH_SUBSCRIPTIONS;
  });
  if (subscriptions.length === 0) return;

  const expiredIds: string[] = [];
  const jsonPayload = JSON.stringify(payload);

  for (const sub of subscriptions) {
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      expiredIds.push(sub.id);
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
        { timeout: PUSH_TIMEOUT_MS },
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
    console.log(`[WebPush] Cleaned up ${expiredIds.length} expired or unsupported subscriptions`);
  }
}
