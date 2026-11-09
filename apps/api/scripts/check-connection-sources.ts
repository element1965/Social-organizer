/**
 * Local check of SO-15: a connection counts the same whatever way the newcomer signed in.
 * For each sign-in method (e-mail code, Telegram Mini App initData, Google) a new person signs in,
 * opens the inviter's personal link (invite.accept), the inviter confirms (pending.accept),
 * and both counters are compared. Real tRPC procedures against a LOCAL database.
 *
 * Only Google's own signature check is replaced (OAuth2Client.verifyIdToken returns a fixed payload):
 * everything after it — account creation, invite, confirmation, counting — runs as in production.
 * Telegram initData is signed with the local TELEGRAM_BOT_TOKEN exactly like Telegram does.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=<local db> JWT_SECRET=<16+ chars> TELEGRAM_BOT_TOKEN=local-test GOOGLE_CLIENT_ID=local-test \
 *   DEV_MAIL_OUTBOX=<file> npx tsx scripts/check-connection-sources.ts
 */
import { createHmac } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
for (const v of ['TELEGRAM_BOT_TOKEN', 'GOOGLE_CLIENT_ID', 'DEV_MAIL_OUTBOX', 'JWT_SECRET']) {
  if (!process.env[v]) { console.error(`${v} is required`); process.exit(1); }
}

// Nothing leaves the machine
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (/api\.telegram\.org|googleapis\.com|resend\.com/.test(url)) {
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

const GOOGLE_SUB = `so15src-${Date.now()}`;
const GOOGLE_EMAIL = `so15src-google-${Date.now()}@test.local`;
(OAuth2Client.prototype as any).verifyIdToken = async () => ({
  getPayload: () => ({ sub: GOOGLE_SUB, email: GOOGLE_EMAIL, email_verified: true, name: 'Google Newcomer' }),
});

const { appRouter } = await import('../src/routers/index.js');
const db = getDb();
const call = (userId: string | null) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);

let failed = 0;
const rows: string[][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const EMAIL = `so15src-mail-${Date.now()}@test.local`;
const TG_ID = 900000000 + Math.floor(Math.random() * 99999);
const created: string[] = [];

function signedInitData(): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'so15check');
  params.set('user', JSON.stringify({ id: TG_ID, first_name: 'Telegram', last_name: 'Newcomer', language_code: 'ru' }));
  const check = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN!).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

async function readCode(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const file = process.env.DEV_MAIL_OUTBOX!;
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8');
      const at = text.lastIndexOf(email);
      const m = at >= 0 ? text.slice(at).match(/\b(\d{6})\b/) : null;
      if (m) return m[1]!;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('code not found in DEV_MAIL_OUTBOX');
}

async function signIn(method: string): Promise<string> {
  const pub = call(null);
  if (method === 'e-mail code') {
    await pub.auth.requestEmailCode({ email: EMAIL });
    const res = await pub.auth.verifyEmailCode({ email: EMAIL, code: await readCode(EMAIL) });
    return res.userId;
  }
  if (method === 'Telegram') return (await pub.auth.loginWithTelegram({ initData: signedInitData() })).userId;
  return (await pub.auth.loginWithGoogle({ idToken: 'local-test-token' })).userId;
}

async function main() {
  const inviter = await db.user.create({ data: { name: 'so15src inviter' } });
  created.push(inviter.id);
  let inviterExpected = 0;

  for (const method of ['e-mail code', 'Telegram', 'Google']) {
    const newcomer = await signIn(method);
    created.push(newcomer);
    const { token } = await call(inviter.id).invite.generate();
    const res: any = await call(newcomer).invite.accept({ token });
    const pending = await db.pendingConnection.findFirst({
      where: { fromUserId: newcomer, toUserId: inviter.id, status: 'PENDING' }, select: { id: true },
    });
    const beforeConfirm = (await call(newcomer).connection.getCount()).count;
    await call(inviter.id).pending.accept({ pendingId: pending!.id });
    inviterExpected++;

    const mine = (await call(newcomer).connection.getCount()).count;
    const theirs = (await call(inviter.id).connection.getCount()).count;
    const sosErr = await call(newcomer).collection.create({ type: 'EMERGENCY', amount: 100, chatLink: 'https://t.me/so15src' })
      .then(() => null, (e: any) => e.message as string);
    check(`${method}: request alone counts 0, confirmed counts 1`, res?.pending === true && beforeConfirm === 0 && mine === 1,
      `pending=${res?.pending} before=${beforeConfirm} after=${mine}`);
    check(`${method}: inviter count ${inviterExpected}`, theirs === inviterExpected, `inviter=${theirs}`);
    check(`${method}: SOS refused with the same number`, !!sosErr?.includes('You have 1'), String(sosErr));
    rows.push([method, String(beforeConfirm), String(mine), String(theirs), sosErr ? 'SOS refused (1/10)' : 'SOS allowed']);
  }

  console.log('\n| Sign-in | Count after request | Count after confirmation | Inviter count | Server decision |\n|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
}

async function cleanup() {
  const ids = created.filter(Boolean);
  await db.connection.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await db.pendingConnection.deleteMany({ where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] } });
  await db.inviteLink.deleteMany({ where: { OR: [{ inviterId: { in: ids } }, { usedById: { in: ids } }] } });
  await db.platformAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
}

try {
  await main();
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await cleanup().catch((e) => console.error('cleanup failed', e));
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
