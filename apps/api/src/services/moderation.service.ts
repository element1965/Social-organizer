import { Prisma, type PrismaClient } from '@so/db';
import { TRPCError } from '@trpc/server';
import { ADMIN_IDS } from '../admin.js';
import { COMPLAINT_REASONS, type ComplaintReasonCode } from '../config/ask.js';
import { isUniqueViolation } from './identity.service.js';
import { sendMail } from './mail.service.js';
import { sendPushNotification } from './push.service.js';
import {
  COMMENT_MAX,
  REVIEW_WINDOW_MS,
  applyDismissedComplaint,
  collectionCooling,
  communityHoldPatch,
  complaintBanned,
  decideReview,
  deliverWithRetry,
  dismissalRecordsStrikes,
  hackedMajority,
  inflectFirstName,
  pledgeOldEnough,
  reviewAudience,
  reviewKind,
  shouldOpenReview,
  upheldBecomesInconclusive,
  type ForcedOutcome,
  type ReviewKind,
  type ReviewOutcome,
  type ReviewVoteAnswer,
} from './moderation-rules.js';

type Db = PrismaClient | Prisma.TransactionClient;

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

export type ComplainCode =
  | 'AUTHOR'
  | 'NOT_ELIGIBLE'
  | 'ALREADY'
  | 'BANNED'
  | 'UNAVAILABLE'
  | 'REVIEW_OPEN'
  | 'ESCALATED'
  | 'COOLDOWN'
  | 'TOO_SOON'
  | 'NOT_FOUND';

export type CanComplain = { allowed: true } | { allowed: false; code: ComplainCode };

const REASON_ORDER = COMPLAINT_REASONS;

class ReviewLost extends Error {
  constructor() {
    super('REVIEW_LOST');
    this.name = 'ReviewLost';
  }
}

function complainError(code: ComplainCode): TRPCError {
  if (code === 'NOT_FOUND') return new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
  if (code === 'ALREADY') return new TRPCError({ code: 'CONFLICT', message: 'ALREADY' });
  if (code === 'UNAVAILABLE' || code === 'REVIEW_OPEN' || code === 'ESCALATED' || code === 'COOLDOWN' || code === 'TOO_SOON') {
    return new TRPCError({ code: 'BAD_REQUEST', message: code });
  }
  return new TRPCError({ code: 'FORBIDDEN', message: code });
}

function normalizeComment(comment: string | undefined): string | null {
  if (comment == null) return null;
  const trimmed = comment.trim();
  if (!trimmed) return null;
  if (trimmed.length > COMMENT_MAX) throw new TRPCError({ code: 'BAD_REQUEST', message: 'COMMENT_TOO_LONG' });
  return trimmed;
}

function asAnswer(value: string): ReviewVoteAnswer {
  if (value === 'PROBLEM' || value === 'OK' || value === 'UNKNOWN') return value;
  return 'UNKNOWN';
}

async function lockKey(db: Db, key: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
}

function reasonCounts(reasons: readonly string[]): { reason: ComplaintReasonCode; count: number }[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return REASON_ORDER.filter((reason) => counts.has(reason)).map((reason) => ({
    reason,
    count: counts.get(reason) ?? 0,
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '"') return '&quot;';
    return '&#39;';
  });
}

export async function canComplain(db: PrismaClient, userId: string, collectionId: string): Promise<CanComplain> {
  return complainGate(db, userId, collectionId);
}

