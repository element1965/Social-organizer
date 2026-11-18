/**
 * Push to the iOS app straight through APNs (token-based auth, HTTP/2), without Firebase on the device.
 * The iOS app hands its APNs device token to @capacitor/push-notifications, which registers it with
 * platform "ios"; Android tokens keep going through FCM (fcm.service.ts).
 *
 * Env:
 *  - APNS_KEY: contents of the AuthKey_XXXX.p8 file (Apple Developer → Keys, "Apple Push Notifications service").
 *    Line breaks may be pasted as real breaks or as "\n".
 *  - APNS_KEY_ID: the key's ID; APNS_TEAM_ID: the developer team (defaults to the team in the Xcode project).
 *  - APNS_BUNDLE_ID: defaults to APPLE_BUNDLE_ID, then com.socialorganizer.app.
 *  - APNS_SANDBOX=1 sends to the development gateway (Xcode debug builds); store builds use production.
 * Without APNS_KEY and APNS_KEY_ID iOS tokens are not stored at all (push.router), so delivery keeps
 * choosing Telegram for those people.
 */
import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { PrismaClient } from '@so/db';
import type { WebPushPayload } from './web-push.service.js';

const KEY_ID = process.env.APNS_KEY_ID?.trim() || '';
const TEAM_ID = process.env.APNS_TEAM_ID?.trim() || process.env.APPLE_TEAM_ID?.trim() || '6MQRV9Q3H5';
const BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim() || process.env.APPLE_BUNDLE_ID?.trim() || 'com.socialorganizer.app';
const HOST = process.env.APNS_SANDBOX === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

let privateKey: KeyObject | null = null;
if (process.env.APNS_KEY && KEY_ID) {
  try {
    privateKey = createPrivateKey(process.env.APNS_KEY.replace(/\\n/g, '\n').trim());
    console.log('[APNs] key loaded');
  } catch (err) {
    console.error('[APNs] APNS_KEY is not a valid .p8 key:', (err as Error).message);
  }
}

export function apnsConfigured(): boolean {
  return privateKey !== null;
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/** Provider token: ES256 JWT, valid for up to an hour; Apple rejects refreshing it more often than every 20 min. */
let cachedJwt: { token: string; issuedAt: number } | null = null;
export function providerToken(now = Math.floor(Date.now() / 1000), key: KeyObject | null = privateKey, keyId = KEY_ID): string {
  if (!key) throw new Error('APNs is not configured');
  if (key === privateKey && cachedJwt && now - cachedJwt.issuedAt < 40 * 60) return cachedJwt.token;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: TEAM_ID, iat: now }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  const token = `${header}.${claims}.${b64url(signature)}`;
  if (key === privateKey) cachedJwt = { token, issuedAt: now };
  return token;
}

/** The notification body: the same fixed texts as Android; data.url is read by the app on tap. */
export function apnsBody(payload: WebPushPayload): string {
  return JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
    ...(payload.url ? { url: payload.url } : {}),
  });
}

function post(session: ClientHttp2Session, deviceToken: string, body: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve, reject) => {
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => { status = Number(headers[constants.HTTP2_HEADER_STATUS]); });
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      let reason: string | undefined;
      try { reason = data ? JSON.parse(data).reason : undefined; } catch { /* empty body on success */ }
      resolve({ status, reason });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.close(constants.NGHTTP2_CANCEL));
    req.end(body);
  });
}

/** Send to every iOS token of the given users; tokens Apple says are dead are removed. */
export async function sendApnsPush(db: PrismaClient, userIds: string[], payload: WebPushPayload): Promise<void> {
  if (!privateKey || userIds.length === 0) return;
  const tokens = await db.nativePushToken.findMany({ where: { userId: { in: userIds }, platform: 'ios' } });
  if (tokens.length === 0) return;

  const session = connect(HOST);
  session.on('error', (err) => console.error('[APNs] connection error:', err.message));
  const body = apnsBody(payload);
  const expiredIds: string[] = [];
  try {
    for (const record of tokens) {
      try {
        const res = await post(session, record.token, body);
        if (res.status === 410 || res.reason === 'BadDeviceToken' || res.reason === 'Unregistered' || res.reason === 'DeviceTokenNotForTopic') {
          expiredIds.push(record.id);
        } else if (res.status !== 200) {
          console.error('[APNs] send failed:', res.status, res.reason);
        }
      } catch (err) {
        console.error('[APNs] send error:', (err as Error).message);
      }
    }
  } finally {
    session.close();
  }
  if (expiredIds.length > 0) {
    await db.nativePushToken.deleteMany({ where: { id: { in: expiredIds } } });
    console.log(`[APNs] Cleaned up ${expiredIds.length} expired tokens`);
  }
}
