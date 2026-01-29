import { create } from 'zustand';
import {
  getOrCreateIdentity,
  getMyPubKey,
  registerParticipant,
  recordConnection,
  declareObligation,
  deterministicConfirm,
  closeObligation,
  onParticipants,
  onConnections,
  onObligations,
} from './gun-sync';
import type { Participant, Connection, Obligation, ObligationType } from './gun-sync';

interface AppState {
  // Identity
  myPubKey: string | null;
  initialized: boolean;

  // Data from Gun
  participants: Participant[];
  connections: Connection[];
  obligations: Obligation[];

  // Actions
  init: () => Promise<void>;
  register: (invitedBy: string | null) => void;
  addConnection: (toPubKey: string) => void;
  addObligation: (toPubKey: string, unitAmount: number, type: ObligationType) => string;
  confirmObligations: (upToUnits: number) => string[];
  closeObl: (obligationId: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  myPubKey: null,
  initialized: false,
  participants: [],
  connections: [],
  obligations: [],

  init: async () => {
    const pub = await getOrCreateIdentity();
    set({ myPubKey: pub });

    // Subscribe to real-time Gun data
    onParticipants((list) => set({ participants: list }));
    onConnections((list) => set({ connections: list }));
    onObligations((list) => set({ obligations: list }));

    set({ initialized: true });
  },

  register: (invitedBy) => {
    registerParticipant(invitedBy);
  },

  addConnection: (toPubKey) => {
    recordConnection(toPubKey);
  },

  addObligation: (toPubKey, unitAmount, type) => {
    return declareObligation(toPubKey, unitAmount, type);
  },

  confirmObligations: (upToUnits) => {
    const { obligations } = get();
    return deterministicConfirm(obligations, upToUnits);
  },

  closeObl: (obligationId) => {
    closeObligation(obligationId);
  },
}));
