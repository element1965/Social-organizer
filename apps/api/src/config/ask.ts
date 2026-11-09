/** Thresholds for creating a request (collection). Single source for the server checks and the UI progress. */
// ASK_MIN_DIRECT / ASK_MIN_NETWORK live in @so/shared
// No amount cap: a request above what the network can help with gets a UI warning only (decision 2026-11-09).
export const ASK_NETWORK_SCAN_LIMIT = 500; // BFS stops once this many people are found

/** Stable message keys carried in TRPCError.message so the UI can map them to copy. */
export const ASK_ERRORS = {
  locked: 'ASK_LOCKED',
} as const;

/** Reasons an admin can pick when blocking a collection. */
export const BLOCK_REASONS = [
  'COMPLAINTS',
  'SUSPECTED_FRAUD',
  'RULES_VIOLATION',
  'AUTHOR_REQUEST',
] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
