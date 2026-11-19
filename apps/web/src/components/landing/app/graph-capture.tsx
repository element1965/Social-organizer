/**
 * Dev-only page that draws the example network with the app's own graph (@so/graph-3d), for the still pictures in
 * the landing's "In the app" chapter. It is not part of the app build: Vite serves it in dev from
 * apps/web/dev/landing-app-graph.html, and scripts/capture-landing-app-graph.mjs photographs it in both themes and
 * writes the pictures and the label positions. The box is the Circle's scene on a 390 x 844 phone with the feed
 * open (CirclePage, PhoneCircle): the graph above the sheet, the header and the ring chips over it.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NetworkGraph, type GraphNode } from '@so/graph-3d';
import { DEMO_FAR, demoNetwork, type DemoLabel } from './demo';
import { SCENE_BOX } from './scene-box';
import '../../../index.css';

type SimNode = { id: string; x?: number; y?: number; z?: number };
type SceneObject = { __data?: SimNode; children: SceneObject[] };
// The force graph's handle (react-force-graph-3d): its scene keeps each node's data on the node's object
type FG = {
  scene: () => SceneObject;
  graph2ScreenCoords: (x: number, y: number, z: number) => { x: number; y: number };
};
function simNodes(fg: FG): SimNode[] {
  const out: SimNode[] = [];
  const walk = (o: SceneObject) => {
    if (o.__data && typeof o.__data.id === 'string' && 'x' in o.__data) out.push(o.__data);
    o.children.forEach(walk);
  };
  walk(fg.scene());
  return out;
}
const debug: { fg?: FG } = {};
(globalThis as { __SO_GRAPH_DEBUG__?: unknown }).__SO_GRAPH_DEBUG__ = debug;

const net = demoNetwork();
// The names are HTML over the picture, in the page language: the graph draws none (an invisible character, as an
// empty name would draw a dot)
const nodes: GraphNode[] = net.nodes.map((n) => ({ id: n.id, name: '​', photoUrl: null, isCenter: n.depth === 0, depth: n.depth }));
const edges = net.edges.map((e) => ({ source: e.from, target: e.to }));
const impulses = [{ id: 'need', path: net.need }];
const LABELS: DemoLabel[] = ['you', 'tom', 'sarah', 'emma'];

function Capture() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'));
  document.documentElement.classList.toggle('dark', theme === 'dark');
  Object.assign(window, {
    __setTheme: setTheme,
    // where the named people are, as fractions of the box
    __labels: () => {
      const fg = debug.fg;
      if (!fg) return null;
      const out: Partial<Record<DemoLabel, [number, number]>> = {};
      for (const n of simNodes(fg)) {
        if (!LABELS.includes(n.id as DemoLabel)) continue;
        const p = fg.graph2ScreenCoords(n.x ?? 0, n.y ?? 0, n.z ?? 0);
        out[n.id as DemoLabel] = [Math.round((p.x / SCENE_BOX.width) * 1000) / 1000, Math.round((p.y / SCENE_BOX.height) * 1000) / 1000];
      }
      return out;
    },
  });
  return (
    <div
      id="scene"
      className="scene-follows-theme relative overflow-hidden bg-scene bg-[radial-gradient(120%_90%_at_50%_38%,rgb(var(--so-scene-2))_0%,rgb(var(--so-scene))_60%)]"
      style={{ width: SCENE_BOX.width, height: SCENE_BOX.height }}
    >
      <NetworkGraph
        nodes={nodes}
        edges={edges}
        impulses={impulses}
        farRings={[DEMO_FAR]}
        width={SCENE_BOX.width}
        height={SCENE_BOX.height}
        insetTop={SCENE_BOX.insetTop}
        labelInsetBottom={SCENE_BOX.insetBottom}
        showControls={false}
        theme={theme}
        sceneTheme={theme}
      />
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Capture /></StrictMode>);
