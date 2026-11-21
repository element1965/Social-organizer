import type { Server, IncomingMessage } from 'http';
import { getDb, type PrismaClient } from '@so/db';
import { verifyToken, tokenIssuedMs } from './services/auth.service.js';
import { isActiveAccount } from './services/active-account.js';

/**
 * Gun.js relay for graph backups (SO-14).
 *
 * - The WebSocket handshake needs a valid access token (`/gun?token=<jwt>`) of an account that still exists,
 *   is not deleted and was issued after the account's first mailbox proof, otherwise it is refused.
 * - Each connection only sees and writes its own backup node `so-backup/<userId>`
 *   (plus its own link inside the `so-backup` root), in both directions.
 * - Every message is rebuilt from an allowlist before Gun sees it (SEC-2): only the envelope fields Gun's mesh
 *   reads (gun/src/mesh.js), only scalar or soul-link values with a numeric state in the caller's own nodes,
 *   never a `__proto__` / `constructor` / `prototype` key. Anything else is dropped, never thrown: the relay
 *   runs inside the API process.
 * - Incoming messages reach Gun as parsed objects, one at a time, inside the listener's try/catch. Gun then
 *   handles each synchronously (mesh.hear → hear.one); a raw string would go through Gun's own deferred
 *   parser and batch loop (YSON, setTimeout.turn), outside any catch of ours.
 */

const ROOT = 'so-backup';

type GunMsg = Record<string, unknown>;
type GunNode = Record<string, unknown> & { _: { '#': string; '>': Record<string, number> } };

/**
 * Largest wire frame the relay accepts from a client, in characters (ws enforces the same bound in bytes
 * before buffering). The biggest real frame is one backup put from @so/gun-backup: at most 600 nodes
 * (id, 200-character name, 512-character photo link, depth, count) and 1500 edges, stored as JSON strings
 * inside the Gun put, plus the nicknames of direct connections. The worst case, with 3-byte characters in
 * every name and JSON escaping, is about 1.3 MB; 4 MiB leaves room for Gun's batching and metadata.
 */
export const MAX_GUN_FRAME = 4 * 1024 * 1024;
/** Messages in one batch frame. Gun batches its own acks; a client batch is a handful of puts and gets. */
export const MAX_GUN_BATCH = 64;
/** Keys in one node. A backup node has five (userId, syncedAt, nodesJson, edgesJson, nicknamesJson). */
const MAX_NODE_KEYS = 32;
/** Souls in one graph put: the caller's node and the root link. */
const MAX_PUT_SOULS = 8;

/**
 * Work bounds for what a client sends. What the relay's own Gun sends is filtered by the same rules without
 * them: its batches and its root node may be large, and dropping them would lose the caller's own data.
 */
interface Bounds { batch: number; souls: number; keys: number }
const CLIENT_BOUNDS: Bounds = { batch: MAX_GUN_BATCH, souls: MAX_PUT_SOULS, keys: MAX_NODE_KEYS };
const RELAY_BOUNDS: Bounds = { batch: Infinity, souls: Infinity, keys: Infinity };
const MAX_ID = 128;
const MAX_KEY = 256;
/** A state far in the future makes Gun hold the write in a timer until then: a day of clock skew is plenty. */
const MAX_STATE_AHEAD_MS = 24 * 60 * 60 * 1000;

/** Keys that change an object's prototype or shadow its constructor when assigned: never copied. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeKey(key: unknown, max = MAX_KEY): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= max && !UNSAFE_KEYS.has(key);
}

function shortText(value: unknown, max = MAX_ID): value is string {
  return typeof value === 'string' && value.length <= max && !UNSAFE_KEYS.has(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validState(value: unknown): value is number {
  return finiteNumber(value) && value <= Date.now() + MAX_STATE_AHEAD_MS;
}

/** A Gun value: null, text, boolean, finite number, or a link `{ '#': soul }` (gun/src/valid.js). Rebuilt. */
function cleanValue(value: unknown): { ok: true; value: unknown } | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { ok: true, value };
  if (finiteNumber(value)) return { ok: true, value };
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '#' && safeKey(value['#'])) return { ok: true, value: { '#': value['#'] } };
  }
  return null;
}

