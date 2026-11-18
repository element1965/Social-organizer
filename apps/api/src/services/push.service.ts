import type { PrismaClient } from '@so/db';
import { sendWebPush, type WebPushPayload } from './web-push.service.js';
import { sendFcmPush } from './fcm.service.js';
import { sendApnsPush } from './apns.service.js';

export type { WebPushPayload } from './web-push.service.js';

/**
 * Unified push notification sender.
 * Sends to Web Push (browser), FCM (native Android) and APNs (native iOS) in parallel.
 */
export async function sendPushNotification(
  db: PrismaClient,
  userIds: string[],
  payload: WebPushPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  const results = await Promise.allSettled([
    sendWebPush(db, userIds, payload),
    sendFcmPush(db, userIds, payload),
    sendApnsPush(db, userIds, payload),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[Push] Channel failed:', result.reason);
    }
  }
}
