import { randomInt } from 'node:crypto';
import { Prisma, type PrismaClient } from '@so/db';
import { isValidReferralSlug } from '@so/shared';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function isReferralSlugConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes('referralSlug');
}

async function withGeneratedSlug<T>(write: (slug: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!isValidReferralSlug(slug)) continue;
    try {
      return await write(slug);
    } catch (error) {
      if (!isReferralSlugConflict(error)) throw error;
    }
  }
  throw new Error('Could not allocate a unique referral slug');
}

export function createUserWithReferralSlug(db: PrismaClient, data: Prisma.UserCreateInput) {
  return withGeneratedSlug((referralSlug) => db.user.create({ data: { ...data, referralSlug } }));
}

export async function ensureReferralSlug(db: PrismaClient, userId: string): Promise<string> {
  const read = () => db.user.findUniqueOrThrow({
    where: { id: userId, deletedAt: null },
    select: { referralSlug: true },
  });
  const existing = await read();
  if (existing.referralSlug) return existing.referralSlug;

  // Only a request that still sees NULL may assign a slug. A concurrent request or manual edit wins once.
  return withGeneratedSlug(async (referralSlug) => {
    const updated = await db.user.updateMany({
      where: { id: userId, deletedAt: null, referralSlug: null },
      data: { referralSlug },
    });
    if (updated.count === 1) return referralSlug;
    const winner = await read();
    if (!winner.referralSlug) throw new Error('Referral slug assignment did not persist');
    return winner.referralSlug;
  });
}