function tokenFromUrl(url: string | undefined): string | null {
  try {
    return new URL(url ?? '', 'http://relay').searchParams.get('token');
  } catch {
    return null;
  }
}

/** The states map of a node's metadata, or null when the metadata is not Gun's `{ '#': soul, '>': {...} }`. */
function statesOf(node: Record<string, unknown>, soul: string): Record<string, unknown> | null {
  const meta = node._;
  if (!isPlainObject(meta) || meta['#'] !== soul || !isPlainObject(meta['>'])) return null;
  return meta['>'];
}

/** The caller's own node: every safe key with a valid value and state, rebuilt; null if nothing is left. */
function cleanOwnNode(soul: string, node: Record<string, unknown>, bounds: Bounds): GunNode | null {
  const states = statesOf(node, soul);
  if (!states) return null;
  const out: GunNode = { _: { '#': soul, '>': {} } };
  let kept = 0;
  for (const key of Object.keys(node)) {
    if (key === '_') continue;
    if (++kept > bounds.keys) return null;
    if (!safeKey(key)) continue;
    const value = cleanValue(node[key]);
    const state = states[key];
    if (!value || !validState(state)) continue;
    out[key] = value.value;
    out._['>'][key] = state;
  }
  return Object.keys(out).length > 1 ? out : null;
}

/** The shared root: only the caller's own link (or its removal), nothing else. */
function cleanRootNode(node: Record<string, unknown>, userId: string): GunNode | null {
  if (!Object.prototype.hasOwnProperty.call(node, userId)) return null;
  const states = statesOf(node, ROOT);
  const state = states?.[userId];
  if (!validState(state)) return null;
  const value = node[userId];
  const own = `${ROOT}/${userId}`;
  const link = value === null ? null : cleanValue(value);
  if (value !== null && !(link && isPlainObject(link.value) && link.value['#'] === own)) return null;
  return { _: { '#': ROOT, '>': { [userId]: state } }, [userId]: value === null ? null : { '#': own } };
}

/** Keeps only the parts of a graph-format put this user may touch; null if nothing is left. */
function filterGraph(graph: Record<string, unknown>, userId: string, bounds: Bounds): Record<string, GunNode> | null {
  const own = `${ROOT}/${userId}`;
  const souls = Object.keys(graph);
  if (souls.length > bounds.souls) return null;
  const out: Record<string, GunNode> = {};
  for (const soul of souls) {
    const node = graph[soul];
    // A node of any other JSON type is malformed: it is never inspected and never passed on
    if (!isPlainObject(node)) continue;
    const cleaned = soul === own ? cleanOwnNode(soul, node, bounds) : soul === ROOT ? cleanRootNode(node, userId) : null;
    if (cleaned) out[soul] = cleaned;
  }
  return Object.keys(out).length ? out : null;
}

function allowedKey(soul: unknown, key: unknown, userId: string): boolean {
  if (soul === `${ROOT}/${userId}`) return safeKey(key);
  return soul === ROOT && key === userId;
}

/** Single-key put `{ '#': soul, '.': key, ':': value, '>': state }`, rebuilt; null if not allowed. */
function filterSingle(put: Record<string, unknown>, userId: string): Record<string, unknown> | null {
  if (!allowedKey(put['#'], put['.'], userId)) return null;
  const value = cleanValue(put[':']);
  if (!value || !validState(put['>'])) return null;
  return { '#': put['#'], '.': put['.'], ':': value.value, '>': put['>'] };
}

function filterGet(get: Record<string, unknown>, userId: string): Record<string, unknown> | null {
  const soul = get['#'];
  const key = get['.'];
  if (soul === `${ROOT}/${userId}`) {
    if (key === undefined) return { '#': soul };
    return safeKey(key) ? { '#': soul, '.': key } : null;
  }
  return soul === ROOT && key === userId ? { '#': ROOT, '.': userId } : null;
}