async function complainGate(db: Db, userId: string, collectionId: string): Promise<CanComplain> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, creatorId: true, status: true, blockReason: true },
  });
  if (!collection) return { allowed: false, code: 'NOT_FOUND' };
  // A goal hold (BLOCKED, no reason) can still be reported. An admin or circle hold cannot.
  if (collection.status === 'CLOSED' || collection.status === 'CANCELLED' || collection.blockReason != null) {
    return { allowed: false, code: 'UNAVAILABLE' };
  }
  if (collection.creatorId === userId) return { allowed: false, code: 'AUTHOR' };

  const [user, existing, activeReview, obligation, link, recentClose] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { complaintBanUntil: true, deletedAt: true } }),
    db.collectionComplaint.findUnique({
      where: { collectionId_userId: { collectionId, userId } },
      select: { id: true },
    }),
    db.collectionReview.findFirst({
      where: { collectionId, status: { in: ['OPEN', 'ESCALATED'] } },
      select: { id: true, status: true },
    }),
    db.obligation.findFirst({
      where: { collectionId, userId, unsubscribedAt: null },
      select: { id: true, createdAt: true },
    }),
    db.connection.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: collection.creatorId },
          { userAId: collection.creatorId, userBId: userId },
        ],
      },
      select: { id: true },
    }),
    db.collectionReview.findFirst({
      where: { collectionId, status: { in: ['DISMISSED', 'INCONCLUSIVE'] } },
      orderBy: { decidedAt: 'desc' },
      select: { decidedAt: true },
    }),
  ]);

  if (!user || user.deletedAt) return { allowed: false, code: 'NOT_ELIGIBLE' };
  if (existing) return { allowed: false, code: 'ALREADY' };
  if (activeReview?.status === 'ESCALATED') return { allowed: false, code: 'ESCALATED' };
  if (activeReview) return { allowed: false, code: 'REVIEW_OPEN' };
  // Participants, including people further out who joined, and the author's direct contacts.
  if (!obligation && !link) return { allowed: false, code: 'NOT_ELIGIBLE' };
  if (obligation && !pledgeOldEnough(obligation.createdAt.getTime(), Date.now())) {
    return { allowed: false, code: 'TOO_SOON' };
  }
  if (collectionCooling(recentClose?.decidedAt?.getTime() ?? null, Date.now())) {
    return { allowed: false, code: 'COOLDOWN' };
  }
  if (complaintBanned(user.complaintBanUntil?.getTime() ?? null, Date.now())) {
    return { allowed: false, code: 'BANNED' };
  }
  return { allowed: true };
}

