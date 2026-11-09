import { Prisma, type PrismaClient } from '@so/db';

/**
 * One person = one account across sign-in methods (SO-21).
 *
 * Accounts are matched only by proven identifiers: the provider account itself
 * (Google/Apple `sub`) or an e-mail whose ownership is proven on both sides.
 * Never by a similar name, photo or an unproven e-mail.
 */

/**
 * Hide most of an e-mail for screens that must say which account exists without disclosing it:
 * "anna@gmail.com" → "an•••@gmail.com" (one letter kept for local parts of 1–2 letters).
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = email.slice(0, at);
  const keep = local.length > 2 ? 2 : 1;
  return `${local.slice(0, keep)}•••${email.slice(at)}`;
}

export class AccountExistsError extends Error {
  /** Masked e-mail of the existing account; only the masked form ever leaves the server. */
  readonly maskedEmail: string | null;
  /** The e-mail belongs to an account whose e-mail was never proven: sign in the old way first. */
  constructor(email?: string | null) {
    super('ACCOUNT_EXISTS_OTHER_METHOD');
    this.maskedEmail = email ? maskEmail(email) : null;
  }
}

export interface ExternalIdentity {
  platform: 'GOOGLE' | 'APPLE';
  platformId: string;
  /** Present only when the provider says the e-mail is verified. */
  verifiedEmail: string | null;
  name: string;
  photoUrl?: string | null;
  accessToken?: string | null;
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function resolveOnce(db: PrismaClient, id: ExternalIdentity): Promise<{ userId: string; isNew: boolean }> {
  // 1. This provider account is already known
  const account = await db.platformAccount.findUnique({
    where: { platform_platformId: { platform: id.platform, platformId: id.platformId } },
    include: { user: { select: { photoUrl: true } } },
  });
  if (account) {
    if (id.photoUrl && account.user.photoUrl !== id.photoUrl && id.platform === 'GOOGLE') {
      await db.user.update({ where: { id: account.userId }, data: { photoUrl: id.photoUrl } });
    }
    return { userId: account.userId, isNew: false };
  }

  const email = id.verifiedEmail?.toLowerCase() ?? null;

  // 2. Same e-mail already has an account
  if (email) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // Attach only when the existing account's e-mail is proven too
      // (or it never had a password, i.e. it came from a verified provider).
      // An e-mail typed at password sign-up was never checked: the person signs in
      // the old way (e-mail code) and links the methods in Settings.
      if (!existing.emailVerifiedAt && existing.passwordHash) throw new AccountExistsError(email);
      await db.platformAccount.create({
        data: { userId: existing.id, platform: id.platform, platformId: id.platformId, accessToken: id.accessToken ?? null },
      });
      await db.user.update({
        where: { id: existing.id },
        data: {
          ...(existing.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
          ...(id.photoUrl && !existing.photoUrl ? { photoUrl: id.photoUrl } : {}),
        },
      });
      return { userId: existing.id, isNew: false };
    }
  }

  // 3. New person
  const user = await db.user.create({
    data: {
      name: id.name,
      email,
      emailVerifiedAt: email ? new Date() : null,
      photoUrl: id.photoUrl || null,
      monthlyBudget: 1,
      remainingBudget: 1,
      onboardingCompleted: true,
      platformAccounts: {
        create: { platform: id.platform, platformId: id.platformId, accessToken: id.accessToken ?? null },
      },
    },
  });
  return { userId: user.id, isNew: true };
}

/**
 * Find or create the user for a Google/Apple identity.
 * A parallel first sign-in with the same provider account (two taps, two devices)
 * loses the unique-constraint race and then reads the account the other request created.
 */
export async function resolveExternalIdentity(db: PrismaClient, id: ExternalIdentity): Promise<{ userId: string; isNew: boolean }> {
  try {
    return await resolveOnce(db, id);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const r = await resolveOnce(db, id);
    return { ...r, isNew: false };
  }
}
