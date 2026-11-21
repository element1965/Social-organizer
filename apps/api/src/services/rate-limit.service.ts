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

/** True when the key already used up its limit in the current window (does not count an attempt). */
export function isLimited(key: string, max: number): boolean {
  const bucket = buckets.get(key);
  return !!bucket && bucket.resetAt > Date.now() && bucket.count >= max;
}

/** Gives back one attempt counted by hit() (an attempt that turned out legitimate). */
export function refund(key: string): void {
  const bucket = buckets.get(key);
  if (bucket && bucket.resetAt > Date.now() && bucket.count > 0) bucket.count -= 1;
}

/**
 * Addresses of our own proxy hop. On Railway the edge connects to the container from the private
 * 100.64.0.0/10 range (seen as the socket address in production logs); loopback covers local development.
 */
function isPrivateHop(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(v4);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = address.toLowerCase();
  return v6 === '::1' || /^f[cd][0-9a-f]{2}:/.test(v6);
}

/** The value appended last to a forwarding header: the one written by the nearest proxy, not by the client. */
function lastHop(header: string | string[] | undefined): string | null {
  const joined = Array.isArray(header) ? header.join(',') : header;
  const last = joined?.split(',').pop()?.trim();
  return last || null;
}

/**
 * Client IP for rate limits. Forwarding headers are trusted only when the TCP peer is our own proxy hop
 * (a private address); a direct connection is keyed by its socket address, whatever headers it sends.
 * Behind the proxy the rightmost entry is used: Railway's edge sets X-Real-IP to the address it saw, and if a
 * client-sent value were kept and appended to, the client's part would sit to the left. X-Forwarded-For is
 * the fallback for a proxy that only sets that header.
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const peer = req.socket.remoteAddress;
  if (isPrivateHop(peer)) {
    const forwarded = lastHop(req.headers['x-real-ip']) ?? lastHop(req.headers['x-forwarded-for']);
    if (forwarded) return forwarded;
  }
  return peer || 'unknown';
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