export async function submitComplaint(
  db: PrismaClient,
  userId: string,
  input: { collectionId: string; reason: ComplaintReasonCode; comment?: string },
): Promise<{ reviewOpened: boolean; escalated: boolean }> {
  const comment = normalizeComment(input.comment);
  const opened = await db.$transaction(async (tx) => {
    await lockKey(tx, `so-complain:${input.collectionId}`);
    const gate = await complainGate(tx, userId, input.collectionId);
    if (!gate.allowed) throw complainError(gate.code);
    try {
      await tx.collectionComplaint.create({
        data: {
          collectionId: input.collectionId,
          userId,
          reason: input.reason,
          comment,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw complainError('ALREADY');
      throw err;
    }
    return openOrEscalate(tx, input.collectionId);
  });

  if (opened.reviewId && opened.kind === 'VOTE') {
    notifyReviewAudience(db, opened.reviewId).catch((err) => console.error('[moderation] notify', err));
  }
  if (opened.reviewId && opened.kind === 'ESCALATION') {
    notifyAdmins(db, opened.reviewId).catch((err) => console.error('[moderation] admin notify', err));
  }
  return { reviewOpened: opened.kind === 'VOTE', escalated: opened.kind === 'ESCALATION' };
}

async function openOrEscalate(
  tx: Prisma.TransactionClient,
  collectionId: string,
): Promise<{ reviewId: string | null; kind: ReviewKind | null }> {
  const existing = await tx.collectionReview.findFirst({
    where: { collectionId, status: { in: ['OPEN', 'ESCALATED'] } },
    select: { id: true },
  });
  const complaints = await tx.collectionComplaint.findMany({
    where: { collectionId },
    select: { id: true, userId: true },
  });
  if (!shouldOpenReview(complaints.length, existing != null)) return { reviewId: null, kind: null };

  const collection = await tx.collection.findUnique({
    where: { id: collectionId },
    select: { creatorId: true },
  });
  if (!collection) return { reviewId: null, kind: null };

  const links = await tx.connection.findMany({
    where: { OR: [{ userAId: collection.creatorId }, { userBId: collection.creatorId }] },
    select: { userAId: true, userBId: true },
  });
  const direct = links.map((link) => (link.userAId === collection.creatorId ? link.userBId : link.userAId));
  const audience = reviewAudience(collection.creatorId, direct, complaints.map((row) => row.userId));
  const alive = audience.length === 0
    ? []
    : (await tx.user.findMany({
        where: { id: { in: audience }, deletedAt: null },
        select: { id: true },
      })).map((row) => row.id);
  const aliveSet = new Set(alive);
  const audienceIds = audience.filter((id) => aliveSet.has(id));
  const kind = reviewKind(audienceIds.length);
  const now = new Date();
  try {
    const review = await tx.collectionReview.create({
      data: {
        collectionId,
        startedAt: now,
        closesAt: new Date(now.getTime() + REVIEW_WINDOW_MS),
        status: kind === 'ESCALATION' ? 'ESCALATED' : 'OPEN',
        audienceIds: kind === 'ESCALATION' ? [] : audienceIds,
        complaintIds: complaints.map((row) => row.id),
      },
    });
    return { reviewId: review.id, kind };
  } catch (err) {
    if (isUniqueViolation(err)) throw complainError('REVIEW_OPEN');
    throw err;
  }
}

async function notifyReviewAudience(db: PrismaClient, reviewId: string): Promise<void> {
  const review = await db.collectionReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      audienceIds: true,
      collection: { select: { creator: { select: { name: true } } } },
    },
  });
  if (!review || review.audienceIds.length === 0) return;

  const users = await db.user.findMany({
    where: { id: { in: review.audienceIds }, deletedAt: null },
    select: { id: true, language: true },
  });
  const buckets = new Map<'ru' | 'en', string[]>();
  for (const user of users) {
    const lang = user.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    const list = buckets.get(lang) ?? [];
    list.push(user.id);
    buckets.set(lang, list);
  }

  const url = `${WEB_APP_URL}/?review=${review.id}`;
  await Promise.all([...buckets.entries()].map(async ([lang, ids]) => {
    const name = inflectFirstName(review.collection.creator.name, lang);
    const payload = lang === 'ru'
      ? {
          title: 'Люди жалуются на сбор',
          body: `Люди жалуются на сбор ${name}. Вы что-то знаете?`,
        }
      : {
          title: 'People reported a collection',
          body: `People reported ${name}'s collection. Do you know anything?`,
        };
    await sendPushNotification(db, ids, { ...payload, url });
  }));
}

async function notifyAdmins(db: PrismaClient, reviewId: string): Promise<void> {
  if (ADMIN_IDS.length === 0) {
    console.error('[moderation] escalation has no admins', reviewId);
    return;
  }
  const users = await db.user.findMany({
    where: { id: { in: ADMIN_IDS }, deletedAt: null },
    select: { id: true, language: true },
  });
  const buckets = new Map<'ru' | 'en', string[]>();
  for (const user of users) {
    const lang = user.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    const list = buckets.get(lang) ?? [];
    list.push(user.id);
    buckets.set(lang, list);
  }
  const url = `${WEB_APP_URL}/me`;
  await Promise.all([...buckets.entries()].map(async ([lang, ids]) => {
    const payload = lang === 'ru'
      ? {
          title: 'Жалобы на сбор',
          body: 'В круге автора меньше трёх человек. Нужно решение администратора.',
        }
      : {
          title: 'Reports on a collection',
          body: 'The author has fewer than three close contacts. An admin needs to decide.',
        };
    await sendPushNotification(db, ids, { ...payload, url });
  }));
}

