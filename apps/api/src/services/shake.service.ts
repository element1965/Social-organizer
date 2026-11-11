import { randomBytes } from 'crypto';
import { haversineKm } from './geo.service.js';

/**
 * Pure in-memory matcher for "shake to connect". No DB. The API runs as a single instance, so process
 * memory is enough. Two shakes that arrive almost at the same time from people who are probably together
 * are paired; both people then confirm (see shake.router).
 */

export type ShakeGeo = { lat: number; lng: number; accuracy: number };
export type PairState = 'waiting' | 'connected' | 'declined' | 'expired' | 'failed';

export type ShakeEntry = {
  ticket: string;
  userId: string;
  /** Server receipt time (ms) */
  at: number;
  ip: string;
  geo?: ShakeGeo;
  pairId?: string;
  crowded?: boolean;
};

export type ShakePair = {
  pairId: string;
  users: [string, string];
  createdAt: number;
  expiresAt: number;
  accepted: Set<string>;
  declinedBy?: string;
  state: PairState;
  error?: string;
  /** Who got the error: a limit message is worded for them and swapped for the other person */
  errorFor?: string;
  /** Whether the two were connected before this shake; read once, before anyone answers */
  connectedBefore?: boolean;
  /** True while the router is writing the connection, so a double tap cannot connect twice */
  connecting?: boolean;
};

export type ShakeSearchStatus =
  | { state: 'searching' }
  | { state: 'none' }
  | { state: 'crowded' }
  | { state: 'matched'; pair: ShakePair; otherUserId: string };

/** Two shakes count as simultaneous when their server receipt times differ by at most this */
export const MATCH_WINDOW_MS = 3000;
/** A pairing is committed only once the newest shake is this old, so a third phone can still show up */
export const SETTLE_MS = 500;
/** A shake that found nobody is reported as 'none' after this */
export const SEARCH_TIMEOUT_MS = 6000;
const ENTRY_TTL_MS = 8000;
export const PAIR_TTL_MS = 30_000;
const PAIR_KEEP_MS = 60_000;
const MIN_GEO_RADIUS_M = 150;
/** A wider radius would pair strangers far apart (a claimed accuracy of kilometres matches a whole city) */
const MAX_GEO_RADIUS_M = 500;
/** Coarser fixes than this say nothing about being in one room: such geo is ignored */
export const MAX_GEO_ACCURACY_M = 200;

let now: () => number = () => Date.now();
const entries = new Map<string, ShakeEntry>();
const pairs = new Map<string, ShakePair>();

/** Test hook: replace the clock */
export function __setShakeClock(fn: (() => number) | null): void {
  now = fn ?? (() => Date.now());
}

export function __resetShakeState(): void {
  entries.clear();
  pairs.clear();
  now = () => Date.now();
}

function geoDistanceLimitM(a: ShakeGeo, b: ShakeGeo): number {
  return Math.min(MAX_GEO_RADIUS_M, Math.max(MIN_GEO_RADIUS_M, a.accuracy + b.accuracy));
}

/** Both have geo and are farther apart than their accuracy allows: they cannot be together */
function contradicts(a: ShakeEntry, b: ShakeEntry): boolean {
  if (!a.geo || !b.geo) return false;
  const meters = haversineKm(a.geo.lat, a.geo.lng, b.geo.lat, b.geo.lng) * 1000;
  return meters > geoDistanceLimitM(a.geo, b.geo);
}

function isStrong(a: ShakeEntry, b: ShakeEntry): boolean {
  if (a.ip === b.ip) return true;
  // Reaching here means contradicts() is false, so two geo points are within range
  return !!a.geo && !!b.geo;
}

type Choice = { kind: 'match'; other: ShakeEntry } | { kind: 'crowded' } | { kind: 'wait' };

function choose(e: ShakeEntry): Choice {
  const inWindow: ShakeEntry[] = [];
  for (const o of entries.values()) {
    if (o === e || o.userId === e.userId) continue;
    if (Math.abs(o.at - e.at) > MATCH_WINDOW_MS) continue;
    inWindow.push(o);
  }
  const strong: ShakeEntry[] = [];
  const weak: ShakeEntry[] = [];
  for (const o of inWindow) {
    if (contradicts(e, o)) continue;
    (isStrong(e, o) ? strong : weak).push(o);
  }
  if (strong.length > 1) return { kind: 'crowded' };
  if (strong.length === 1) {
    return strong[0]!.pairId ? { kind: 'crowded' } : { kind: 'match', other: strong[0]! };
  }
  if (weak.length === 1 && inWindow.length === 1 && !weak[0]!.pairId) {
    return { kind: 'match', other: weak[0]! };
  }
  return { kind: 'wait' };
}

