import { initializeApp, cert, type ServiceAccount, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PrismaClient } from '@so/db';
import type { WebPushPayload } from './web-push.service.js';

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

if (FIREBASE_SERVICE_ACCOUNT && getApps().length === 0) {
  try {
    const serviceAccount: ServiceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
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
): Promise<void> {
  if (!FIREBASE_SERVICE_ACCOUNT || getApps().length === 0) return;
  if (userIds.length === 0) return;

  const tokens = await db.nativePushToken.findMany({
    where: { userId: { in: userIds } },
  });
  if (tokens.length === 0) return;

  const messaging = getMessaging();
  const expiredIds: string[] = [];

  for (const tokenRecord of tokens) {
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
          notification: {
            sound: 'default',
            clickAction: 'FCM_PLUGIN_ACTIVITY',
          },
        },
      });
    } catch (err: any) {
      const code = err?.code || err?.errorInfo?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        expiredIds.push(tokenRecord.id);
      } else {
        console.error('[FCM] Send error:', code, err?.message);
      }
    }
  }

  if (expiredIds.length > 0) {
    await db.nativePushToken.deleteMany({
      where: { id: { in: expiredIds } },
    });
    console.log(`[FCM] Cleaned up ${expiredIds.length} expired tokens`);
  }
}