export async function castVote(
  db: PrismaClient,
  userId: string,
  input: { reviewId: string; answer: ReviewVoteAnswer },
): Promise<{ ok: true }> {
  const preview = await db.collectionReview.findUnique({
    where: { id: input.reviewId },
    select: { status: true, audienceIds: true },
  });
  if (!preview) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
  if (!preview.audienceIds.includes(userId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'NOT_AUDIENCE' });
  }
  if (preview.status !== 'OPEN') throw new TRPCError({ code: 'BAD_REQUEST', message: 'REVIEW_CLOSED' });

  try {
    await db.$transaction(async (tx) => {
      await lockKey(tx, `so-review:${input.reviewId}`);
      const review = await tx.collectionReview.findUnique({
        where: { id: input.reviewId },
        select: { status: true, closesAt: true, audienceIds: true },
      });
      if (!review || review.status !== 'OPEN' || review.closesAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'REVIEW_CLOSED' });
      }
      if (!review.audienceIds.includes(userId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'NOT_AUDIENCE' });
      }
      await tx.collectionReviewVote.create({
        data: { reviewId: input.reviewId, userId, answer: input.answer },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      await closeReviewIfReady(db, input.reviewId);
      throw new TRPCError({ code: 'CONFLICT', message: 'ALREADY_VOTED' });
    }
    if (err instanceof TRPCError && err.message === 'REVIEW_CLOSED') {
      await closeReviewIfReady(db, input.reviewId);
    }
    throw err;
  }

  await closeReviewIfReady(db, input.reviewId);
  return { ok: true };
}

type HoldResult = 'suspended' | 'already' | 'inconclusive';

async function applyCommunityHold(tx: Prisma.TransactionClient, collectionId: string): Promise<HoldResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const collection = await tx.collection.findUnique({
      where: { id: collectionId },
      select: { status: true, blockReason: true, blockedAt: true },
    });
    if (!collection || upheldBecomesInconclusive(collection)) return 'inconclusive';
    const patch = communityHoldPatch(collection);
    if (!patch) return 'already';
    const updated = await tx.collection.updateMany({
      where: {
        id: collectionId,
        status: collection.status,
        blockReason: collection.blockReason,
      },
      data: {
        status: 'BLOCKED',
        blockReason: 'COMMUNITY',
        blockedAt: collection.blockedAt ?? new Date(),
      },
    });
    if (updated.count !== 1) continue;
    await tx.notification.updateMany({
      where: {
        collectionId,
        type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] },
        status: { in: ['UNREAD', 'READ'] },
      },
      data: { status: 'EXPIRED' },
    });
    return 'suspended';
  }
  return 'inconclusive';
}

/**
 * Close one review when the leader is unassailable, the deadline has passed, or an admin forces it.
 * An escalated review waits for an admin. Safe to call more than once.
 */
export async function closeReviewIfReady(
  db: PrismaClient,
  reviewId: string,
  force?: ForcedOutcome,
): Promise<ReviewOutcome | null> {
  const applied = await db.$transaction(async (tx) => {
    await lockKey(tx, `so-review:${reviewId}`);
    const review = await tx.collectionReview.findUnique({
      where: { id: reviewId },
      include: {
        votes: { select: { answer: true } },
        collection: { select: { id: true, creatorId: true, status: true, blockReason: true } },
      },
    });
    if (!review) return null;
    if (review.status !== 'OPEN' && review.status !== 'ESCALATED') return null;
    if (review.status === 'ESCALATED' && !force) return null;

    const votes = review.votes.map((vote) => asAnswer(vote.answer));
    let outcome = decideReview({
      now: Date.now(),
      closesAt: review.closesAt.getTime(),
      votes,
      audienceSize: review.audienceIds.length,
      force,
    });
    if (!outcome) return null;

    const fresh = await tx.collection.findUnique({
      where: { id: review.collectionId },
      select: { status: true, blockReason: true },
    });
    if (fresh && upheldBecomesInconclusive(fresh)) outcome = 'INCONCLUSIVE';

    let suspended = false;
    if (outcome === 'UPHELD') {
      const hold = await applyCommunityHold(tx, review.collectionId);
      if (hold === 'inconclusive') outcome = 'INCONCLUSIVE';
      else if (hold === 'suspended') suspended = true;
    }

    const updated = await tx.collectionReview.updateMany({
      where: { id: reviewId, status: review.status },
      data: { status: outcome, decidedAt: new Date() },
    });
    if (updated.count !== 1) throw new ReviewLost();

    const complaints = review.complaintIds.length === 0
      ? []
      : await tx.collectionComplaint.findMany({
          where: { id: { in: review.complaintIds } },
          select: { userId: true, reason: true },
        });

    if (outcome === 'DISMISSED' && dismissalRecordsStrikes(votes, review.audienceIds.length)) {
      await recordStrikes(tx, complaints);
    }
    if (review.complaintIds.length > 0) {
      await tx.collectionComplaint.deleteMany({ where: { id: { in: review.complaintIds } } });
    }

    return {
      outcome,
      hacked: suspended && hackedMajority(complaints.map((row) => row.reason)),
      creatorId: review.collection.creatorId,
    };
  }).catch((err: unknown) => {
    if (err instanceof ReviewLost) return null;
    throw err;
  });

  if (!applied) return null;
  if (applied.hacked) {
    sendHackedNotice(db, applied.creatorId, reviewId).catch((err) => {
      console.error('[moderation] hack mail failed', reviewId, err);
    });
  }
  return applied.outcome;
}

