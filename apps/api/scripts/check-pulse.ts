/**
 * Local check of notification.pulse, the one light poll that replaced the app's per-list timers: for every
 * list it stands for, a change that alters that list must change exactly its group of the pulse, and an
 * unchanged state must give the same pulse twice. Real tRPC procedures against a LOCAL database.
 *
 * Usage (from apps/api):
 *   JWT_SECRET=<16+ chars> npx tsx --env-file=.env scripts/check-pulse.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows (ids start with "pu-").
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;

const { appRouter } = await import('../src/routers/index.js');
const { invalidateGraph } = await import('../src/services/graph-cache.service.js');
const { createConnectionWithinLimit } = await import('../src/services/connection-request.service.js');

const db = getDb();
const P = 'pu-';
const id = (s: string) => `${P}${s}`;
const call = (userId: string) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

type Pulse = Awaited<ReturnType<ReturnType<typeof call>['notification']['pulse']>>;
const ME = id('me');
const pulse = () => call(ME).notification.pulse();
/** Groups of the pulse that differ between two answers. */
function changed(a: Pulse, b: Pulse): string[] {
  return (Object.keys(a) as Array<keyof Pulse>).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}

let before: Pulse;
/**
 * Runs a change and checks that exactly the expected groups moved. `optional` groups may move too (a
 * side effect of a real procedure, e.g. a milestone reached by a connection) and are reported.
 */
async function expectChange(name: string, change: () => Promise<unknown>, expected: string[], optional: string[] = []) {
  // updatedAt / createdAt are in milliseconds: keep two changes apart
  await sleep(5);
  await change();
  const after = await pulse();
  const moved = changed(before, after);
  const must = [...expected].sort();
  const extra = moved.filter((k) => !must.includes(k) && !optional.includes(k));
  const missing = must.filter((k) => !moved.includes(k));
  check(name, extra.length === 0 && missing.length === 0, `changed: [${moved.join(', ')}]${missing.length ? ` missing: [${missing}]` : ''}${extra.length ? ` unexpected: [${extra}]` : ''}`);
  before = after;
  return moved;
}

async function cleanup() {
  await db.user.deleteMany({ where: { id: { startsWith: P } } });
  invalidateGraph();
}

