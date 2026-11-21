import type { PrismaClient } from '@so/db';
import { recordProviderOutcome, type DeliveryGate, type ProviderOutcome } from './provider-outcome.js';
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
  beforeHandoff?: DeliveryGate,
): Promise<Map<string, ProviderOutcome>> {
  const outcomes = new Map<string, ProviderOutcome>(userIds.map((id) => [id, 'retired']));
  if (userIds.length === 0) return outcomes;

  const results = await Promise.allSettled([
    sendWebPush(db, userIds, payload, beforeHandoff),
    sendFcmPush(db, userIds, payload, beforeHandoff),
    sendApnsPush(db, userIds, payload, beforeHandoff),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[Push] Channel failed:', result.reason);
      for (const userId of userIds) recordProviderOutcome(outcomes, userId, 'retry');
    } else {
      for (const [userId, outcome] of result.value) recordProviderOutcome(outcomes, userId, outcome);
    }
  }
  return outcomes;
}
