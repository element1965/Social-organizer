import type { PrismaClient } from '@so/db';
import { ADMIN_BLOCK_REASONS } from '../config/ask.js';

/**
 * What one viewer may see of a Need (SEC-6).
 * - The author and everyone with an active Participation see the full list: who and how much.
 * - Any other signed-in viewer (a link, a notice, a declined Participation) sees who takes part, without
 *   amounts; the total, the goal and the number of participants are on the Need itself.
 * - The participants' chat link goes to the author, and to a participant only while the page would offer the
 *   chat (CollectionPage.tsx): not on a closed or held Need, and not while a renewed cycle waits for the
 *   person's confirmation. The same rule is used wherever a Need travels with its chat link.
 */

const ADMIN_REASONS: ReadonlySet<string> = new Set(ADMIN_BLOCK_REASONS);

/** The Need fields the chat rule reads. */
export interface ChatGate {
  creatorId: string;
  status: string;
  blockReason: string | null;
  type: string;
  cycleNumber: number;
  currentCycleStart: Date | null;
  chatLink: string | null;
}

/** A renewed cycle of a regular Need: each participant confirms again (CollectionPage `renewal`). */
export function isRenewal(c: Pick<ChatGate, 'type' | 'cycleNumber' | 'currentCycleStart'>): boolean {
  return c.type === 'REGULAR' && c.cycleNumber > 1 && c.currentCycleStart != null;
}

export function cycleConfirmation(
  c: Pick<ChatGate, 'type' | 'cycleNumber' | 'currentCycleStart'>,
  participation: { createdAt: Date },
  acknowledged: boolean,
): boolean | null {
  return isRenewal(c) ? participation.createdAt >= c.currentCycleStart! || acknowledged : null;
}

export function needsCycleConfirmation(
  c: Omit<ChatGate, 'chatLink' | 'creatorId'>,
  participation: { createdAt: Date } | undefined,
  acknowledged: boolean,
): boolean {
  return c.status === 'ACTIVE' && !isHeld(c) && !!participation
    && cycleConfirmation(c, participation, acknowledged) === false;
}

/** Paused by an admin or by the circle (CollectionPage `held`). */
export function isHeld(c: Pick<ChatGate, 'status' | 'blockReason'>): boolean {
  return c.blockReason === 'COMMUNITY' || (c.status === 'BLOCKED' && c.blockReason != null && ADMIN_REASONS.has(c.blockReason));
}

export function isClosed(c: Pick<ChatGate, 'status'>): boolean {
  return c.status === 'CLOSED' || c.status === 'CANCELLED';
}

/**
 * The chat link for this viewer, or null.
 * @param own the viewer's active Participation in this Need, if any
 * @param confirmedCycle the viewer answered the current cycle's renewal notice (RESPONDED)
 */
export function chatLinkFor(
  c: ChatGate,
  viewerId: string,
  own: { createdAt: Date } | null | undefined,
  confirmedCycle: boolean,
): string | null {
  if (c.creatorId === viewerId) return c.chatLink;
  if (!own || isClosed(c) || isHeld(c)) return null;
  if (needsCycleConfirmation(c, own, confirmedCycle)) return null;
  return c.chatLink;
}

/**
 * Renewal confirmations of one viewer, as "collectionId:wave" keys, for the Needs given. One query for a list.
 */
export async function confirmedRenewals(
  db: PrismaClient,
  userId: string,
  needs: Array<Pick<ChatGate, 'type' | 'cycleNumber' | 'currentCycleStart'> & { id: string }>,
): Promise<Set<string>> {
  const ids = needs.filter(isRenewal).map((c) => c.id);
  if (ids.length === 0) return new Set();
  const rows = await db.notification.findMany({
    where: { userId, collectionId: { in: ids }, type: 'CYCLE_RENEWED', status: 'RESPONDED' },
    select: { collectionId: true, wave: true },
  });
  return new Set(rows.map((r) => `${r.collectionId}:${r.wave}`));
}

export interface NeedAudience<T> {
  isAuthor: boolean;
  isParticipant: boolean;
  /** Sees everyone's amounts (author or active participant). */
  seesAmounts: boolean;
  /** The viewer's own active Participation, if any. */
  own: T | undefined;
  /** The active Participation rows (unsubscribed ones are never listed). */
  active: T[];
}

export function needAudience<T extends { userId: string; unsubscribedAt: Date | null }>(
  viewerId: string,
  creatorId: string,
  obligations: T[],
): NeedAudience<T> {
  const active = obligations.filter((o) => o.unsubscribedAt == null);
  const isAuthor = viewerId === creatorId;
  const own = active.find((o) => o.userId === viewerId);
  const isParticipant = !!own;
  return { isAuthor, isParticipant, seesAmounts: isAuthor || isParticipant, own, active };
}
