import { initializeApp, cert, type ServiceAccount, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PrismaClient } from '@so/db';
import { recordProviderOutcome, type PushDeliveryGate, type ProviderOutcome } from './provider-outcome.js';
import type { WebPushPayload } from './web-push.service.js';

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

/**
 * Parse the service-account JSON from env. When the key is pasted into a hosting
 * dashboard, the "\n" escapes inside private_key often turn into real line breaks,
 * which makes the JSON invalid ("Bad control character"). Re-escape them and retry.
 */
function parseServiceAccount(raw: string): ServiceAccount {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/\r\n/g, '\n').replace(/\n/g, '\\n'));
  }
}

if (FIREBASE_SERVICE_ACCOUNT && getApps().length === 0) {
  try {
    const serviceAccount = parseServiceAccount(FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    console.log('[FCM] Firebase Admin initialized');
  } catch (err) {
    console.error('[FCM] Failed to initialize Firebase Admin:', err);
  }
}

/**
 * Send FCM push notifications to all native tokens of given users.
 * Automatically cleans up invalid/expired tokens.
 */
export async function sendFcmPush(
  db: PrismaClient,
  userIds: string[],
  payload: WebPushPayload,
  beforeHandoff?: PushDeliveryGate,
): Promise<Map<string, ProviderOutcome>> {
  const outcomes = new Map<string, ProviderOutcome>();
  if (!FIREBASE_SERVICE_ACCOUNT || getApps().length === 0) return outcomes;
  if (userIds.length === 0) return outcomes;

  const tokens = await db.nativePushToken.findMany({
    // iOS tokens are APNs device tokens, sent by apns.service.ts
    where: { userId: { in: userIds }, platform: { not: 'ios' } },
  });
  if (tokens.length === 0) return outcomes;

  const messaging = getMessaging();
  const expiredIds: string[] = [];

  for (const tokenRecord of tokens) {
    if (beforeHandoff) {
      const allowed = await beforeHandoff({ kind: 'native', id: tokenRecord.id, platform: tokenRecord.platform }).catch(() => {
        recordProviderOutcome(outcomes, tokenRecord.userId, 'retry');
        return false;
      });
      if (allowed === 'skip') continue;
      if (!allowed) break;
    }
    try {
      await messaging.send({
        token: tokenRecord.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.url ? { url: payload.url } : undefined,
        android: {
          priority: 'high',
          // No clickAction: the default opens the app, and the app routes by data.url.
          // 'FCM_PLUGIN_ACTIVITY' (cordova-plugin-fcm) matches no activity here, so a tap did nothing.
          notification: {
            sound: 'default',
          },
        },
      });
      recordProviderOutcome(outcomes, tokenRecord.userId, 'sent');
    } catch (err: any) {
      const code = err?.code || err?.errorInfo?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        expiredIds.push(tokenRecord.id);
      } else {
        recordProviderOutcome(outcomes, tokenRecord.userId, 'retry');
        console.error('[FCM] Send error:', code, err?.message);
      }
    }
  }

  if (expiredIds.length > 0) {
    await db.nativePushToken.deleteMany({ where: { id: { in: expiredIds } } })
      .catch(() => console.error('[FCM] Could not clean up expired tokens'));
    console.log(`[FCM] Cleaned up ${expiredIds.length} expired tokens`);
  }
  return outcomes;
}
