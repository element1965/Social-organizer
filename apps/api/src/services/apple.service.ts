import crypto from 'node:crypto';
import type { PrismaClient } from '@so/db';
import { createAccessToken, createRefreshToken } from './auth.service.js';

// Sign in with Apple is verified entirely from the id_token returned by Apple's
// web OAuth flow (response_type=code id_token, response_mode=form_post). We verify
// the JWT signature against Apple's public keys (JWKS) — no client secret / .p8 key
// is needed because we never exchange the authorization code.

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

// Accepted audiences: the web Services ID (web/native browser flow) and, as a
// fallback, the native app bundle id (in case a native id_token ever reaches here).
const APPLE_SERVICE_ID = process.env.APPLE_SERVICE_ID || '';
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.socialorganizer.app';

export interface AppleUserData {
  sub: string;
  email: string | null;
  email_verified: boolean;
}

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getAppleKeys(): Promise<AppleJwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Apple JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: AppleJwk[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/**
 * Verify an Apple id_token (JWT, RS256) against Apple's published public keys.
 * Returns the user claims, or null if the token is invalid.
 */
export async function verifyAppleIdToken(idToken: string): Promise<AppleUserData | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { kid: string; alg: string };
    if (header.alg !== 'RS256') return null;

    const keys = await getAppleKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      // Key may have rotated — refresh once and retry
      jwksCache = null;
      const fresh = await getAppleKeys();
      const retry = fresh.find((k) => k.kid === header.kid);
      if (!retry) return null;
      return verifyWithJwk(retry, headerB64, payloadB64, signatureB64);
    }
    return verifyWithJwk(jwk, headerB64, payloadB64, signatureB64);
  } catch (err) {
    console.error('[Apple] Token verification failed:', err);
    return null;
  }
}

function verifyWithJwk(
  jwk: AppleJwk,
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
): AppleUserData | null {
  const publicKey = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
  const signingInput = `${headerB64}.${payloadB64}`;
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(signingInput),
    publicKey,
    base64UrlDecode(signatureB64),
  );
  if (!valid) return null;

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    iss: string;
    aud: string;
    exp: number;
    sub: string;
    email?: string;
    email_verified?: boolean | string;
  };

  if (payload.iss !== APPLE_ISSUER) return null;
  const allowedAud = [APPLE_SERVICE_ID, APPLE_BUNDLE_ID].filter(Boolean);
  if (!allowedAud.includes(payload.aud)) {
    console.error('[Apple] Unexpected aud:', payload.aud, 'allowed:', allowedAud);
    return null;
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub) return null;

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    email_verified: payload.email_verified === true || payload.email_verified === 'true',
  };
}

/**
 * Find or create a user for an Apple identity. Mirrors the Google flow:
 * 1. linkCode → attach Apple account to an existing user
 * 2. existing PlatformAccount(APPLE, sub) → that user
 * 3. verified email → link to user with same email, else create
 * 4. otherwise → create a new user without email
 */
export async function findOrCreateAppleUser(
  db: PrismaClient,
  apple: AppleUserData,
  displayName: string | null,
  linkCode?: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string; isNew: boolean }> {
  const name = displayName || (apple.email ? apple.email.split('@')[0] : '') || `User_${apple.sub.slice(0, 8)}`;

  // 0. Link to existing user via 6-digit code
  if (linkCode) {
    const linkingCode = await db.linkingCode.findFirst({
      where: { code: linkCode, expiresAt: { gt: new Date() } },
    });
    if (!linkingCode) throw new Error('Invalid or expired link code');
    const user = await db.user.findUnique({ where: { id: linkingCode.userId } });
    if (!user || user.deletedAt) throw new Error('User not found');
    await db.platformAccount.upsert({
      where: { platform_platformId: { platform: 'APPLE', platformId: apple.sub } },
      create: { userId: user.id, platform: 'APPLE', platformId: apple.sub },
      update: { userId: user.id },
    });
    await db.linkingCode.delete({ where: { id: linkingCode.id } });
    return { ...issue(user.id), userId: user.id, isNew: false };
  }

  // 1. Existing Apple account
  const platformAccount = await db.platformAccount.findUnique({
    where: { platform_platformId: { platform: 'APPLE', platformId: apple.sub } },
  });
  if (platformAccount) {
    return { ...issue(platformAccount.userId), userId: platformAccount.userId, isNew: false };
  }

  // 2. Verified email — link to an existing user with the same email
  if (apple.email_verified && apple.email) {
    const existingUser = await db.user.findUnique({ where: { email: apple.email.toLowerCase() } });
    if (existingUser) {
      await db.platformAccount.create({
        data: { userId: existingUser.id, platform: 'APPLE', platformId: apple.sub },
      });
      return { ...issue(existingUser.id), userId: existingUser.id, isNew: false };
    }
    const user = await db.user.create({
      data: {
        name,
        email: apple.email.toLowerCase(),
        monthlyBudget: 1,
        remainingBudget: 1,
        onboardingCompleted: true,
        platformAccounts: { create: { platform: 'APPLE', platformId: apple.sub } },
      },
    });
    return { ...issue(user.id), userId: user.id, isNew: true };
  }

  // 3. No verified email — create a user without an email
  const user = await db.user.create({
    data: {
      name,
      monthlyBudget: 1,
      remainingBudget: 1,
      onboardingCompleted: true,
      platformAccounts: { create: { platform: 'APPLE', platformId: apple.sub } },
    },
  });
  return { ...issue(user.id), userId: user.id, isNew: true };
}

function issue(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: createAccessToken(userId),
    refreshToken: createRefreshToken(userId),
  };
}
