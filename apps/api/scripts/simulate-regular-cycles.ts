/**
 * Local check of the regular-collection cycle: runs 3 cycles in a row against a
 * LOCAL database and verifies reminders / "cycle renewed" notifications.
 *
 * Telegram calls are intercepted (global fetch is stubbed) — nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/social_organizer \
 *   TELEGRAM_BOT_TOKEN=fake npx tsx scripts/simulate-regular-cycles.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows.
 */
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { processCycleRenewalReminder } from '../src/workers/cycle-renewal-reminder.worker.js';
import { processCycleClose } from '../src/workers/cycle-close.worker.js';

if (/railway|rlwy\.net/.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run against a remote database.');
  process.exit(1);
}

// ---- Intercept Telegram ----
type TgCall = { chatId: string; text: string };
const tgCalls: TgCall[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('api.telegram.org')) {
    const body = JSON.parse(init?.body ?? '{}');
    tgCalls.push({ chatId: String(body.chat_id), text: String(body.text ?? '') });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

const db = getDb();
const DAY = 24 * 60 * 60 * 1000;
const job = {} as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (d: Date, lang: string) =>
  d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

let failures = 0;
function check(cond: boolean, msg: string) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}

const TAG = `sim-${Date.now()}`;

async function main() {
  // ---- Seed ----
  const mk = (name: string, language: string, extra: Record<string, unknown> = {}) =>
    db.user.create({ data: { name: `${name}`, language, email: `${name}-${TAG}@test.local`, ...extra } });
  const creator = await mk('Creator', 'en');
  const anna = await mk('Anna', 'ru');                                  // 50 UAH
  const bob = await mk('Bob', 'en');                                    // 10 USD + 5 USD
  const carl = await mk('Carl', 'uk');                                  // unsubscribes after cycle 1 reminder
  const dina = await mk('Dina', 'en', { notifyRenewalReminder: false, notifyRenewalStart: false });

  const tgIds: Record<string, string> = {};
  for (const u of [creator, anna, bob, carl, dina]) {
    tgIds[u.id] = `${Math.floor(Math.random() * 1e9)}`;
    await db.platformAccount.create({ data: { userId: u.id, platform: 'TELEGRAM', platformId: tgIds[u.id]! } });
  }

  const collection = await db.collection.create({
    data: {
      creatorId: creator.id, type: 'REGULAR', amount: 1000, currency: 'USD', chatLink: 'https://t.me/test',
      currentCycleStart: new Date(Date.now() - 25.5 * DAY), cycleNumber: 1,
    },
  });
  const obl = (userId: string, amount: number, originalAmount: number | null, originalCurrency: string | null) =>
    db.obligation.create({ data: { collectionId: collection.id, userId, amount, originalAmount, originalCurrency, isSubscription: true } });
  await obl(anna.id, 1.2, 50, 'UAH');
  await obl(bob.id, 10, 10, 'USD');
  await obl(bob.id, 5, 5, 'USD');
  await obl(carl.id, 20, 20, 'USD');
  await obl(dina.id, 7, 7, 'USD');

  const tgFor = (userId: string) => tgCalls.filter((c) => c.chatId === tgIds[userId]);
  const notifCount = (userId: string, type: string, wave: number) =>
    db.notification.count({ where: { userId, collectionId: collection.id, type: type as any, wave } });

  for (let cycle = 1; cycle <= 3; cycle++) {
    console.log(`\n=== Cycle ${cycle} ===`);
    const before = await db.collection.findUniqueOrThrow({ where: { id: collection.id } });
    check(before.cycleNumber === cycle, `cycleNumber = ${cycle}`);

    // -- Reminder 3 days before the end (worker runs twice: must not duplicate) --
    tgCalls.length = 0;
    await processCycleRenewalReminder(job);
    await processCycleRenewalReminder(job);
    await sleep(800);

    const nextStart = new Date(before.currentCycleStart!.getTime() + REGULAR_CYCLE_DAYS * DAY);
    const nextEnd = new Date(nextStart.getTime() + (REGULAR_CYCLE_DAYS - 1) * DAY);
    const carlActive = cycle === 1;

    check((await notifCount(anna.id, 'CYCLE_RENEWAL_REMINDER', cycle)) === 1, 'Anna: exactly 1 in-app reminder');
    check((await notifCount(bob.id, 'CYCLE_RENEWAL_REMINDER', cycle)) === 1, 'Bob: exactly 1 in-app reminder');
    check((await notifCount(carl.id, 'CYCLE_RENEWAL_REMINDER', cycle)) === (carlActive ? 1 : 0), `Carl: ${carlActive ? 1 : 0} reminders`);
    check((await notifCount(dina.id, 'CYCLE_RENEWAL_REMINDER', cycle)) === 0, 'Dina (reminders off): none');
    check((await notifCount(creator.id, 'CYCLE_RENEWAL_REMINDER', cycle)) === 0, 'Creator: none');

    const aR = tgFor(anna.id);
    check(aR.length === 1, `Anna: 1 Telegram reminder (got ${aR.length})`);
    check(!!aR[0]?.text.includes('Ваш взнос: <b>50 UAH</b>'), 'Anna TG: own contribution 50 UAH (ru)');
    check(!!aR[0]?.text.includes(`Период: ${fmt(nextStart, 'ru')} — ${fmt(nextEnd, 'ru')}`), 'Anna TG: next period dates');
    const bR = tgFor(bob.id);
    check(bR.length === 1, `Bob: 1 Telegram reminder (got ${bR.length})`);
    check(!!bR[0]?.text.includes('Your contribution: <b>15 USD</b>'), 'Bob TG: 10+5 = 15 USD');
    check(!bR[0]?.text.includes('1000'), 'Bob TG: no collection goal (1000) shown');
    check(tgFor(dina.id).length === 0, 'Dina: no Telegram');
    if (cycle === 1) {
      console.log('\n  --- sample reminder (Anna) ---\n' + aR[0]?.text + '\n  ---');
      // Carl unsubscribes after the reminder
      await db.obligation.updateMany({ where: { collectionId: collection.id, userId: carl.id }, data: { unsubscribedAt: new Date() } });
    }

    // -- Cycle end: move cycle start back past 28 days, run close twice --
    await db.collection.update({ where: { id: collection.id }, data: { currentCycleStart: new Date(Date.now() - (REGULAR_CYCLE_DAYS * DAY + 3600_000)) } });
    tgCalls.length = 0;
    await processCycleClose(job);
    await processCycleClose(job);
    await sleep(800);

    const after = await db.collection.findUniqueOrThrow({ where: { id: collection.id } });
    check(after.cycleNumber === cycle + 1, `cycle rolled over once → ${cycle + 1}`);
    const newStart = after.currentCycleStart!;
    const newEnd = new Date(newStart.getTime() + (REGULAR_CYCLE_DAYS - 1) * DAY);

    check((await notifCount(anna.id, 'CYCLE_RENEWED', cycle + 1)) === 1, 'Anna: exactly 1 "cycle renewed"');
    check((await notifCount(bob.id, 'CYCLE_RENEWED', cycle + 1)) === 1, 'Bob: exactly 1 "cycle renewed"');
    check((await notifCount(carl.id, 'CYCLE_RENEWED', cycle + 1)) === 0, 'Carl (unsubscribed): not renewed');
    check((await notifCount(dina.id, 'CYCLE_RENEWED', cycle + 1)) === 0, 'Dina (start off): no "renewed"');

    const aN = tgFor(anna.id);
    check(aN.length === 1, `Anna: 1 Telegram "renewed" (got ${aN.length})`);
    check(!!aN[0]?.text.includes('Ваш взнос: <b>50 UAH</b>'), 'Anna TG renewed: own contribution');
    check(!!aN[0]?.text.includes(`Период: ${fmt(newStart, 'ru')} — ${fmt(newEnd, 'ru')}`), 'Anna TG renewed: new period dates');
    check(tgFor(carl.id).length === 0, 'Carl: no Telegram after unsubscribe');
    if (cycle === 1) console.log('\n  --- sample "renewed" (Anna) ---\n' + aN[0]?.text + '\n  ---');
    if (cycle === 1) {
      const carlObls = await db.obligation.count({ where: { collectionId: collection.id, userId: carl.id } });
      check(carlObls === 0, 'Carl: unsubscribed obligation removed at cycle end');
    }

    // -- Time passes: move to ~3 days before the next end --
    await db.collection.update({ where: { id: collection.id }, data: { currentCycleStart: new Date(Date.now() - 25.5 * DAY) } });
  }

  // ---- Cleanup ----
  await db.collection.delete({ where: { id: collection.id } });
  await db.user.deleteMany({ where: { email: { endsWith: `${TAG}@test.local` } } });

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
