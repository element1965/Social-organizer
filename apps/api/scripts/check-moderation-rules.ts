/**
 * Checks the circle-moderation rules, then the database path when DATABASE_URL is localhost:5434.
 * Run from the repo root: pnpm --filter @so/api exec tsx scripts/check-moderation-rules.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRPCError } from '@trpc/server';
import {
  applyDismissedComplaint,
  communityHoldPatch,
  complaintBanned,
  COMPLAINT_BAN_MS,
  decideReview,
  hackedMajority,
  inflectFirstName,
  quorumReached,
  reviewAudience,
  shouldOpenReview,
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

check('problem majority ignores unknown', decideReview({
  now, closesAt, audienceSize: 10, votes: ['PROBLEM', 'UNKNOWN', 'UNKNOWN'],
}), 'UPHELD');
check('ok majority dismisses early', decideReview({
  now, closesAt, audienceSize: 10, votes: ['OK', 'OK', 'PROBLEM'],
}), 'DISMISSED');
check('tie at quorum dismisses', decideReview({
  now, closesAt, audienceSize: 10, votes: ['PROBLEM', 'OK', 'UNKNOWN'],
}), 'DISMISSED');
check('all unknown at quorum dismisses', decideReview({
  now, closesAt, audienceSize: 4, votes: ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
}), 'DISMISSED');
check('below quorum stays open', decideReview({
  now, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM'],
}), null);
check('deadline without quorum dismisses', decideReview({
  now: closesAt, closesAt, audienceSize: 10, votes: ['PROBLEM'],
}), 'DISMISSED');
check('deadline with problem quorum upholds', decideReview({
  now: closesAt + 1, closesAt, audienceSize: 10, votes: ['PROBLEM', 'PROBLEM', 'OK'],
}), 'UPHELD');
check('admin force upholds', decideReview({
  now, closesAt, audienceSize: 10, votes: [], force: 'UPHELD',
}), 'UPHELD');

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

async function main() {
  loadEnvFile(resolve(process.cwd(), '../../packages/db/.env'));
  const url = process.env.DATABASE_URL;
  if (!isLocalDb(url)) {
    console.log('skip database checks (DATABASE_URL is not localhost:5434)');
    if (failed > 0) process.exit(1);
    return;
  }

  const { PrismaClient } = await import('@so/db');
  const service = await import('../src/services/moderation.service.js');
  const { syncCollectionGoal } = await import('../src/services/collection-amount.js');
  const db = new PrismaClient();
  const stamp = `wp11${Date.now().toString(36)}`;
  const id = (name: string) => `${stamp}_${name}`;
  const author = id('author');
  const people = ['p1', 'p2', 'p3', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 's2', 'stranger'].map(id);
  const userIds = [author, ...people];

  const connect = async (a: string, b: string) => {
    const [userAId, userBId] = [a, b].sort();
    await db.connection.create({ data: { userAId: userAId!, userBId: userBId! } });
  };

  try {
    await db.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "collection_reviews_one_open_idx" ON "collection_reviews"("collectionId") WHERE "status" = \'OPEN\'',
    );

    await db.user.createMany({
      data: userIds.map((userId, index) => ({
        id: userId,
        name: index === 0 ? 'Анна' : `Person ${index}`,
        language: 'ru',
        email: index === 0 ? `${stamp}@example.com` : null,
      })),
    });

    const [p1, p2, p3, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, s2, stranger] = people;
    for (const friend of [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10]) {
      if (friend) await connect(author, friend);
    }
    if (f1 && s2) await connect(f1, s2);

    const collection = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 100, chatLink: 'https://example.com/chat' },
    });
    for (const userId of [p1, p2, p3]) {
      if (!userId) continue;
      await db.obligation.create({ data: { collectionId: collection.id, userId, amount: 10 } });
    }

    if (!p1 || !p2 || !p3 || !f1 || !f2 || !f3 || !f4 || !s2 || !stranger) throw new Error('fixture ids missing');

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

    const first = await service.submitComplaint(db, p1, { collectionId: collection.id, reason: 'ACCOUNT_HACKED' });
    check('first report does not open', first.reviewOpened, false);
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
    check('third report opens a review', third.reviewOpened, true);

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
    check('problem majority upholds', open?.status, 'UPHELD');
    const held = await db.collection.findUnique({ where: { id: collection.id } });
    check('upheld sets community hold', { status: held?.status, reason: held?.blockReason }, {
      status: 'BLOCKED',
      reason: 'COMMUNITY',
    });

    await db.collection.update({ where: { id: collection.id }, data: { amount: 1000 } });
    await syncCollectionGoal(db, collection.id);
    const stillHeld = await db.collection.findUnique({ where: { id: collection.id } });
    check('goal arithmetic does not lift community', { status: stillHeld?.status, reason: stillHeld?.blockReason }, {
      status: 'BLOCKED',
      reason: 'COMMUNITY',
    });

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
    await db.obligation.createMany({
      data: [
        { collectionId: goal.id, userId: p1, amount: 10 },
        { collectionId: goal.id, userId: p2, amount: 5 },
      ],
    });
    await service.submitComplaint(db, p1, { collectionId: goal.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, p2, { collectionId: goal.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f2!, { collectionId: goal.id, reason: 'COMPLAINTS' });
    const goalReview = await db.collectionReview.findFirst({ where: { collectionId: goal.id, status: 'OPEN' } });
    if (!goalReview) throw new Error('goal review missing');
    await service.adminCloseReview(db, goalReview.id, 'DISMISSED');
    const goalAfter = await db.collection.findUnique({ where: { id: goal.id } });
    check('dismiss keeps the goal hold', { status: goalAfter?.status, reason: goalAfter?.blockReason }, {
      status: 'BLOCKED',
      reason: null,
    });
    const reportsLeft = await db.collectionComplaint.count({ where: { collectionId: goal.id } });
    check('dismiss removes reports', reportsLeft, 0);

    const strikes = await db.user.findUnique({ where: { id: p1 }, select: { complaintStrikes: true, complaintBanUntil: true } });
    check('one dismissed report is one strike', strikes?.complaintStrikes, 1);
    check('one strike is not a ban yet', strikes?.complaintBanUntil, null);

    const again = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 80, chatLink: 'https://example.com/again' },
    });
    await db.obligation.createMany({
      data: [
        { collectionId: again.id, userId: p1, amount: 10 },
        { collectionId: again.id, userId: p2, amount: 5 },
      ],
    });
    await service.submitComplaint(db, p1, { collectionId: again.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, p2, { collectionId: again.id, reason: 'COMPLAINTS' });
    await service.submitComplaint(db, f3!, { collectionId: again.id, reason: 'COMPLAINTS' });
    const againReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: again.id, status: 'OPEN' } });
    await db.collectionReview.update({
      where: { id: againReview.id },
      data: { closesAt: new Date(Date.now() - 1000) },
    });
    await service.settleOpenReviews(db, again.id);
    const againAfter = await db.collectionReview.findUnique({ where: { id: againReview.id } });
    check('deadline dismisses', againAfter?.status, 'DISMISSED');
    const afterBan = await db.user.findUnique({ where: { id: p1 }, select: { complaintStrikes: true, complaintBanUntil: true } });
    check('two dismissals reset strikes', afterBan?.complaintStrikes, 0);
    check('two dismissals set a ban', afterBan?.complaintBanUntil != null, true);

    const bannedCollection = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 40, chatLink: 'https://example.com/ban' },
    });
    await db.obligation.create({ data: { collectionId: bannedCollection.id, userId: p1, amount: 10 } });
    try {
      await service.submitComplaint(db, p1, { collectionId: bannedCollection.id, reason: 'COMPLAINTS' });
      caught = '';
    } catch (err) {
      caught = messageOf(err);
    }
    check('banned person cannot report', caught, 'BANNED');

    const early = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 50, chatLink: 'https://example.com/early', status: 'ACTIVE' },
    });
    await db.collection.update({
      where: { id: early.id },
      data: { status: 'BLOCKED', blockReason: null, blockedAt: new Date(), amount: 10 },
    });
    // p1 and p2 are banned by the earlier dismissals. p3 and untouched direct contacts are not.
    await db.obligation.create({ data: { collectionId: early.id, userId: p3, amount: 10 } });
    await service.submitComplaint(db, p3, { collectionId: early.id, reason: 'ACCOUNT_HACKED' });
    if (!f5 || !f6) throw new Error('fixture ids missing');
    await service.submitComplaint(db, f5, { collectionId: early.id, reason: 'ACCOUNT_HACKED' });
    await service.submitComplaint(db, f6, { collectionId: early.id, reason: 'COMPLAINTS' });
    const earlyReview = await db.collectionReview.findFirstOrThrow({ where: { collectionId: early.id, status: 'OPEN' } });
    const voter = earlyReview.audienceIds[0];
    const voter2 = earlyReview.audienceIds[1];
    const voter3 = earlyReview.audienceIds[2];
    if (!voter || !voter2 || !voter3) throw new Error('early audience too small');
    await service.castVote(db, voter, { reviewId: earlyReview.id, answer: 'OK' });
    await service.castVote(db, voter2, { reviewId: earlyReview.id, answer: 'OK' });
    await service.castVote(db, voter3, { reviewId: earlyReview.id, answer: 'PROBLEM' });
    const earlyAfter = await db.collection.findUnique({ where: { id: early.id } });
    check('ok majority keeps the goal hold', { status: earlyAfter?.status, reason: earlyAfter?.blockReason }, {
      status: 'BLOCKED',
      reason: null,
    });

    console.log('database checks finished');
  } finally {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
