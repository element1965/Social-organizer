/** Thresholds for creating a request (collection). Single source for the server checks and the UI progress. */
export const ASK_MIN_DIRECT = 5; // confirmed direct connections (1st ring)
export const ASK_MIN_NETWORK = 10; // people reachable in the whole network
export const ASK_FIRST_AMOUNT_FACTOR = 2; // first ever request <= factor x what the network can help with
export const ASK_NETWORK_SCAN_LIMIT = 500; // BFS stops once this many people are found

/** Stable message keys carried in TRPCError.message so the UI can map them to copy. */
export const ASK_ERRORS = {
  locked: 'ASK_LOCKED',
  amountCap: 'ASK_AMOUNT_CAP',
} as const;

/** Reasons an admin can pick when blocking a collection. */
export const BLOCK_REASONS = [
  'COMPLAINTS',
  'SUSPECTED_FRAUD',
  'RULES_VIOLATION',
  'AUTHOR_REQUEST',
] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
