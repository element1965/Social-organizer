import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'local-gun-relay-test-key';
});

const { filterGunFrame, acceptGunFrame, deliverGunFrame, MAX_GUN_FRAME, MAX_GUN_BATCH } = await import('../src/gun-relay.js');

const me = 'user-a';
const own = `so-backup/${me}`;
const frame = (value: unknown) => JSON.stringify(value);
const parsed = (raw: string | null) => (raw === null ? null : JSON.parse(raw));

describe('Gun frame filter', () => {
  it('drops malformed frames without throwing', () => {
    const malformed = [
      'not json',
      '',
      '42',
      '"text"',
      'null',
      'true',
      frame({ put: { 'so-backup': 7 } }),
      frame({ put: { 'so-backup': 'user-a' } }),
      frame({ put: { 'so-backup': [me] } }),
      frame({ put: { [own]: 'string node' } }),
      frame({ put: { [own]: null } }),
      frame({ put: 'packed string' }),
      frame({ put: 5 }),
      frame({ get: 'so-backup' }),
      frame({ get: [own] }),
      frame([[{ put: { 'so-backup/user-b': { x: 1 } } }]]),
      frame([1, 'two', null, [own]]),
    ];
    for (const raw of malformed) {
      expect(() => filterGunFrame(raw, me)).not.toThrow();
      expect(filterGunFrame(raw, me), raw).toBeNull();
    }
  });

  it('survives a hostile root node in a batch and keeps the valid parts', () => {
    const raw = frame([
      { put: { 'so-backup': 1 } },
      { put: { [own]: { _: { '#': own, '>': { nodesJson: 5 } }, nodesJson: '[]' } } },
    ]);
    expect(parsed(filterGunFrame(raw, me))).toEqual([{ put: { [own]: { _: { '#': own, '>': { nodesJson: 5 } }, nodesJson: '[]' } } }]);
  });

  it('reduces the shared root to the caller’s own link', () => {
    const raw = frame({
      put: {
        'so-backup': {
          _: { '#': 'so-backup', '>': { [me]: 3, 'user-b': 3 } },
          [me]: { '#': own },
          'user-b': { '#': 'so-backup/user-b' },
        },
        'so-backup/user-b': { _: { '#': 'so-backup/user-b', '>': { secret: 1 } }, secret: 1 },
      },
    });
    expect(parsed(filterGunFrame(raw, me))).toEqual({
      put: { 'so-backup': { _: { '#': 'so-backup', '>': { [me]: 3 } }, [me]: { '#': own } } },
    });
  });

  it('drops nodes whose metadata Gun would refuse and root links that point elsewhere', () => {
    const cases = [
      { 'so-backup': { _: 'broken meta', [me]: { '#': own } } },
      { 'so-backup': { _: { '#': 'so-backup', '>': {} }, [me]: { '#': own } } },
      { 'so-backup': { _: { '#': 'so-backup', '>': { [me]: 1 } }, [me]: { '#': 'so-backup/user-b' } } },
      { 'so-backup': { _: { '#': 'so-backup', '>': { [me]: 1 } }, [me]: 'text' } },
      { [own]: { _: { '#': 'so-backup/other', '>': { a: 1 } }, a: 1 } },
      { [own]: { _: { '#': own, '>': { a: 'not a number' } }, a: 1 } },
      { [own]: { _: { '#': own, '>': { a: Date.now() + 10 * 24 * 3600 * 1000 } }, a: 1 } },
    ];
    for (const put of cases) expect(filterGunFrame(frame({ put }), me), JSON.stringify(put)).toBeNull();
  });

  it('keeps only scalar and link values in the caller’s node and never an unsafe key', () => {
    const raw = `{"#":"m1","put":{"${own}":{"_":{"#":"${own}","__proto__":{"x":1},">":{"ok":1,"obj":1,"arr":1,"__proto__":1,"constructor":1,"link":1,"n":1,"b":1,"nil":1}},`
      + `"ok":"text","obj":{"a":1},"arr":[1],"__proto__":{"polluted":true},"constructor":"x","link":{"#":"${own}"},"n":2.5,"b":false,"nil":null}}}`;
    const msgs = acceptGunFrame(raw, me);
    expect(msgs).toHaveLength(1);
    const node = (msgs![0]!.put as Record<string, Record<string, unknown>>)[own]!;
    expect(Object.keys(node).sort()).toEqual(['_', 'b', 'link', 'n', 'nil', 'ok']);
    expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
    expect(node._).toEqual({ '#': own, '>': { ok: 1, link: 1, n: 1, b: 1, nil: 1 } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('passes only the envelope fields Gun’s mesh reads, and refuses DAM other than the handshake', () => {
    const msgs = acceptGunFrame(frame({
      '#': 'm2', '@': 'm1', '##': 123, '><': 'a,b', ok: { '@': 1, '/': 2 }, err: 'x',
      get: { '#': own, '.': 'nodesJson', '%': 99 }, DBG: { x: 1 }, data: 'shadow', mob: 1, peers: { 'ws://internal': 1 },
    }), me);
    expect(msgs).toEqual([{ '#': 'm2', '@': 'm1', '##': 123, '><': 'a,b', ok: { '@': 1, '/': 2 }, err: 'x', get: { '#': own, '.': 'nodesJson' } }]);
    expect(acceptGunFrame(frame({ dam: '?', pid: 'p1' }), me)).toEqual([{ dam: '?', pid: 'p1' }]);
    // Gun's ack of a stored put
    expect(acceptGunFrame(frame({ '#': 'a1', '@': 'put-1', ok: true }), me)).toEqual([{ '#': 'a1', '@': 'put-1', ok: true }]);
    // 'mob' would make the relay drop the socket and dial a peer of the client's choosing
    expect(acceptGunFrame(frame({ dam: 'mob', peers: { 'ws://10.0.0.1:1/gun': 1 } }), me)).toBeNull();
    expect(acceptGunFrame(frame({ dam: '!', err: 'x' }), me)).toBeNull();
    // A known field with the wrong shape drops the whole message
    expect(acceptGunFrame(frame({ '#': { nested: 1 }, get: { '#': own } }), me)).toBeNull();
    expect(acceptGunFrame(frame({ '#': '__proto__', get: { '#': own } }), me)).toBeNull();
    expect(acceptGunFrame(frame({ ok: 'yes' }), me)).toBeNull();
  });

  it('refuses an over-long batch', () => {
    const one = { get: { '#': own } };
    expect(acceptGunFrame(frame(Array.from({ length: MAX_GUN_BATCH }, () => one)), me)).toHaveLength(MAX_GUN_BATCH);
    expect(acceptGunFrame(frame(Array.from({ length: MAX_GUN_BATCH + 1 }, () => one)), me)).toBeNull();
    // The relay's own output is not bounded: a long batch of Gun's still reaches the caller
    const out = filterGunFrame(frame(Array.from({ length: MAX_GUN_BATCH + 10 }, () => one)), me, Infinity, false);
    expect(parsed(out)).toHaveLength(MAX_GUN_BATCH + 10);
  });

  it('keeps heartbeats, own puts in both formats, own gets and null acks', () => {
    expect(filterGunFrame('[]', me)).toBe('[]');
    const single = frame({ put: { '#': own, '.': 'nodesJson', ':': '[]', '>': 1 } });
    expect(parsed(filterGunFrame(single, me))).toEqual(JSON.parse(single));
    expect(filterGunFrame(frame({ put: { '#': own, '.': 'nodesJson', ':': { a: 1 }, '>': 1 } }), me)).toBeNull();
    expect(filterGunFrame(frame({ put: { '#': own, '.': '__proto__', ':': 1, '>': 1 } }), me)).toBeNull();
    const graph = frame({ '#': 'g1', put: { [own]: { _: { '#': own, '>': { syncedAt: 2 } }, syncedAt: 'now' } } });
    expect(parsed(filterGunFrame(graph, me))).toEqual(JSON.parse(graph));
    const batch = frame([{ '#': 'b1', get: { '#': own } }, { '#': 'b2', '@': 'x', put: null }, { get: { '#': 'so-backup/user-b' } }]);
    expect(parsed(filterGunFrame(batch, me))).toEqual([{ '#': 'b1', get: { '#': own } }, { '#': 'b2', '@': 'x', put: null }]);
    expect(filterGunFrame(frame({ put: { '#': 'so-backup/user-b', '.': 'x', ':': 1, '>': 1 } }), me)).toBeNull();
    expect(parsed(filterGunFrame(frame({ get: { '#': own } }), me))).toEqual({ get: { '#': own } });
    expect(filterGunFrame(frame({ get: { '#': 'so-backup/user-b' } }), me)).toBeNull();
    expect(parsed(filterGunFrame(frame({ '@': 'abc', put: null }), me))).toEqual({ '@': 'abc', put: null });
  });

  it('refuses frames over the size limit and accepts the largest real backup', () => {
    // The largest backup @so/gun-backup can write: 600 nodes with full-length names and photo links, 1500 edges
    const nodes = Array.from({ length: 600 }, (_, i) => ({
      id: `c${String(i).padStart(24, '0')}`,
      name: 'Ж'.repeat(200),
      photoUrl: `https://t.me/i/userpic/320/${'x'.repeat(480)}`,
      depth: 3,
      connectionCount: 99999,
    }));
    const edges = Array.from({ length: 1500 }, (_, i) => ({ from: nodes[i % 600]!.id, to: nodes[(i + 1) % 600]!.id }));
    const nicknames = Object.fromEntries(nodes.slice(0, 150).map((n) => [n.id, 'Ж'.repeat(200)]));
    const state = 1_763_700_000_000.001;
    const backup = frame({
      '#': 'backup-1',
      put: {
        'so-backup': { _: { '#': 'so-backup', '>': { [me]: state } }, [me]: { '#': own } },
        [own]: {
          _: { '#': own, '>': { userId: state, syncedAt: state, nodesJson: state, edgesJson: state, nicknamesJson: state } },
          userId: me,
          syncedAt: new Date().toISOString(),
          nodesJson: JSON.stringify(nodes),
          edgesJson: JSON.stringify(edges),
          nicknamesJson: JSON.stringify(nicknames),
        },
      },
    });
    expect(Buffer.byteLength(backup)).toBeLessThan(MAX_GUN_FRAME / 2);
    // Passed on unchanged
    expect(parsed(filterGunFrame(backup, me, MAX_GUN_FRAME))).toEqual(JSON.parse(backup));
    const huge = frame({ put: { [own]: { blob: 'x'.repeat(MAX_GUN_FRAME) } } });
    expect(filterGunFrame(huge, me, MAX_GUN_FRAME)).toBeNull();
  });
});

describe('Gun frame delivery', () => {
  it('hands Gun each accepted message as an object, synchronously, and contains its exceptions', () => {
    const seen: unknown[] = [];
    const listener = vi.fn((msg: unknown) => {
      seen.push(msg);
      if ((msg as { '#'?: string })['#'] === 'boom') throw new Error('Gun failed');
    });
    const batch = frame([{ '#': 'boom', get: { '#': own } }, { '#': 'ok', get: { '#': own } }, { put: { 'so-backup/user-b': {} } }]);
    expect(() => deliverGunFrame(batch, me, listener)).not.toThrow();
    // Both messages reached Gun in this same tick, as objects (never a string for Gun's deferred parser)
    expect(seen).toEqual([{ '#': 'boom', get: { '#': own } }, { '#': 'ok', get: { '#': own } }]);
  });

  it('passes a heartbeat on as it came and drops malformed frames silently', () => {
    const listener = vi.fn();
    deliverGunFrame('[]', me, listener);
    expect(listener).toHaveBeenCalledWith('[]');
    listener.mockClear();
    for (const raw of ['{', 'null', frame({ put: 5 }), Buffer.from('not json')]) deliverGunFrame(raw, me, listener);
    expect(listener).not.toHaveBeenCalled();
    const huge = frame({ get: { '#': own }, err: 'x'.repeat(MAX_GUN_FRAME) });
    deliverGunFrame(huge, me, listener);
    expect(listener).not.toHaveBeenCalled();
  });
});
