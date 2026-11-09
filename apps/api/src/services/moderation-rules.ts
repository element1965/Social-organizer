/**
 * Pure rules for circle moderation. The service applies them; the check script asserts them.
 * Unknown answers count toward quorum and not toward either side.
 * A tie, or no decisive votes, is not a problem majority.
 */

export const REVIEW_WINDOW_MS = 48 * 60 * 60 * 1000;
export const QUORUM_MIN_VOTES = 3;
export const QUORUM_PERCENT = 30;
export const COMPLAINTS_TO_OPEN = 3;
export const BAN_AFTER_DISMISSALS = 2;
export const COMPLAINT_BAN_MS = 30 * 24 * 60 * 60 * 1000;
export const COMMENT_MAX = 280;

export type ReviewVoteAnswer = 'PROBLEM' | 'OK' | 'UNKNOWN';
export type ReviewOutcome = 'UPHELD' | 'DISMISSED';

export function quorumReached(voteCount: number, audienceSize: number): boolean {
  if (audienceSize <= 0 || voteCount < QUORUM_MIN_VOTES) return false;
  return voteCount * 100 >= audienceSize * QUORUM_PERCENT;
}

/** PROBLEM or OK only. Equal counts are not a majority. */
export function decisiveMajority(votes: readonly ReviewVoteAnswer[]): 'PROBLEM' | 'OK' | null {
  let problem = 0;
  let ok = 0;
  for (const answer of votes) {
    if (answer === 'PROBLEM') problem += 1;
    else if (answer === 'OK') ok += 1;
  }
  if (problem > ok) return 'PROBLEM';
  if (ok > problem) return 'OK';
  return null;
}

/**
 * null means the review stays open.
 * Quorum decides immediately: only a problem majority pauses the collection.
 * The deadline drops the reports when quorum never arrived.
 */
export function decideReview(input: {
  now: number;
  closesAt: number;
  votes: readonly ReviewVoteAnswer[];
  audienceSize: number;
  force?: ReviewOutcome;
}): ReviewOutcome | null {
  if (input.force) return input.force;
  if (quorumReached(input.votes.length, input.audienceSize)) {
    return decisiveMajority(input.votes) === 'PROBLEM' ? 'UPHELD' : 'DISMISSED';
  }
  if (input.now >= input.closesAt) return 'DISMISSED';
  return null;
}

/** Strict majority of the reports that are part of this review. */
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

/**
 * One dismissed report. The second starts a 30-day ban and clears the count,
 * so the next two dismissals are required after the ban ends.
 * A ban that is already running is kept when this dismissal does not start a new one.
 */
export function applyDismissedComplaint(
  state: { strikes: number; banUntil: number | null },
  now: number,
): { strikes: number; banUntil: number | null } {
  const next = state.strikes + 1;
  if (next >= BAN_AFTER_DISMISSALS) {
    return { strikes: 0, banUntil: now + COMPLAINT_BAN_MS };
  }
  const banUntil = state.banUntil != null && state.banUntil > now ? state.banUntil : state.banUntil;
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
  if (collection.status === 'CLOSED' || collection.status === 'CANCELLED') return null;
  if (collection.blockReason != null && collection.blockReason !== 'COMMUNITY') return null;
  if (collection.blockReason === 'COMMUNITY' && collection.status === 'BLOCKED') return null;
  return { status: 'BLOCKED', blockReason: 'COMMUNITY' };
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
