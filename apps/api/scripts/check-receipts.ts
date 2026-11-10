/**
 * Local check of per-cycle "received" marks (ObligationReceipt) and the collection description.
 * Real tRPC procedures and the cycle-close worker against the LOCAL database so_signal_check_b only.
 *
 * Covers: mark in cycle 1 -> receipt for cycle 1 and the live mark cleared; unmarked cycle 2 -> no
 * receipt; running the close twice creates no duplicates; a marked person who unsubscribed keeps the
 * receipt after the obligation is deleted; history is author-only (FORBIDDEN for everyone else);
 * emergency collections are untouched; description is trimmed, capped and author-only.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/so_signal_check_b?schema=public npx tsx scripts/check-receipts.ts
 */
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS } from '@so/shared';

if (!/@localhost:5434\/so_signal_check_b(\?|$)/.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL must be the local so_signal_check_b database.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;

const { appRouter } = await import('../src/routers/index.js');
const { processCycleClose, recordCycleReceipts } = await import('../src/workers/cycle-close.worker.js');

const db = getDb();
const P = `rcpt${Date.now().toString(36)}`;
const id = (s: string) => `${P}-${s}`;
const call = (userId: string) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const DAY = 24 * 60 * 60 * 1000;

let failed = 0;
function check(cond: boolean, msg: string) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!cond) failed++;
}
async function forbidden(fn: () => Promise<unknown>) {
  try { await fn(); return false; } catch (e: any) { return e?.code === 'FORBIDDEN'; }
}