/**
 * Rebuilds one message from the fields Gun's mesh reads. Unknown envelope fields are dropped; a known field
 * with a value of the wrong shape drops the whole message. DAM messages other than the peer handshake ('?')
 * are refused: 'mob' would make the relay disconnect and dial a peer URL the client chose.
 */
function filterMsg(msg: GunMsg, userId: string, bounds: Bounds): GunMsg | null {
  const out: GunMsg = {};
  for (const field of ['#', '@', 'pid'] as const) {
    if (!(field in msg)) continue;
    if (!shortText(msg[field])) return null;
    out[field] = msg[field];
  }
  if ('##' in msg) {
    const hash = msg['##'];
    if (!(finiteNumber(hash) || shortText(hash))) return null;
    out['##'] = hash;
  }
  if ('><' in msg) {
    if (!shortText(msg['><'], 1000)) return null;
    out['><'] = msg['><'];
  }
  if ('err' in msg) {
    if (!shortText(msg.err, 1000)) return null;
    out.err = msg.err;
  }
  if ('ok' in msg) {
    const ok = msg.ok;
    // Gun acks a stored put with `ok: true`; relayed puts carry `{ '@': hops, '/': peers }`
    if (finiteNumber(ok) || typeof ok === 'boolean') out.ok = ok;
    else if (isPlainObject(ok) && (ok['@'] === undefined || finiteNumber(ok['@'])) && (ok['/'] === undefined || finiteNumber(ok['/']))) {
      out.ok = { ...(ok['@'] !== undefined ? { '@': ok['@'] } : {}), ...(ok['/'] !== undefined ? { '/': ok['/'] } : {}) };
    } else return null;
  }
  if ('dam' in msg) {
    if (msg.dam !== '?') return null;
    out.dam = '?';
  }
  // null carries no data (Gun's acks); any other value that is not an object is malformed
  if ('put' in msg) {
    if (msg.put === null) {
      out.put = null;
    } else {
      if (!isPlainObject(msg.put)) return null;
      const put = typeof msg.put['#'] === 'string' ? filterSingle(msg.put, userId) : filterGraph(msg.put, userId, bounds);
      if (!put) return null;
      out.put = put;
    }
  }
  if ('get' in msg && msg.get !== null) {
    if (!isPlainObject(msg.get)) return null;
    const get = filterGet(msg.get, userId);
    if (!get) return null;
    out.get = get;
  }
  return Object.keys(out).length ? out : null;
}

function parseFrame(raw: string, userId: string, maxLength: number, bounds: Bounds): { msgs: GunMsg[]; batch: boolean } | null {
  try {
    if (typeof raw !== 'string' || raw.length > maxLength) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (!parsed.length) return { msgs: [], batch: true }; // heartbeat
      if (parsed.length > bounds.batch) return null;
      const kept: GunMsg[] = [];
      for (const m of parsed) {
        // A batch holds message objects only; a nested array or a scalar is malformed
        if (!isPlainObject(m)) continue;
        const msg = filterMsg(m, userId, bounds);
        if (msg) kept.push(msg);
      }
      return kept.length ? { msgs: kept, batch: true } : null;
    }
    if (!isPlainObject(parsed)) return null;
    const msg = filterMsg(parsed, userId, bounds);
    return msg ? { msgs: [msg], batch: false } : null;
  } catch {
    return null;
  }
}

/**
 * Parses and filters one raw wire frame (object or batch array) into the messages this user may pass on.
 * Returns null to drop the frame; an empty array for a heartbeat (`[]`).
 * Never throws: anything unexpected drops the frame (fail closed).
 */
export function acceptGunFrame(raw: string, userId: string, maxLength = Infinity): GunMsg[] | null {
  return parseFrame(raw, userId, maxLength, CLIENT_BOUNDS)?.msgs ?? null;
}

/**
 * The same filter, back as a wire frame in the shape it came: null to drop it. Used for what the relay sends
 * (`fromClient` false: no work bounds, see RELAY_BOUNDS).
 */
