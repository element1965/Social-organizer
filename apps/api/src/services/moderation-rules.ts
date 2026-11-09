/**
 * Pure rules for circle moderation. The service applies them; the check script asserts them.
 * Unknown answers count toward quorum and not toward either side.
 */

export const REVIEW_WINDOW_MS = 48 * 60 * 60 * 1000;
export const QUORUM_MIN_VOTES = 3;
export const QUORUM_PERCENT = 30;
export const COMPLAINTS_TO_OPEN = 3;
export const MIN_VOTE_AUDIENCE = 3;
export const BAN_AFTER_DISMISSALS = 2;
export const COMPLAINT_BAN_MS = 30 * 24 * 60 * 60 * 1000;
export const COLLECTION_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const PLEDGE_MIN_AGE_MS = 60 * 60 * 1000;
export const COMMENT_MAX = 280;
export const HACK_MAIL_ATTEMPTS = 3;

export type ReviewVoteAnswer = 'PROBLEM' | 'OK' | 'UNKNOWN';
export type ReviewOutcome = 'UPHELD' | 'DISMISSED' | 'INCONCLUSIVE';
export type ForcedOutcome = 'UPHELD' | 'DISMISSED';
export type ReviewKind = 'VOTE' | 'ESCALATION';

export function quorumReached(voteCount: number, audienceSize: number): boolean {
  if (audienceSize <= 0 || voteCount < QUORUM_MIN_VOTES) return false;
  return voteCount * 100 >= audienceSize * QUORUM_PERCENT;
}

function tally(votes: readonly ReviewVoteAnswer[]): { problem: number; ok: number; total: number } {
  let problem = 0;
  let ok = 0;
  for (const answer of votes) {
    if (answer === 'PROBLEM') problem += 1;
    else if (answer === 'OK') ok += 1;
  }
  return { problem, ok, total: votes.length };
}

/** UPHELD needs at least two PROBLEM votes and more PROBLEM than OK. */
export function problemRule(problem: number, ok: number): boolean {
  return problem >= 2 && problem > ok;
}

/**
 * Result once the review stops taking votes.
 * No quorum, a tie, or only UNKNOWN answers are inconclusive: complaints go, strikes do not.
 */
export function outcomeAtClose(votes: readonly ReviewVoteAnswer[], audienceSize: number): ReviewOutcome {
  const { problem, ok, total } = tally(votes);
  if (!quorumReached(total, audienceSize)) return 'INCONCLUSIVE';
  if (problemRule(problem, ok)) return 'UPHELD';
  if (ok > problem) return 'DISMISSED';
  return 'INCONCLUSIVE';
}

/**
 * True when every remaining ballot, cast the worst way for the leader, still leaves the same result.
 * Quorum must already be met, because people who never vote cannot be assumed to vote.
 */
export function leaderUnassailable(votes: readonly ReviewVoteAnswer[], audienceSize: number): boolean {
  const { problem, ok, total } = tally(votes);
  if (!quorumReached(total, audienceSize)) return false;
  const remaining = Math.max(0, audienceSize - total);
  if (problemRule(problem, ok + remaining)) return true;
  if (ok > problem + remaining) return true;
  return false;
}

/**
 * null means the review stays open.
 * Early close only when the leader is unassailable. At the deadline, close with outcomeAtClose.
 */
export function decideReview(input: {
  now: number;
  closesAt: number;
  votes: readonly ReviewVoteAnswer[];
  audienceSize: number;
  force?: ForcedOutcome;
}): ReviewOutcome | null {
  if (input.force) return input.force;
  if (leaderUnassailable(input.votes, input.audienceSize) || input.now >= input.closesAt) {
    return outcomeAtClose(input.votes, input.audienceSize);
  }
  return null;
}

/** Strikes only when the circle reached quorum and OK beat PROBLEM. */
export function dismissalRecordsStrikes(votes: readonly ReviewVoteAnswer[], audienceSize: number): boolean {
  const { problem, ok, total } = tally(votes);
  return quorumReached(total, audienceSize) && ok > problem;
}

/** A circle smaller than three people does not vote. Admins take the case instead. */
export function reviewKind(audienceSize: number): ReviewKind {
  return audienceSize < MIN_VOTE_AUDIENCE ? 'ESCALATION' : 'VOTE';
}

/** Strict majority of the reports that belong to this review. */
export function hackedMajority(reasons: readonly string[]): boolean {
  if (reasons.length === 0) return false;
  let hacked = 0;
  for (const reason of reasons) {
    if (reason === 'ACCOUNT_HACKED') hacked += 1;
  }
  return hacked * 2 > reasons.length;
}

