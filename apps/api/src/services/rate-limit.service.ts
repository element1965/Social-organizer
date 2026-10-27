import type { IncomingMessage } from 'http';

/**
 * Small in-memory fixed-window rate limiter (single API instance on Railway).
 * hit() counts one attempt and returns false once the key is over its limit.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 50_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/** Client IP: Railway's edge puts it into X-Real-IP; fall back to the socket address. */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const real = req.headers['x-real-ip'];
  const value = Array.isArray(real) ? real[0] : real;
  return value?.trim() || req.socket.remoteAddress || 'unknown';
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
