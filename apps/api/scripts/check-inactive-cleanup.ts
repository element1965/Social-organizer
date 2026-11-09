/**
 * Checks the 2-year inactivity cleanup against the LOCAL database (localhost only).
 * Creates two throwaway users, runs the routine with an injected clock and cleans up.
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

async function main() {
  loadEnvFile(resolve(process.cwd(), '../../packages/db/.env'));
  if (!isLocalDb(process.env.DATABASE_URL)) {
    console.error('Refusing to run: DATABASE_URL is not a localhost database');
    process.exit(1);
  }
  const outbox = join(tmpdir(), `so-inactive-check-${Date.now()}.log`);
  process.env.DEV_MAIL_OUTBOX = outbox;
  delete process.env.RESEND_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;

  const { PrismaClient } = await import('@so/db');
  const svc = await import('../src/services/inactive-cleanup.service.js');
  const db = new PrismaClient();
  const emails = ['inactive-a@test.local', 'inactive-b@test.local'];
  await db.user.deleteMany({ where: { email: { in: emails } } });

  const T = new Date();
  const at = (days: number) => new Date(T.getTime() + days * DAY);
  // A: last seen 725 days ago (2-year mark in 5 days), Russian.
  const a = await db.user.create({ data: { name: 'Inactive A', email: emails[0], language: 'ru', lastSeen: at(-725), createdAt: at(-900) } });
  // B: never seen, created 800 days ago (mark already passed: must still get both warnings first).
  const b = await db.user.create({ data: { name: 'Inactive B', email: emails[1], language: 'en', lastSeen: null, createdAt: at(-800) } });
  const ids = [a.id, b.id];

  const notices: Array<{ userId: string; stage: number; text: string; deleteOn: string }> = [];
  type Target = Parameters<typeof svc.sendInactivityNotice>[1];
  type Notice = Parameters<typeof svc.sendInactivityNotice>[2];
  const notify = async (d: typeof db, u: Target, n: Notice) => {
    notices.push({ userId: n.userId, stage: n.stage, text: n.text, deleteOn: day(n.deleteOn) });
    await svc.sendInactivityNotice(d, u, n); // real channels: the e-mail lands in the dev outbox
  };
  const run = (now: Date) => svc.runInactiveCleanup(db, { now, notify, onlyUserIds: ids });
  const stageOf = async (id: string) =>
    (await db.user.findUnique({ where: { id }, select: { inactivityStage: true } }))?.inactivityStage ?? null;

  try {
    // Day 0: first warning to both; deletion date = day 30 (B's mark has already passed).
    let r = await run(T);
    check('day 0: two 30-day warnings', [r.warned30, r.warned7, r.deleted], [2, 0, 0]);
    check('day 0: stages', [await stageOf(a.id), await stageOf(b.id)], [1, 1]);
    const na = notices.find((n) => n.userId === a.id);
    const nb = notices.find((n) => n.userId === b.id);
    check('ru text', !!na && na.text.startsWith('Ваш профиль в Social Organizer будет удалён') && na.text.endsWith('Чтобы сохранить его, просто войдите.'), true);
    check('en text', !!nb && nb.text.startsWith('Your Social Organizer profile will be deleted on'), true);
    check('announced date = day 30 for both', [na?.deleteOn, nb?.deleteOn], [day(at(30)), day(at(30))]);
    let outboxText = '';
    try { outboxText = readFileSync(outbox, 'utf8'); } catch { /* nothing written */ }
    check('e-mail notices in dev outbox', outboxText.includes(emails[0]) && outboxText.includes(emails[1]), true);

    r = await run(T);
    check('day 0 again: idempotent', [r.warned30, r.warned7, r.deleted], [0, 0, 0]);

    r = await run(at(22));
    check('day 22: too early for 2nd warning', [r.warned30, r.warned7, r.deleted], [0, 0, 0]);

    r = await run(at(23));
    check('day 23: two 7-day warnings', [r.warned30, r.warned7, r.deleted], [0, 2, 0]);
    check('day 23: stages', [await stageOf(a.id), await stageOf(b.id)], [2, 2]);
    check('7-day notice keeps the announced date', notices.filter((n) => n.stage === 2).map((n) => n.deleteOn), [day(at(30)), day(at(30))]);

    r = await run(at(29));
    check('day 29: nothing deleted yet', r.deleted, 0);

    // B signs in on day 29 (what the auth middleware does): the stage resets, the profile is kept.
    await db.user.update({ where: { id: b.id }, data: { lastSeen: at(29), inactivityStage: 0, inactivityWarnedAt: null } });

    // Advisory lock: a run while another holder has the lock is skipped.
    const lockKey = 'so:inactive-account-cleanup';
    const skipped = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
      return svc.runInactiveCleanupLocked(db, { now: at(30), notify, onlyUserIds: ids });
    }, { timeout: 30_000 });
    check('locked run is skipped', skipped.skipped, true);

    r = await svc.runInactiveCleanupLocked(db, { now: at(30), notify, onlyUserIds: ids });
    check('day 30: A deleted, B kept', [r.deleted, r.skipped ?? false], [1, false]);
    check('A is gone (no ties: hard delete)', await db.user.findUnique({ where: { id: a.id } }), null);
    const bRow = await db.user.findUnique({ where: { id: b.id }, select: { inactivityStage: true, deletedAt: true } });
    check('B still active, stage 0', [bRow?.inactivityStage, bRow?.deletedAt ?? null], [0, null]);

    r = await run(at(31));
    check('day 31: B not warned again (fresh 2-year period)', [r.warned30, r.warned7, r.deleted], [0, 0, 0]);
  } finally {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