function prune(): void {
  const t = now();
  for (const [id, p] of pairs) {
    if (p.state === 'waiting' && t >= p.expiresAt && !p.connecting) p.state = 'expired';
    if (t >= p.expiresAt + PAIR_KEEP_MS) pairs.delete(id);
  }
  for (const [ticket, e] of entries) {
    if (e.pairId) {
      if (!pairs.has(e.pairId)) entries.delete(ticket);
    } else if (t - e.at > ENTRY_TTL_MS) {
      entries.delete(ticket);
    }
  }
}

/** Pairs shakes that settled; marks ambiguous ones as crowded. Symmetric: both sides must pick each other. */
function evaluate(): void {
  const t = now();
  const open = [...entries.values()].filter((e) => !e.pairId && !e.crowded && t - e.at <= SEARCH_TIMEOUT_MS);
  const choices = new Map<string, Choice>();
  for (const e of open) choices.set(e.ticket, choose(e));
  for (const e of open) {
    if (e.pairId) continue;
    const c = choices.get(e.ticket)!;
    if (c.kind === 'crowded') {
      e.crowded = true;
    } else if (c.kind === 'match' && !c.other.pairId) {
      if (t - Math.max(e.at, c.other.at) < SETTLE_MS) continue;
      const back = choices.get(c.other.ticket) ?? choose(c.other);
      if (back.kind === 'crowded') {
        // The other side sees several candidates; this one cannot be certain either
        c.other.crowded = true;
        e.crowded = true;
      } else if (back.kind === 'match' && back.other === e) {
        const pair: ShakePair = {
          pairId: randomBytes(12).toString('hex'),
          users: [e.userId, c.other.userId],
          createdAt: t,
          expiresAt: t + PAIR_TTL_MS,
          accepted: new Set(),
          state: 'waiting',
        };
        pairs.set(pair.pairId, pair);
        e.pairId = pair.pairId;
        c.other.pairId = pair.pairId;
      }
    }
  }
}

/** Registers a shake; a previous unpaired shake of the same user is replaced. Returns the ticket. */
export function registerShake(input: { userId: string; ip: string; geo?: ShakeGeo }): string {
  prune();
  for (const [ticket, e] of entries) {
    if (e.userId === input.userId && !e.pairId) entries.delete(ticket);
  }
  const ticket = randomBytes(12).toString('hex');
  // A coarse fix (cell towers, a claimed accuracy of kilometres) cannot place two phones together
  const geo = input.geo && input.geo.accuracy <= MAX_GEO_ACCURACY_M ? input.geo : undefined;
  entries.set(ticket, { ticket, userId: input.userId, at: now(), ip: input.ip, geo });
  evaluate();
  return ticket;
}

export function getTicketOwner(ticket: string): string | null {
  return entries.get(ticket)?.userId ?? null;
}

/** Status of a ticket. Unknown or pruned tickets are reported as 'none'. */
export function getShakeStatus(ticket: string): ShakeSearchStatus {
  prune();
  evaluate();
  const e = entries.get(ticket);
  if (!e) return { state: 'none' };
  if (e.pairId) {
    const pair = pairs.get(e.pairId);
    if (pair) {
      const otherUserId = pair.users[0] === e.userId ? pair.users[1] : pair.users[0];
      return { state: 'matched', pair, otherUserId };
    }
    return { state: 'none' };
  }
  if (e.crowded) return { state: 'crowded' };
  if (now() - e.at > SEARCH_TIMEOUT_MS) return { state: 'none' };
  return { state: 'searching' };
}

export function getPair(pairId: string): ShakePair | null {
  prune();
  return pairs.get(pairId) ?? null;
}

export type RespondOutcome = 'declined' | 'ready' | 'waiting' | 'noop';

/**
 * Records one person's answer. 'ready' means both accepted and the caller (the one who got 'ready')
 * must write the connection, then call finishPair().
 */
export function recordResponse(pair: ShakePair, userId: string, accept: boolean): RespondOutcome {
  if (pair.state !== 'waiting' || pair.connecting) return 'noop';
  if (!accept) {
    pair.declinedBy = userId;
    pair.state = 'declined';
    return 'declined';
  }
  pair.accepted.add(userId);
  if (pair.accepted.size === 2) {
    pair.connecting = true;
    return 'ready';
  }
  return 'waiting';
}

export function finishPair(pair: ShakePair, result: { ok: true } | { ok: false; error: string; userId: string }): void {
  pair.connecting = false;
  if (result.ok) {
    pair.state = 'connected';
  } else {
    pair.state = 'failed';
    pair.error = result.error;
    pair.errorFor = result.userId;
  }
}
