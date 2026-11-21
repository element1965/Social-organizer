import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'local-gun-relay-live-test-key';
});

// The handshake's account check needs a database; here every signed token belongs to an active account
vi.mock('../src/services/active-account.js', () => ({ isActiveAccount: async () => true }));

const { startGunRelay } = await import('../src/gun-relay.js');
const { createAccessToken } = await import('../src/services/auth.service.js');

// The ws client Gun itself depends on
const requireHere = createRequire(import.meta.url);
interface WsClient {
  on(event: 'message', listener: (data: unknown) => void): void;
  once(event: 'open' | 'error', listener: (err?: unknown) => void): void;
  send(data: string): void;
  close(): void;
}
const WebSocket = createRequire(requireHere.resolve('gun'))('ws') as new (url: string) => WsClient;

type Msg = Record<string, unknown>;

let server: Server;
let dir: string;
let port: number;
// Every TCP socket, recorded when it connects: closeAllConnections() skips upgraded (WebSocket) ones
const sockets = new Set<Socket>();
// Gun loads dgram through CommonJS; this is the same module object, so the wrapper sees any UDP socket it opens
const dgram = requireHere('node:dgram') as { createSocket: (...args: unknown[]) => unknown };
const udpSocketCalls: unknown[][] = [];
const createSocket = dgram.createSocket;
dgram.createSocket = (...args: unknown[]) => {
  udpSocketCalls.push(args);
  return createSocket.apply(dgram, args);
};

beforeAll(async () => {
  // A storage folder of its own, with a unique name, so no other relay's data or state is read
  dir = mkdtempSync(join(tmpdir(), 'so-gun-'));
  server = createServer();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await startGunRelay(server, { file: join(dir, `data-${process.pid}-${Date.now()}`) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
}, 30_000);

afterAll(async () => {
  dgram.createSocket = createSocket;
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

/** A signed-in socket that collects every message the relay sends it (batches unpacked). */
async function connect(userId: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/gun?token=${createAccessToken(userId)}`);
  const inbox: Msg[] = [];
  ws.on('message', (data) => {
    const parsed = JSON.parse(String(data)) as Msg | Msg[];
    for (const m of Array.isArray(parsed) ? parsed : [parsed]) inbox.push(m);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return {
    inbox,
    send: (frame: unknown) => ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame)),
    close: () => ws.close(),
  };
}

async function waitFor<T>(find: () => T | undefined, ms = 3000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const found = find();
    if (found !== undefined) return found;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const reply = (inbox: Msg[], id: string) => () => inbox.find((m) => m['@'] === id);

describe('Gun relay (real Gun over a socket)', () => {
  it('opens no transport besides the checked WebSocket', async () => {
    // Gun's multicast module binds its UDP socket while Gun starts; give it a moment
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(udpSocketCalls).toEqual([]);
  });

  it('survives hostile frames, keeps backups working and keeps accounts apart', async () => {
    const a = await connect('user-a');
    const own = 'so-backup/user-a';

    // Frames that used to reach Gun's parser or deferred batch loop: none of them may take the process down
    const hostile = [
      'not json',
      '{"put":{"so-backup":7}}',
      '[{"put":5},[1],null,"x"]',
      '{"dam":"mob","peers":{"ws://127.0.0.1:1/gun":1}}',
      `{"#":"h1","put":{"${own}":{"_":{"#":"${own}","__proto__":{"x":1},">":{"__proto__":1,"a":"x"}},"__proto__":{"polluted":1},"a":{"deep":{"x":1}}}}}`,
      JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ '#': `h-batch-${i}`, put: { [own]: { _: { '#': own }, x: [i] } } }))),
      JSON.stringify({ get: { '#': own, '.': { $ne: 1 } } }),
    ];
    for (const frame of hostile) a.send(frame);

    // A real backup put (graph form, root link + own node) is stored and acknowledged
    const state = Date.now();
    a.send({
      '#': 'put-1',
      put: {
        'so-backup': { _: { '#': 'so-backup', '>': { 'user-a': state } }, 'user-a': { '#': own } },
        [own]: { _: { '#': own, '>': { nodesJson: state, syncedAt: state } }, nodesJson: '[{"id":"x"}]', syncedAt: 'now' },
      },
    });
    const ack = await waitFor(reply(a.inbox, 'put-1'));
    expect(ack.err).toBeUndefined();
    expect(ack.ok).toBe(true);

    // Another device of the same account reads it back
    const a2 = await connect('user-a');
    a2.send({ '#': 'get-1', get: { '#': own } });
    const got = await waitFor(() => a2.inbox.find((m) => m['@'] === 'get-1' && m.put));
    const node = (got.put as Record<string, Msg>)[own]!;
    expect(node.nodesJson).toBe('[{"id":"x"}]');
    expect(({} as Msg).polluted).toBeUndefined();

    // Another account never sees it, whichever way it asks
    const b = await connect('user-b');
    b.send({ '#': 'get-b1', get: { '#': own } });
    b.send({ '#': 'get-b2', get: { '#': 'so-backup', '.': 'user-a' } });
    b.send({ '#': 'get-b3', get: { '#': 'so-backup' } });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(JSON.stringify(b.inbox)).not.toContain('nodesJson');

    // The relay still answers after all of the above
    a2.send({ '#': 'get-2', get: { '#': own, '.': 'nodesJson' } });
    await waitFor(() => a2.inbox.find((m) => m['@'] === 'get-2'));

    for (const socket of [a, a2, b]) socket.close();
  }, 20_000);
});
