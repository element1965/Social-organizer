import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { createAvatarClient } from './avatarCache';
import { layoutOf, writeLayout } from './layoutCache';
import {
  type GraphColors,
  colorsKey,
  depthColor,
  lineColor,
  overlayColors,
  parseColor,
  resolveColors,
  withAlpha,
} from './palette';

/* ---------- Types ---------- */

export interface GraphNode {
  id: string;
  name: string;
  photoUrl: string | null;
  isCenter?: boolean;
  isDeleted?: boolean;
  depth?: number;
  connectionCount?: number;
  lastSeen?: string | Date | null;
}

export interface GraphEdge {
  source: string;
  target: string;
}

/** Camera pose so a screen can leave the graph and come back to the same place. */
export interface GraphView {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom?: number;
}

export interface NetworkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Node ids from me to the target. Unknown ids are ignored. Fewer than two matches: no dimming. */
  highlightPath?: string[];
  /** Ring depths to hide. The centre (depth 0) always stays. */
  hiddenRings?: number[];
  /** Scene palette. Defaults are the dark v2 tokens; the scene stays dark in both themes. */
  colors?: Partial<GraphColors>;
  /** White-on-transparent brand mark. Drawn on the care tile, tinted with `colors.careOn`. */
  logoUrl?: string;
  /** Applied once on mount instead of the intro fit. No intro fly. */
  initialView?: GraphView;
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  /** Fires with the node on tap/click. Does not replace `onNodeClick` and does not pause rendering. */
  onNodeTap?: (node: GraphNode) => void;
  /** Overlay and tooltip only. The WebGL scene does not follow this. */
  theme?: 'light' | 'dark';
  /** @deprecated Prefer `theme`. Honoured when `theme` is omitted. */
  darkMode?: boolean;
  /** In-canvas focus / fit buttons. Default true so existing screens keep them. */
  showControls?: boolean;
  /**
   * Controlled focus (e.g. the open person card). When set, the camera flies close to that node, follows it
   * and slowly orbits it; when cleared, it glides back to the pose it had before. Passing the prop at all
   * (even null) turns off the built-in fly on tap, so the screen owns the focus.
   */
  focusId?: string | null;
  /** While focused, show the node this fraction of the height above the middle (room for a bottom card). */
  focusLift?: number;
}

export interface NetworkGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  focusOnMe: () => void;
  getView: () => GraphView | null;
  setView: (view: GraphView, options?: { animate?: boolean }) => void;
}

/* ---------- Tuning ---------- */

// LOD distances (camera -> node), compared squared in the frame loop
const LOD_CLOSE = 150;   // avatar + label
const LOD_MEDIUM = 300;  // dot + label
const LOD_FAR = 500;     // small dot; beyond: tiny dot
const LOD_CLOSE2 = LOD_CLOSE * LOD_CLOSE;
const LOD_MEDIUM2 = LOD_MEDIUM * LOD_MEDIUM;
const LOD_FAR2 = LOD_FAR * LOD_FAR;

const INTRO_MS = 750;            // node pop-in duration
const AUTO_ROTATE_SPEED = 1.1;   // OrbitControls units (1 = one turn per minute)
const AUTO_ROTATE_RESUME_MS = 2500;
const LABELS_PER_FRAME = 6;      // lazily created labels per frame
const BOB_AMPLITUDE = 0.7;       // gentle floating of close nodes
const CHARGE_BASE = 14;          // node repulsion; lower = a more compact graph
const CHARGE_RANGE = 160;        // repulsion reach; short, so far parts of a big graph do not push it apart
const LINK_BASE = 12;            // link length for a leaf
// Pull of the spherical shells (0 = free-form layout). Firm enough to hold a compact ball;
// the speed limit (MAX_NODE_SPEED) keeps it from bouncing while the graph forms.
const BALL_STRENGTH = 0.22;
/** Outer shell radius for a graph of n nodes: grows with the cube root, so the ball keeps its density. */
const ballOuter = (n: number) => 9 * Math.cbrt(Math.max(1, n)) + 22;
const FOCUS_ROTATE_SPEED = 1.6;  // orbit around a focused node (OrbitControls units)
const FOCUS_FLY_MS = 900;
const BALL_SHELLS = [0, 0.38, 0.7, 1]; // shell radius by depth, as a fraction of the outer radius
const MAX_NODE_SPEED = 4;        // world units per tick; caps the "explosion" of the first ticks
const MIN_DOT_PX = 0.0042;       // far dots stay a few pixels; nearer rings stay larger
const LOD_HYSTERESIS = 1.08;     // a node must move 8% past a LOD border to switch back (no flicker)
// Nodes the camera flies through fade out instead of filling the screen and blocking the view
const NEAR_HIDE = 6;
const NEAR_FADE = 20;
const NEAR_FADE2 = NEAR_FADE * NEAR_FADE;
const MARK_SIZE = 10;            // centre tile, world units
const NEAREST_LABELS = 8;        // labels on the nearest ring-1/2 nodes, plus the path
const PATH_CURVE = 0.15;         // slight bend; 0 is a straight line
const DIM_OPACITY = 0.35;
const LINK_POINTS = 21;          // fixed buffer; never resized (straight links use the same curve with curvature 0)
const LABEL_IDLE_MS = 2000;
const LABEL_CAP = 30;

/** Map connectionCount → avatar scale factor (1.0 – 1.6) */
function sizeFromConnections(count: number): number {
  if (count <= 1) return 1.0;
  if (count >= 30) return 1.6;
  return 1.0 + (count - 1) * 0.6 / 29;
}

