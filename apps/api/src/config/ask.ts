/** Thresholds for creating a request (collection). Single source for the server checks and the UI progress. */
// ASK_MIN_DIRECT / ASK_MIN_NETWORK live in @so/shared
// No amount cap: a request above what the network can help with gets a UI warning only (decision 2026-11-09).
export const ASK_NETWORK_SCAN_LIMIT = 500; // BFS stops once this many people are found

/** Stable message keys carried in TRPCError.message so the UI can map them to copy. */
export const ASK_ERRORS = {
  locked: 'ASK_LOCKED',
} as const;

/** Reasons an admin can pick when blocking a collection. COMMUNITY is set only by the circle. */
export const ADMIN_BLOCK_REASONS = [
  'COMPLAINTS',
  'SUSPECTED_FRAUD',
  'RULES_VIOLATION',
  'AUTHOR_REQUEST',
] as const;

export const BLOCK_REASONS = [...ADMIN_BLOCK_REASONS, 'COMMUNITY'] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
export type AdminBlockReason = (typeof ADMIN_BLOCK_REASONS)[number];

/** Reasons a participant or a 1st-handshake contact can pick. Not the admin-only "author asked". */
export const COMPLAINT_REASONS = [
  'COMPLAINTS',
  'SUSPECTED_FRAUD',
  'RULES_VIOLATION',
  'ACCOUNT_HACKED',
] as const;
export type ComplaintReasonCode = (typeof COMPLAINT_REASONS)[number];