async function main() {
  const people = ['author', 'a', 'b', 'c', 'stranger'];
  await db.user.createMany({ data: people.map((p) => ({ id: id(p), name: `Person ${p}`, language: 'en', onboardingCompleted: true }) as any) });

  // Regular collection whose first cycle is already over
  const reg = await db.collection.create({
    data: {
      id: id('reg'), creatorId: id('author'), type: 'REGULAR', amount: 100, chatLink: 'https://example.com/chat',
      currentCycleStart: new Date(Date.now() - (REGULAR_CYCLE_DAYS + 1) * DAY),
    },
  });
  const ob = async (p: string, amount: number, extra: Record<string, unknown> = {}) =>
    db.obligation.create({ data: { collectionId: reg.id, userId: id(p), amount, isSubscription: true, ...extra } });
  const oa = await ob('a', 30, { confirmedAt: new Date() });           // marked, stays
  const obb = await ob('b', 20);                                       // never marked
  const oc = await ob('c', 10, { confirmedAt: new Date(), unsubscribedAt: new Date() }); // marked, left

  // Emergency collection with a marked obligation: must stay as it is
  const emg = await db.collection.create({ data: { id: id('emg'), creatorId: id('author'), type: 'EMERGENCY', amount: 50, chatLink: 'https://example.com/e' } });
  const oe = await db.obligation.create({ data: { collectionId: emg.id, userId: id('a'), amount: 5, confirmedAt: new Date() } });

  // ---- Close cycle 1 ----
  await processCycleClose({} as any);
  let col = await db.collection.findUniqueOrThrow({ where: { id: reg.id } });
  check(col.cycleNumber === 2, 'cycle advanced to 2');
  let receipts = await db.obligationReceipt.findMany({ where: { collectionId: reg.id } });
  check(receipts.length === 2 && receipts.every((r) => r.cycleNumber === 1), 'two receipts for cycle 1 (a and c)');
  check(receipts.find((r) => r.userId === id('a'))?.amount === 30, 'receipt keeps the amount of that moment');
  check(!receipts.some((r) => r.userId === id('b')), 'unmarked person has no receipt');
  check((await db.obligation.findUnique({ where: { id: oa.id } }))?.confirmedAt === null, 'live mark cleared for the new cycle');
  check((await db.obligation.findUnique({ where: { id: obb.id } })) !== null, 'carried-over obligation kept');
  check((await db.obligation.findUnique({ where: { id: oc.id } })) === null, 'unsubscribed obligation deleted at close');
  const cReceipt = receipts.find((r) => r.userId === id('c'));
  check(!!cReceipt && cReceipt.obligationId === null, 'receipt of the person who left survives (obligationId set to null)');
  const emgAfter = await db.obligation.findUnique({ where: { id: oe.id } });
  check(emgAfter?.confirmedAt != null, 'emergency collection mark untouched');
  check((await db.obligationReceipt.count({ where: { collectionId: emg.id } })) === 0, 'emergency collection gets no receipts');

  // ---- Idempotency: the same close applied again ----
  await db.obligation.update({ where: { id: oa.id }, data: { confirmedAt: new Date() } }); // pretend the mark was still there
  await recordCycleReceipts(db, reg.id, 1);
  await recordCycleReceipts(db, reg.id, 1);
  await processCycleClose({} as any); // cycle 2 is not over: nothing happens
  receipts = await db.obligationReceipt.findMany({ where: { collectionId: reg.id } });
  check(receipts.length === 2, 'running the close twice creates no duplicate receipts');
  check((await db.obligation.findUnique({ where: { id: oa.id } }))?.confirmedAt === null, 'repeat run leaves the mark cleared');

  // ---- Cycle 2 unmarked -> no receipt for cycle 2 ----
  await db.collection.update({ where: { id: reg.id }, data: { currentCycleStart: new Date(Date.now() - (REGULAR_CYCLE_DAYS + 1) * DAY) } });
  await processCycleClose({} as any);
  col = await db.collection.findUniqueOrThrow({ where: { id: reg.id } });
  check(col.cycleNumber === 3, 'cycle advanced to 3');
  check((await db.obligationReceipt.count({ where: { collectionId: reg.id, cycleNumber: 2 } })) === 0, 'unmarked cycle 2 has no receipt');

  // ---- History: author only ----
  const hist = await call(id('author')).obligation.receiptHistory({ collectionId: reg.id });
  const c1 = hist.cycles.find((c) => c.cycleNumber === 1);
  const c2 = hist.cycles.find((c) => c.cycleNumber === 2);
  check(hist.cycles.map((c) => c.cycleNumber).join(',') === '2,1', 'history lists past cycles newest first');
  check(c1?.markedCount === 2 && c1.markedAmount === 40 && c1.marked.length === 2, 'cycle 1: 2 marked, 40 $, names listed');
  check(c2?.markedCount === 0 && c2.markedAmount === 0, 'cycle 2: no marks, shown with zeros');
  check(!!c1?.startsAt && !!c1?.endsAt, 'period dates derived');
  check(await forbidden(() => call(id('a')).obligation.receiptHistory({ collectionId: reg.id })), 'a participant gets FORBIDDEN');
  check(await forbidden(() => call(id('stranger')).obligation.receiptHistory({ collectionId: reg.id })), 'a stranger gets FORBIDDEN');
  check((await call(id('author')).obligation.receiptHistory({ collectionId: emg.id })).cycles.length === 0, 'emergency collection has no history');
  const seen = await call(id('a')).collection.getById({ id: reg.id });
  check(seen.obligations.every((o) => o.confirmedAt === null), 'participants still never see marks in getById');

  // ---- Description ----
  const author = call(id('author'));
  const upd = await author.collection.updateDescription({ id: reg.id, description: '  Rent for the winter  ' });
  check(upd.description === 'Rent for the winter', 'description trimmed');
  check((await call(id('a')).collection.getPublic({ id: reg.id })).description === 'Rent for the winter', 'public landing returns the description');
  check((await call(id('a')).collection.getById({ id: reg.id })).description === 'Rent for the winter', 'getById returns the description');
  check((await author.collection.updateDescription({ id: reg.id, description: '   ' })).description === null, 'empty becomes null');
  let tooLong = false;
  try { await author.collection.updateDescription({ id: reg.id, description: 'x'.repeat(301) }); } catch { tooLong = true; }
  check(tooLong, '301 characters rejected');
  check(await forbidden(() => call(id('a')).collection.updateDescription({ id: reg.id, description: 'hi' })), 'non-author cannot edit the description');
  const html = await author.collection.updateDescription({ id: reg.id, description: '<b>x</b>' });
  check(html.description === '<b>x</b>', 'markup is stored as plain text (rendered as text only)');
}

try {
  await main();
} finally {
  await db.user.deleteMany({ where: { id: { startsWith: `${P}-` } } }); // cascades to collections, obligations, receipts
  await db.$disconnect();
}
console.log(failed === 0 ? '\nAll checks passed' : `\n${failed} check(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
