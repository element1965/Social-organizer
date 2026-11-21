import type { PrismaClient } from '@so/db';
import { isAdmin } from '../admin.js';
import { accessFromAuthHeader } from './auth.service.js';
import { isActiveAccount } from './active-account.js';

/**
 * The admin REST routes' check of an `Authorization` header: an admin's access token, of an account that still
 * exists and is not deleted (SEC-8), issued after its first mailbox proof (SEC-1).
 */
export async function activeAdminFromAuthHeader(
  db: PrismaClient,
  authorization: string | undefined,
): Promise<{ userId: string } | { status: 401 | 403 }> {
  const access = accessFromAuthHeader(authorization);
  if (!access) return { status: 401 };
  if (!isAdmin(access.userId)) return { status: 403 };
  if (!(await isActiveAccount(db, access.userId, access.issuedMs))) return { status: 403 };
  return { userId: access.userId };
}