async function recordStrikes(
  tx: Prisma.TransactionClient,
  complaints: { userId: string }[],
): Promise<void> {
  const counts = new Map<string, number>();
  for (const row of complaints) counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
  const now = Date.now();
  for (const userId of [...counts.keys()].sort()) {
    await lockKey(tx, `so-strike:${userId}`);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { complaintStrikes: true, complaintBanUntil: true },
    });
    if (!user) continue;
    const count = counts.get(userId) ?? 0;
    let state = {
      strikes: user.complaintStrikes,
      banUntil: user.complaintBanUntil ? user.complaintBanUntil.getTime() : null,
    };
    for (let i = 0; i < count; i += 1) state = applyDismissedComplaint(state, now);
    await tx.user.updateMany({
      where: { id: userId },
      data: {
        complaintStrikes: state.strikes,
        complaintBanUntil: state.banUntil == null ? null : new Date(state.banUntil),
      },
    });
  }
}

async function sendHackedNotice(db: PrismaClient, creatorId: string, reviewId: string): Promise<void> {
  const review = await db.collectionReview.findUnique({
    where: { id: reviewId },
    select: { collectionId: true, status: true },
  });
  const user = await db.user.findUnique({
    where: { id: creatorId },
    select: { email: true, language: true, deletedAt: true },
  });
  if (!review || review.status !== 'UPHELD' || !user || user.deletedAt || !user.email) return;

  const email = user.email;
  const ru = user.language.toLowerCase().startsWith('ru');
  const link = `${WEB_APP_URL}/collection/${review.collectionId}`;
  const subject = ru ? 'Ваш сбор приостановлен' : 'Your collection was paused';
  const text = ru
    ? `Ближний круг приостановил ваш сбор: в большинстве жалоб указано, что аккаунт могли взломать. Если это были не вы, напишите в поддержку. Письмо пришло на почту аккаунта, чтобы вы узнали даже без приложения.\n\n${link}`
    : `Your close circle paused your collection. Most reports said the account may have been taken over. If that was not you, write to support. This message went to the account email so you can read it without the app.\n\n${link}`;
  await deliverWithRetry(reviewId, () => sendMail({
    to: email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`,
  }));
}

/**
 * Lazy close for hot reads. One indexed lookup; the vote tally runs only when an OPEN review exists.
 * Escalations wait for an admin and are not settled here.
 */
export async function settleOpenReviews(db: PrismaClient, collectionId: string): Promise<void> {
  const open = await db.collectionReview.findFirst({
    where: { collectionId, status: 'OPEN' },
    select: { id: true },
  });
  if (!open) return;
  await closeReviewIfReady(db, open.id);
}

/** Deadline pass for the BullMQ worker. Early closes also run on each vote and on read. */
export async function closeDueReviews(db: PrismaClient): Promise<number> {
  const due = await db.collectionReview.findMany({
    where: { status: 'OPEN', closesAt: { lte: new Date() } },
    select: { id: true },
    take: 200,
  });
  let closed = 0;
  for (const row of due) {
    const outcome = await closeReviewIfReady(db, row.id);
    if (outcome) closed += 1;
  }
  return closed;
}

export type OpenReviewRow = {
  id: string;
  collectionId: string;
  authorId: string;
  authorName: string;
  closesAt: Date;
  reasons: { reason: ComplaintReasonCode; count: number }[];
  myVote: ReviewVoteAnswer | null;
};

export async function listMyOpenReviews(db: PrismaClient, userId: string): Promise<OpenReviewRow[]> {
  const mine = await db.collectionReview.findMany({
    where: { status: 'OPEN', audienceIds: { has: userId } },
    select: { id: true },
  });
  for (const row of mine) await closeReviewIfReady(db, row.id);

  const reviews = await db.collectionReview.findMany({
    where: { status: 'OPEN', audienceIds: { has: userId } },
    orderBy: { startedAt: 'desc' },
    include: {
      votes: { where: { userId }, select: { answer: true } },
      collection: {
        select: {
          id: true,
          creator: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (reviews.length === 0) return [];

  const complaints = await loadComplaintReasons(db, reviews.flatMap((review) => review.complaintIds));
  return reviews.map((review) => {
    const ownVote = review.votes[0];
    return {
      id: review.id,
      collectionId: review.collection.id,
      authorId: review.collection.creator.id,
      authorName: review.collection.creator.name,
      closesAt: review.closesAt,
      reasons: reasonCounts(review.complaintIds.map((id) => complaints.get(id) ?? '').filter(Boolean)),
      myVote: ownVote ? asAnswer(ownVote.answer) : null,
    };
  });
}

async function loadComplaintReasons(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.collectionComplaint.findMany({
    where: { id: { in: ids } },
    select: { id: true, reason: true },
  });
  return new Map(rows.map((row) => [row.id, row.reason]));
}

export type AdminReviewRow = {
  id: string;
  collectionId: string;
  authorId: string;
  authorName: string;
  closesAt: Date;
  kind: ReviewKind;
  complaintCount: number;
  reasons: { reason: ComplaintReasonCode; count: number }[];
  voteCount: number;
  audienceCount: number;
};

export async function listAdminOpenReviews(db: PrismaClient): Promise<AdminReviewRow[]> {
  const due = await db.collectionReview.findMany({
    where: { status: 'OPEN', closesAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const row of due) await closeReviewIfReady(db, row.id);

  const reviews = await db.collectionReview.findMany({
    where: { status: { in: ['OPEN', 'ESCALATED'] } },
    orderBy: { closesAt: 'asc' },
    include: {
      collection: { select: { id: true, creator: { select: { id: true, name: true } } } },
      _count: { select: { votes: true } },
    },
    take: 100,
  });
  if (reviews.length === 0) return [];

  const complaints = await loadComplaintReasons(db, reviews.flatMap((review) => review.complaintIds));
  return reviews.map((review) => {
    const reasons = review.complaintIds.map((id) => complaints.get(id)).filter((reason): reason is string => !!reason);
    return {
      id: review.id,
      collectionId: review.collection.id,
      authorId: review.collection.creator.id,
      authorName: review.collection.creator.name,
      closesAt: review.closesAt,
      kind: review.status === 'ESCALATED' ? 'ESCALATION' : 'VOTE',
      complaintCount: reasons.length,
      reasons: reasonCounts(reasons),
      voteCount: review._count.votes,
      audienceCount: review.audienceIds.length,
    };
  });
}

export async function adminCloseReview(
  db: PrismaClient,
  reviewId: string,
  outcome: ForcedOutcome,
): Promise<{ outcome: ReviewOutcome }> {
  const review = await db.collectionReview.findUnique({
    where: { id: reviewId },
    select: { status: true },
  });
  if (!review) throw new TRPCError({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
  if (review.status !== 'OPEN' && review.status !== 'ESCALATED') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'REVIEW_CLOSED' });
  }
  const applied = await closeReviewIfReady(db, reviewId, outcome);
  if (!applied) throw new TRPCError({ code: 'BAD_REQUEST', message: 'REVIEW_CLOSED' });
  return { outcome: applied };
}
