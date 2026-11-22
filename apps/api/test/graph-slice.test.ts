import type { PrismaClient } from '@so/db';
import { describe, expect, it, vi } from 'vitest';
import { getGraphSlice } from '../src/services/bfs.service.js';
import { getGraph } from '../src/services/graph-cache.service.js';
import { GraphBuilder } from '../src/services/graph-store.js';

vi.mock('../src/services/graph-cache.service.js');

async function readSlice(builder: GraphBuilder) {
  vi.mocked(getGraph).mockResolvedValue(builder.finish());
  const findMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
    [...where.id.in].reverse().map((id) => ({ id, name: id, photoUrl: null, lastSeen: null })),
  );
  const slice = await getGraphSlice({ user: { findMany } } as unknown as PrismaClient, 'me', 2);
  expect(findMany).toHaveBeenCalledTimes(1);
  return slice;
}

describe('graph slice acquaintances', () => {
  it('keeps the BFS parent and adds each other visible handshake once', async () => {
    const graph = new GraphBuilder();
    graph.add('me', 'a', 1);
    graph.add('me', 'b', 1);
    graph.add('b', 'a', 1);
    graph.add('a', 'c', 1);
    graph.add('b', 'c', 1);
    graph.add('c', 'outside', 1);

    const { edges, links } = await readSlice(graph);
    expect(edges).toEqual([{ from: 'a', to: 'me' }, { from: 'b', to: 'me' }, { from: 'a', to: 'c' }]);
    expect(links).toEqual([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
  });

  it('reserves space for near-ring acquaintances before truncating a dense outer ring', async () => {
    const graph = new GraphBuilder();
    graph.add('me', 'a', 1);
    graph.add('me', 'b', 1);
    graph.add('a', 'b', 1);
    for (let i = 0; i < 80; i++) {
      graph.add('a', String(i), 1);
      for (let j = 0; j < i; j++) graph.add(String(j), String(i), 1);
    }

    const { edges, links } = await readSlice(graph);
    expect(edges).toHaveLength(82);
    expect(links).toHaveLength(3000);
    expect(links[0]).toEqual({ from: 'a', to: 'b' });
    expect(new Set(links.map(({ from, to }) => [from, to].sort().join('/'))).size).toBe(3000);
  });
});
