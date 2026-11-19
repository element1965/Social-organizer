/**
 * The example behind the landing's "In the app" chapter: a person who joined recently, with six acquaintances.
 * One cast with the story above it: you, Tom (Oleg in Russian) whom you know, Sarah (Maria) whom Tom knows and
 * who is short of the rent, Emma (Lena) who knows Sarah. The counts are invented and shown under "Example".
 */

/** People by handshake, as the Circle's ring chips show them, and the rounded 4th to 6th. */
export const DEMO_RINGS = { 1: 6, 2: 31, 3: 150 } as const;
export const DEMO_FAR = 900;
/** The header's people count: 1st + 2nd + 3rd + the far count, as the app adds them. */
export const DEMO_PEOPLE = DEMO_RINGS[1] + DEMO_RINGS[2] + DEMO_RINGS[3] + DEMO_FAR;
/** Declared participation of the network: the intentions of those people, summed. */
export const DEMO_CAN_HELP = 2400;

/** The participants of Sarah's Need besides you (your share is the story's), in dollars. */
export const DEMO_TOM_AMOUNT = 20;
export const DEMO_EMMA_AMOUNT = 10;
/** When Sarah reported the Need, before now. */
export const DEMO_OPENED_AGO_MS = 3 * 60 * 60 * 1000;
/** A link of the app's own shape (eight letters and digits), not anyone's. */
export const DEMO_SLUG = 'u4tq8wzm';

/** The people the graph snapshot names (the labels are HTML over the picture, in the page language). */
export type DemoLabel = 'you' | 'tom' | 'sarah' | 'emma';

export type DemoNode = { id: string; depth: number };
export type DemoEdge = { from: string; to: string };

/**
 * The example network up to the 3rd handshake, always the same: each person hangs on someone one handshake nearer,
 * and some know a second person. Sarah's Need comes along Sarah → Tom → you.
 */
export function demoNetwork(): { nodes: DemoNode[]; edges: DemoEdge[]; need: string[] } {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const nodes: DemoNode[] = [{ id: 'you', depth: 0 }];
  const edges: DemoEdge[] = [];
  const byDepth: string[][] = [['you'], [], [], []];
  const named: Record<number, string> = { 1: 'tom', 2: 'sarah', 3: 'emma' };
  const parentOf: Record<string, string> = { tom: 'you', sarah: 'tom', emma: 'sarah' };
  for (const depth of [1, 2, 3] as const) {
    for (let i = 0; i < DEMO_RINGS[depth]; i++) {
      const id = i === 0 ? named[depth]! : `p${depth}-${i}`;
      const near = byDepth[depth - 1]!;
      const parent = parentOf[id] ?? near[Math.floor(rand() * near.length)]!;
      nodes.push({ id, depth });
      edges.push({ from: parent, to: id });
      byDepth[depth]!.push(id);
      // some people know a second person one handshake nearer
      if (depth > 1 && rand() < 0.18) {
        const other = near[Math.floor(rand() * near.length)]!;
        if (other !== parent) edges.push({ from: other, to: id });
      }
    }
  }
  return { nodes, edges, need: ['sarah', 'tom', 'you'] };
}
