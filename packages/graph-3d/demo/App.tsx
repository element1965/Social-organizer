import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NetworkGraph, type GraphNode, type GraphView, type NetworkGraphHandle } from '../src/NetworkGraph';

interface Built {
  nodes: GraphNode[];
  edges: { source: string; target: string }[];
  /** A selected person's path, me first (the highlight without pulses) */
  path: string[];
  /** Active incoming Needs: asker first, me last */
  impulses: { id: string; path: string[] }[];
}

const RING1 = ['Олег брат', 'Ирина Соколова', 'Катя Белова', 'Денис Волков', 'Лена Мороз', 'Тимур Алиев', 'Марина Пак', 'Кирилл Семёнов'];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A large network for performance work: `?n=500` gives ~500 people in three rings (15% / 40% / 45%),
 * a tree plus some links inside rings, like a real big circle. The app's graph slice is capped at 500.
 */
function buildBig(total: number): Built {
  const rnd = mulberry32(11);
  const nodes: GraphNode[] = [{ id: 'me', name: 'Анна', photoUrl: null, isCenter: true, depth: 0, connectionCount: 0, lastSeen: new Date().toISOString() }];
  const edges: Built['edges'] = [];
  const rings: string[][] = [[], [], []];
  const parentOf = new Map<string, string>();
  const sizes = [Math.min(150, Math.round(total * 0.15)), Math.round(total * 0.4)];
  sizes.push(total - sizes[0]! - sizes[1]!);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < sizes[r]!; i++) {
      const id = `r${r + 1}-${i}`;
      const parent = r === 0 ? 'me' : rings[r - 1]![Math.floor(rnd() * rings[r - 1]!.length)]!;
      rings[r]!.push(id);
      parentOf.set(id, parent);
      nodes.push({
        id,
        name: `Человек ${r + 1}.${i + 1}`,
        photoUrl: r === 0 && i % 3 === 0 ? `/avatars/${[0, 1, 2, 4][i % 4]}.png` : null,
        depth: r + 1,
        connectionCount: 1 + Math.floor(rnd() * 8),
        lastSeen: rnd() < 0.1 ? new Date().toISOString() : null,
      });
      edges.push({ source: parent, target: id });
    }
  }
  for (let r = 0; r < 2; r++) {
    const ring = rings[r]!;
    for (let k = 0; k < ring.length * 0.4; k++) {
      const a = ring[Math.floor(rnd() * ring.length)]!;
      const b = ring[Math.floor(rnd() * ring.length)]!;
      if (a !== b) edges.push({ source: a, target: b });
    }
  }
  const last = rings[2]![0] ?? rings[1]![0]!;
  const up = (id: string): string[] => {
    const out: string[] = [];
    for (let cursor: string | undefined = id; cursor && out.length < 6; cursor = parentOf.get(cursor)) out.push(cursor);
    return out.length > 1 ? out : [];
  };
  const path = ['me', rings[0]![0]!, rings[1]![0]!, last].filter(Boolean);
  const impulses = [
    { id: 'need-1', path: [...path].reverse() },
    { id: 'need-2', path: up(rings[1]![5]!) },
    { id: 'need-3', path: up(rings[0]![7]!) },
  ].filter((i) => i.path.length > 1);
  return { nodes, edges, path, impulses };
}

const BIG = Number(new URLSearchParams(window.location.search).get('n') || 0);
// Debug handle for performance checks (see NetworkGraph: __SO_GRAPH_DEBUG__)
(window as unknown as { __SO_GRAPH_DEBUG__?: object }).__SO_GRAPH_DEBUG__ = {};

function build(): Built {
  if (BIG > 0) return buildBig(BIG);
  const rnd = mulberry32(7);
  const nodes: GraphNode[] = [{
    id: 'me',
    name: 'Анна',
    photoUrl: null,
    isCenter: true,
    depth: 0,
    connectionCount: 8,
    lastSeen: new Date().toISOString(),
  }];
  const edges: Built['edges'] = [];
  const ring1: string[] = [];
  RING1.forEach((name, i) => {
    const id = `a${i}`;
    ring1.push(id);
    nodes.push({
      id,
      name,
      photoUrl: i === 0 || i === 1 || i === 2 || i === 4 ? `/avatars/${i}.png` : null,
      depth: 1,
      connectionCount: 2 + Math.floor(rnd() * 6),
      lastSeen: i === 1 ? new Date().toISOString() : null,
      isDeleted: i === 6,
    });
    edges.push({ source: 'me', target: id });
  });
  const ring2: string[] = [];
  const parentOf = new Map<string, string>();
  for (let i = 0; i < 28; i++) {
    const id = `b${i}`;
    const parent = ring1[Math.floor(rnd() * ring1.length)] ?? ring1[0]!;
    ring2.push(id);
    parentOf.set(id, parent);
    nodes.push({
      id,
      name: i === 4 ? 'Мария Коваль' : `Второе ${i + 1}`,
      photoUrl: null,
      depth: 2,
      connectionCount: 1 + Math.floor(rnd() * 4),
      lastSeen: null,
    });
    edges.push({ source: parent, target: id });
  }
  let preferred = '';
  let fallback = '';
  for (let i = 0; i < 48; i++) {
    const id = `c${i}`;
    const parent = ring2[Math.floor(rnd() * ring2.length)] ?? ring2[0]!;
    parentOf.set(id, parent);
    if (!fallback) fallback = id;
    if (!preferred && parent === 'b4') preferred = id;
    nodes.push({
      id,
      name: `Дальнее ${i + 1}`,
      photoUrl: null,
      depth: 3,
      connectionCount: 1,
      lastSeen: null,
    });
    edges.push({ source: parent, target: id });
  }
  for (const id of ring1) parentOf.set(id, 'me');
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor = preferred || fallback;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    path.push(cursor);
    cursor = parentOf.get(cursor) ?? '';
  }
  path.reverse();
  // Needs: a far asker (3 rings away), one in ring 2 and a direct one (the paths share links on purpose)
  const up = (id: string): string[] => {
    const out: string[] = [];
    for (let cursor: string | undefined = id; cursor && out.length < 6; cursor = parentOf.get(cursor)) out.push(cursor);
    return out;
  };
  const impulses = [
    { id: 'need-1', path: [...path].reverse() },
    { id: 'need-2', path: up('b9') },
    { id: 'need-3', path: up('a3') },
  ];
  return { nodes, edges, path, impulses };
}

