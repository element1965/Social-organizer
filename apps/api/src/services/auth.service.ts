import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import {
  JWT_ACCESS_TTL_MINUTES,
  JWT_REFRESH_TTL_DAYS,
  LINKING_CODE_LENGTH,
} from '@so/shared';

// No fallback: a known default secret would let anyone sign tokens (SO-14).
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 16) {
  throw new Error('JWT_SECRET is not set (or shorter than 16 chars) — refusing to start');
}

interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  iat: number;
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

export function createAccessToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    sub: userId,
    type: 'access',
    iat: now,
    exp: now + JWT_ACCESS_TTL_MINUTES * 60,
  });
}

export function createRefreshToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    sub: userId,
    type: 'refresh',
    iat: now,
    exp: now + JWT_REFRESH_TTL_DAYS * 24 * 60 * 60,
  });
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
    if (!(payload.exp > Math.floor(Date.now() / 1000))) return null;

    return payload;
  } catch {
    return null;
  }
}

/** userId from an `Authorization: Bearer <access token>` header, or null if missing/invalid. */
export function userIdFromAuthHeader(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7))?.sub ?? null;
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