try {
  await cleanup();
  const people = ['me', 'b', 'c', 'd', 'e'];
  await db.user.createMany({ data: people.map((p) => ({ id: id(p), name: `PU ${p}`, monthlyBudget: 10, remainingBudget: 10 })) });
  invalidateGraph();

  /* ---------- An unchanged state ---------- */
  before = await pulse();
  const again = await pulse();
  check('an unchanged state gives an identical pulse twice', JSON.stringify(before) === JSON.stringify(again));
  check('the pulse carries numbers only', Object.values(before).every((g) => Object.values(g as object).every((v) => typeof v === 'number')));

  /* ---------- Connection requests ---------- */
  const fromB = { id: '' };
  await expectChange('a new incoming request moves `incoming` only', async () => {
    fromB.id = (await db.pendingConnection.create({ data: { fromUserId: id('b'), toUserId: ME } })).id;
  }, ['incoming']);
  const toC = { id: '' };
  await expectChange('my own new request moves `outgoing` only', async () => {
    toC.id = (await db.pendingConnection.create({ data: { fromUserId: ME, toUserId: id('c') } })).id;
  }, ['outgoing']);
  await expectChange('the other person confirms my request: `outgoing`, `accepted` and `connections`',
    () => call(id('c')).pending.accept({ pendingId: toC.id }), ['outgoing', 'accepted', 'connections'], ['milestones']);
  await expectChange('I confirm an incoming request: `incoming` and `connections`',
    () => call(ME).pending.accept({ pendingId: fromB.id }), ['incoming', 'connections'], ['milestones']);
  await expectChange('the confirmation is seen: `accepted` only', () => call(ME).pending.markAcceptedSeen({ ids: [toC.id] }), ['accepted']);
  await expectChange('the confirmation is dismissed: `accepted` only', () => call(ME).pending.dismissAccepted({ id: toC.id }), ['accepted']);

  /* ---------- Need notices ---------- */
  const day = 24 * 60 * 60 * 1000;
  const needOfB = await db.collection.create({ data: { creatorId: id('b'), type: 'EMERGENCY', amount: 50, chatLink: 'https://t.me/pu_check' } });
  const notice = { id: '' };
  await expectChange('a Need notice arrives: `notifications` only', async () => {
    notice.id = (await db.notification.create({
      data: { userId: ME, collectionId: needOfB.id, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + day), handshakePath: [id('b'), ME] },
    })).id;
  }, ['notifications']);
  await expectChange('the notice is opened (read): `notifications` only', () => call(ME).notification.markRead({ id: notice.id }), ['notifications']);
  await expectChange('the Need under the notice is closed: `notifications` only',
    () => db.collection.update({ where: { id: needOfB.id }, data: { status: 'CLOSED', closedAt: new Date() } }), ['notifications']);
  await expectChange('the notice is dismissed: `notifications` only', () => call(ME).notification.dismiss({ id: notice.id }), ['notifications']);
  const needOfC = await db.collection.create({ data: { creatorId: id('c'), type: 'EMERGENCY', amount: 40, chatLink: 'https://t.me/pu_check' } });
  const shortNotice = await db.notification.create({
    data: { userId: ME, collectionId: needOfC.id, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + 1500), handshakePath: [id('c'), ME] },
  });
  before = await pulse();
  await expectChange('a notice runs out (badge): `notifications` only', () => sleep(1600), ['notifications']);
  void shortNotice;

  /* ---------- Needs I take part in ---------- */
  const pledge = { id: '' };
  await expectChange('I pledge to a Need: `participating` only', async () => {
    pledge.id = (await db.obligation.create({ data: { collectionId: needOfC.id, userId: ME, amount: 10 } })).id;
  }, ['participating']);
  await expectChange('someone else pledges to that Need: `participating` only',
    () => db.obligation.create({ data: { collectionId: needOfC.id, userId: id('d'), amount: 5 } }), ['participating']);
  await expectChange('my pledge amount is changed in place: `participating` only',
    () => db.obligation.update({ where: { id: pledge.id }, data: { amount: 12 } }), ['participating']);
  await expectChange('that Need is closed: `participating` and `notifications` (its notice is still on my list)',
    () => db.collection.update({ where: { id: needOfC.id }, data: { status: 'CLOSED', closedAt: new Date() } }), ['participating', 'notifications']);

  /* ---------- My own Needs ---------- */
  const mine = { id: '' };
  await expectChange('I open a Need: `mine` only', async () => {
    mine.id = (await db.collection.create({ data: { creatorId: ME, type: 'EMERGENCY', amount: 30, chatLink: 'https://t.me/pu_check' } })).id;
  }, ['mine']);
  const theirs = { id: '' };
  await expectChange('someone pledges to my Need: `mine` only', async () => {
    theirs.id = (await db.obligation.create({ data: { collectionId: mine.id, userId: id('e'), amount: 7 } })).id;
  }, ['mine']);
  await expectChange('I mark the pledge as received: `mine` only',
    () => db.obligation.update({ where: { id: theirs.id }, data: { confirmedAt: new Date() } }), ['mine']);
  await expectChange('the pledge is withdrawn: `mine` only',
    () => db.obligation.update({ where: { id: theirs.id }, data: { unsubscribedAt: new Date() } }), ['mine']);
  await expectChange('my Need is closed: `mine` only',
    () => db.collection.update({ where: { id: mine.id }, data: { status: 'CLOSED', closedAt: new Date() } }), ['mine']);

  /* ---------- Milestones ---------- */
  await db.userMilestone.deleteMany({ where: { userId: ME, kind: 'FIRST_NEED' } });
  before = await pulse();
  await expectChange('a milestone is reached: `milestones` only',
    () => db.userMilestone.create({ data: { userId: ME, kind: 'FIRST_NEED', achievedAt: new Date() } }), ['milestones']);
  await expectChange('the milestone is seen: `milestones` only', () => call(ME).milestone.markSeen({ kind: 'FIRST_NEED' }), ['milestones']);

  /* ---------- Circle questions ---------- */
  const reviewed = await db.collection.create({ data: { creatorId: id('b'), type: 'EMERGENCY', amount: 20, chatLink: 'https://t.me/pu_check' } });
  before = await pulse();
  const review = { id: '' };
  await expectChange('a circle question is addressed to me: `reviews` only', async () => {
    review.id = (await db.collectionReview.create({
      data: { collectionId: reviewed.id, closesAt: new Date(Date.now() + day), audienceIds: [ME, id('d')] },
    })).id;
  }, ['reviews']);
  await expectChange('someone else in the audience votes: `reviews` only',
    () => db.collectionReviewVote.create({ data: { reviewId: review.id, userId: id('d'), answer: 'OK' } }), ['reviews']);
  await expectChange('the question is decided: `reviews` only',
    () => db.collectionReview.update({ where: { id: review.id }, data: { status: 'DISMISSED', decidedAt: new Date() } }), ['reviews']);
  await db.collectionReview.create({ data: { collectionId: reviewed.id, closesAt: new Date(Date.now() + 1500), audienceIds: [ME] } });
  before = await pulse();
  await expectChange('a question reaches its closing time (the list then closes it): `reviews` only', () => sleep(1600), ['reviews']);

  /* ---------- A connection made elsewhere ---------- */
  await expectChange('a new connection (made on another device / by the other side): `connections`',
    () => db.$transaction((tx) => createConnectionWithinLimit(tx, ME, id('e'))), ['connections'], ['milestones']);

  /* ---------- Other people's changes leave my pulse alone ---------- */
  await expectChange('a request and a notice between other people change nothing', async () => {
    await db.pendingConnection.create({ data: { fromUserId: id('d'), toUserId: id('e') } });
    await db.notification.create({
      data: { userId: id('d'), collectionId: reviewed.id, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + day), handshakePath: [] },
    });
  }, []);

  const last1 = await pulse();
  const last2 = await pulse();
  check('…and the settled state is still identical twice', JSON.stringify(last1) === JSON.stringify(last2));

  /* ---------- Reads only ---------- */
  const stamp = async () => JSON.stringify(await Promise.all([
    db.notification.findMany({ where: { userId: ME }, orderBy: { id: 'asc' } }),
    db.pendingConnection.findMany({ where: { OR: [{ fromUserId: ME }, { toUserId: ME }] }, orderBy: { id: 'asc' } }),
    db.userMilestone.findMany({ where: { userId: ME }, orderBy: { id: 'asc' } }),
    db.collectionReview.findMany({ where: { audienceIds: { has: ME } }, orderBy: { id: 'asc' } }),
  ]));
  const rowsBefore = await stamp();
  await pulse();
  check('the pulse writes nothing', rowsBefore === (await stamp()));
} finally {
  await cleanup();
  await db.$disconnect();
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
