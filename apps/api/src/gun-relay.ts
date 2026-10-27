import type { Server, IncomingMessage } from 'http';
import { verifyToken } from './services/auth.service.js';

/**
 * Gun.js relay for graph backups (SO-14).
 *
 * - The WebSocket handshake needs a valid access token (`/gun?token=<jwt>`), otherwise it is refused.
 * - Each connection only sees and writes its own backup node `so-backup/<userId>`
 *   (plus its own link inside the `so-backup` root), in both directions.
 */

const ROOT = 'so-backup';

type GunMsg = Record<string, unknown>;
type GunNode = Record<string, unknown> & { _?: { '#'?: string; '>'?: Record<string, number> } };

function tokenFromUrl(url: string | undefined): string | null {
  try {
    return new URL(url ?? '', 'http://relay').searchParams.get('token');
  } catch {
    return null;
  }
}

/** Keeps only the parts of a graph-format put this user may touch; null if nothing is left. */
function filterGraph(graph: Record<string, GunNode>, userId: string): Record<string, GunNode> | null {
  const own = `${ROOT}/${userId}`;
  const out: Record<string, GunNode> = {};
  for (const [soul, node] of Object.entries(graph)) {
    if (soul === own) {
      out[soul] = node;
    } else if (soul === ROOT && node && userId in node) {
      const state = node._?.['>']?.[userId];
      out[soul] = {
        _: { '#': ROOT, '>': state === undefined ? {} : { [userId]: state } },
        [userId]: node[userId],
      };
    }
  }
  return Object.keys(out).length ? out : null;
}

function allowedKey(soul: unknown, key: unknown, userId: string): boolean {
  if (soul === `${ROOT}/${userId}`) return true;
  return soul === ROOT && key === userId;
}

function filterMsg(msg: GunMsg, userId: string): GunMsg | null {
  if (msg.put && typeof msg.put === 'object') {
    const put = msg.put as Record<string, unknown>;
    if (typeof put['#'] === 'string') {
      // Single-key format: { '#': soul, '.': key, ':': value, '>': state }
      if (!allowedKey(put['#'], put['.'], userId)) return null;
    } else {
      const graph = filterGraph(put as Record<string, GunNode>, userId);
      if (!graph) return null;
      msg = { ...msg, put: graph };
    }
  }
  if (msg.get && typeof msg.get === 'object') {
    const get = msg.get as Record<string, unknown>;
    const soul = get['#'];
    if (soul !== `${ROOT}/${userId}` && !(soul === ROOT && get['.'] === userId)) return null;
  }
  return msg;
}

/** Filters one raw wire frame (object or batch array). Returns null to drop it. */
export function filterGunFrame(raw: string, userId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    if (!parsed.length) return raw; // heartbeat
    const kept = parsed
      .filter((m): m is GunMsg => !!m && typeof m === 'object')
      .map((m) => filterMsg(m, userId))
      .filter((m): m is GunMsg => m !== null);
    return kept.length ? JSON.stringify(kept) : null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const msg = filterMsg(parsed as GunMsg, userId);
  return msg ? JSON.stringify(msg) : null;
}

interface Wire {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  send: (data: string, ...rest: unknown[]) => void;
}

export async function startGunRelay(server: Server): Promise<void> {
  const Gun = (await import('gun')).default;
  const gun = Gun({
    web: server,
    file: 'gun-data',
    ws: {
      verifyClient: (info: { req: IncomingMessage & { soUserId?: string } }) => {
        const payload = verifyToken(tokenFromUrl(info.req.url) ?? '');
        if (!payload) return false;
        info.req.soUserId = payload.sub;
        return true;
      },
    },
  } as never) as unknown as { _: { opt: { ws: { web: NodeJS.EventEmitter } } } };

  // Runs before Gun's own 'connection' handler, so Gun only ever sees filtered frames.
  gun._.opt.ws.web.prependListener('connection', (wire: Wire, req: IncomingMessage & { soUserId?: string }) => {
    const userId = req.soUserId;
    if (!userId) return;

    const origOn = wire.on.bind(wire);
    wire.on = (event, listener) => {
      if (event !== 'message') return origOn(event, listener);
      return origOn('message', (data: unknown) => {
        const raw = typeof data === 'string' ? data : String(data);
        const kept = filterGunFrame(raw, userId);
        if (kept !== null) listener(kept);
      });
    };

    const origSend = wire.send.bind(wire);
    wire.send = (data, ...rest) => {
      const kept = filterGunFrame(String(data), userId);
      if (kept !== null) origSend(kept, ...rest);
    };
  });
}