export function App() {
  const graph = useRef<NetworkGraphHandle>(null);
  const data = useMemo(build, []);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  // "Selected path" stands for a tapped person (highlight without pulses); impulses are the incoming Needs
  const [pathOn, setPathOn] = useState(false);
  const [impulsesOn, setImpulsesOn] = useState(true);
  const [hidden, setHidden] = useState<number[]>([]);
  const [showControls, setShowControls] = useState(false);
  const [tapped, setTapped] = useState('hover a node for the tooltip');
  const [generation, setGeneration] = useState(0);
  const savedView = useRef<GraphView | null>(null);
  const [viewZ, setViewZ] = useState('');

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleRing = (ring: number) => {
    setHidden((cur) => (cur.includes(ring) ? cur.filter((n) => n !== ring) : [...cur, ring]));
  };

  const chip: CSSProperties = {
    height: 36,
    padding: '0 12px',
    borderRadius: 12,
    border: '1px solid rgba(231,238,235,0.14)',
    background: 'rgba(19,36,32,0.78)',
    color: '#e7eeeb',
    font: '700 13px Manrope, sans-serif',
    cursor: 'pointer',
  };

  return (
    <div style={{ height: '100%', background: '#0b1513' }}>
      <NetworkGraph
        key={generation}
        ref={graph}
        nodes={data.nodes}
        edges={data.edges}
        width={size.w}
        height={size.h}
        theme={theme}
        highlightPath={pathOn ? data.path : undefined}
        impulses={impulsesOn ? data.impulses : undefined}
        hiddenRings={hidden}
        showControls={showControls}
        onNodeTap={(node) => setTapped(`${node.name} · ring ${node.depth ?? 0}`)}
      />
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={chip} onClick={() => graph.current?.zoomIn()}>+</button>
        <button style={chip} onClick={() => graph.current?.zoomOut()}>−</button>
        <button style={chip} onClick={() => graph.current?.fit()}>Fit</button>
        <button style={chip} onClick={() => graph.current?.focusOnMe()}>Me</button>
        <button style={chip} data-view-z={viewZ} onClick={() => {
          const view = graph.current?.getView() ?? null;
          savedView.current = view;
          if (!view) { setViewZ(''); return; }
          const p = view.position;
          setViewZ(`${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`);
        }}>Save view</button>
        <button style={chip} onClick={() => { if (savedView.current) graph.current?.setView(savedView.current, { animate: true }); }}>Restore view</button>
        <button style={{ ...chip, color: pathOn ? '#5fd3c6' : '#e7eeeb' }} onClick={() => setPathOn((v) => !v)}>
          {pathOn ? 'Selected path on' : 'Selected path off'}
        </button>
        <button style={{ ...chip, color: impulsesOn ? '#5fd3c6' : '#e7eeeb' }} onClick={() => setImpulsesOn((v) => !v)}>
          {impulsesOn ? 'Impulses on' : 'Impulses off'}
        </button>
        {[1, 2, 3].map((ring) => (
          <button key={ring} style={{ ...chip, color: hidden.includes(ring) ? '#5f7069' : '#e7eeeb' }} onClick={() => toggleRing(ring)}>
            {hidden.includes(ring) ? `Show ${ring}` : `Hide ${ring}`}
          </button>
        ))}
        <button style={chip} onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          Tooltip {theme}
        </button>
        <button style={chip} onClick={() => setShowControls((v) => !v)}>
          {showControls ? 'Canvas buttons on' : 'Canvas buttons off'}
        </button>
        <button style={chip} onClick={() => setGeneration((n) => n + 1)}>Remount</button>
        <span style={{ color: '#9fb0aa', font: '600 13px Manrope, sans-serif' }}>{tapped}</span>
      </div>
    </div>
  );
}
