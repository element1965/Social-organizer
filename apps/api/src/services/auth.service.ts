import { randomBytes, createHmac } from 'crypto';
import {
  JWT_ACCESS_TTL_MINUTES,
  JWT_REFRESH_TTL_DAYS,
  LINKING_CODE_LENGTH,
} from '@so/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

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

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (sig !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body!, 'base64url').toString()) as JwtPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
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
