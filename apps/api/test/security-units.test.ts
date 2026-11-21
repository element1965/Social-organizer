import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'local-security-units-test-key';
});

const { clientIp } = await import('../src/services/rate-limit.service.js');
const { needAudience, chatLinkFor } = await import('../src/services/collection-view.js');
const { feedbackTelegramText } = await import('../src/routers/chat.router.js');
const { fetchAvatarImage, imageTypeOf, MAX_AVATAR_BYTES } = await import('../src/services/image-proxy.service.js');
const { tokenIssuedMs, issuedBeforeEmailProof, verifyToken, createAccessToken } = await import('../src/services/auth.service.js');

function req(remoteAddress: string, headers: Record<string, string | string[]> = {}) {
  return { socket: { remoteAddress }, headers } as unknown as Parameters<typeof clientIp>[0];
}

describe('client IP', () => {
  it('uses the last hop written by our proxy, not a value the client added', () => {
    expect(clientIp(req('100.64.0.9', { 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req('100.64.0.9', { 'x-real-ip': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req('100.64.0.9', { 'x-forwarded-for': '9.9.9.9, 203.0.113.8' }))).toBe('203.0.113.8');
    expect(clientIp(req('::ffff:10.1.2.3', { 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('ignores forwarding headers on a direct connection', () => {
    expect(clientIp(req('198.51.100.4', { 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }))).toBe('198.51.100.4');
    expect(clientIp(req('100.128.0.1', { 'x-real-ip': '1.2.3.4' }))).toBe('100.128.0.1');
  });
});

describe('Need audience', () => {
  const rows = [
    { userId: 'p1', unsubscribedAt: null, amount: 10 },
    { userId: 'p2', unsubscribedAt: null, amount: 20 },
    { userId: 'gone', unsubscribedAt: new Date(), amount: 30 },
  ];

  it('gives the author and every active participant all active rows with amounts', () => {
    for (const viewer of ['author', 'p1', 'p2']) {
      const view = needAudience(viewer, 'author', rows);
      expect(view.seesAmounts).toBe(true);
      expect(view.active.map((o) => o.userId)).toEqual(['p1', 'p2']);
    }
    expect(needAudience('p2', 'author', rows).own?.userId).toBe('p2');
  });

  it('gives others, including a person who declined, the people without amounts', () => {
    for (const viewer of ['stranger', 'gone']) {
      const view = needAudience(viewer, 'author', rows);
      expect(view.seesAmounts).toBe(false);
      expect(view.own).toBeUndefined();
      expect(view.active.map((o) => o.userId)).toEqual(['p1', 'p2']);
    }
  });
});

describe('chat link gate', () => {
  const cycleStart = new Date('2026-11-01T00:00:00Z');
  const need = {
    creatorId: 'author', status: 'ACTIVE', blockReason: null as string | null, type: 'EMERGENCY',
    cycleNumber: 1, currentCycleStart: null as Date | null, chatLink: 'https://t.me/chat',
  };
  const joined = { createdAt: new Date('2026-10-01T00:00:00Z') };

  it('opens for the author always and for an active participant of an open Need', () => {
    expect(chatLinkFor({ ...need, status: 'CLOSED' }, 'author', null, false)).toBe(need.chatLink);
    expect(chatLinkFor(need, 'p1', joined, false)).toBe(need.chatLink);
    // Goal reached (BLOCKED without a reason) keeps the chat, as the page does
    expect(chatLinkFor({ ...need, status: 'BLOCKED' }, 'p1', joined, false)).toBe(need.chatLink);
  });

  it('stays closed without a Participation, on a closed or held Need', () => {
    expect(chatLinkFor(need, 'stranger', null, false)).toBeNull();
    for (const status of ['CLOSED', 'CANCELLED']) expect(chatLinkFor({ ...need, status }, 'p1', joined, false)).toBeNull();
    expect(chatLinkFor({ ...need, status: 'BLOCKED', blockReason: 'SUSPECTED_FRAUD' }, 'p1', joined, false)).toBeNull();
    expect(chatLinkFor({ ...need, blockReason: 'COMMUNITY' }, 'p1', joined, false)).toBeNull();
  });

  it('waits for the confirmation of a renewed cycle', () => {
    const renewed = { ...need, type: 'REGULAR', cycleNumber: 2, currentCycleStart: cycleStart };
    expect(chatLinkFor(renewed, 'p1', joined, false)).toBeNull();
    expect(chatLinkFor(renewed, 'p1', joined, true)).toBe(need.chatLink);
    // Joined during this cycle: nothing to confirm
    expect(chatLinkFor(renewed, 'p1', { createdAt: new Date('2026-11-02T00:00:00Z') }, false)).toBe(need.chatLink);
  });
});

describe('sessions and the first mailbox proof', () => {
  it('judges tokens by their millisecond issue time, older tokens by their second', () => {
    expect(tokenIssuedMs({ iat: 1_700_000_000, iatMs: 1_700_000_000_456 })).toBe(1_700_000_000_456);
    expect(tokenIssuedMs({ iat: 1_700_000_000 })).toBe(1_700_000_000_000);
    const proof = new Date(1_700_000_000_400);
    expect(issuedBeforeEmailProof(1_700_000_000_399, proof)).toBe(true);
    expect(issuedBeforeEmailProof(1_700_000_000_400, proof)).toBe(false);
    // A token from before iatMs, issued in the same second as the proof: refused (the safe side)
    expect(issuedBeforeEmailProof(tokenIssuedMs({ iat: 1_700_000_000 }), proof)).toBe(true);
    expect(issuedBeforeEmailProof(0, null)).toBe(false);
  });

  it('puts the millisecond issue time into new tokens', () => {
    const before = Date.now();
    const payload = verifyToken(createAccessToken('u1'));
    expect(payload?.iatMs).toBeGreaterThanOrEqual(before);
    expect(Math.floor(payload!.iatMs! / 1000)).toBe(payload!.iat);
  });
});

describe('feedback copy for the team chat', () => {
  it('escapes every user value and carries no contacts', () => {
    const text = feedbackTelegramText('<a href="https://evil">Anna</a> & co', 'u<1>', '<b>click</b> <a href="x">here</a>');
    expect(text).not.toMatch(/<a |<b>click/);
    expect(text).toContain('&lt;a href="https://evil"&gt;Anna&lt;/a&gt; &amp; co');
    expect(text).toContain('u&lt;1&gt;');
    expect(text).toContain('&lt;b&gt;click&lt;/b&gt;');
    expect(text).toMatch(/support inbox: https?:\/\/\S+\/support/);
    expect(text).not.toMatch(/Email:|Phone:/);
  });
});

describe('avatar proxy fetch', () => {
  const image = (body: ConstructorParameters<typeof Response>[0], headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg', ...headers } });

  it('checks every redirect hop before requesting it', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).startsWith('https://t.me/')) {
        return new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest' } });
      }
      return image('secret');
    });
    const result = await fetchAvatarImage('https://t.me/i/userpic/320/a.jpg', fetchImpl as typeof fetch);
    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid redirect' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to another avatar host', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (String(url).startsWith('https://t.me/')
      ? new Response(null, { status: 301, headers: { location: 'https://cdn4.telesco.pe/file/a.jpg' } })
      : image('jpeg-bytes')));
    const result = await fetchAvatarImage('https://t.me/i/userpic/320/a.jpg', fetchImpl as typeof fetch);
    expect(result.ok && result.body.toString()).toBe('jpeg-bytes');
  });

  it('refuses a redirect without a target', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302 }));
    const result = await fetchAvatarImage('https://t.me/i/userpic/320/a.jpg', fetchImpl as typeof fetch);
    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid redirect' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('passes on exact image types only, with the matched type', async () => {
    expect(imageTypeOf('image/png; charset=binary')).toBe('image/png');
    expect(imageTypeOf('IMAGE/JPEG')).toBe('image/jpeg');
    for (const bad of ['image/gif-anything', 'image/svg+xml', 'image/pngx', 'text/html', '', null]) {
      expect(imageTypeOf(bad)).toBeNull();
    }
    const fetchImpl = (async () => image('x', { 'content-type': 'image/webp;foo=<script>' })) as typeof fetch;
    const result = await fetchAvatarImage('https://t.me/i/userpic/320/a.jpg', fetchImpl);
    expect(result.ok && result.contentType).toBe('image/webp');
    const svg = await fetchAvatarImage('https://t.me/a', (async () => image('<svg/>', { 'content-type': 'image/svg+xml' })) as typeof fetch);
    expect(svg).toEqual({ ok: false, status: 415, error: 'Not an image' });
  });

  it('stops reading a body over the cap', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (pulled > 50) controller.close();
      },
    });
    const result = await fetchAvatarImage('https://t.me/i/userpic/320/a.jpg', (async () => image(stream)) as typeof fetch);
    expect(result).toEqual({ ok: false, status: 413, error: 'Image too large' });
    expect(pulled).toBeLessThanOrEqual(MAX_AVATAR_BYTES / (1024 * 1024) + 2);
  });
});