/** Check if user is online (lastSeen within 5 minutes) */
function isOnline(lastSeen: string | Date | null | undefined): boolean {
  if (!lastSeen) return false;
  const ts = typeof lastSeen === 'string' ? new Date(lastSeen).getTime() : lastSeen.getTime();
  return Date.now() - ts < 5 * 60 * 1000;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Overshooting ease: nodes "pop" into place */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Stable pseudo-random 0..1 from a string (per-node phase / intro jitter) */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/* ---------- Internal types ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGRef = any;

interface SimNode extends GraphNode {
  x?: number; y?: number; z?: number;
  fx?: number; fy?: number; fz?: number;
}

/** Everything we keep per node; the three.js objects are cheap and mostly share textures/materials. */
interface NodeVis {
  node: SimNode;
  outer: THREE.Group;      // positioned by the force graph
  inner: THREE.Group;      // scaled (intro/hover) and bobbing
  avatar: THREE.Sprite;
  dot: THREE.Sprite;
  glow: THREE.Sprite | null;
  label: SpriteText | null;
  pulse: THREE.Sprite | null;
  level: number;           // -1 = not applied yet
  sf: number;              // size factor from connection count
  online: boolean;
  bornAt: number;
  hover: number;           // 0..1 eased
  phase: number;
  realAvatar: boolean;
  lastScale: number;
  /** 0 while the label is wanted. Set when it stops being wanted, so it can be dropped after idle. */
  unwantedAt: number;
  /** Last time the label was wanted. LRU evicts the oldest non-centre, non-path labels. */
  wantedAt: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  __lineObj?: THREE.Object3D;
}

interface PathState {
  /** Resolved ids, in order. Empty when fewer than two ids exist in the graph. */
  set: Set<string>;
  /** Both directions of each consecutive pair. */
  links: Set<string>;
  dim: boolean;
}

const EMPTY_PATH: PathState = { set: new Set(), links: new Set(), dim: false };

const noRaycast = () => { /* decorative objects must not take part in hover raycasting */ };

/**
 * three-spritetext regenerates its canvas + texture on every property setter. Fill the private
 * fields and generate once. Halo is a stroke in the scene colour (mockup paint-order: stroke).
 */
function makeLabel(text: string, textHeight: number, color: string, stroke: string, weight: string): SpriteText {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = new SpriteText('') as any;
  l._text = text;
  l._textHeight = textHeight;
  l._color = color;
  l._backgroundColor = false;
  l._padding = 0;
  l._borderWidth = 0;
  l._borderRadius = 0;
  l._strokeWidth = 1.25;
  l._strokeColor = stroke;
  l._fontFace = 'Manrope, sans-serif';
  l._fontWeight = weight;
  l._fontSize = 64;
  l._genCanvas();
  l.material.depthWrite = false;
  return l as SpriteText;
}

function labelLines(name: string, center: boolean): string {
  const text = String(name ?? '').trim() || '·';
  if (center) return text;
  const parts = text.split(/\s+/);
  const first = parts[0];
  if (!first || parts.length < 2) return text;
  return `${first}\n${parts.slice(1).join(' ')}`;
}

function endpointNode(end: string | SimNode | undefined, map: Map<string, SimNode>): SimNode | undefined {
  if (!end) return undefined;
  if (typeof end === 'object') return end;
  return map.get(String(end));
}

const LINK_EPS = 0.04;

/**
 * Own the line geometry. The buffer is allocated once at LINK_POINTS and never replaced.
 * Curvature 0 is the same curve with the control point on the midpoint, so the library
 * can keep linkCurvature at 0 and stop swapping attributes. Skip the write when the
 * endpoints, bend, and ink are unchanged. Do not touch matrixAutoUpdate.
 */
function updateOwnedLink(
  line: THREE.Line,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  curvature: number,
  color: number,
  opacity: number,
) {
  const ud = line.userData;
  const geom = line.geometry;
  const prev = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  const samePos = prev?.count === LINK_POINTS
    && typeof ud.lx === 'number'
    && Math.abs((ud.lx as number) - ax) < LINK_EPS
    && Math.abs((ud.ly as number) - ay) < LINK_EPS
    && Math.abs((ud.lz as number) - az) < LINK_EPS
    && Math.abs((ud.mx as number) - bx) < LINK_EPS
    && Math.abs((ud.my as number) - by) < LINK_EPS
    && Math.abs((ud.mz as number) - bz) < LINK_EPS
    && ud.cv === curvature;
  const ownedMat = ud.soLineMat as THREE.Material | undefined;
  const sameInk = ud.lc === color
    && typeof ud.lo === 'number'
    && Math.abs((ud.lo as number) - opacity) < 0.01
    && !!ownedMat
    && !ownedMat.userData.dead
    && line.material === ownedMat;
  if (samePos && sameInk) return;
  if (!samePos) {
    let attr = prev;
    if (!attr || attr.count !== LINK_POINTS) {
      attr = new THREE.BufferAttribute(new Float32Array(LINK_POINTS * 3), 3);
      geom.setAttribute('position', attr);
    }
    const arr = attr.array as Float32Array;
    const segments = LINK_POINTS - 1;
    let cx: number;
    let cy: number;
    let cz: number;
    if (curvature <= 0) {
      cx = (ax + bx) / 2;
      cy = (ay + by) / 2;
      cz = (az + bz) / 2;
    } else {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      if (dx === 0 && dy === 0) {
        cx = (ax + bx) / 2 + curvature * -dz;
        cy = (ay + by) / 2;
        cz = (az + bz) / 2 + curvature * dx;
      } else {
        cx = (ax + bx) / 2 + curvature * dy;
        cy = (ay + by) / 2 - curvature * dx;
        cz = (az + bz) / 2;
      }
    }
    for (let i = 0; i < LINK_POINTS; i++) {
      const t = i / segments;
      const u = 1 - t;
      const uu = u * u;
      const tt = t * t;
      const ut2 = 2 * u * t;
      arr[i * 3] = uu * ax + ut2 * cx + tt * bx;
      arr[i * 3 + 1] = uu * ay + ut2 * cy + tt * by;
      arr[i * 3 + 2] = uu * az + ut2 * cz + tt * bz;
    }
    attr.needsUpdate = true;
    ud.lx = ax; ud.ly = ay; ud.lz = az;
    ud.mx = bx; ud.my = by; ud.mz = bz;
    ud.cv = curvature;
  }
  if (!sameInk) {
    paintLink(line, color, opacity);
    ud.lc = color;
    ud.lo = opacity;
  }
  if (line.frustumCulled) line.frustumCulled = false;
}

function lineOf(obj: THREE.Object3D): THREE.Line | null {
  if ((obj as THREE.Line).isLine) return obj as THREE.Line;
  for (const child of obj.children) {
    if ((child as THREE.Line).isLine) return child as THREE.Line;
  }
  return null;
}

/**
 * Per-link material. The library only re-colours lines when the linkColor accessor
 * identity changes, and it disposes the previous material, so a shared material is unsafe.
 */
function paintLink(line: THREE.Line, color: number, opacity: number) {
  let mat = line.userData.soLineMat as THREE.LineBasicMaterial | undefined;
  if (!mat || mat.userData.dead) {
    mat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
    mat.addEventListener('dispose', () => { mat!.userData.dead = true; });
    line.userData.soLineMat = mat;
  }
  if (mat.color.getHex() !== color) mat.color.set(color);
  if (Math.abs(mat.opacity - opacity) > 0.01) mat.opacity = opacity;
  mat.transparent = opacity < 1;
  if (line.material !== mat) line.material = mat;
}

function disposeLabel(l: SpriteText | null) {
  if (!l) return;
  l.material.map?.dispose();
  l.material.dispose();
}

function dropLabel(v: NodeVis) {
  if (!v.label) return;
  v.inner.remove(v.label);
  disposeLabel(v.label);
  v.label = null;
  v.unwantedAt = 0;
}

/* ---------- Component ---------- */

export const NetworkGraph = forwardRef<NetworkGraphHandle, NetworkGraphProps>(function NetworkGraph({
  nodes,
  edges,
  highlightPath,
  hiddenRings,
  colors: colorsProp,
  width,
  height,
  onNodeClick,
  onNodeTap,
  theme: themeProp,
  darkMode = true,
  showControls = true,
  logoUrl = '/logo.png',
  initialView,
  focusId,
  focusLift = 0,
}, ref) {
  const fgRef = useRef<FGRef>(null);
  const theme: 'light' | 'dark' = themeProp ?? (darkMode ? 'dark' : 'light');
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const colorKey = colorsKey(colorsProp);
  const colors = useMemo(() => resolveColors(colorsProp), [colorKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // Latest props for stable callbacks (the force graph must not see new function identities)
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const onNodeTapRef = useRef(onNodeTap);
  onNodeTapRef.current = onNodeTap;

  // Controlled focus: the frame loop follows and orbits the node, and lifts it above a bottom card
  const focusControlled = focusId !== undefined;
  const focusControlledRef = useRef(focusControlled);
  focusControlledRef.current = focusControlled;
  const focusRef = useRef<{ id: string | null; kick: boolean; lift: number; before: GraphView | null }>({
    id: null,
    kick: false,
    lift: 0,
    before: null,
  });
  focusRef.current.lift = focusLift;

  /* ----- Stable graph data: node objects survive re-renders, layout is kept ----- */

  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const ownerRef = useRef('');
  /** Every current node had a saved position: do not reheat (cooldownTicks 0). */
  const layoutHoldRef = useRef(false);
  const visRef = useRef<Map<string, NodeVis>>(new Map());
  const introSeenRef = useRef<Set<string>>(new Set());
  const needsRefreshRef = useRef(false);
  const depthRef = useRef<Map<string, number>>(new Map());
  const subtreeRef = useRef<Map<string, number>>(new Map());
  const sizeRef = useRef(0);

  // Structural signature — only a change in who is in the graph / how they look rebuilds it.
  // connectionCount / lastSeen change every refetch but are applied in place (see effect below).
  const signature =
    nodes.map((n) => `${n.id}:${n.depth ?? ''}:${n.isCenter ? 1 : 0}:${n.isDeleted ? 1 : 0}:${n.name}:${n.photoUrl ?? ''}`).join('|') +
    '#' +
    edges.map((e) => `${e.source}>${e.target}`).join(',');

  const graphData = useMemo(() => {
    const map = nodeMapRef.current;
    const seen = new Set<string>();
    const next: SimNode[] = [];

    // Adjacency, so new nodes can appear next to someone they know
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source)!.push(e.target);
      adj.get(e.target)!.push(e.source);
    }

    const created: SimNode[] = [];
    let centerId = '';
    for (const n of nodes) {
      if (n.isCenter && n.id) centerId = n.id;
      seen.add(n.id);
      let s = map.get(n.id);
      if (!s) {
        s = { ...n };
        map.set(n.id, s);
        created.push(s);
      } else if (
        s.name !== n.name || s.photoUrl !== n.photoUrl || !!s.isDeleted !== !!n.isDeleted ||
        s.depth !== n.depth || !!s.isCenter !== !!n.isCenter
      ) {
        s.name = n.name;
        s.photoUrl = n.photoUrl;
        s.isDeleted = n.isDeleted;
        s.depth = n.depth;
        s.isCenter = n.isCenter;
        needsRefreshRef.current = true;
      }
      // The center node is pinned in the middle of the graph
      s.fx = n.isCenter ? 0 : undefined;
      s.fy = n.isCenter ? 0 : undefined;
      s.fz = n.isCenter ? 0 : undefined;
      next.push(s);
    }

    const layout = centerId ? layoutOf(centerId) : undefined;
    // Cached nodes start where the user left them, before anyone new is placed,
    // so a newcomer can bloom from a neighbour that already has a spot.
    if (layout) {
      for (const s of created) {
        const hit = layout.get(s.id);
        if (!hit) continue;
        s.x = hit.x;
        s.y = hit.y;
        s.z = hit.z;
      }
    }

    // "Bloom": parents first, each new node starts a short random hop from an already placed
    // neighbor (compressed link length), then the simulation lets the graph unfold and glide.
    // Nodes restored from the layout cache are already placed and skip this.
    created.sort((a, b) => (a.depth ?? (a.isCenter ? 0 : 1)) - (b.depth ?? (b.isCenter ? 0 : 1)));
    for (const s of created) {
      if (typeof s.x === 'number' && Number.isFinite(s.x)) continue;
      let anchor: SimNode | undefined;
      for (const nbId of adj.get(s.id) ?? []) {
        const nb = map.get(nbId);
        if (nb && typeof nb.x === 'number' && (!anchor || (nb.depth ?? 9) < (anchor.depth ?? 9))) anchor = nb;
      }
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      const hop = anchor ? 14 : 4;
      s.x = (anchor?.x ?? 0) + hop * q * Math.cos(a);
      s.y = (anchor?.y ?? 0) + hop * q * Math.sin(a);
      s.z = (anchor?.z ?? 0) + hop * u;
    }

    // All current nodes cached → freeze (no reheat). Otherwise pin the cached ones
    // so only newcomers move, and release those pins when the engine stops.
    let hold = !!layout && next.length > 0;
    if (layout) {
      for (const s of next) {
        const hit = layout.get(s.id);
        if (!hit) {
          hold = false;
          continue;
        }
        if (s.isCenter) continue;
        const x = typeof s.x === 'number' && Number.isFinite(s.x) ? s.x : hit.x;
        const y = typeof s.y === 'number' && Number.isFinite(s.y) ? s.y : hit.y;
        const z = typeof s.z === 'number' && Number.isFinite(s.z) ? s.z : hit.z;
        s.x = x;
        s.y = y;
        s.z = z;
        s.fx = x;
        s.fy = y;
        s.fz = z;
      }
    }
    ownerRef.current = centerId;
    layoutHoldRef.current = hold;
    for (const id of [...map.keys()]) {
      if (!seen.has(id)) {
        map.delete(id);
        visRef.current.delete(id);
      }
    }

    // Depth + subtree depth (how deep descendants go) drive link length and repulsion
    const depthMap = new Map(next.map((n) => [n.id, n.depth ?? (n.isCenter ? 0 : 1)]));
    const cache = new Map<string, number>();
    const computing = new Set<string>(); // cycle guard
    const subtree = (id: string): number => {
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      if (computing.has(id)) return 0;
      computing.add(id);
      const myDepth = depthMap.get(id) ?? 0;
      let maxD = 0;
      for (const nId of adj.get(id) ?? []) {
        if ((depthMap.get(nId) ?? 0) === myDepth + 1) maxD = Math.max(maxD, 1 + subtree(nId));
      }
      computing.delete(id);
      cache.set(id, maxD);
      return maxD;
    };
    for (const n of next) subtree(n.id);
    depthRef.current = depthMap;
    subtreeRef.current = cache;

    return { nodes: next, links: edges.map((e) => ({ source: e.source, target: e.target })) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const holdLayout = layoutHoldRef.current;

  /* ----- Shared GPU resources (one set per mounted graph) ----- */

  const resRef = useRef<ReturnType<typeof createResources> | null>(null);
  if (!resRef.current) resRef.current = createResources();
  const res = resRef.current;
  sizeRef.current = graphData.nodes.length;
  const highlightKey = (highlightPath ?? []).join('\u0001');
  const pathState = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of highlightPath ?? []) {
      if (!id || seen.has(id) || !nodeMapRef.current.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length < 2) return EMPTY_PATH;
    const links = new Set<string>();
    for (let i = 1; i < ids.length; i++) links.add(`${ids[i - 1]}\0${ids[i]}`).add(`${ids[i]}\0${ids[i - 1]}`);
    return { set: new Set(ids), links, dim: true };
    // highlightKey covers the array; signature covers membership in the graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, signature]);
  const pathRef = useRef<PathState>(pathState);
  pathRef.current = pathState;

  const hiddenKey = (hiddenRings ?? []).join(',');
  const hiddenRef = useRef<Set<number>>(new Set());
  hiddenRef.current = useMemo(() => {
    const next = new Set<number>();
    for (const ring of hiddenRings ?? []) if (ring > 0) next.add(ring);
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKey]);
  const nearestRef = useRef<Set<string>>(new Set());
  const reducedRef = useRef(false);
  const sceneFxRef = useRef<{ stars: THREE.Points | null; glow: THREE.Sprite | null }>({ stars: null, glow: null });

  const lifeRef = useRef<{ disposeTimer: ReturnType<typeof setTimeout> | null; userTouched: boolean; hoverId: string | null }>({
    disposeTimer: null,
    userTouched: false,
    hoverId: null,
  });

  // Camera fly-to: our own tween (the library's can't be cancelled and fights the user)
  const flyRef = useRef({
    active: false,
    t0: 0,
    dur: 1,
    d0: new THREE.Vector3(0, 0, 1),
    d1: new THREE.Vector3(0, 0, 1),
    r0: 1,
    r1: 1,
  });
  // Restored pose. Lerps camera position and look-at target. Separate from the orbit fly,
  // which always looks at the origin.
  const viewFlyRef = useRef({
    active: false,
    t0: 0,
    dur: 700,
    p0: new THREE.Vector3(),
    p1: new THREE.Vector3(),
    l0: new THREE.Vector3(),
    l1: new THREE.Vector3(),
    z0: 1,
    z1: 1,
  });
  const initialViewRef = useRef(initialView);
  const simRef = useRef(true);

  /** Fly the camera to `pos` while the look-at point moves to `look` (keeps the current zoom). */
  const flyPose = useCallback((pos: THREE.Vector3, look: THREE.Vector3, ms: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    flyRef.current.active = false;
    const cam = fg.camera() as THREE.PerspectiveCamera;
    if (reducedRef.current || ms <= 0) {
      viewFlyRef.current.active = false;
      fg.cameraPosition({ x: pos.x, y: pos.y, z: pos.z }, { x: look.x, y: look.y, z: look.z });
      return;
    }
    const controls = fg.controls() as { target?: THREE.Vector3 } | undefined;
    const f = viewFlyRef.current;
    f.p0.copy(cam.position);
    if (controls?.target) f.l0.copy(controls.target);
    else f.l0.set(0, 0, 0);
    f.p1.copy(pos);
    f.l1.copy(look);
    f.z0 = cam.zoom || 1;
    f.z1 = cam.zoom || 1;
    f.t0 = performance.now();
    f.dur = Math.max(1, ms);
    f.active = true;
  }, []);

  /** Current look-at point of the orbit controls (the origin until a node was focused). */
  const lookAt = useCallback((): THREE.Vector3 => {
    const controls = fgRef.current?.controls() as { target?: THREE.Vector3 } | undefined;
    return controls?.target ? controls.target.clone() : new THREE.Vector3();
  }, []);
  const linkDirtyRef = useRef(false);
  const linkScanRef = useRef(false);
  const linkLinesRef = useRef<THREE.Line[]>([]);
  const inkRef = useRef({
    src: null as GraphColors | null,
    care: 0,
    careOp: 1,
    plain: 0,
    plainOp: 1,
    dim: 0,
    dimOp: 1,
  });

  const readInk = useCallback(() => {
    const palette = colorsRef.current;
    const ink = inkRef.current;
    if (ink.src !== palette) {
      const care = parseColor(palette.care);
      const plain = parseColor(lineColor(palette.line, false));
      const dim = parseColor(lineColor(palette.line, true));
      ink.src = palette;
      ink.care = care.color;
      ink.careOp = 0.95 * (care.opacity || 1);
      ink.plain = plain.color;
      ink.plainOp = plain.opacity;
      ink.dim = dim.color;
      ink.dimOp = dim.opacity;
    }
    return ink;
  }, []);

  const styleLink = useCallback((line: THREE.Line, link: SimLink, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    line.userData.soLink = link;
    if (!line.userData.soListed) {
      line.userData.soListed = true;
      linkLinesRef.current.push(line);
    }
    const path = pathRef.current;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    const on = !!(path.dim && src && tgt && path.links.has(`${src}\0${tgt}`));
    const ink = readInk();
    updateOwnedLink(
      line,
      ax, ay, az, bx, by, bz,
      on ? PATH_CURVE : 0,
      on ? ink.care : path.dim ? ink.dim : ink.plain,
      on ? ink.careOp : path.dim ? ink.dimOp : ink.plainOp,
    );
  }, [readInk]);

  const flushLinks = useCallback((scene: THREE.Scene | undefined) => {
    if (linkScanRef.current || linkLinesRef.current.length === 0) {
      for (const line of linkLinesRef.current) line.userData.soListed = false;
      const next: THREE.Line[] = [];
      scene?.traverse((obj) => {
        const tagged = obj as THREE.Object3D & { __graphObjType?: string; __data?: SimLink };
        if (tagged.__graphObjType !== 'link') return;
        const line = lineOf(obj);
        if (!line?.parent) return;
        if (tagged.__data) line.userData.soLink = tagged.__data;
        line.userData.soListed = true;
        next.push(line);
      });
      linkLinesRef.current = next;
      linkScanRef.current = false;
    } else {
      const cur = linkLinesRef.current;
      let write = 0;
      for (let i = 0; i < cur.length; i++) {
        const line = cur[i];
        if (line?.parent) cur[write++] = line;
        else if (line) line.userData.soListed = false;
      }
      cur.length = write;
    }
    const map = nodeMapRef.current;
    for (const line of linkLinesRef.current) {
      const link = line.userData.soLink as SimLink | undefined;
      if (!link) continue;
      const a = endpointNode(link.source, map);
      const b = endpointNode(link.target, map);
      if (!a || !b || a.x == null || b.x == null) continue;
      styleLink(line, link, a.x, a.y ?? 0, a.z ?? 0, b.x, b.y ?? 0, b.z ?? 0);
    }
    linkDirtyRef.current = false;
  }, [styleLink]);

  const flyTo = useCallback((dir: THREE.Vector3, dist: number, ms: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    viewFlyRef.current.active = false;
    const cam = fg.camera() as THREE.Camera;
    const aim = dir.clone().normalize();
    if (aim.lengthSq() < 1e-6) aim.set(0, 0, 1);
    // Looking at a focused node: the orbit fly assumes the origin, so glide the look-at back with the camera.
    if (lookAt().lengthSq() > 1) {
      flyPose(aim.multiplyScalar(dist), new THREE.Vector3(), ms);
      return;
    }
    if (reducedRef.current || ms <= 0) {
      flyRef.current.active = false;
      const p = aim.multiplyScalar(dist);
      fg.cameraPosition({ x: p.x, y: p.y, z: p.z }, { x: 0, y: 0, z: 0 });
      return;
    }
    const f = flyRef.current;
    f.r0 = Math.max(1, cam.position.length());
    f.d0.copy(cam.position).normalize();
    if (f.d0.lengthSq() < 1e-6) f.d0.set(0, 0, 1);
    f.d1.copy(aim);
    f.r1 = dist;
    f.t0 = performance.now();
    f.dur = Math.max(1, ms);
    f.active = true;
  }, [flyPose, lookAt]);

  /* ----- Node objects ----- */

  const wantsLabel = useCallback((v: NodeVis) => {
    const n = v.node;
    const depth = n.depth ?? (n.isCenter ? 0 : 1);
    if (n.isCenter || depth <= 0) return !!n.isCenter;
    if (hiddenRef.current.has(depth)) return false;
    // Path membership before the ring-3 cutoff, so a highlighted far node still gets its name.
    if (pathRef.current.set.has(n.id) && !n.isDeleted) return true;
    if (depth >= 3) return false;
    return nearestRef.current.has(n.id);
  }, []);

  const paintNode = useCallback((v: NodeVis) => {
    const palette = colorsRef.current;
    const path = pathRef.current;
    const n = v.node;
    const onPath = path.set.has(n.id) && !n.isDeleted;
    const dim = path.dim && !onPath;
    const depth = n.depth ?? (n.isCenter ? 0 : 1);
    if (n.isCenter) {
      v.avatar.material = res.markMaterial(dim);
      if (v.glow) {
        v.glow.material = res.glowMaterial();
        (v.glow.material as THREE.SpriteMaterial).opacity = dim ? 0.05 : 0.14;
      }
      return;
    }
    const hex = onPath ? palette.careBright : depthColor(palette, Math.max(1, depth));
    const base = n.isDeleted ? 0.3 : depth <= 1 ? 0.96 : depth === 2 ? 0.74 : 0.5;
    const parsed = parseColor(hex);
    v.dot.material = res.dotMaterial(parsed.color, dim ? base * DIM_OPACITY : base);
    const want = dim ? DIM_OPACITY : n.isDeleted ? 0.45 : 1;
    const baseMat = (v.avatar.userData.matBase as THREE.SpriteMaterial | undefined) ?? (v.avatar.material as THREE.SpriteMaterial);
    v.avatar.userData.matBase = baseMat;
    if (want < 0.99) {
      let dimMat = v.avatar.userData.matDim as THREE.SpriteMaterial | undefined;
      if (!dimMat || dimMat.userData.src !== baseMat) {
        dimMat?.dispose();
        dimMat = baseMat.clone();
        dimMat.userData.src = baseMat;
        dimMat.transparent = true;
        dimMat.depthWrite = false;
        v.avatar.userData.matDim = dimMat;
      }
      dimMat.opacity = want;
      v.avatar.material = dimMat;
    } else if (v.avatar.material !== baseMat) {
      v.avatar.material = baseMat;
    }
  }, [res]);

  const applyLevel = useCallback((v: NodeVis, level: number) => {
    const n = v.node;
    const isC = !!n.isCenter;
    const sf = v.sf;
    const onPath = pathRef.current.set.has(n.id) && !n.isDeleted;
    const avatarSize = (isC ? MARK_SIZE : 5) * sf;
    const boost = !isC && onPath ? 1.4 : 1;
    v.level = level;

    if (isC) {
      v.avatar.visible = true;
      v.avatar.scale.set(MARK_SIZE, MARK_SIZE, 1);
      v.dot.visible = false;
      if (v.glow) {
        v.glow.visible = true;
        v.glow.scale.set(MARK_SIZE * 1.45, MARK_SIZE * 1.45, 1);
      }
    } else {
      const showPhoto = level === 0 && v.realAvatar;
      v.avatar.visible = showPhoto;
      v.avatar.scale.set(avatarSize, avatarSize, 1);
      v.dot.visible = !showPhoto;
      const dotSize = (level <= 1 ? 3.15 * sf : level === 2 ? 2.05 * sf : 1.25) * boost;
      v.dot.scale.set(dotSize, dotSize, 1);
    }

    if (v.pulse) {
      const show = !isC && !n.isDeleted && ((v.online && level <= 1) || onPath);
      v.pulse.visible = show;
      const body = isC ? MARK_SIZE : (v.avatar.visible ? avatarSize : v.dot.scale.x);
      v.pulse.scale.set(body * (isC ? 1.38 : 1.9), body * (isC ? 1.38 : 1.9), 1);
      v.pulse.material = pathRef.current.dim && !onPath ? res.pulseDimMaterial : res.pulseMaterial;
    }

    if (v.label) {
      const base = v.label.userData.baseScale as THREE.Vector3;
      const k = isC || v.avatar.visible ? 1 : 0.9;
      v.label.scale.set(base.x * k, base.y * k, 1);
      const body = isC ? MARK_SIZE : (v.avatar.visible ? avatarSize : v.dot.scale.x);
      v.label.position.y = -(body / 2 + (base.y * k) / 2 + (isC ? 0.85 : 0.4));
    }
  }, [res]);

  const restyleLabel = useCallback((v: NodeVis) => {
    if (!v.label) return;
    const palette = colorsRef.current;
    const n = v.node;
    const onPath = pathRef.current.set.has(n.id) && !n.isDeleted;
    const color = n.isDeleted ? palette.node3 : onPath ? palette.care : palette.label;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l = v.label as any;
    l._color = color;
    l._strokeColor = palette.scene;
    l._genCanvas();
    v.label.material.depthWrite = false;
    v.label.userData.baseScale = v.label.scale.clone();
    if (v.level >= 0) applyLevel(v, v.level);
  }, [applyLevel]);

  const createLabel = useCallback((v: NodeVis) => {
    const n = v.node;
    const palette = colorsRef.current;
    const onPath = pathRef.current.set.has(n.id) && !n.isDeleted;
    const color = n.isDeleted ? palette.node3 : onPath ? palette.care : palette.label;
    const label = makeLabel(
      labelLines(String(n.name ?? ''), !!n.isCenter),
      n.isCenter ? 4.4 : 3.5,
      color,
      palette.scene,
      n.isCenter ? '800' : '700',
    );
    label.raycast = noRaycast;
    label.renderOrder = 4;
    label.userData.baseScale = label.scale.clone();
    v.label = label;
    v.inner.add(label);
    applyLevel(v, v.level);
  }, [applyLevel]);

  const nodeThreeObject = useCallback((node: SimNode) => {
    const isC = !!node.isCenter;
    const sf = isC ? 1 : sizeFromConnections(node.connectionCount ?? 0);
    const depth = node.depth ?? (isC ? 0 : 1);
    const photoUrl = !isC && node.photoUrl ? node.photoUrl : null;
    const cachedPhoto = photoUrl ? res.peekPhoto(photoUrl) : null;
    if (cachedPhoto && photoUrl) res.holdPhoto(photoUrl);
    let showCached = false;
    if (cachedPhoto) {
      try {
        const cam = fgRef.current?.camera?.() as THREE.Camera | undefined;
        if (cam) {
          const dx = (node.x ?? 0) - cam.position.x;
          const dy = (node.y ?? 0) - cam.position.y;
          const dz = (node.z ?? 0) - cam.position.z;
          showCached = dx * dx + dy * dy + dz * dz < LOD_CLOSE2;
        }
      } catch { /* camera is not ready until the graph mounts */ }
    }

    const outer = new THREE.Group();
    const inner = new THREE.Group();
    outer.add(inner);

    const avatar = new THREE.Sprite(
      isC
        ? res.markMaterial(false)
        : cachedPhoto && photoUrl
          ? res.photoMaterial(photoUrl, !!node.isDeleted, cachedPhoto)
          : res.dotMaterial(0xffffff, 0),
    );
    avatar.name = 'avatar';
    avatar.visible = isC || showCached;
    if (photoUrl && cachedPhoto) avatar.userData.photoUrl = photoUrl;
    if (isC) avatar.scale.set(MARK_SIZE, MARK_SIZE, 1);
    else if (showCached) avatar.scale.set(5 * sf, 5 * sf, 1);
    inner.add(avatar);

    const dotHex = depthColor(colorsRef.current, Math.max(1, depth));
    const dot = new THREE.Sprite(res.dotMaterial(parseColor(dotHex).color, 0.9));
    dot.visible = !isC && !showCached;
    if (!isC) {
      const dotSize = (depth <= 1 ? 3.15 : depth === 2 ? 2.05 : 1.25) * sf;
      dot.scale.set(dotSize, dotSize, 1);
    }
    inner.add(dot);

    let glow: THREE.Sprite | null = null;
    if (isC) {
      glow = new THREE.Sprite(res.glowMaterial());
      glow.scale.set(MARK_SIZE * 1.45, MARK_SIZE * 1.45, 1);
      glow.raycast = noRaycast;
      glow.renderOrder = 1;
      inner.add(glow);
      avatar.renderOrder = 2;
    }

    const pulse = new THREE.Sprite(res.pulseMaterial);
    pulse.raycast = noRaycast;
    pulse.visible = false;
    pulse.renderOrder = 3;
    inner.add(pulse);

    const seen = introSeenRef.current.has(node.id);
    const prev = visRef.current.get(node.id);
    if (prev?.label) disposeLabel(prev.label);
    const v: NodeVis = {
      node,
      outer,
      inner,
      avatar,
      dot,
      glow,
      label: null,
      pulse,
      level: showCached ? 0 : -1,
      sf,
      online: isOnline(node.lastSeen),
      // Staggered pop-in: closer circles first; nodes seen before (theme refresh) appear instantly
      bornAt: seen || isC ? -Infinity : performance.now() + depth * 160 + hash01(node.id) * 260,
      hover: 0,
      phase: hash01(node.id + 'p') * Math.PI * 2,
      realAvatar: !!cachedPhoto,
      lastScale: -1,
      unwantedAt: 0,
      wantedAt: 0,
    };
    introSeenRef.current.add(node.id);
    visRef.current.set(node.id, v);
    avatar.userData.matBase = avatar.material;
    paintNode(v);
    if (isC) createLabel(v);
    inner.scale.setScalar(0.0001);
    return outer;
  }, [res, paintNode, createLabel]);

  /* ----- Mount: controls, forces, frame loop, camera ----- */

  const fitCamera = useCallback((ms: number, introSpin = false) => {
    const fg = fgRef.current;
    if (!fg) return;
    const list = graphData.nodes;
    if (!list.length) return;
    // Radius containing ~92% of nodes (ignore a few far outliers)
    const dists = list.map((n) => Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0)).sort((a, b) => a - b);
    const r = (dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.92))] ?? 40) + 12;
    const cam = fg.camera() as THREE.PerspectiveCamera;
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (cam.aspect || 1));
    const dist = THREE.MathUtils.clamp((r / Math.sin(Math.min(vfov, hfov) / 2)) * 0.78, 90, 1600);
    const dir = cam.position.clone().sub(lookAt());
    if (dir.lengthSq() < 1) dir.set(0.35, 0.3, 1);
    dir.normalize();
    if (introSpin && ms > 0 && !reducedRef.current) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9).normalize();
    flyTo(dir, dist, ms);
    const controls = fg.controls();
    if (controls) controls.maxDistance = Math.max(600, dist * 2.2);
  }, [graphData, flyTo, lookAt]);
  const fitCameraRef = useRef(fitCamera);
  fitCameraRef.current = fitCamera;

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const life = lifeRef.current;
    // StrictMode runs effect -> cleanup -> effect immediately: cancel the deferred teardown
    if (life.disposeTimer) {
      clearTimeout(life.disposeTimer);
      life.disposeTimer = null;
    }

    // --- Camera controls: orbit with damping = inertia after a fling, smooth auto-rotate ---
    const controls = fg.controls();
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = reduceMq.matches;
    let rotTarget = reduceMq.matches ? 0 : AUTO_ROTATE_SPEED;
    let rotCur = 0;
    const onReduce = () => {
      reducedRef.current = reduceMq.matches;
      if (!controls) return;
      if (reduceMq.matches) {
        rotTarget = 0;
        rotCur = 0;
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0;
      } else {
        controls.autoRotate = true;
      }
    };
    reduceMq.addEventListener('change', onReduce);
    const onStart = () => {
      life.userTouched = true;
      flyRef.current.active = false;
      viewFlyRef.current.active = false;
      rotTarget = 0;
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const onEnd = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      if (reducedRef.current) {
        rotTarget = 0;
        return;
      }
      resumeTimer = setTimeout(() => {
        if (!reducedRef.current) rotTarget = AUTO_ROTATE_SPEED;
      }, AUTO_ROTATE_RESUME_MS);
    };
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.rotateSpeed = 0.7;
      controls.zoomSpeed = 0.8;
      controls.enablePan = false;
      controls.minDistance = 30;
      controls.autoRotate = !reduceMq.matches;
      controls.autoRotateSpeed = 0;
      controls.addEventListener('start', onStart);
      controls.addEventListener('end', onEnd);
    }

    // --- Forces: nodes with deeper subtrees repel more and sit further from their parent ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge = fg.d3Force('charge') as any;
    if (charge && typeof charge.strength === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      charge.strength((node: any) => {
        const d = subtreeRef.current.get(String(node.id ?? '')) ?? 0;
        // Leaf: -CHARGE, each level of subtree below adds half (linear: a dense ball, not a starburst)
        return -CHARGE_BASE * (1 + d * 0.5);
      });
      if (typeof charge.distanceMax === 'function') charge.distanceMax(CHARGE_RANGE); // also bounds the cost
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkForce = fg.d3Force('link') as any;
    if (linkForce && typeof linkForce.distance === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkForce.distance((link: any) => {
        const srcId = typeof link.source === 'object' ? link.source?.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target?.id : link.target;
        const srcDepth = depthRef.current.get(String(srcId)) ?? 1;
        const tgtDepth = depthRef.current.get(String(tgtId)) ?? 1;
        // The "child" node is the one with greater depth
        const childId = tgtDepth > srcDepth ? String(tgtId) : String(srcId);
        const d = subtreeRef.current.get(childId) ?? 0;
        // Gentle growth: d=0→1x, d=1→1.3x, d=2→1.6x, d=3→1.9x
        return LINK_BASE * (1 + d * 0.3);
      });
    }

    // --- Ball: gently hold each depth on its own spherical shell (you in the middle, then 1°, 2°, 3°),
    // so the network forms a round cloud instead of sprawling like a tree. ---
    let ballNodes: SimNode[] = [];
    const ball = (alpha: number) => {
      const outer = ballOuter(sizeRef.current);
      for (const n of ballNodes) {
        if (n.fx != null) continue; // pinned center
        const x = n.x ?? 0, y = n.y ?? 0, z = n.z ?? 0;
        const r = Math.hypot(x, y, z);
        if (r < 1e-3) continue;
        const d = Math.min(3, depthRef.current.get(n.id) ?? 1);
        const k = ((outer * (BALL_SHELLS[d] ?? 1) - r) / r) * BALL_STRENGTH * alpha;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = n as any;
        m.vx = (m.vx ?? 0) + x * k;
        m.vy = (m.vy ?? 0) + y * k;
        m.vz = (m.vz ?? 0) + z * k;
      }
    };
    ball.initialize = (ns: SimNode[]) => { ballNodes = ns; };
    fg.d3Force('ball', ball);

    // The default centering force translates every free node each tick while the pinned center
    // snaps back to the origin — the whole cloud jitters around "me". The shells already keep
    // the graph centered, so drop it.
    fg.d3Force('center', null);

    // Speed limit, registered last so it sees the sum of all forces: no node can jump across
    // the screen in the first ticks, the graph unfolds instead of exploding.
    let calmNodes: SimNode[] = [];
    const calm = () => {
      for (const n of calmNodes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = n as any;
        const vx = m.vx ?? 0, vy = m.vy ?? 0, vz = m.vz ?? 0;
        const sp2 = vx * vx + vy * vy + vz * vz;
        if (sp2 > MAX_NODE_SPEED * MAX_NODE_SPEED) {
          const k = MAX_NODE_SPEED / Math.sqrt(sp2);
          m.vx = vx * k;
          m.vy = vy * k;
          m.vz = vz * k;
        }
      }
    };
    calm.initialize = (ns: SimNode[]) => { calmNodes = ns; };
    fg.d3Force('calm', calm);

    // --- Renderer: cap DPR at 2, and again if the screen scale changes ---
    const renderer = fg.renderer() as THREE.WebGLRenderer;
    const applyDpr = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const size = renderer.getSize(new THREE.Vector2());
      renderer.setSize(size.x, size.y, false);
      renderer.render(fg.scene(), fg.camera());
    };
    applyDpr();
    let dprMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDpr = () => {
      applyDpr();
      dprMq.removeEventListener('change', onDpr);
      dprMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprMq.addEventListener('change', onDpr);
    };
    dprMq.addEventListener('change', onDpr);
    const resizeObserver = new ResizeObserver(() => {
      renderer.render(fg.scene(), fg.camera());
    });
    resizeObserver.observe(renderer.domElement);

    // Soft centre wash + a few stars, behind the nodes. Added once per scene.
    const scene = fg.scene() as THREE.Scene;
    const existingStars = scene.getObjectByName('so-stars') as THREE.Points | undefined;
    if (existingStars) {
      sceneFxRef.current.stars = existingStars;
      sceneFxRef.current.glow = scene.getObjectByName('so-glow') as THREE.Sprite | null;
    } else {
      const starCount = 80;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const z = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = 420 + Math.random() * 220;
        const ring = Math.sqrt(1 - z * z);
        positions[i * 3] = Math.cos(a) * ring * r;
        positions[i * 3 + 1] = z * r * 0.72;
        positions[i * 3 + 2] = Math.sin(a) * ring * r;
      }
      const starGeom = new THREE.BufferGeometry();
      starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starParsed = parseColor(colorsRef.current.star);
      const starMat = new THREE.PointsMaterial({
        color: starParsed.color,
        opacity: starParsed.opacity,
        transparent: true,
        size: 1.7,
        sizeAttenuation: true,
        depthWrite: false,
        map: res.discTexture,
        alphaTest: 0.4,
      });
      const stars = new THREE.Points(starGeom, starMat);
      stars.name = 'so-stars';
      stars.raycast = noRaycast;
      stars.frustumCulled = false;
      scene.add(stars);
      sceneFxRef.current.stars = stars;

      const glow = new THREE.Sprite(res.sceneGlowMaterial(colorsRef.current.scene));
      glow.name = 'so-glow';
      glow.position.set(0, 0, -40);
      glow.scale.set(340, 340, 1);
      glow.raycast = noRaycast;
      glow.renderOrder = -1;
      scene.add(glow);
      sceneFxRef.current.glow = glow;
    }

    // --- Single frame loop: LOD, lazy labels, intro / hover / float animation ---
    let raf = 0;
    let last = performance.now();
    let labelFrame = 0;
    const camPos = new THREE.Vector3();
    const flyV = new THREE.Vector3();
    const flyQ = new THREE.Quaternion();
    const flyQ2 = new THREE.Quaternion();
    let liftCur = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last);
      last = now;
      const cam = fg.camera() as THREE.Camera | undefined;
      if (!cam) return;
      camPos.copy(cam.position);

      // Restored view lerps position and look-at. The orbit fly always looks at the origin.
      const viewFly = viewFlyRef.current;
      const fly = flyRef.current;
      if (viewFly.active) {
        const k = Math.min(1, (now - viewFly.t0) / viewFly.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        fg.cameraPosition(
          {
            x: viewFly.p0.x + (viewFly.p1.x - viewFly.p0.x) * e,
            y: viewFly.p0.y + (viewFly.p1.y - viewFly.p0.y) * e,
            z: viewFly.p0.z + (viewFly.p1.z - viewFly.p0.z) * e,
          },
          {
            x: viewFly.l0.x + (viewFly.l1.x - viewFly.l0.x) * e,
            y: viewFly.l0.y + (viewFly.l1.y - viewFly.l0.y) * e,
            z: viewFly.l0.z + (viewFly.l1.z - viewFly.l0.z) * e,
          },
        );
        const persp = cam as THREE.PerspectiveCamera;
        const zoom = viewFly.z0 + (viewFly.z1 - viewFly.z0) * e;
        if (Math.abs(persp.zoom - zoom) > 1e-4) {
          persp.zoom = zoom;
          persp.updateProjectionMatrix();
        }
        if (k >= 1) {
          viewFly.active = false;
          persp.zoom = viewFly.z1;
          persp.updateProjectionMatrix();
        }
      } else if (fly.active) {
        const k = Math.min(1, (now - fly.t0) / fly.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        flyQ.setFromUnitVectors(fly.d0, fly.d1);
        flyQ2.identity().slerp(flyQ, e);
        flyV.copy(fly.d0).applyQuaternion(flyQ2).multiplyScalar(fly.r0 + (fly.r1 - fly.r0) * e);
        fg.cameraPosition({ x: flyV.x, y: flyV.y, z: flyV.z }, { x: 0, y: 0, z: 0 });
        if (k >= 1) fly.active = false;
      }

      // Controlled focus: start the slow orbit, keep the look-at on the node while the layout drifts
      // (the camera moves by the same step, so the orbit distance holds), lift it above a bottom card.
      const foc = focusRef.current;
      if (foc.kick) {
        foc.kick = false;
        if (!reducedRef.current && controls) {
          controls.autoRotate = true;
          rotTarget = FOCUS_ROTATE_SPEED;
        }
      }
      const orbit = controls as unknown as { target?: THREE.Vector3 } | undefined;
      if (foc.id && !viewFly.active && orbit?.target) {
        const n = nodeMapRef.current.get(foc.id);
        if (n && typeof n.x === 'number') {
          const t = orbit.target;
          const dx = (n.x - t.x) * 0.12;
          const dy = ((n.y ?? 0) - t.y) * 0.12;
          const dz = ((n.z ?? 0) - t.z) * 0.12;
          if (dx * dx + dy * dy + dz * dz > 1e-8) {
            t.set(t.x + dx, t.y + dy, t.z + dz);
            cam.position.set(cam.position.x + dx, cam.position.y + dy, cam.position.z + dz);
          }
        }
      }
      const persp = cam as THREE.PerspectiveCamera;
      const liftWant = foc.id ? foc.lift : 0;
      if (liftWant !== 0 || liftCur !== 0) {
        liftCur += (liftWant - liftCur) * Math.min(1, dt * 0.006);
        const el = (fg.renderer() as THREE.WebGLRenderer | undefined)?.domElement;
        if (Math.abs(liftCur) < 0.002 && liftWant === 0) {
          liftCur = 0;
          persp.clearViewOffset();
        } else if (el && el.clientWidth > 0 && el.clientHeight > 0) {
          // Shifting the view window down moves the picture (and the focused node) up
          persp.setViewOffset(el.clientWidth, el.clientHeight, 0, liftCur * el.clientHeight, el.clientWidth, el.clientHeight);
        }
      }

      // Smooth auto-rotate ramp. prefers-reduced-motion holds the speed at zero and does not resume.
      if (reducedRef.current) rotTarget = 0;
      if (controls && (rotTarget !== 0 || rotCur !== 0)) {
        const next = rotCur + (rotTarget - rotCur) * Math.min(1, dt * 0.004);
        if (Math.abs(next - rotCur) > 1e-4) {
          rotCur = next;
          controls.autoRotateSpeed = rotCur;
        } else if (rotTarget === 0) {
          rotCur = 0;
          controls.autoRotateSpeed = 0;
        }
      }

      const reduced = reducedRef.current;
      const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(now * 0.003);
      const nextOp = reduced ? 0.5 : 0.28 + 0.28 * pulse;
      if (Math.abs(res.pulseMaterial.opacity - nextOp) > 0.001) {
        res.pulseMaterial.opacity = nextOp;
        res.pulseDimMaterial.opacity = nextOp * DIM_OPACITY;
      }
      let labelBudget = LABELS_PER_FRAME;
      const hoverId = life.hoverId;

      if (labelFrame++ % 6 === 0) {
        const ranked: { id: string; d2: number }[] = [];
        for (const v of visRef.current.values()) {
          if (!v.outer.parent) continue;
          const depth = v.node.depth ?? 1;
          if (depth < 1 || depth > 2 || hiddenRef.current.has(depth)) continue;
          const p = v.outer.position;
          const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
          ranked.push({ id: v.node.id, d2: dx * dx + dy * dy + dz * dz });
        }
        ranked.sort((a, b) => a.d2 - b.d2);
        const next = new Set<string>();
        for (let i = 0; i < ranked.length && next.size < NEAREST_LABELS; i++) {
          const id = ranked[i]?.id;
          if (id) next.add(id);
        }
        nearestRef.current = next;
      }

      for (const v of visRef.current.values()) {
        if (!v.outer.parent) continue;
        const p = v.outer.position;
        const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        let level = d2 < LOD_CLOSE2 ? 0 : d2 < LOD_MEDIUM2 ? 1 : d2 < LOD_FAR2 ? 2 : 3;
        // Hysteresis: going back to a coarser level needs a margin, so a node sitting on a border
        // (camera rotating / node floating) does not flip between avatar and dot every frame
        if (v.level >= 0 && level > v.level) {
          const border = v.level === 0 ? LOD_CLOSE2 : v.level === 1 ? LOD_MEDIUM2 : LOD_FAR2;
          if (d2 < border * LOD_HYSTERESIS * LOD_HYSTERESIS) level = v.level;
        }
        if (level !== v.level) applyLevel(v, level);

        const showLabel = wantsLabel(v);
        const kept = !!v.node.isCenter || (pathRef.current.set.has(v.node.id) && !v.node.isDeleted);
        if (showLabel) {
          v.unwantedAt = 0;
          v.wantedAt = now;
          if (!v.label && (v.node.isCenter || labelBudget > 0)) {
            createLabel(v);
            if (!v.node.isCenter) labelBudget--;
          }
        } else if (v.label && !kept) {
          if (v.unwantedAt === 0) v.unwantedAt = now;
          else if (now - v.unwantedAt >= LABEL_IDLE_MS) dropLabel(v);
        }
        if (v.label) {
          v.label.visible = showLabel;
          const dimLabel = pathRef.current.dim && !pathRef.current.set.has(v.node.id);
          const mat = v.label.material as THREE.SpriteMaterial;
          const op = dimLabel ? DIM_OPACITY : 1;
          if (mat.opacity !== op) {
            mat.opacity = op;
            mat.transparent = true;
          }
        }
        const depth = v.node.depth ?? (v.node.isCenter ? 0 : 1);
        if (
          level === 0
          && !v.node.isCenter
          && v.node.photoUrl
          && !v.realAvatar
          && !hiddenRef.current.has(depth)
        ) {
          res.requestPhoto(v.node.photoUrl, v.node.id);
        }

        // Far nodes keep a minimum on-screen size, like stars
        if (!v.node.isCenter && level >= 2) {
          const onPath = pathRef.current.set.has(v.node.id) && !v.node.isDeleted;
          const want = Math.sqrt(d2) * MIN_DOT_PX * (onPath ? 1.35 : 1);
          const base = (level === 2 ? 2.05 * v.sf : 1.25) * (onPath ? 1.4 : 1);
          const size = Math.max(base, want);
          if (Math.abs(size - v.dot.scale.x) > size * 0.03) v.dot.scale.set(size, size, 1);
        }

        // Pop-in + hover emphasis. Reduced motion skips the pop and the float.
        let s = 1;
        if (!reduced) {
          if (now < v.bornAt) s = 0.0001;
          else if (now < v.bornAt + INTRO_MS) s = Math.max(0.0001, easeOutBack((now - v.bornAt) / INTRO_MS));
        }
        v.hover += ((hoverId === v.node.id ? 1 : 0) - v.hover) * 0.22;
        // Fade out nodes right in front of the lens: the camera passes through them instead of
        // getting "stuck" behind a huge avatar (a near-zero scale also keeps them out of picking)
        let near = 1;
        if (d2 < NEAR_FADE2 && !v.node.isCenter) {
          near = THREE.MathUtils.smoothstep(Math.sqrt(d2), NEAR_HIDE, NEAR_FADE);
        }
        const finalScale = Math.max(0.0001, s * near * (1 + 0.3 * v.hover));
        if (Math.abs(finalScale - v.lastScale) > 0.0005) {
          v.inner.scale.setScalar(finalScale);
          v.lastScale = finalScale;
        }

        if (reduced) {
          if (v.inner.position.y !== 0) v.inner.position.y = 0;
        } else if (level <= 1) {
          v.inner.position.y = Math.sin(now * 0.0011 + v.phase) * BOB_AMPLITUDE;
        }
        if (!reduced && v.pulse && v.pulse.visible && v.online) {
          const body = v.node.isCenter ? MARK_SIZE : (v.dot.visible ? v.dot.scale.x : (v.node.isCenter ? MARK_SIZE : 5) * v.sf);
          const ps = body * (v.node.isCenter ? 1.38 : 1.9) * (1 + 0.12 * pulse);
          v.pulse.scale.set(ps, ps, 1);
        }
      }

      if (labelFrame % 20 === 0) {
        const labeled: NodeVis[] = [];
        for (const v of visRef.current.values()) {
          if (v.label) labeled.push(v);
        }
        if (labeled.length > LABEL_CAP) {
          const pathNow = pathRef.current;
          const evictable = labeled.filter((v) => !v.node.isCenter && !(pathNow.set.has(v.node.id) && !v.node.isDeleted));
          evictable.sort((a, b) => {
            const au = a.unwantedAt > 0 ? a.unwantedAt : Number.POSITIVE_INFINITY;
            const bu = b.unwantedAt > 0 ? b.unwantedAt : Number.POSITIVE_INFINITY;
            if (au !== bu) return au - bu;
            return a.wantedAt - b.wantedAt;
          });
          let extra = labeled.length - LABEL_CAP;
          for (const v of evictable) {
            if (extra <= 0) break;
            dropLabel(v);
            extra--;
          }
        }
      }

      // While the simulation runs, linkPositionUpdate owns the lines. After it stops, one pass
      // when the path or the palette is dirty. Settled links are skipped inside updateOwnedLink.
      if (!simRef.current && linkDirtyRef.current) {
        flushLinks(fg.scene() as THREE.Scene | undefined);
      }

      res.pumpPhotos((nodeId, tex, url) => {
        const v = visRef.current.get(nodeId);
        if (!v || v.node.isCenter || v.node.photoUrl !== url) return;
        v.avatar.material = res.photoMaterial(url, !!v.node.isDeleted, tex);
        v.avatar.userData.matBase = v.avatar.material;
        v.avatar.userData.matDim = null;
        v.avatar.userData.photoUrl = url;
        v.realAvatar = true;
        paintNode(v);
        if (v.level >= 0) applyLevel(v, v.level);
      });
    };
    raf = requestAnimationFrame(frame);

    // --- Camera intro: fly in while the graph blooms. A restored view and reduced motion skip the fly. ---
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const restored = initialViewRef.current;
    if (restored) {
      life.userTouched = true;
      rotTarget = 0;
      rotCur = 0;
      if (controls) controls.autoRotateSpeed = 0;
      fg.cameraPosition(restored.position, restored.target);
      const persp = fg.camera() as THREE.PerspectiveCamera;
      if (restored.zoom != null && Number.isFinite(restored.zoom) && restored.zoom > 0) {
        persp.zoom = restored.zoom;
        persp.updateProjectionMatrix();
      }
      flyRef.current.active = false;
      viewFlyRef.current.active = false;
    } else if (reducedRef.current) {
      if (controls) controls.autoRotate = false;
      timers.push(setTimeout(() => { if (!life.userTouched) fitCameraRef.current(0); }, 350));
    } else {
      timers.push(setTimeout(() => { if (!life.userTouched) fitCameraRef.current(1800, true); }, 350));
      timers.push(setTimeout(() => { if (!life.userTouched) fitCameraRef.current(1500); }, 2600));
    }

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      if (resumeTimer) clearTimeout(resumeTimer);
      reduceMq.removeEventListener('change', onReduce);
      dprMq.removeEventListener('change', onDpr);
      resizeObserver.disconnect();
      sceneFxRef.current.stars = null;
      sceneFxRef.current.glow = null;
      if (controls) {
        controls.removeEventListener('start', onStart);
        controls.removeEventListener('end', onEnd);
      }
      // Deferred teardown (see StrictMode note above). Use `fg` from the closure: by the time
      // this runs React has already cleared fgRef.current.
      life.disposeTimer = setTimeout(() => {
        life.disposeTimer = null;
        try { fg.pauseAnimation(); } catch { /* noop */ }
        try { fg.controls()?.dispose(); } catch { /* noop */ }
        // three-render-objects has no destructor: release the WebGL context ourselves.
        try {
          const r = fg.renderer();
          r.setAnimationLoop(null);
          r.dispose();
          r.forceContextLoss();
        } catch { /* noop */ }
        for (const v of visRef.current.values()) disposeLabel(v.label);
        res.dispose();
        visRef.current.clear();
      }, 0);
    };
    // Mount-only: everything else is read through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----- In-place updates: no rebuild, no layout restart ----- */

  // connectionCount / lastSeen change on every refetch
  useEffect(() => {
    for (const n of nodes) {
      const sim = nodeMapRef.current.get(n.id);
      if (!sim) continue;
      sim.connectionCount = n.connectionCount;
      sim.lastSeen = n.lastSeen;
      const v = visRef.current.get(n.id);
      if (!v) continue;
      const sf = n.isCenter ? 1 : sizeFromConnections(n.connectionCount ?? 0);
      const online = isOnline(n.lastSeen);
      if (Math.abs(sf - v.sf) > 0.01 || online !== v.online) {
        v.sf = sf;
        v.online = online;
        if (v.level >= 0) applyLevel(v, v.level);
      }
    }
  }, [nodes, applyLevel]);

  // Structural changes that need new objects (name / photo / deleted). Theme does not rebuild the scene.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const refresh = needsRefreshRef.current;
    needsRefreshRef.current = false;
    if (refresh) {
      for (const v of visRef.current.values()) disposeLabel(v.label);
      visRef.current.clear();
      linkLinesRef.current = [];
      linkScanRef.current = true;
      linkDirtyRef.current = true;
      res.resetMaterials();
      try { fg.refresh(); } catch { /* noop */ }
    }
  }, [graphData, res]);

  // Palette, then path: repaint dots and labels. Link accessors read pathRef.
  useEffect(() => {
    res.setColors(colors);
    const stars = sceneFxRef.current.stars;
    if (stars) {
      const parsed = parseColor(colors.star);
      const mat = stars.material as THREE.PointsMaterial;
      mat.color.set(parsed.color);
      mat.opacity = parsed.opacity;
      mat.transparent = true;
    }
    const wash = sceneFxRef.current.glow;
    if (wash) wash.material = res.sceneGlowMaterial(colors.scene);
    for (const v of visRef.current.values()) {
      paintNode(v);
      restyleLabel(v);
      if (v.level >= 0) applyLevel(v, v.level);
    }
    linkDirtyRef.current = true;
    const fg = fgRef.current;
    if (!fg) return;
    try { fg.renderer().render(fg.scene(), fg.camera()); } catch { /* noop */ }
  }, [colors, pathState, paintNode, restyleLabel, applyLevel, res]);

  const hiddenBootRef = useRef(true);
  useEffect(() => {
    if (hiddenBootRef.current) {
      hiddenBootRef.current = false;
      return;
    }
    linkScanRef.current = true;
    linkDirtyRef.current = true;
  }, [hiddenKey]);

  useEffect(() => {
    res.setLogo(logoUrl || '/logo.png');
  }, [logoUrl, res]);

  // Ring 1 is fetched as soon as the data arrives. Rings 2–3 stay on the distance path in the frame loop.
  useEffect(() => {
    if (hiddenRef.current.has(1)) return;
    for (const n of graphData.nodes) {
      const depth = n.depth ?? (n.isCenter ? 0 : 1);
      if (depth !== 1 || n.isCenter || !n.photoUrl) continue;
      res.requestPhoto(n.photoUrl, n.id);
    }
  }, [signature, hiddenKey, graphData, res]);

  /* ----- Interaction ----- */

  const handleNodeClick = useCallback((node: SimNode) => {
    if (!node?.id) return;
    // Bring the tapped node to the middle of the view: the camera keeps its viewing direction and
    // distance band, and the orbit now turns around that node. "To me" and Fit glide back to the center.
    const fg = fgRef.current;
    const { x, y, z } = node;
    // With a controlled focus the screen answers the tap through `focusId`, which flies the camera
    if (!focusControlledRef.current && fg && typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
      lifeRef.current.userTouched = true;
      const target = new THREE.Vector3(x, y, z);
      const cam = fg.camera() as THREE.Camera;
      const dir = cam.position.clone().sub(lookAt());
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      const dist = THREE.MathUtils.clamp(dir.length() * 0.7, 70, 180);
      flyPose(target.clone().add(dir.normalize().multiplyScalar(dist)), target, 800);
    }
    // onNodeTap must not pause. The pause stays only for the legacy navigation callback.
    onNodeTapRef.current?.(node);
    if (!onNodeClickRef.current) return;
    try { fgRef.current?.pauseAnimation(); } catch { /* noop */ }
    onNodeClickRef.current(String(node.id));
  }, [flyPose, lookAt]);

  // Controlled focus: fly close to the node (keeping the viewing direction), or back to the pose before it
  useEffect(() => {
    if (!focusControlled) return;
    const f = focusRef.current;
    const next = focusId ?? null;
    if (next === f.id) return;
    const prev = f.id;
    f.id = next;
    // No cleanup that cancels retries: under StrictMode the re-run sees the same id and returns early,
    // and a stale retry stops by itself once the focus has changed.
    if (next) {
      lifeRef.current.userTouched = true; // the intro fit must not take the camera away
      // The node may still be without a position right after mount: retry a few times
      const go = (tries: number) => {
        const fg = fgRef.current;
        const node = nodeMapRef.current.get(next);
        if (focusRef.current.id !== next) return;
        if (!fg || !node || typeof node.x !== 'number') {
          if (tries > 0) setTimeout(() => go(tries - 1), 250);
          return;
        }
        const cam = fg.camera() as THREE.PerspectiveCamera;
        if (!prev && !f.before) {
          const look = lookAt();
          f.before = {
            position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            target: { x: look.x, y: look.y, z: look.z },
          };
        }
        const target = new THREE.Vector3(node.x, node.y ?? 0, node.z ?? 0);
        // Look from outside the ball: mostly along "centre → person", a little along the current view,
        // so nobody sits between the camera and the person and the turn is not abrupt
        const view = cam.position.clone().sub(target);
        if (view.lengthSq() < 1e-6) view.set(0, 0, 1);
        const out = target.lengthSq() > 1 ? target.clone().normalize() : view.clone().normalize();
        const dir = out.multiplyScalar(0.7).add(view.normalize().multiplyScalar(0.3));
        if (dir.lengthSq() < 1e-6) dir.copy(out);
        // Close enough to read the name, far enough to see the person's own links around them
        const dist = THREE.MathUtils.clamp(ballOuter(sizeRef.current) * 1.4, 90, 150);
        flyPose(target.clone().add(dir.normalize().multiplyScalar(dist)), target, FOCUS_FLY_MS);
        f.kick = true;
      };
      go(12);
    } else if (f.before) {
      const b = f.before;
      f.before = null;
      flyPose(
        new THREE.Vector3(b.position.x, b.position.y, b.position.z),
        new THREE.Vector3(b.target.x, b.target.y, b.target.z),
        FOCUS_FLY_MS,
      );
    }
  }, [focusControlled, focusId, flyPose, lookAt]);

  const handleNodeHover = useCallback((node: { id?: string | number } | null) => {
    lifeRef.current.hoverId = node?.id != null ? String(node.id) : null;
  }, []);

  const nodeVisible = useCallback((node: SimNode) => {
    if (node.isCenter) return true;
    const depth = node.depth ?? depthRef.current.get(node.id) ?? 1;
    if (depth <= 0) return true;
    return !hiddenRef.current.has(depth);
  }, [hiddenKey]);

  const linkVisible = useCallback((link: { source?: string | SimNode; target?: string | SimNode }) => {
    const src = typeof link.source === 'object' ? link.source : nodeMapRef.current.get(String(link.source ?? ''));
    const tgt = typeof link.target === 'object' ? link.target : nodeMapRef.current.get(String(link.target ?? ''));
    if (!src || !tgt) return true;
    return nodeVisible(src) && nodeVisible(tgt);
  }, [nodeVisible]);

  const linkColor = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      const path = pathRef.current;
      const palette = colorsRef.current;
      if (src && tgt && path.links.has(`${src}\0${tgt}`)) return withAlpha(palette.care, 0.95);
      return lineColor(palette.line, path.dim);
    },
    [],
  );

  // Library curvature stays 0 so it never resizes the position buffer. Returning true tells it
  // to skip its own write. Path bend is applied in styleLink.
  const onLinkPosition = useCallback((
    obj: THREE.Object3D,
    coords: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } },
    link: object,
  ) => {
    const line = lineOf(obj);
    if (!line) return false;
    styleLink(
      line,
      link as SimLink,
      coords.start.x || 0, coords.start.y || 0, coords.start.z || 0,
      coords.end.x || 0, coords.end.y || 0, coords.end.z || 0,
    );
    return true;
  }, [styleLink]);

  const nodeLabel = useCallback(
    (node: { name?: string; connectionCount?: number; lastSeen?: string | Date | null }) => {
      const card = overlayColors(themeRef.current);
      const name = escapeHtml(String(node.name ?? '').trim() || '·');
      const count = Number(node.connectionCount ?? 0) || 0;
      const online = isOnline(node.lastSeen);
      return `<div style="padding:10px 12px;border-radius:16px;background:${card.surface};color:${card.ink};font-family:Manrope,sans-serif;font-size:13px;line-height:1.35;font-weight:700;box-shadow:0 10px 28px rgba(11,21,19,.28);border:1px solid ${card.line};pointer-events:none;min-width:112px">
        <div style="font-weight:800;letter-spacing:-.02em">${name}</div>
        <div style="margin-top:2px;font-weight:600;font-size:12px;color:${card.muted}">${count}${online ? ` · <span style="color:${card.care}">online</span>` : ''}</div>
      </div>`;
    },
    [],
  );

  // Focus the camera on the center node ("me") keeping the current viewing direction
  const focusOnMe = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    lifeRef.current.userTouched = true;
    // Keep the viewing direction (relative to whatever the camera looks at now).
    const dir = (fg.camera() as THREE.Camera).position.clone().sub(lookAt());
    if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    flyTo(dir, 85, 900);
  }, [flyTo, lookAt]);

  const fitAll = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    let placed = false;
    for (const n of nodeMapRef.current.values()) {
      const x = n.x;
      const y = n.y;
      const z = n.z;
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x !== 0 || y !== 0 || z !== 0) { placed = true; break; }
    }
    if (!placed) return;
    lifeRef.current.userTouched = true;
    flyRef.current.active = false;
    viewFlyRef.current.active = false;
    fitCameraRef.current(reducedRef.current ? 0 : 1000);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    lifeRef.current.userTouched = true;
    const cam = fg.camera() as THREE.Camera;
    const controls = fg.controls() as { minDistance?: number; maxDistance?: number } | undefined;
    const min = controls?.minDistance ?? 30;
    const max = controls?.maxDistance && controls.maxDistance > min ? controls.maxDistance : 1600;
    const look = lookAt();
    if (look.lengthSq() > 1) {
      // Zoom around the focused node, not back toward the center.
      const offset = cam.position.clone().sub(look);
      const dist = THREE.MathUtils.clamp(Math.max(1, offset.length()) * factor, min, max);
      flyPose(look.clone().add(offset.normalize().multiplyScalar(dist)), look, 280);
      return;
    }
    const dist = Math.max(1, cam.position.length());
    flyTo(cam.position, THREE.MathUtils.clamp(dist * factor, min, max), 280);
  }, [flyTo, flyPose, lookAt]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomBy(0.8),
    zoomOut: () => zoomBy(1.2),
    fit: () => fitAll(),
    focusOnMe: () => focusOnMe(),
    getView: () => {
      const fg = fgRef.current;
      if (!fg) return null;
      const cam = fg.camera() as THREE.PerspectiveCamera | undefined;
      if (!cam) return null;
      const controls = fg.controls() as { target?: THREE.Vector3 } | undefined;
      const t = controls?.target;
      return {
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target: { x: t?.x ?? 0, y: t?.y ?? 0, z: t?.z ?? 0 },
        zoom: cam.zoom,
      };
    },
    setView: (view, options) => {
      const fg = fgRef.current;
      if (!fg || !view?.position || !view?.target) return;
      const nums = [view.position.x, view.position.y, view.position.z, view.target.x, view.target.y, view.target.z];
      if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return;
      lifeRef.current.userTouched = true;
      flyRef.current.active = false;
      const cam = fg.camera() as THREE.PerspectiveCamera;
      const controls = fg.controls() as { target?: THREE.Vector3 } | undefined;
      const zoom = view.zoom != null && Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : cam.zoom;
      if (!options?.animate || reducedRef.current) {
        viewFlyRef.current.active = false;
        fg.cameraPosition(view.position, view.target);
        if (Math.abs(cam.zoom - zoom) > 1e-4) {
          cam.zoom = zoom;
          cam.updateProjectionMatrix();
        }
        return;
      }
      const f = viewFlyRef.current;
      f.p0.copy(cam.position);
      if (controls?.target) f.l0.copy(controls.target);
      else f.l0.set(0, 0, 0);
      f.p1.set(view.position.x, view.position.y, view.position.z);
      f.l1.set(view.target.x, view.target.y, view.target.z);
      f.z0 = cam.zoom || 1;
      f.z1 = zoom || 1;
      f.t0 = performance.now();
      f.dur = 700;
      f.active = true;
    },
  }), [zoomBy, fitAll, focusOnMe]);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.load) return;
    let cancel = false;
    fonts.load('700 64px Manrope').then(() => {
      if (cancel) return;
      for (const v of visRef.current.values()) restyleLabel(v);
    }).catch(() => { /* font stays on the fallback */ });
    return () => { cancel = true; };
  }, [restyleLabel]);

  const btnStyle = {
    position: 'absolute' as const,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 12,
    border: '1px solid rgba(231,238,235,0.14)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(19,36,32,0.78)',
    color: colors.node1,
    boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
    padding: 0,
  };

  const rendererConfig = useMemo(
    () => ({
      antialias: (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) < 2,
      powerPreference: 'high-performance' as const,
    }),
    [],
  );

  return (
    <div style={{ position: 'relative', width: width || '100%', height: height || '100%', background: colors.scene }}>
      {showControls && (
        <>
          <button
            onClick={focusOnMe}
            title="Focus on me"
            aria-label="Focus on me"
            style={{ ...btnStyle, bottom: 16 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </button>
          <button
            onClick={fitAll}
            title="Show whole network"
            aria-label="Show whole network"
            style={{ ...btnStyle, bottom: 64 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V4h5" />
              <path d="M20 9V4h-5" />
              <path d="M4 15v5h5" />
              <path d="M20 15v5h-5" />
            </svg>
          </button>
        </>
      )}
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        controlType="orbit"
        rendererConfig={rendererConfig}
        backgroundColor={colors.scene}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeVisibility={nodeVisible}
        nodeLabel={nodeLabel}
        linkColor={linkColor}
        linkCurvature={0}
        linkPositionUpdate={onLinkPosition}
        linkWidth={0}
        linkOpacity={1}
        linkVisibility={linkVisible}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onEngineTick={() => { simRef.current = true; }}
        onEngineStop={() => {
          simRef.current = false;
          linkDirtyRef.current = true;
          const owner = ownerRef.current;
          if (owner) writeLayout(owner, nodeMapRef.current.values());
          for (const n of nodeMapRef.current.values()) {
            if (n.isCenter) continue;
            n.fx = undefined;
            n.fy = undefined;
            n.fz = undefined;
          }
          if (lifeRef.current.userTouched || initialViewRef.current) return;
          fitCameraRef.current(reducedRef.current ? 0 : 1400);
        }}
        enableNodeDrag={false}
        warmupTicks={0}
        cooldownTicks={holdLayout ? 0 : Infinity}
        cooldownTime={7000}
        d3AlphaDecay={0.014}
        d3VelocityDecay={0.4}
        showNavInfo={false}
      />
    </div>
  );
});

/* ---------- Shared GPU resources ---------- */

/** Care tile. The brand mark is the real logo, tinted, not a redraw. */
function paintTile(
  ctx: CanvasRenderingContext2D,
  size: number,
  fill: string,
  ink: string,
  logo: HTMLImageElement | null,
) {
  const r = size * 0.29;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (!logo || !logo.naturalWidth) return;
  const stamp = document.createElement('canvas');
  stamp.width = size;
  stamp.height = size;
  const sctx = stamp.getContext('2d');
  if (!sctx) return;
  const boxW = size * 0.68;
  const boxH = boxW * 0.71;
  sctx.drawImage(logo, (size - boxW) / 2, (size - boxH) / 2, boxW, boxH);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = ink;
  sctx.fillRect(0, 0, size, size);
  ctx.drawImage(stamp, 0, 0);
}

function paintWash(ctx: CanvasRenderingContext2D, size: number, scene: string) {
  const g = ctx.createRadialGradient(size * 0.5, size * 0.42, size * 0.04, size * 0.5, size * 0.46, size * 0.5);
  g.addColorStop(0, 'rgba(27,51,46,0.85)');
  g.addColorStop(0.62, 'rgba(19,36,32,0.28)');
  g.addColorStop(1, withAlpha(scene, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function createResources() {
  const textures: THREE.Texture[] = [];
  const track = <T extends THREE.Texture>(t: T): T => { textures.push(t); return t; };

  const makeCanvasTexture = (size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return track(tex);
  };

  // White disc / ring, tinted per material
  const discTexture = makeCanvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
  });
  const ringTexture = makeCanvasTexture(128, (ctx, s) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  });

  const materials = new Map<string, THREE.SpriteMaterial>();
  const avatars = createAvatarClient();
  let disposed = false;
  let colors: GraphColors = { ...resolveColors(null) };
  let markKey = '';
  let markTex: THREE.CanvasTexture | null = null;
  const markCanvas = document.createElement('canvas');
  markCanvas.width = 256;
  markCanvas.height = 256;
  let logoImg: HTMLImageElement | null = null;
  let logoUrl = '';
  let logoState: 'idle' | 'loading' | 'ok' | 'fail' = 'idle';

  const cached = (key: string, make: () => THREE.SpriteMaterial) => {
    let m = materials.get(key);
    if (!m) { m = make(); materials.set(key, m); }
    return m;
  };

  const pulseMaterial = new THREE.SpriteMaterial({
    map: ringTexture, color: parseColor(colors.care).color, transparent: true, opacity: 0.5, depthWrite: false,
  });
  const pulseDimMaterial = pulseMaterial.clone();

  const washTextures = new Map<string, THREE.Texture>();
  const sceneWash = (scene: string) => {
    let tex = washTextures.get(scene);
    if (!tex) {
      tex = makeCanvasTexture(256, (ctx, s) => paintWash(ctx, s, scene));
      washTextures.set(scene, tex);
    }
    return tex;
  };

  const logoToken = () => (logoState === 'ok' && logoImg ? logoUrl : '');
  const markKeyNow = () => `${colors.careBright}|${colors.careOn}|${logoToken()}`;
  const redrawMark = () => {
    const ctx = markCanvas.getContext('2d');
    if (!ctx) return;
    paintTile(ctx, 256, colors.careBright, colors.careOn, logoState === 'ok' ? logoImg : null);
    if (!markTex) {
      markTex = new THREE.CanvasTexture(markCanvas);
      markTex.colorSpace = THREE.SRGBColorSpace;
      markTex.generateMipmaps = false;
      markTex.minFilter = THREE.LinearFilter;
      track(markTex);
    }
    markTex.needsUpdate = true;
    markKey = markKeyNow();
  };
  const markMap = () => {
    if (markTex && markKey === markKeyNow()) return markTex;
    redrawMark();
    return markTex!;
  };

  const api = {
    discTexture,
    pulseMaterial,
    pulseDimMaterial,

    setColors(next: GraphColors) {
      colors = next;
      const care = parseColor(next.care).color;
      pulseMaterial.color.set(care);
      pulseDimMaterial.color.set(care);
    },
    setLogo(url: string) {
      const next = url || '/logo.png';
      if (logoUrl === next && logoState !== 'idle') return;
      logoUrl = next;
      logoState = 'loading';
      logoImg = null;
      const img = new Image();
      img.onload = () => {
        if (disposed || logoUrl !== next) return;
        logoImg = img;
        logoState = 'ok';
        redrawMark();
      };
      img.onerror = () => {
        if (logoUrl !== next) return;
        logoImg = null;
        logoState = 'fail';
        redrawMark();
      };
      img.src = next;
    },
    dotMaterial(color: number, opacity: number) {
      const op = opacity.toFixed(3);
      return cached(`dot:${color}:${op}`, () => new THREE.SpriteMaterial({
        map: discTexture, color, transparent: true, opacity, depthWrite: false,
      }));
    },
    markMaterial(dim: boolean) {
      const map = markMap();
      return cached(`mark:${dim ? 1 : 0}:${colors.careBright}:${colors.careOn}`, () => new THREE.SpriteMaterial({
        map, transparent: true, opacity: dim ? 0.35 : 1, depthWrite: false,
      }));
    },
    glowMaterial() {
      const color = parseColor(colors.care).color;
      return cached(`glow:${color}`, () => new THREE.SpriteMaterial({
        map: discTexture, color, transparent: true, opacity: 0.22, depthWrite: false,
      }));
    },
    sceneGlowMaterial(scene: string) {
      const key = `wash:${scene}`;
      return cached(key, () => new THREE.SpriteMaterial({
        map: sceneWash(scene), transparent: true, depthWrite: false, opacity: 1,
      }));
    },
    photoMaterial(url: string, deleted: boolean, tex: THREE.Texture) {
      return cached(`photo:${url}:${deleted}`, () => new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: deleted ? 0.5 : 1,
      }));
    },

    peekPhoto(url: string) {
      return avatars.peek(url);
    },
    holdPhoto(url: string) {
      avatars.hold(url);
    },
    /** Shared module cache. Same-origin and data URLs load directly; other hosts go through the image proxy. */
    requestPhoto(url: string, nodeId: string) {
      if (disposed) return;
      avatars.request(url, nodeId);
    },
    pumpPhotos(apply: (nodeId: string, tex: THREE.Texture, url: string) => void) {
      if (disposed) return;
      avatars.pump(apply);
    },

    /** Theme switch: tinted materials are rebuilt, textures stay. */
    resetMaterials() {
      for (const m of materials.values()) m.dispose();
      materials.clear();
    },
    dispose() {
      disposed = true;
      for (const m of materials.values()) m.dispose();
      materials.clear();
      pulseMaterial.dispose();
      pulseDimMaterial.dispose();
      for (const t of textures) t.dispose();
      textures.length = 0;
      // Avatar textures stay in the module cache. release() only drops this graph's pins.
      avatars.release();
    },
  };
  return api;
}