export function complaintBanned(banUntil: number | null, now: number): boolean {
  return banUntil != null && banUntil > now;
}

/** No new complaints on this collection for 30 days after DISMISSED or INCONCLUSIVE. */
export function collectionCooling(decidedAt: number | null, now: number): boolean {
  return decidedAt != null && decidedAt + COLLECTION_COOLDOWN_MS > now;
}

/** A participant must have pledged at least an hour ago. */
export function pledgeOldEnough(pledgedAt: number, now: number): boolean {
  return now - pledgedAt >= PLEDGE_MIN_AGE_MS;
}

/**
 * An admin reason or a finished collection cannot be suspended by the circle.
 * The review then closes as inconclusive.
 */
export function upheldBecomesInconclusive(collection: {
  status: string;
  blockReason: string | null;
}): boolean {
  if (collection.status === 'CLOSED' || collection.status === 'CANCELLED') return true;
  return collection.blockReason != null && collection.blockReason !== 'COMMUNITY';
}

/**
 * One OK-majority dismissal. The second starts a 30-day ban and clears the count,
 * so the next two dismissals are required after the ban ends.
 * A ban that is still running is kept. An expired ban is cleared.
 */
export function applyDismissedComplaint(
  state: { strikes: number; banUntil: number | null },
  now: number,
): { strikes: number; banUntil: number | null } {
  const next = state.strikes + 1;
  if (next >= BAN_AFTER_DISMISSALS) {
    return { strikes: 0, banUntil: now + COMPLAINT_BAN_MS };
  }
  const banUntil = state.banUntil != null && state.banUntil > now ? state.banUntil : null;
  return { strikes: next, banUntil };
}

export function shouldOpenReview(complaintCount: number, openReviewExists: boolean): boolean {
  return !openReviewExists && complaintCount >= COMPLAINTS_TO_OPEN;
}

/** Direct contacts, without the author and without people who already reported. */
export function reviewAudience(
  authorId: string,
  directIds: readonly string[],
  complainantIds: readonly string[],
): string[] {
  const complained = new Set(complainantIds);
  const seen = new Set<string>();
  const audience: string[] = [];
  for (const id of directIds) {
    if (id === authorId || complained.has(id) || seen.has(id)) continue;
    seen.add(id);
    audience.push(id);
  }
  return audience;
}

/**
 * What an upheld review writes. An admin reason is left untouched.
 * A goal hold (BLOCKED, no reason) gains COMMUNITY and stays blocked.
 * A closed collection is not reopened.
 * null means the row does not change.
 */
export function communityHoldPatch(collection: {
  status: string;
  blockReason: string | null;
}): { status: 'BLOCKED'; blockReason: 'COMMUNITY' } | null {
  if (upheldBecomesInconclusive(collection)) return null;
  if (collection.blockReason === 'COMMUNITY' && collection.status === 'BLOCKED') return null;
  return { status: 'BLOCKED', blockReason: 'COMMUNITY' };
}

export function hackMailDelayMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

/**
 * Try the hacked-account mail up to three times. The last failure is logged with the review id.
 * Returns false when every attempt failed. wait is injectable so tests do not sleep.
 */
export async function deliverWithRetry(
  reviewId: string,
  send: () => Promise<void>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  let last: unknown;
  for (let attempt = 1; attempt <= HACK_MAIL_ATTEMPTS; attempt += 1) {
    try {
      await send();
      return true;
    } catch (err) {
      last = err;
      if (attempt < HACK_MAIL_ATTEMPTS) await wait(hackMailDelayMs(attempt));
    }
  }
  console.error('[moderation] hack mail failed', reviewId, last);
  return false;
}

/** First token of a name. Cyrillic given names get a rough genitive; other names stay as written. */
export function inflectFirstName(fullName: string, language: string): string {
  const name = fullName.trim().split(/\s+/)[0] || fullName;
  if (!language.toLowerCase().startsWith('ru')) return name;
  if (!/^[\u0400-\u04FF-]+$/.test(name)) return name;
  const lower = name.toLocaleLowerCase('ru');
  const swap = (drop: number, ending: string) => name.slice(0, name.length - drop) + ending;
  if (lower.endsWith('ия')) return swap(2, 'ии');
  if (lower.endsWith('ья')) return swap(2, 'ьи');
  if (lower.endsWith('а')) return swap(1, 'ы');
  if (lower.endsWith('я')) return swap(1, 'и');
  if (lower.endsWith('й') || lower.endsWith('ь')) return swap(1, 'я');
  return `${name}а`;
}
