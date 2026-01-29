// ---- Data Model (strict, per spec) ----

export interface Participant {
  pubKey: string;
  invitedBy: string | null;
  createdAt: number; // Unix timestamp ms
}

export interface Connection {
  fromPubKey: string;
  toPubKey: string;
  createdAt: number;
}

export type ObligationType = 'ONE_TIME' | 'REPEATING' | 'INITIATIVE';
export type ObligationStatus = 'DECLARED' | 'CONFIRMED' | 'CLOSED';

export interface Obligation {
  id: string;
  fromPubKey: string;
  toPubKey: string;
  unitAmount: number; // always >= 1
  type: ObligationType;
  status: ObligationStatus;
  createdAt: number;
}

// ---- State Machine ----
// DECLARED -> CONFIRMED -> CLOSED
// All other transitions are impossible.

export const ALLOWED_TRANSITIONS: Record<ObligationStatus, ObligationStatus | null> = {
  DECLARED: 'CONFIRMED',
  CONFIRMED: 'CLOSED',
  CLOSED: null,
};