export function filterGunFrame(raw: string, userId: string, maxLength = Infinity, fromClient = true): string | null {
  const frame = parseFrame(raw, userId, maxLength, fromClient ? CLIENT_BOUNDS : RELAY_BOUNDS);
  if (!frame) return null;
  try {
    return frame.batch ? JSON.stringify(frame.msgs) : JSON.stringify(frame.msgs[0]);
  } catch {
    return null;
  }
}

interface Wire {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  send: (data: string, ...rest: unknown[]) => void;
}

type VerifyInfo = { req: IncomingMessage & { soUserId?: string } };

/**
 * Hands one client frame to Gun's message listener: each accepted message as an object, synchronously, so
 * any exception in Gun's handling of it is caught here. A heartbeat is passed on as it came.
 */
export function deliverGunFrame(data: unknown, userId: string, listener: (msg: unknown) => void): void {
  let msgs: GunMsg[] | null;
  try {
    msgs = acceptGunFrame(typeof data === 'string' ? data : String(data), userId, MAX_GUN_FRAME);
  } catch {
    return;
  }
  if (!msgs) return;
  if (!msgs.length) {
    try {
      listener('[]');
    } catch (err) {
      console.warn('[gun-relay] heartbeat failed in Gun:', (err as Error)?.message);
    }
    return;
  }
  for (const msg of msgs) {
    try {
      listener(msg);
    } catch (err) {
      console.warn('[gun-relay] dropped a message that failed in Gun:', (err as Error)?.message);
    }
  }
}

/** `file` is Gun's storage folder (a temporary one in tests); `db` is where the handshake checks the account. */
export async function startGunRelay(
  server: Server,
  { file = 'gun-data', db = getDb() }: { file?: string; db?: PrismaClient } = {},
): Promise<void> {
  const Gun = (await import('gun')).default;
  const gun = Gun({
    web: server,
    file,
    // The checked WebSocket below is the relay's only way in. Gun's server build otherwise joins a UDP
    // multicast group (lib/multicast.js) and hands every datagram straight to the mesh, past the token
    // check and the account filter.
    multicast: false,
    // lib/stats.js keeps a file inside node_modules/gun, shared by every relay with the same storage
    // folder name, and AXE re-dials the peer URLs it finds there on start. Nothing here reads the stats.
    stats: false,
    ws: {
      // ws closes a connection whose frame is larger than this, before buffering it
      maxPayload: MAX_GUN_FRAME,
      // Two parameters: ws waits for the callback, so the account can be checked (SEC-8)
      verifyClient: (info: VerifyInfo, done: (ok: boolean, code?: number) => void) => {
        const payload = verifyToken(tokenFromUrl(info.req.url) ?? '');
        if (!payload) {
          done(false, 401);
          return;
        }
        isActiveAccount(db, payload.sub, tokenIssuedMs(payload)).then((active) => {
          if (!active) {
            done(false, 401);
            return;
          }
          info.req.soUserId = payload.sub;
          done(true);
        }, (err: unknown) => {
          console.error('[gun-relay] account check failed:', err);
          done(false, 503);
        });
      },
    },
  } as never) as unknown as { _: { opt: { ws: { web: NodeJS.EventEmitter } } } };

  // Runs before Gun's own 'connection' handler, so Gun only ever sees filtered messages.
  gun._.opt.ws.web.prependListener('connection', (wire: Wire, req: IncomingMessage & { soUserId?: string }) => {
    const userId = req.soUserId;
    if (!userId) return;

    const origOn = wire.on.bind(wire);
    wire.on = (event, listener) => {
      if (event !== 'message') return origOn(event, listener);
      return origOn('message', (data: unknown) => deliverGunFrame(data, userId, listener));
    };

    const origSend = wire.send.bind(wire);
    wire.send = (data, ...rest) => {
      try {
        const kept = filterGunFrame(String(data), userId, Infinity, false);
        if (kept !== null) origSend(kept, ...rest);
      } catch (err) {
        console.warn('[gun-relay] dropped an outgoing frame:', (err as Error)?.message);
      }
    };
  });
}
