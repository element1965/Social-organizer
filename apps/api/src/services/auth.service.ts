import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import {
  JWT_ACCESS_TTL_MINUTES,
  JWT_REFRESH_TTL_DAYS,
  LINKING_CODE_LENGTH,
} from '@so/shared';
import { sessionClockMs } from './session-clock.js';

// No fallback: a known default secret would let anyone sign tokens (SO-14).
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 16) {
  throw new Error('JWT_SECRET must be at least 16 characters. For local development, copy apps/api/.env.example to apps/api/.env. Set a unique secret in production.');
}

interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  iat: number;
  /**
   * Issue time in milliseconds. `iat` has whole seconds only, which cannot tell a token issued just before the
   * first mailbox proof from one issued by the proving request itself (SEC-1). Tokens issued before this claim
   * existed lack it and are judged by `iat`.
   */
  iatMs?: number;
  exp: number;
}

function base64url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function sign(payload: object): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Issue time for a new token: the session clock (session-clock.ts, the same clock that writes the first-proof
 * cutoff), raised to `notBeforeMs` when the caller knows the account's cutoff, so the token is never judged as
 * issued before it.
 */
function issueTimeMs(notBeforeMs?: number): number {
  const nowMs = sessionClockMs();
  return notBeforeMs != null && Number.isFinite(notBeforeMs) && notBeforeMs > nowMs ? Math.ceil(notBeforeMs) : nowMs;
}

export function createAccessToken(userId: string, notBeforeMs?: number): string {
  const nowMs = issueTimeMs(notBeforeMs);
  const now = Math.floor(nowMs / 1000);
  return sign({
    sub: userId,
    type: 'access',
    iat: now,
    iatMs: nowMs,
    exp: now + JWT_ACCESS_TTL_MINUTES * 60,
  });
}

export function createRefreshToken(userId: string, notBeforeMs?: number): string {
  const nowMs = issueTimeMs(notBeforeMs);
  const now = Math.floor(nowMs / 1000);
  return sign({
    sub: userId,
    type: 'refresh',
    iat: now,
    iatMs: nowMs,
    exp: now + JWT_REFRESH_TTL_DAYS * 24 * 60 * 60,
  });
}

/** When a verified token was issued, in milliseconds (the start of its second for tokens without `iatMs`). */
export function tokenIssuedMs(payload: Pick<JwtPayload, 'iat' | 'iatMs'>): number {
  return typeof payload.iatMs === 'number' && Number.isFinite(payload.iatMs) ? payload.iatMs : payload.iat * 1000;
}

/**
 * A token issued before the account's first mailbox proof (SEC-1). Whoever held the account until then may not
 * be the mailbox owner (an address typed at password sign-up was never checked), so every session from before
 * the proof ends; the proving request issues its own tokens after the timestamp is written.
 */
export function issuedBeforeEmailProof(issuedMs: number, emailVerifiedAt: Date | null | undefined): boolean {
  return emailVerifiedAt != null && issuedMs < emailVerifiedAt.getTime();
}

export function verifyToken(
  token: string,
  expectedType: JwtPayload['type'] = 'access',
): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts as [string, string, string];
    const expectedSig = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest();
    const givenSig = Buffer.from(sig, 'base64url');
    if (givenSig.length !== expectedSig.length || !timingSafeEqual(givenSig, expectedSig)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JwtPayload;

    if (payload.type !== expectedType) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return null;
    if (!(payload.exp > Math.floor(Date.now() / 1000))) return null;

    return payload;
  } catch {
    return null;
  }
}

/** The account and issue time of an `Authorization: Bearer <access token>` header, or null if missing/invalid. */
export function accessFromAuthHeader(header: string | undefined): { userId: string; issuedMs: number } | null {
  if (!header?.startsWith('Bearer ')) return null;
  const payload = verifyToken(header.slice(7));
  return payload ? { userId: payload.sub, issuedMs: tokenIssuedMs(payload) } : null;
}

export function generateLinkingCode(): string {
  const digits = '0123456789';
  let code = '';
  const bytes = randomBytes(LINKING_CODE_LENGTH);
  for (let i = 0; i < LINKING_CODE_LENGTH; i++) {
    code += digits[bytes[i]! % 10];
  }
  return code;
}
