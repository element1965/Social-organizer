/**
 * Fetch of an external profile photo for /api/image-proxy (t.me sends no CORS headers).
 * Only known avatar hosts, only images, size-capped: not an open proxy (SO-14).
 * Redirects are followed by hand, and every hop must pass the same host check before it is requested.
 * The body is read as a stream and dropped as soon as it passes the size cap.
 */

/** Avatar hosts the image proxy may fetch from: Telegram and Google profile photos. */
const AVATAR_HOSTS = [/^t\.me$/, /(^|\.)telegram\.org$/, /(^|\.)cdn-telegram\.org$/, /(^|\.)telegram-cdn\.org$/, /(^|\.)telesco\.pe$/, /(^|\.)googleusercontent\.com$/];
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
/** The only types passed on; the reply carries the matched type itself, never the upstream header. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** The MIME essence of a Content-Type header ("image/png; charset=x" → "image/png") if it is an allowed image type. */
export function imageTypeOf(header: string | null): (typeof IMAGE_TYPES)[number] | null {
  const essence = (header ?? '').split(';')[0]!.trim().toLowerCase();
  return IMAGE_TYPES.find((type) => type === essence) ?? null;
}

export function parseAvatarUrl(raw: string | null | undefined, base?: URL): URL | null {
  try {
    const u = new URL(raw ?? '', base);
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
    return AVATAR_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

export type AvatarFetchResult =
  | { ok: true; contentType: string; body: Buffer }
  | { ok: false; status: number; error: string };

async function readCapped(response: Response, max: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function fetchAvatarImage(raw: string | undefined, fetchImpl: typeof fetch = fetch): Promise<AvatarFetchResult> {
  const first = parseAvatarUrl(raw);
  if (!first) return { ok: false, status: 400, error: 'Invalid URL' };
  let target: URL = first;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; ; hop++) {
    const response = await fetchImpl(target, { signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      // A redirect without a target would resolve to the same URL and loop until the hop limit
      const location = response.headers.get('location')?.trim();
      const next: URL | null = location ? parseAvatarUrl(location, target) : null;
      if (!next || hop >= MAX_REDIRECTS) return { ok: false, status: 400, error: 'Invalid redirect' };
      target = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, status: response.status, error: 'Upstream error' };
    }
    const contentType = imageTypeOf(response.headers.get('content-type'));
    if (!contentType) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, status: 415, error: 'Not an image' };
    }
    const body = await readCapped(response, MAX_AVATAR_BYTES);
    if (!body) return { ok: false, status: 413, error: 'Image too large' };
    return { ok: true, contentType, body };
  }
}
