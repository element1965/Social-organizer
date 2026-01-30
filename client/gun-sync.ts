import Gun from 'gun/gun';
import 'gun/sea';
import type {
  Participant,
  Connection,
  Obligation,
  ObligationType,
  ObligationStatus,
} from '../shared/types';
import { ALLOWED_TRANSITIONS } from '../shared/types';

// Re-export shared types for convenience
export type { Participant, Connection, Obligation, ObligationType, ObligationStatus };
export { ALLOWED_TRANSITIONS };

const RELAY_URL = import.meta.env.VITE_RELAY_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `${window.location.origin}/gun`
    : 'http://localhost:8765/gun'
);

const gun = Gun({ peers: [RELAY_URL] });

// ---- Gun graph namespaces ----
const participants = gun.get('participants');
const connections  = gun.get('connections');
const obligations  = gun.get('obligations');

// ---- SEA key pair (identity) ----
let _pair: { pub: string; priv: string; epub: string; epriv: string } | null = null;

export async function getOrCreateIdentity(): Promise<string> {
  const stored = localStorage.getItem('so_keypair');
  if (stored) {
    _pair = JSON.parse(stored);
    return _pair!.pub;
  }
  const pair = await (Gun as any).SEA.pair();
  _pair = pair;
  localStorage.setItem('so_keypair', JSON.stringify(pair));
  return pair.pub;
}

export function getMyPubKey(): string | null {
  return _pair?.pub ?? null;
}

// ---- Participant ----

export function registerParticipant(invitedByPubKey: string | null): void {
  const pub = getMyPubKey();
  if (!pub) return;
  const p: Participant = { pubKey: pub, invitedBy: invitedByPubKey, createdAt: Date.now() };
  participants.get(pub).put(p as any);
}

export function onParticipants(cb: (list: Participant[]) => void): () => void {
  const map = new Map<string, Participant>();
  const handler = participants.map().on((data: any, key: string) => {
    if (!data) return;
    map.set(key, { pubKey: data.pubKey, invitedBy: data.invitedBy, createdAt: data.createdAt });
    cb(Array.from(map.values()));
  });
  return () => { (handler as any).off?.(); };
}

// ---- Connection ----

export function recordConnection(toPubKey: string): void {
  const from = getMyPubKey();
  if (!from) return;
  const id = `${from}_${toPubKey}`;
  const c: Connection = { fromPubKey: from, toPubKey, createdAt: Date.now() };
  connections.get(id).put(c as any);
}

export function onConnections(cb: (list: Connection[]) => void): () => void {
  const map = new Map<string, Connection>();
  const handler = connections.map().on((data: any, key: string) => {
    if (!data) return;
    map.set(key, { fromPubKey: data.fromPubKey, toPubKey: data.toPubKey, createdAt: data.createdAt });
    cb(Array.from(map.values()));
  });
  return () => { (handler as any).off?.(); };
}

// ---- Obligation ----

export function declareObligation(
  toPubKey: string,
  unitAmount: number,
  type: ObligationType,
): string {
  const from = getMyPubKey();
  if (!from) throw new Error('Identity not initialized');
  if (unitAmount < 1) throw new Error('unitAmount must be >= 1');

  const id = `${from}_${toPubKey}_${Date.now()}`;
  const o: Obligation = {
    id,
    fromPubKey: from,
    toPubKey,
    unitAmount,
    type,
    status: 'DECLARED',
    createdAt: Date.now(),
  };
  obligations.get(id).put(o as any);
  return id;
}

/**
 * Transition an obligation to the next allowed status.
 * Enforces the strict state machine: DECLARED -> CONFIRMED -> CLOSED.
 */
export function transitionObligation(obligationId: string, currentStatus: ObligationStatus): void {
  const next = ALLOWED_TRANSITIONS[currentStatus];
  if (!next) throw new Error(`No transition from ${currentStatus}`);
  obligations.get(obligationId).put({ status: next } as any);
}

/**
 * Deterministic confirmation: confirms DECLARED obligations toward the caller,
 * ordered by createdAt (earliest first), up to `upToUnits` total.
 * The receiver CANNOT choose specific participants — the system selects deterministically.
 */
export function deterministicConfirm(
  allObligations: Obligation[],
  upToUnits: number,
): string[] {
  const myPub = getMyPubKey();
  if (!myPub) return [];

  // Filter: only DECLARED obligations where I am the receiver
  const eligible = allObligations
    .filter(o => o.toPubKey === myPub && o.status === 'DECLARED')
    .sort((a, b) => a.createdAt - b.createdAt); // deterministic order

  let remaining = upToUnits;
  const confirmed: string[] = [];

  for (const o of eligible) {
    if (remaining <= 0) break;
    transitionObligation(o.id, 'DECLARED');
    confirmed.push(o.id);
    remaining -= o.unitAmount;
  }

  return confirmed;
}

/**
 * Close a CONFIRMED obligation (terminal state).
 */
export function closeObligation(obligationId: string): void {
  transitionObligation(obligationId, 'CONFIRMED');
}

export function onObligations(cb: (list: Obligation[]) => void): () => void {
  const map = new Map<string, Obligation>();
  const handler = obligations.map().on((data: any, key: string) => {
    if (!data || !data.id) return;
    map.set(key, {
      id: data.id,
      fromPubKey: data.fromPubKey,
      toPubKey: data.toPubKey,
      unitAmount: data.unitAmount,
      type: data.type,
      status: data.status,
      createdAt: data.createdAt,
    });
    cb(Array.from(map.values()));
  });
  return () => { (handler as any).off?.(); };
}

export { gun };
