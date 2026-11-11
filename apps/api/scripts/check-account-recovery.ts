/**
 * Local check of the 11.11.2026 incident: a Telegram newcomer was muted ("Deleted user") by the first
 * notification after their invite was confirmed, then came back with Google and got a second account.
 *
 * 1. The bot cannot write first (403 "bot can't initiate conversation"): the newcomer stays active.
 * 2. A real block mutes the account; signing in with Telegram again restores it.
 * 3. The person signs in with Google (a fresh empty account), presses "Connect Telegram": the empty
 *    account is folded into the Telegram one, and Google now signs in there.
 * Real tRPC procedures against a LOCAL database; Telegram and Google are stubbed, nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=<local db> JWT_SECRET=<16+ chars> TELEGRAM_BOT_TOKEN=local-test GOOGLE_CLIENT_ID=local-test \
 *   npx tsx scripts/check-account-recovery.ts
 */
import { createHmac } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
for (const v of ['TELEGRAM_BOT_TOKEN', 'GOOGLE_CLIENT_ID', 'JWT_SECRET']) {
  if (!process.env[v]) { console.error(`${v} is required`); process.exit(1); }
}

// Telegram answers every send like it does to someone who never pressed Start; switchable to "blocked"
let tgAnswer: { status: number; description: string } = { status: 403, description: "Forbidden: bot can't initiate conversation with a user" };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (/api\.telegram\.org/.test(url)) {
    return new Response(JSON.stringify({ ok: false, error_code: tgAnswer.status, description: tgAnswer.description }), { status: tgAnswer.status });
  }
  if (/googleapis\.com|resend\.com/.test(url)) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  return realFetch(input, init);
}) as typeof fetch;

const STAMP = Date.now();
const GOOGLE_SUB = `recovery-${STAMP}`;
const GOOGLE_EMAIL = `recovery-google-${STAMP}@test.local`;
(OAuth2Client.prototype as any).verifyIdToken = async () => ({
  getPayload: () => ({ sub: GOOGLE_SUB, email: GOOGLE_EMAIL, email_verified: true, name: 'Anar Google' }),
});

const { appRouter } = await import('../src/routers/index.js');
const { removeBlockedUser } = await import('../src/services/telegram-bot.service.js');
const db = getDb();
const call = (userId: string | null) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const TG_ID = 910000000 + Math.floor(Math.random() * 99999);
const created = new Set<string>();

function signedInitData(startParam?: string): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'recovery');
  if (startParam) params.set('start_param', startParam);
  params.set('user', JSON.stringify({ id: TG_ID, first_name: 'Mono', language_code: 'ru' }));
  const data = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN!).digest();
  params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return params.toString();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const inviter = await db.user.create({ data: { name: 'recovery inviter' } });
  created.add(inviter.id);

  // 1. Telegram newcomer through the inviter's link; the inviter confirms; the bot cannot write first
  const tg = await call(null).auth.loginWithTelegram({ initData: signedInitData() });
  created.add(tg.userId);
  const { token } = await call(inviter.id).invite.generate();
  await call(tg.userId).invite.accept({ token });
  const pending = await db.pendingConnection.findFirst({ where: { fromUserId: tg.userId, toUserId: inviter.id } });
  await call(inviter.id).pending.accept({ pendingId: pending!.id });
  await wait(1500); // notifications are sent after the response
  const afterConfirm = await db.user.findUnique({ where: { id: tg.userId }, select: { deletedAt: true, name: true } });
  check('bot cannot write first: newcomer stays active', !afterConfirm?.deletedAt, `deletedAt=${afterConfirm?.deletedAt?.toISOString() ?? null}`);

  // 2. A real block mutes the account; Telegram sign-in brings it back
  tgAnswer = { status: 403, description: 'Forbidden: bot was blocked by the user' };
  await removeBlockedUser(TG_ID);
  const muted = await db.user.findUnique({ where: { id: tg.userId }, select: { deletedAt: true, name: true } });
  check('real block mutes the account', !!muted?.deletedAt && muted.name === 'Deleted user');
  const again = await call(null).auth.loginWithTelegram({ initData: signedInitData() });
  const restored = await db.user.findUnique({ where: { id: tg.userId }, select: { deletedAt: true, name: true } });
  check('Telegram sign-in restores the muted account', again.userId === tg.userId && !restored?.deletedAt && restored?.name === 'Mono',
    `deletedAt=${restored?.deletedAt ?? null} name=${restored?.name}`);
  const me = await call(tg.userId).user.me().then(() => 'ok', (e: any) => e.message);
  check('restored account can use the app', me === 'ok', String(me));
  tgAnswer = { status: 403, description: "Forbidden: bot can't initiate conversation with a user" };

  // 3. Same person signs in with Google: a fresh account; it opens the inviter's link too
  const google = await call(null).auth.loginWithGoogle({ idToken: 'local-test-token' });
  created.add(google.userId);
  check('Google makes a separate new account (no shared identifier)', google.isNew && google.userId !== tg.userId);
  const { token: token2 } = await call(inviter.id).invite.generate();
  await call(google.userId).invite.accept({ token: token2 });

  // "Connect Telegram" from the new account
  const { code } = await call(google.userId).auth.generateLinkCode();
  const linked: any = await call(null).auth.loginWithTelegram({ initData: signedInitData(`link_${code}`) });
  check('connecting Telegram folds the empty account in', linked.linkResult === 'merged' && linked.userId === tg.userId, `linkResult=${linked.linkResult}`);
  const gone = await db.user.findUnique({ where: { id: google.userId } });
  check('the empty Google account is removed', !gone);
  const googleAgain = await call(null).auth.loginWithGoogle({ idToken: 'local-test-token' });
  check('Google now signs in to the Telegram account', googleAgain.userId === tg.userId && !googleAgain.isNew, `userId=${googleAgain.userId}`);
  const keep = await db.user.findUnique({ where: { id: tg.userId }, select: { email: true } });
  check('the proven Google e-mail moved over', keep?.email === GOOGLE_EMAIL, String(keep?.email));
  const stillConnected = await db.connection.count({ where: { OR: [{ userAId: tg.userId }, { userBId: tg.userId }] } });
  check('the connection with the inviter is kept', stillConnected === 1, `connections=${stillConnected}`);
}

async function cleanup() {
  const ids = [...created];
  await db.connection.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await db.pendingConnection.deleteMany({ where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] } });
  await db.inviteLink.deleteMany({ where: { OR: [{ inviterId: { in: ids } }, { usedById: { in: ids } }] } });
  await db.linkingCode.deleteMany({ where: { userId: { in: ids } } });
  await db.platformAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.botStart.deleteMany({ where: { chatId: String(TG_ID) } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
}

try {
  await main();
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await cleanup();
  await db.$disconnect();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
