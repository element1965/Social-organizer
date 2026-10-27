const raw = process.env.ADMIN_IDS ?? '';

export const ADMIN_IDS: string[] = raw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}

/**
 * Admin cluster stats: in the cluster that contains CLUSTER_ROOT_OVERRIDE.member,
 * show CLUSTER_ROOT_OVERRIDE.root as the cluster root (founders' cluster). Single source.
 */
export const CLUSTER_ROOT_OVERRIDE = {
  member: 'cml9ffhhh0000o801afqv67fz',
  root: 'cml9h2u8s000go801lcvi6ba9',
} as const;
