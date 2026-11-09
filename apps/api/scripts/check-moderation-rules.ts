/**
 * Checks the circle-moderation rules, then the database path when DATABASE_URL is localhost:5434.
 * Run from the repo root: pnpm --filter @so/api exec tsx scripts/check-moderation-rules.ts
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TRPCError } from '@trpc/server';
import {
  applyDismissedComplaint,
  collectionCooling,
  communityHoldPatch,
  complaintBanned,
  COMPLAINT_BAN_MS,
  COLLECTION_COOLDOWN_MS,
  decideReview,
  deliverWithRetry,
  dismissalRecordsStrikes,
  hackedMajority,
  inflectFirstName,
  leaderUnassailable,
  PLEDGE_MIN_AGE_MS,
  pledgeOldEnough,
  quorumReached,
  reviewAudience,
  reviewKind,
  shouldOpenReview,
  upheldBecomesInconclusive,
} from '../src/services/moderation-rules.js';

let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}\n  actual   ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
    return;
  }
  console.log(`ok   ${name}`);
}

const hour = 60 * 60 * 1000;
const now = Date.parse('2026-11-09T12:00:00Z');
const closesAt = now + 48 * hour;

check('quorum needs 3 and 30%', quorumReached(2, 3), false);
check('quorum 3 of 10', quorumReached(3, 10), true);
check('quorum 3 of 9', quorumReached(3, 9), true);
check('quorum 5 of 20 is short', quorumReached(5, 20), false);
check('quorum 6 of 20', quorumReached(6, 20), true);
check('empty audience never has quorum', quorumReached(3, 0), false);

check('small circle escalates', reviewKind(2), 'ESCALATION');
check('three addresses vote', reviewKind(3), 'VOTE');

check('one problem is not enough to uphold', decideReview({
  now: closesAt, closesAt, audienceSize: 3, votes: ['PROBLEM', 'UNKNOWN', 'UNKNOWN'],
}), 'INCONCLUSIVE');
check('two problems and one unknown uphold at the deadline', decideReview({
  now: closesAt, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM', 'UNKNOWN'],
}), 'UPHELD');
check('unassailable problem lead closes early', decideReview({
  now, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM', 'PROBLEM', 'PROBLEM', 'PROBLEM', 'PROBLEM'],
}), 'UPHELD');
check('three problems can still be overtaken', decideReview({
  now, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM', 'PROBLEM'],
}), null);
check('full small circle of problems closes early', decideReview({
  now, closesAt, audienceSize: 3, votes: ['PROBLEM', 'PROBLEM', 'UNKNOWN'],
}), 'UPHELD');
check('ok majority is not early while it can flip', decideReview({
  now, closesAt, audienceSize: 10, votes: ['OK', 'OK', 'OK'],
}), null);
check('ok majority closes early when it cannot flip', decideReview({
  now, closesAt, audienceSize: 3, votes: ['OK', 'OK', 'UNKNOWN'],
}), 'DISMISSED');
check('tie stays open before the deadline', decideReview({
  now, closesAt, audienceSize: 4, votes: ['PROBLEM', 'OK', 'UNKNOWN'],
}), null);
check('tie at the deadline is inconclusive', decideReview({
  now: closesAt, closesAt, audienceSize: 4, votes: ['PROBLEM', 'OK', 'UNKNOWN'],
}), 'INCONCLUSIVE');
check('all unknown at the deadline is inconclusive', decideReview({
  now: closesAt, closesAt, audienceSize: 4, votes: ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
}), 'INCONCLUSIVE');
check('below quorum stays open', decideReview({
  now, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM'],
}), null);
check('deadline without quorum is inconclusive', decideReview({
  now: closesAt, closesAt, audienceSize: 10, votes: ['PROBLEM'],
}), 'INCONCLUSIVE');
check('deadline with the problem rule upholds', decideReview({
  now: closesAt + 1, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM', 'OK'],
}), 'UPHELD');
check('admin force upholds', decideReview({
  now, closesAt, audienceSize: 10, votes: [], force: 'UPHELD',
}), 'UPHELD');
check('leader helper matches the early problem close', leaderUnassailable(
  ['PROBLEM', 'PROBLEM', 'PROBLEM', 'PROBLEM', 'PROBLEM', 'PROBLEM'],
  10,
), true);

check('strikes need quorum and an ok majority', dismissalRecordsStrikes(['OK', 'OK', 'OK'], 10), true);
check('a problem lead records no strikes', dismissalRecordsStrikes(['PROBLEM', 'PROBLEM', 'OK'], 10), false);
check('a tie records no strikes', dismissalRecordsStrikes(['PROBLEM', 'OK', 'UNKNOWN'], 4), false);
check('timeout without quorum records no strikes', dismissalRecordsStrikes(['OK'], 10), false);
check('all unknown records no strikes', dismissalRecordsStrikes(['UNKNOWN', 'UNKNOWN', 'UNKNOWN'], 4), false);

check('hacked is a strict majority', hackedMajority(['ACCOUNT_HACKED', 'ACCOUNT_HACKED', 'COMPLAINTS']), true);
check('hacked tie is not a majority', hackedMajority(['ACCOUNT_HACKED', 'COMPLAINTS']), false);
check('no reports is not hacked', hackedMajority([]), false);

check('first dismissal is a strike', applyDismissedComplaint({ strikes: 0, banUntil: null }, now), { strikes: 1, banUntil: null });
const banned = applyDismissedComplaint({ strikes: 1, banUntil: null }, now);
check('second dismissal bans for 30 days', banned, { strikes: 0, banUntil: now + COMPLAINT_BAN_MS });
check('ban is active', complaintBanned(banned.banUntil, now + 1000), true);
check('ban expires', complaintBanned(banned.banUntil, now + COMPLAINT_BAN_MS), false);
check('running ban is kept on the next strike', applyDismissedComplaint({ strikes: 0, banUntil: now + hour }, now), {
  strikes: 1,
  banUntil: now + hour,
});
check('expired ban is cleared on the next strike', applyDismissedComplaint({ strikes: 0, banUntil: now - hour }, now), {
  strikes: 1,
  banUntil: null,
});

check('cooldown lasts 30 days', collectionCooling(now, now + hour), true);
check('cooldown ends at 30 days', collectionCooling(now, now + COLLECTION_COOLDOWN_MS), false);
check('no decision means no cooldown', collectionCooling(null, now), false);
check('a fresh pledge is too soon', pledgeOldEnough(now, now + PLEDGE_MIN_AGE_MS - 1), false);
check('an hour-old pledge is old enough', pledgeOldEnough(now, now + PLEDGE_MIN_AGE_MS), true);

check('admin reason blocks a circle hold', upheldBecomesInconclusive({ status: 'BLOCKED', blockReason: 'SUSPECTED_FRAUD' }), true);
check('closed collection blocks a circle hold', upheldBecomesInconclusive({ status: 'CLOSED', blockReason: null }), true);
check('community reason can still be an upheld hold', upheldBecomesInconclusive({ status: 'BLOCKED', blockReason: 'COMMUNITY' }), false);
check('goal hold can become community', upheldBecomesInconclusive({ status: 'BLOCKED', blockReason: null }), false);

check('third report opens', shouldOpenReview(3, false), true);
check('open review does not open another', shouldOpenReview(4, true), false);
check('audience drops author and reporters', reviewAudience('author', ['author', 'a', 'b', 'a'], ['a']), ['b']);

check('goal hold becomes community', communityHoldPatch({ status: 'BLOCKED', blockReason: null }), {
  status: 'BLOCKED',
  blockReason: 'COMMUNITY',
});
check('active becomes community', communityHoldPatch({ status: 'ACTIVE', blockReason: null }), {
  status: 'BLOCKED',
  blockReason: 'COMMUNITY',
});
check('admin reason is kept', communityHoldPatch({ status: 'BLOCKED', blockReason: 'SUSPECTED_FRAUD' }), null);
check('community hold is not rewritten', communityHoldPatch({ status: 'BLOCKED', blockReason: 'COMMUNITY' }), null);
check('closed collection stays closed', communityHoldPatch({ status: 'CLOSED', blockReason: null }), null);

{
  let calls = 0;
  const ok = await deliverWithRetry('rev-1', async () => {
    calls += 1;
    if (calls < 3) throw new Error('down');
  }, async () => undefined);
  check('hack mail retries then succeeds', { ok, calls }, { ok: true, calls: 3 });
}
{
  let fails = 0;
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(' '));
  };
  try {
    const bad = await deliverWithRetry('rev-9', async () => {
      fails += 1;
      throw new Error('down');
    }, async () => undefined);
    check('hack mail gives up after 3 failures', bad, false);
  } finally {
    console.error = orig;
  }
  check('hack mail tried 3 times', fails, 3);
  check('hack mail log names the review', logs.some((line) => line.includes('rev-9')), true);
}

check('Анна genitive', inflectFirstName('Анна Петрова', 'ru'), 'Анны');
check('Мария genitive', inflectFirstName('Мария', 'ru'), 'Марии');
check('Олег genitive', inflectFirstName('Олег', 'ru'), 'Олега');
check('latin name stays', inflectFirstName('Anna', 'ru'), 'Anna');
check('english uses the written name', inflectFirstName('Анна', 'en'), 'Анна');

function loadEnvFile(file: string) {
  try {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
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
    // The pure checks still ran.
  }
}

function isLocalDb(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('localhost:5434') || url.includes('127.0.0.1:5434');
}

function messageOf(err: unknown): string {
  if (err instanceof TRPCError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

async function waitForMail(collectionId: string): Promise<boolean> {
  const file = process.env.DEV_MAIL_OUTBOX || join(tmpdir(), 'so-dev-mail.log');
  for (let i = 0; i < 30; i += 1) {
    try {
      if (readFileSync(file, 'utf8').includes(collectionId)) return true;
    } catch {
      // The outbox is created on the first message.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function mailHas(collectionId: string): boolean {
  const file = process.env.DEV_MAIL_OUTBOX || join(tmpdir(), 'so-dev-mail.log');
  try {
    return readFileSync(file, 'utf8').includes(collectionId);
  } catch {
    return false;
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '../../packages/db/.env'));
  const url = process.env.DATABASE_URL;
  if (!isLocalDb(url)) {
    console.log('skip database checks (DATABASE_URL is not localhost:5434)');
    if (failed > 0) process.exit(1);
    return;
  }

  const stamp = `wp11${Date.now().toString(36)}`;
  const id = (name: string) => `${stamp}_${name}`;
  const adminId = id('admin');
  process.env.ADMIN_IDS = adminId;

  const { PrismaClient } = await import('@so/db');
  const service = await import('../src/services/moderation.service.js');
  const { syncCollectionGoal } = await import('../src/services/collection-amount.js');
  const db = new PrismaClient();
  const author = id('author');
  const author2 = id('author2');
  const people = ['p1', 'p2', 'p3', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'fa', 'fb', 's2', 'stranger', 'late'].map(id);
  const userIds = [author, author2, adminId, ...people];
  const pledgedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const connect = async (a: string, b: string) => {
    const [userAId, userBId] = [a, b].sort();
    await db.connection.create({ data: { userAId: userAId!, userBId: userBId! } });
  };
  const pledge = async (collectionId: string, userId: string, amount = 10) => {
    await db.obligation.create({ data: { collectionId, userId, amount, createdAt: pledgedAt } });
  };
  const strikesOf = async (userId: string) => db.user.findUnique({
    where: { id: userId },
    select: { complaintStrikes: true, complaintBanUntil: true },
  });

  try {
    await db.$executeRawUnsafe('DROP INDEX IF EXISTS "collection_reviews_one_open_idx"');
    await db.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "collection_reviews_one_open_idx" ON "collection_reviews"("collectionId") WHERE "status" IN (\'OPEN\', \'ESCALATED\')',
    );

    await db.user.createMany({
      data: userIds.map((userId, index) => ({
        id: userId,
        name: userId === author ? 'Анна' : `Person ${index}`,
        language: 'ru',
        email: userId === author ? `${stamp}@example.com` : null,
      })),
    });

    const [p1, p2, p3, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, fa, fb, s2, stranger, late] = people;
    for (const friend of [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10]) {
      if (friend) await connect(author, friend);
    }
    if (f1 && s2) await connect(f1, s2);
    if (fa) await connect(author2, fa);
    if (fb) await connect(author2, fb);

    const collection = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 100, chatLink: 'https://example.com/chat' },
    });
    for (const userId of [p1, p2, p3]) {
      if (userId) await pledge(collection.id, userId);
    }

    if (!p1 || !p2 || !p3 || !f1 || !f2 || !f3 || !f4 || !f5 || !f6 || !s2 || !stranger || !late || !fa || !fb) {
      throw new Error('fixture ids missing');
    }

    let caught = '';
    try {
      await service.submitComplaint(db, s2, { collectionId: collection.id, reason: 'COMPLAINTS' });
    } catch (err) {
      caught = messageOf(err);
    }
    check('2nd handshake cannot report', caught, 'NOT_ELIGIBLE');

    try {
      await service.submitComplaint(db, stranger, { collectionId: collection.id, reason: 'COMPLAINTS' });
    } catch (err) {
      caught = messageOf(err);
    }
    check('outsider cannot report', caught, 'NOT_ELIGIBLE');

    try {
      await service.submitComplaint(db, author, { collectionId: collection.id, reason: 'COMPLAINTS' });
    } catch (err) {
      caught = messageOf(err);
    }
    check('author cannot report', caught, 'AUTHOR');

    await db.obligation.create({ data: { collectionId: collection.id, userId: late, amount: 10 } });
    try {
      await service.submitComplaint(db, late, { collectionId: collection.id, reason: 'COMPLAINTS' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('a fresh pledge cannot report', caught, 'TOO_SOON');

    const first = await service.submitComplaint(db, p1, { collectionId: collection.id, reason: 'ACCOUNT_HACKED' });
    check('first report does not open', first, { reviewOpened: false, escalated: false });
    try {
      await service.submitComplaint(db, p1, { collectionId: collection.id, reason: 'COMPLAINTS' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('same person is rejected', caught, 'ALREADY');

    const second = await service.submitComplaint(db, p2, { collectionId: collection.id, reason: 'ACCOUNT_HACKED' });
    check('second report does not open', second.reviewOpened, false);
    const third = await service.submitComplaint(db, f1, { collectionId: collection.id, reason: 'COMPLAINTS' });
    check('third report opens a review', third, { reviewOpened: true, escalated: false });

    try {
      await service.submitComplaint(db, p3, { collectionId: collection.id, reason: 'RULES_VIOLATION' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('another report during the review is rejected', caught, 'REVIEW_OPEN');

    const review = await db.collectionReview.findFirst({ where: { collectionId: collection.id, status: 'OPEN' } });
    if (!review) throw new Error('review was not opened');
    const audience = new Set(review.audienceIds);
    check('reporters are not asked', audience.has(f1), false);
    check('author is not asked', audience.has(author), false);
    check('other direct contacts are asked', audience.has(f2) && audience.has(f10!), true);
    check('audience size', review.audienceIds.length, 9);
    check('review remembers its complaints', review.complaintIds.length, 3);

    try {
      await service.castVote(db, p1, { reviewId: review.id, answer: 'PROBLEM' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('a non-addressee cannot vote', caught, 'NOT_AUDIENCE');

    await service.castVote(db, f2, { reviewId: review.id, answer: 'PROBLEM' });
    await service.castVote(db, f3, { reviewId: review.id, answer: 'UNKNOWN' });
    let open = await db.collectionReview.findUnique({ where: { id: review.id } });
    check('two votes stay open', open?.status, 'OPEN');
    await service.castVote(db, f4, { reviewId: review.id, answer: 'PROBLEM' });
    open = await db.collectionReview.findUnique({ where: { id: review.id } });
    check('three problems can still flip', open?.status, 'OPEN');
    await service.castVote(db, f5, { reviewId: review.id, answer: 'PROBLEM' });
    await service.castVote(db, f6, { reviewId: review.id, answer: 'PROBLEM' });
    await service.castVote(db, f7!, { reviewId: review.id, answer: 'PROBLEM' });
    open = await db.collectionReview.findUnique({ where: { id: review.id } });
    check('unassailable problem majority upholds', open?.status, 'UPHELD');
    const held = await db.collection.findUnique({ where: { id: collection.id } });
    check('upheld sets community hold', { status: held?.status, reason: held?.blockReason }, {
      status: 'BLOCKED',
      reason: 'COMMUNITY',
    });
    const upheldReports = await db.collectionComplaint.count({ where: { collectionId: collection.id } });
    check('upheld removes the review complaints', upheldReports, 0);
    const upheldStrikes = await strikesOf(p1);
    check('upheld records no strike', upheldStrikes?.complaintStrikes, 0);
    check('hacked majority mailed the author', await waitForMail(collection.id), true);

    await db.collection.update({ where: { id: collection.id }, data: { amount: 1000 } });
    await syncCollectionGoal(db, collection.id);
    await db.collection.update({ where: { id: collection.id }, data: { amount: 1 } });
    await syncCollectionGoal(db, collection.id);
    const stillHeld = await db.collection.findUnique({ where: { id: collection.id } });
    check('goal arithmetic does not lift community', { status: stillHeld?.status, reason: stillHeld?.blockReason }, {
      status: 'BLOCKED',
      reason: 'COMMUNITY',
    });

    const small = await db.collection.create({
      data: { creatorId: author2, type: 'EMERGENCY', amount: 90, chatLink: 'https://example.com/small' },
    });
    await pledge(small.id, p1);
    await pledge(small.id, p2);
    await pledge(small.id, p3);
    const smallOpen = await service.submitComplaint(db, p1, { collectionId: small.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, p2, { collectionId: small.id, reason: 'SUSPECTED_FRAUD' });
    const smallThird = await service.submitComplaint(db, p3, { collectionId: small.id, reason: 'ACCOUNT_HACKED' });
    check('small circle does not open a vote', smallOpen.reviewOpened, false);
    check('small circle escalates to admins', smallThird, { reviewOpened: false, escalated: true });
    const escalation = await db.collectionReview.findFirst({ where: { collectionId: small.id } });
    check('escalation is not a vote', escalation?.status, 'ESCALATED');
    check('escalation asks nobody', escalation?.audienceIds.length, 0);
    check('escalation stores no strikes', (await strikesOf(p1))?.complaintStrikes, 0);
    const adminRows = await service.listAdminOpenReviews(db);
    const adminRow = adminRows.find((row) => row.collectionId === small.id);
    check('admin list shows the escalation', adminRow?.kind, 'ESCALATION');
    check('admin list counts the complaints', adminRow?.complaintCount, 3);
    check('admin list has reasons and no reporter ids', {
      reasons: adminRow?.reasons,
      leaks: JSON.stringify(adminRow ?? {}).includes(p1),
    }, {
      reasons: [
        { reason: 'COMPLAINTS', count: 1 },
        { reason: 'SUSPECTED_FRAUD', count: 1 },
        { reason: 'ACCOUNT_HACKED', count: 1 },
      ],
      leaks: false,
    });
    if (!escalation) throw new Error('escalation missing');
    await service.adminCloseReview(db, escalation.id, 'DISMISSED');
    const escalationAfter = await db.collectionReview.findUnique({ where: { id: escalation.id } });
    check('admin dismisses an escalation without a strike', {
      status: escalationAfter?.status,
      strikes: (await strikesOf(p1))?.complaintStrikes,
      reports: await db.collectionComplaint.count({ where: { collectionId: small.id } }),
    }, { status: 'DISMISSED', strikes: 0, reports: 0 });

    const goal = await db.collection.create({
      data: {
        creatorId: author,
        type: 'EMERGENCY',
        amount: 10,
        chatLink: 'https://example.com/goal',
        status: 'BLOCKED',
        blockedAt: new Date(),
        blockReason: null,
      },
    });
    await pledge(goal.id, p1, 10);
    await pledge(goal.id, p2, 5);
    await service.submitComplaint(db, p1, { collectionId: goal.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, p2, { collectionId: goal.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f2, { collectionId: goal.id, reason: 'COMPLAINTS' });
    const goalReview = await db.collectionReview.findFirst({ where: { collectionId: goal.id, status: 'OPEN' } });
    if (!goalReview) throw new Error('goal review missing');
    const goalVoters = goalReview.audienceIds.slice(0, 5);
    if (goalVoters.length < 5) throw new Error('goal audience too small');
    for (const voter of goalVoters) {
      await service.castVote(db, voter, { reviewId: goalReview.id, answer: 'OK' });
    }
    const goalAfterReview = await db.collectionReview.findUnique({ where: { id: goalReview.id } });
    check('ok majority dismisses', goalAfterReview?.status, 'DISMISSED');
    const goalAfter = await db.collection.findUnique({ where: { id: goal.id } });
    check('dismiss keeps the goal hold', { status: goalAfter?.status, reason: goalAfter?.blockReason }, {
      status: 'BLOCKED',
      reason: null,
    });
    check('dismiss removes reports', await db.collectionComplaint.count({ where: { collectionId: goal.id } }), 0);
    const oneStrike = await strikesOf(p1);
    check('one ok-majority is one strike', oneStrike?.complaintStrikes, 1);
    check('one strike is not a ban yet', oneStrike?.complaintBanUntil, null);

    const again = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 80, chatLink: 'https://example.com/again' },
    });
    await pledge(again.id, p1);
    await pledge(again.id, p2);
    await service.submitComplaint(db, p1, { collectionId: again.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, p2, { collectionId: again.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f3, { collectionId: again.id, reason: 'COMPLAINTS' });
    const againReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: again.id, status: 'OPEN' } });
    for (const voter of againReview.audienceIds.slice(0, 5)) {
      await service.castVote(db, voter, { reviewId: againReview.id, answer: 'OK' });
    }
    const againAfter = await db.collectionReview.findUnique({ where: { id: againReview.id } });
    check('second ok-majority dismisses', againAfter?.status, 'DISMISSED');
    const afterBan = await strikesOf(p1);
    check('two ok-majorities reset strikes', afterBan?.complaintStrikes, 0);
    check('two ok-majorities set a ban', afterBan?.complaintBanUntil != null, true);

    const bannedCollection = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 40, chatLink: 'https://example.com/ban' },
    });
    await pledge(bannedCollection.id, p1);
    try {
      await service.submitComplaint(db, p1, { collectionId: bannedCollection.id, reason: 'COMPLAINTS' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('banned person cannot report', caught, 'BANNED');

    if (!f7 || !f8 || !f9 || !f10) throw new Error('fixture ids missing');
    const quiet = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 70, chatLink: 'https://example.com/quiet' },
    });
    await service.submitComplaint(db, f4, { collectionId: quiet.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f7, { collectionId: quiet.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f8, { collectionId: quiet.id, reason: 'COMPLAINTS' });
    const quietReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: quiet.id, status: 'OPEN' } });
    await db.collectionReview.update({
      where: { id: quietReview.id },
      data: { closesAt: new Date(Date.now() - 1000) },
    });
    await service.settleOpenReviews(db, quiet.id);
    const quietAfter = await db.collectionReview.findUnique({ where: { id: quietReview.id } });
    check('deadline without quorum is inconclusive', quietAfter?.status, 'INCONCLUSIVE');
    check('timeout records no strike', (await strikesOf(f4))?.complaintStrikes, 0);
    check('timeout removes reports', await db.collectionComplaint.count({ where: { collectionId: quiet.id } }), 0);
    try {
      await service.submitComplaint(db, f4, { collectionId: quiet.id, reason: 'COMPLAINTS' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('collection cooldown blocks a new report', caught, 'COOLDOWN');

    const tied = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 60, chatLink: 'https://example.com/tied' },
    });
    await service.submitComplaint(db, f5, { collectionId: tied.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f9, { collectionId: tied.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f10, { collectionId: tied.id, reason: 'COMPLAINTS' });
    const tiedReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: tied.id, status: 'OPEN' } });
    const tieVoters = tiedReview.audienceIds.slice(0, 4);
    if (tieVoters.length < 4) throw new Error('tie audience too small');
    await service.castVote(db, tieVoters[0]!, { reviewId: tiedReview.id, answer: 'PROBLEM' });
    await service.castVote(db, tieVoters[1]!, { reviewId: tiedReview.id, answer: 'OK' });
    await service.castVote(db, tieVoters[2]!, { reviewId: tiedReview.id, answer: 'PROBLEM' });
    await service.castVote(db, tieVoters[3]!, { reviewId: tiedReview.id, answer: 'OK' });
    let tiedStatus = await db.collectionReview.findUnique({ where: { id: tiedReview.id } });
    check('a tie stays open', tiedStatus?.status, 'OPEN');
    await db.collectionReview.update({
      where: { id: tiedReview.id },
      data: { closesAt: new Date(Date.now() - 1000) },
    });
    await service.settleOpenReviews(db, tied.id);
    tiedStatus = await db.collectionReview.findUnique({ where: { id: tiedReview.id } });
    check('a tie at the deadline is inconclusive', tiedStatus?.status, 'INCONCLUSIVE');
    check('a tie records no strike', (await strikesOf(f5))?.complaintStrikes, 0);

    const seized = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 55, chatLink: 'https://example.com/seized' },
    });
    await service.submitComplaint(db, f1, { collectionId: seized.id, reason: 'ACCOUNT_HACKED' });
    await service.submitComplaint(db, f2, { collectionId: seized.id, reason: 'ACCOUNT_HACKED' });
    await service.submitComplaint(db, f3, { collectionId: seized.id, reason: 'ACCOUNT_HACKED' });
    const seizedReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: seized.id, status: 'OPEN' } });
    await db.collection.update({
      where: { id: seized.id },
      data: { status: 'BLOCKED', blockReason: 'SUSPECTED_FRAUD', blockedAt: new Date() },
    });
    for (const voter of seizedReview.audienceIds.slice(0, 5)) {
      try {
        await service.castVote(db, voter, { reviewId: seizedReview.id, answer: 'PROBLEM' });
      } catch (err) {
        if (messageOf(err) !== 'REVIEW_CLOSED') throw err;
      }
    }
    const seizedAfter = await db.collectionReview.findUnique({ where: { id: seizedReview.id } });
    const seizedCollection = await db.collection.findUnique({ where: { id: seized.id } });
    check('admin reason closes as inconclusive', seizedAfter?.status, 'INCONCLUSIVE');
    check('admin reason is not replaced', { status: seizedCollection?.status, reason: seizedCollection?.blockReason }, {
      status: 'BLOCKED',
      reason: 'SUSPECTED_FRAUD',
    });
    check('admin reason records no strike', (await strikesOf(f1))?.complaintStrikes, 0);
    check('admin reason removes reports', await db.collectionComplaint.count({ where: { collectionId: seized.id } }), 0);
    await new Promise((resolve) => setTimeout(resolve, 400));
    check('admin reason sends no hack mail', mailHas(seized.id), false);

    const closed = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 45, chatLink: 'https://example.com/closed' },
    });
    await pledge(closed.id, p3);
    await service.submitComplaint(db, p3, { collectionId: closed.id, reason: 'ACCOUNT_HACKED' });
    await service.submitComplaint(db, f4, { collectionId: closed.id, reason: 'ACCOUNT_HACKED' });
    await service.submitComplaint(db, f5, { collectionId: closed.id, reason: 'ACCOUNT_HACKED' });
    const closedReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: closed.id, status: 'OPEN' } });
    await db.collection.update({
      where: { id: closed.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    for (const voter of closedReview.audienceIds.slice(0, 5)) {
      try {
        await service.castVote(db, voter, { reviewId: closedReview.id, answer: 'PROBLEM' });
      } catch (err) {
        if (messageOf(err) !== 'REVIEW_CLOSED') throw err;
      }
    }
    const closedAfter = await db.collectionReview.findUnique({ where: { id: closedReview.id } });
    const closedCollection = await db.collection.findUnique({ where: { id: closed.id } });
    check('a closed collection ends the review as inconclusive', closedAfter?.status, 'INCONCLUSIVE');
    check('a closed collection stays closed', closedCollection?.status, 'CLOSED');
    check('a closed collection records no strike', (await strikesOf(p3))?.complaintStrikes, 0);
    check('a closed collection sends no hack mail', mailHas(closed.id), false);

    const race = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 30, chatLink: 'https://example.com/race' },
    });
    await service.submitComplaint(db, f8, { collectionId: race.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f9, { collectionId: race.id, reason: 'COMPLAINTS' });
    const raced = await Promise.allSettled([
      service.submitComplaint(db, f6, { collectionId: race.id, reason: 'COMPLAINTS' }),
      service.submitComplaint(db, f7, { collectionId: race.id, reason: 'COMPLAINTS' }),
    ]);
    const rejected = raced.filter((row) => row.status === 'rejected');
    check('one racing report is rejected', rejected.length, 1);
    check('the racing rejection is the open review', rejected[0] && rejected[0].status === 'rejected' ? messageOf(rejected[0].reason) : '', 'REVIEW_OPEN');
    check('the race leaves one open review', await db.collectionReview.count({
      where: { collectionId: race.id, status: 'OPEN' },
    }), 1);
    check('the race keeps three reports', await db.collectionComplaint.count({ where: { collectionId: race.id } }), 3);

    console.log('database checks finished');
  } finally {
    await db.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "collection_reviews_one_open_idx" ON "collection_reviews"("collectionId") WHERE "status" IN (\'OPEN\', \'ESCALATED\')',
    ).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
