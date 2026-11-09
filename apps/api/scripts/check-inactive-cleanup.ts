/**
 * Checks the 2-year inactivity cleanup against the LOCAL database (localhost only).
 * Creates throwaway users (inactive-*@test.local), runs the routine with an injected clock
 * and cleans up.
 * Run from the repo root: pnpm --filter @so/api exec tsx scripts/check-inactive-cleanup.ts
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

function loadEnvFile(file: string) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // No env file: DATABASE_URL must come from the environment.
  }
}

function isLocalDb(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const ADMIN_ID = 'inactive-check-admin';

async function main() {
  loadEnvFile(resolve(process.cwd(), '../../packages/db/.env'));
  if (!isLocalDb(process.env.DATABASE_URL)) {
    console.error('Refusing to run: DATABASE_URL is not a localhost database');
    process.exit(1);
  }
  const outbox = join(tmpdir(), `so-inactive-check-${Date.now()}.log`);
  process.env.DEV_MAIL_OUTBOX = outbox;
  process.env.ADMIN_IDS = ADMIN_ID;
  delete process.env.RESEND_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;

  const { PrismaClient } = await import('@so/db');
  const svc = await import('../src/services/inactive-cleanup.service.js');
  const { touchUserNow } = await import('../src/services/activity.service.js');
  const { deleteUserAccount } = await import('../src/services/account-deletion.service.js');
  const db = new PrismaClient();
  const email = (k: string) => `inactive-${k}@test.local`;
  const testUsers = { OR: [{ email: { startsWith: 'inactive-', endsWith: '@test.local' } }, { id: ADMIN_ID }, { name: 'Inactive E' }] };
  const cleanup = async () => {
    await db.collection.deleteMany({ where: { creator: testUsers } });
    await db.user.deleteMany({ where: testUsers });
  };
  await cleanup();

  const T = new Date();
  const at = (days: number) => new Date(T.getTime() + days * DAY);
  // A: last seen 725 days ago (2-year mark in 5 days), Russian, e-mail.
  const a = await db.user.create({ data: { name: 'Inactive A', email: email('a'), language: 'ru', lastSeen: at(-725), createdAt: at(-900) } });
  // B: never seen, created 800 days ago (mark already passed: must still get both notices first).
  const b = await db.user.create({ data: { name: 'Inactive B', email: email('b'), language: 'en', lastSeen: null, createdAt: at(-800) } });
  // C: inactive author of an ACTIVE collection with a pledge from D: exempt.
  const c = await db.user.create({ data: { name: 'Inactive C', email: email('c'), lastSeen: at(-800), createdAt: at(-900) } });
  const d = await db.user.create({ data: { name: 'Active D', email: email('d'), lastSeen: T, createdAt: at(-100) } });
  const coll = await db.collection.create({ data: { creatorId: c.id, type: 'EMERGENCY', chatLink: 'https://t.me/test', amount: 100 } });
  await db.obligation.create({ data: { collectionId: coll.id, userId: d.id, amount: 10 } });
  // E: no channel at all (no e-mail, Telegram or push): notices undelivered, still deleted.
  const e = await db.user.create({ data: { name: 'Inactive E', email: null, lastSeen: at(-800), createdAt: at(-900) } });
  // F: listed in ADMIN_IDS: never processed.
  const f = await db.user.create({ data: { id: ADMIN_ID, name: 'Inactive admin', email: email('f'), lastSeen: at(-800), createdAt: at(-900) } });
  const ids = [a.id, b.id, c.id, d.id, e.id, f.id];

  const notices: Array<{ userId: string; stage: number; text: string; deleteOn: string; channels: number }> = [];
  const notify: import('../src/services/inactive-cleanup.service.js').InactivityNotifier = async (dbc, u, n) => {
    const channels = await svc.sendInactivityNotice(dbc, u, n); // real channels: e-mail lands in the dev outbox
    notices.push({ userId: n.userId, stage: n.stage, text: n.text, deleteOn: day(n.deleteOn), channels });
    return channels;
  };
  const run = (now: Date) => svc.runInactiveCleanup(db, { now, notify, onlyUserIds: ids });
  const stageOf = async (id: string) =>
    (await db.user.findUnique({ where: { id }, select: { inactivityStage: true } }))?.inactivityStage ?? null;
  const counts = (r: { warned30: number; warned7: number; deleted: number }) => [r.warned30, r.warned7, r.deleted];

  try {
    // Day 0: first notice to A, B, E; deletion date = day 30 (marks already near or passed).
    let r = await run(T);
    check('day 0: three 30-day notices, nothing deleted', counts(r), [3, 0, 0]);
    check('day 0: E reached no channel', r.undelivered, 1);
    check('day 0: C exempt (live collection with a pledge)', r.exempt, 1);
    check('day 0: stages A,B,C,E,F', await Promise.all([a, b, c, e, f].map((u) => stageOf(u.id))), [1, 1, 0, 1, 0]);
    const na = notices.find((n) => n.userId === a.id);
    const nb = notices.find((n) => n.userId === b.id);
    check('ru text', !!na && na.text.startsWith('Ваш профиль в Social Organizer будет удалён') && na.text.endsWith('Чтобы сохранить его, просто войдите.'), true);
    check('en text', !!nb && nb.text.startsWith('Your Social Organizer profile will be deleted on'), true);
    check('announced date = day 30', [na?.deleteOn, nb?.deleteOn], [day(at(30)), day(at(30))]);
    let outboxText = '';
    try { outboxText = readFileSync(outbox, 'utf8'); } catch { /* nothing written */ }
    check('e-mail notices in dev outbox (A, B)', outboxText.includes(email('a')) && outboxText.includes(email('b')), true);
    check('admin F got no notice', notices.some((n) => n.userId === f.id), false);

    r = await run(T);
    check('day 0 again: idempotent', counts(r), [0, 0, 0]);

    r = await run(at(22));
    check('day 22: too early for 2nd notice', counts(r), [0, 0, 0]);

    r = await run(at(23));
    check('day 23: three 7-day notices', counts(r), [0, 3, 0]);
    check('day 23: stages A,B,E', await Promise.all([a, b, e].map((u) => stageOf(u.id))), [2, 2, 2]);
    check('7-day notice keeps the announced date', [...new Set(notices.filter((n) => n.stage === 2).map((n) => n.deleteOn))], [day(at(30))]);

    r = await run(at(29));
    check('day 29: nothing deleted yet', r.deleted, 0);

    // B signs in on day 29: the real activity path resets the stage.
    await touchUserNow(db, b.id);
    const bTouched = await db.user.findUnique({ where: { id: b.id }, select: { inactivityStage: true, inactivityWarnedAt: true, lastSeen: true } });
    check('touchUser: stage reset, lastSeen set', [bTouched?.inactivityStage, bTouched?.inactivityWarnedAt, !!bTouched?.lastSeen], [0, null, true]);
    // The real clock is "day 0"; move B's activity to day 29 of the simulated timeline.
    await db.user.update({ where: { id: b.id }, data: { lastSeen: at(29) } });

    // The deletion guard runs inside the transaction: a refusing guard keeps the account.
    const refused = await deleteUserAccount(db, a.id, { guard: async () => false });
    check('guard refusal keeps the account', [refused, !!(await db.user.findUnique({ where: { id: a.id } }))], [null, true]);

    // Advisory lock: a run while another holder has the lock is skipped.
    const lockKey = 'so:inactive-account-cleanup';
    const skipped = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
      return svc.runInactiveCleanupLocked(db, { now: at(30), notify, onlyUserIds: ids });
    }, { timeout: 30_000 });
    check('locked run is skipped', skipped.skipped, true);

    r = await svc.runInactiveCleanupLocked(db, { now: at(30), notify, onlyUserIds: ids });
    check('day 30: A and E deleted (undelivered does not block)', [r.deleted, r.skipped ?? false], [2, false]);
    check('A gone', await db.user.findUnique({ where: { id: a.id } }), null);
    check('E gone', await db.user.findUnique({ where: { id: e.id } }), null);
    const kept = await db.user.count({ where: { id: { in: [b.id, c.id, f.id] }, deletedAt: null } });
    check('B, C, F still active', kept, 3);

    r = await run(at(31));
    check('day 31: nobody warned again', counts(r), [0, 0, 0]);
  } finally {
    await cleanup();
    await db.$disconnect();
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
