import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
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

export interface NetworkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Node ids from me to the target. Unknown ids are ignored. Fewer than two matches: no dimming. */
  highlightPath?: string[];
  /** Ring depths to hide. The centre (depth 0) always stays. */
  hiddenRings?: number[];
  /** Scene palette. Defaults are the dark v2 tokens; the scene stays dark in both themes. */
  colors?: Partial<GraphColors>;
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  /** Fires with the node on tap/click. Does not replace `onNodeClick`. */
  onNodeTap?: (node: GraphNode) => void;
  /** Overlay and tooltip only. The WebGL scene does not follow this. */
  theme?: 'light' | 'dark';
  /** @deprecated Prefer `theme`. Honoured when `theme` is omitted. */
  darkMode?: boolean;
  controlsHint?: string;
  /** In-canvas focus / fit buttons. Default true so existing screens keep them. */
  showControls?: boolean;
}

export interface NetworkGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  focusOnMe: () => void;
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
const PHOTO_CONCURRENCY = 3;
const BOB_AMPLITUDE = 0.7;       // gentle floating of close nodes
const CHARGE_BASE = 38;          // node repulsion; lower = a more compact graph
const BALL_STRENGTH = 0.5;       // pull of the spherical shells (0 = free-form layout)
const BALL_SHELLS = [0, 0.38, 0.7, 1]; // shell radius by depth, as a fraction of the outer radius
const MIN_DOT_PX = 0.0042;       // far dots stay a few pixels; nearer rings stay larger
const MARK_SIZE = 10;            // centre tile, world units
const NEAREST_LABELS = 8;        // labels on the nearest ring-1/2 nodes, plus the path
const PATH_CURVE = 0.15;         // slight bend; 0 is a straight line
const DIM_OPACITY = 0.35;

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
  const text = String(name ?? '').trim();
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

/** Bend a library Line in place. Do not touch matrixAutoUpdate — the library repositions these. */
function writeLinkLine(
  line: THREE.Line,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  curvature: number,
) {
  const geom = line.geometry;
  const segments = curvature > 0 ? 20 : 1;
  const count = segments + 1;
  let attr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!attr || attr.count !== count) {
    attr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geom.setAttribute('position', attr);
  }
  const arr = attr.array as Float32Array;
  if (curvature <= 0) {
    arr[0] = ax; arr[1] = ay; arr[2] = az;
    arr[3] = bx; arr[4] = by; arr[5] = bz;
  } else {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    let cx: number;
    let cy: number;
    let cz: number;
    if (dx === 0 && dy === 0) {
      cx = (ax + bx) / 2 + curvature * -dz;
      cy = (ay + by) / 2;
      cz = (az + bz) / 2 + curvature * dx;
    } else {
      cx = (ax + bx) / 2 + curvature * dy;
      cy = (ay + by) / 2 - curvature * dx;
      cz = (az + bz) / 2;
    }
    for (let i = 0; i < count; i++) {
      const t = i / segments;
      const u = 1 - t;
      arr[i * 3] = u * u * ax + 2 * u * t * cx + t * t * bx;
      arr[i * 3 + 1] = u * u * ay + 2 * u * t * cy + t * t * by;
      arr[i * 3 + 2] = u * u * az + 2 * u * t * cz + t * t * bz;
    }
  }
  attr.needsUpdate = true;
  geom.computeBoundingSphere();
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
  controlsHint: _controlsHint,
  showControls = true,
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

  /* ----- Stable graph data: node objects survive re-renders, layout is kept ----- */

  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
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
    for (const n of nodes) {
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

    // "Bloom": parents first, each new node starts a short random hop from an already placed
    // neighbor (compressed link length), then the simulation lets the graph unfold and glide.
    created.sort((a, b) => (a.depth ?? (a.isCenter ? 0 : 1)) - (b.depth ?? (b.isCenter ? 0 : 1)));
    for (const s of created) {
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
  const flyTo = useCallback((dir: THREE.Vector3, dist: number, ms: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    const cam = fg.camera() as THREE.Camera;
    const f = flyRef.current;
    f.r0 = Math.max(1, cam.position.length());
    f.d0.copy(cam.position).normalize();
    f.d1.copy(dir).normalize();
    f.r1 = dist;
    f.t0 = performance.now();
    f.dur = Math.max(1, ms);
    f.active = true;
  }, []);

  /* ----- Node objects ----- */

  const wantsLabel = useCallback((v: NodeVis) => {
    const n = v.node;
    const depth = n.depth ?? (n.isCenter ? 0 : 1);
    if (n.isCenter || depth <= 0) return !!n.isCenter;
    if (depth >= 3) return false;
    if (hiddenRef.current.has(depth)) return false;
    if (pathRef.current.set.has(n.id)) return true;
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
      v.avatar.visible = level === 0;
      v.avatar.scale.set(avatarSize, avatarSize, 1);
      v.dot.visible = level >= 1;
      const dotSize = (level === 1 ? 3.15 * sf : level === 2 ? 2.05 * sf : 1.25) * boost;
      v.dot.scale.set(dotSize, dotSize, 1);
    }

    if (v.pulse) {
      const show = !isC && !n.isDeleted && ((v.online && level <= 1) || onPath);
      v.pulse.visible = show;
      const body = isC ? MARK_SIZE : (v.dot.visible ? v.dot.scale.x : avatarSize);
      v.pulse.scale.set(body * (isC ? 1.38 : 1.9), body * (isC ? 1.38 : 1.9), 1);
      v.pulse.material = pathRef.current.dim && !onPath ? res.pulseDimMaterial : res.pulseMaterial;
    }

    if (v.label) {
      const base = v.label.userData.baseScale as THREE.Vector3;
      const k = isC || level === 0 ? 1 : 0.9;
      v.label.scale.set(base.x * k, base.y * k, 1);
      const body = isC ? MARK_SIZE : (level === 0 ? avatarSize : v.dot.scale.x);
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

    const outer = new THREE.Group();
    const inner = new THREE.Group();
    outer.add(inner);

    const avatar = new THREE.Sprite(isC ? res.markMaterial(false) : res.placeholderMaterial(node, !!node.isDeleted));
    avatar.name = 'avatar';
    avatar.visible = isC;
    if (isC) avatar.scale.set(MARK_SIZE, MARK_SIZE, 1);
    inner.add(avatar);

    const dotHex = depthColor(colorsRef.current, Math.max(1, depth));
    const dot = new THREE.Sprite(res.dotMaterial(parseColor(dotHex).color, 0.9));
    dot.visible = !isC;
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
      level: -1,
      sf,
      online: isOnline(node.lastSeen),
      // Staggered pop-in: closer circles first; nodes seen before (theme refresh) appear instantly
      bornAt: seen || isC ? -Infinity : performance.now() + depth * 160 + hash01(node.id) * 260,
      hover: 0,
      phase: hash01(node.id + 'p') * Math.PI * 2,
      realAvatar: false,
      lastScale: -1,
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
    const dir = cam.position.clone();
    if (dir.lengthSq() < 1) dir.set(0.35, 0.3, 1);
    dir.normalize();
    if (introSpin) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9).normalize();
    flyTo(dir, dist, ms);
    const controls = fg.controls();
    if (controls) controls.maxDistance = Math.max(600, dist * 2.2);
  }, [graphData, flyTo]);
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
    const onReduce = () => { reducedRef.current = reduceMq.matches; };
    reduceMq.addEventListener('change', onReduce);
    let rotTarget = reduceMq.matches ? 0 : AUTO_ROTATE_SPEED;
    let rotCur = 0;
    const onStart = () => {
      life.userTouched = true;
      flyRef.current.active = false;
      rotTarget = 0;
      if (resumeTimer) clearTimeout(resumeTimer);
    };
    const onEnd = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { rotTarget = AUTO_ROTATE_SPEED; }, AUTO_ROTATE_RESUME_MS);
    };
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.rotateSpeed = 0.7;
      controls.zoomSpeed = 0.8;
      controls.enablePan = false;
      controls.minDistance = 30;
      controls.autoRotate = true;
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
        // Leaf: -CHARGE, subtree=1: -2x, subtree=2: -3.5x, subtree=3: -5.5x
        return -CHARGE_BASE * (1 + d * (d + 1) / 4);
      });
      if (typeof charge.distanceMax === 'function') charge.distanceMax(320); // bounds the cost of big graphs
    }
    const BASE_LINK_DIST = 22;
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
        // Quadratic growth: d=0→1x, d=1→1.5x, d=2→2.5x, d=3→4x
        return BASE_LINK_DIST * (1 + d * (d + 1) / 4);
      });
    }

    // --- Ball: gently hold each depth on its own spherical shell (you in the middle, then 1°, 2°, 3°),
    // so the network forms a round cloud instead of sprawling like a tree. ---
    let ballNodes: SimNode[] = [];
    const ball = (alpha: number) => {
      const outer = 14 * Math.cbrt(Math.max(1, sizeRef.current)) + 34;
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

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last);
      last = now;
      const cam = fg.camera() as THREE.Camera | undefined;
      if (!cam) return;
      camPos.copy(cam.position);

      // Camera fly-to along an arc, eased in and out
      const fly = flyRef.current;
      if (fly.active) {
        const k = Math.min(1, (now - fly.t0) / fly.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        flyQ.setFromUnitVectors(fly.d0, fly.d1);
        flyQ2.identity().slerp(flyQ, e);
        flyV.copy(fly.d0).applyQuaternion(flyQ2).multiplyScalar(fly.r0 + (fly.r1 - fly.r0) * e);
        fg.cameraPosition({ x: flyV.x, y: flyV.y, z: flyV.z }, { x: 0, y: 0, z: 0 });
        if (k >= 1) fly.active = false;
      }

      // Smooth auto-rotate ramp. prefers-reduced-motion holds the speed at zero.
      if (reducedRef.current) rotTarget = 0;
      if (controls) {
        rotCur += (rotTarget - rotCur) * Math.min(1, dt * 0.004);
        controls.autoRotateSpeed = rotCur;
      }

      const reduced = reducedRef.current;
      const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(now * 0.003);
      res.pulseMaterial.opacity = reduced ? 0.5 : 0.28 + 0.28 * pulse;
      res.pulseDimMaterial.opacity = res.pulseMaterial.opacity * DIM_OPACITY;
      let labelBudget = LABELS_PER_FRAME;
      const hoverId = life.hoverId;

      if (labelFrame++ % 6 === 0) {
        const ranked: { id: string; d2: number }[] = [];
        for (const v of visRef.current.values()) {
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
        const p = v.outer.position;
        const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const level = d2 < LOD_CLOSE2 ? 0 : d2 < LOD_MEDIUM2 ? 1 : d2 < LOD_FAR2 ? 2 : 3;
        if (level !== v.level) applyLevel(v, level);

        const showLabel = wantsLabel(v);
        if (showLabel && !v.label && (v.node.isCenter || labelBudget > 0)) {
          createLabel(v);
          if (!v.node.isCenter) labelBudget--;
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
        if (level === 0 && v.node.photoUrl && !v.node.isCenter && !v.realAvatar) {
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
        const finalScale = s * (1 + 0.3 * v.hover);
        if (Math.abs(finalScale - v.lastScale) > 0.0005) {
          v.inner.scale.setScalar(finalScale);
          v.lastScale = finalScale;
        }

        if (reduced) {
          v.inner.position.y = 0;
        } else if (level <= 1) {
          v.inner.position.y = Math.sin(now * 0.0011 + v.phase) * BOB_AMPLITUDE;
        }
        if (!reduced && v.pulse && v.pulse.visible && v.online) {
          const body = v.node.isCenter ? MARK_SIZE : (v.dot.visible ? v.dot.scale.x : (v.node.isCenter ? MARK_SIZE : 5) * v.sf);
          const ps = body * (v.node.isCenter ? 1.38 : 1.9) * (1 + 0.12 * pulse);
          v.pulse.scale.set(ps, ps, 1);
        }
      }

      // Path colour and bend. The library freezes link materials after the accessor is set,
      // and it stops moving lines once the simulation cools down.
      const path = pathRef.current;
      const careInk = parseColor(colorsRef.current.care);
      const careHex = careInk.color;
      const careOp = 0.95 * (careInk.opacity || 1);
      const plainInk = parseColor(lineColor(colorsRef.current.line, false));
      const dimInk = parseColor(lineColor(colorsRef.current.line, true));
      const scene = fg.scene() as THREE.Scene | undefined;
      scene?.traverse((obj) => {
        if ((obj as { __graphObjType?: string }).__graphObjType !== 'link') return;
        const link = (obj as { __data?: SimLink }).__data;
        if (!link) return;
        const line = (obj as THREE.Line).isLine
          ? (obj as THREE.Line)
          : (obj.children.find((c) => (c as THREE.Line).isLine) as THREE.Line | undefined);
        if (!line) return;
        const a = endpointNode(link.source, nodeMapRef.current);
        const b = endpointNode(link.target, nodeMapRef.current);
        if (!a || !b || a.x == null || b.x == null) return;
        const on = !!(path.dim && a.id && b.id && path.links.has(`${a.id}\0${b.id}`));
        try {
          writeLinkLine(line, a.x, a.y ?? 0, a.z ?? 0, b.x, b.y ?? 0, b.z ?? 0, on ? PATH_CURVE : 0);
          const ink = on ? { color: careHex, opacity: careOp } : path.dim ? dimInk : plainInk;
          paintLink(line, ink.color, ink.opacity);
        } catch { /* link mesh was rebuilt by the library */ }
      });

      res.pumpPhotos((nodeId, tex, url) => {
        const v = visRef.current.get(nodeId);
        if (!v || v.node.isCenter) return;
        v.avatar.material = res.photoMaterial(url, !!v.node.isDeleted, tex);
        v.avatar.userData.matBase = v.avatar.material;
        v.avatar.userData.matDim = null;
        v.realAvatar = true;
        paintNode(v);
      });
    };
    raf = requestAnimationFrame(frame);

    // --- Camera intro: fly in while the graph blooms outward, refit as the layout settles ---
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    timers.push(setTimeout(() => { if (!life.userTouched) fitCameraRef.current(1800, true); }, 350));
    timers.push(setTimeout(() => { if (!life.userTouched) fitCameraRef.current(1500); }, 2600));

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
    const fg = fgRef.current;
    if (!fg) return;
    if (typeof fg.linkColor === 'function') fg.linkColor(fg.linkColor());
    if (typeof fg.linkCurvature === 'function') fg.linkCurvature(fg.linkCurvature());
    try { fg.renderer().render(fg.scene(), fg.camera()); } catch { /* noop */ }
  }, [colors, pathState, paintNode, restyleLabel, applyLevel, res]);

  /* ----- Interaction ----- */

  const handleNodeClick = useCallback((node: SimNode) => {
    if (!node?.id) return;
    onNodeTapRef.current?.(node);
    if (!onNodeClickRef.current) return;
    // Stop rendering right away when the page navigates away; teardown still happens on unmount.
    try { fgRef.current?.pauseAnimation(); } catch { /* noop */ }
    onNodeClickRef.current(String(node.id));
  }, []);

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

  // Width 0 keeps the cheap 1px line. Curvature is applied in the frame loop for the path only.
  const linkCurvature = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      return src && tgt && pathRef.current.links.has(`${src}\0${tgt}`) ? PATH_CURVE : 0;
    },
    [],
  );

  const nodeLabel = useCallback(
    (node: { name?: string; connectionCount?: number; lastSeen?: string | Date | null }) => {
      const card = overlayColors(themeRef.current);
      const name = escapeHtml(String(node.name ?? ''));
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
    const dir = (fg.camera() as THREE.Camera).position.clone();
    if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    flyTo(dir, 85, 900);
  }, [flyTo]);

  const fitAll = useCallback(() => {
    lifeRef.current.userTouched = true;
    fitCameraRef.current(1000);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    lifeRef.current.userTouched = true;
    const cam = fg.camera() as THREE.Camera;
    const dist = Math.max(1, cam.position.length());
    const controls = fg.controls() as { minDistance?: number; maxDistance?: number } | undefined;
    const min = controls?.minDistance ?? 30;
    const max = controls?.maxDistance && controls.maxDistance > min ? controls.maxDistance : 1600;
    flyTo(cam.position, THREE.MathUtils.clamp(dist * factor, min, max), 280);
  }, [flyTo]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomBy(0.8),
    zoomOut: () => zoomBy(1.2),
    fit: () => fitAll(),
    focusOnMe: () => focusOnMe(),
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
        linkCurvature={linkCurvature}
        linkWidth={0}
        linkOpacity={1}
        linkVisibility={linkVisible}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onEngineStop={() => { if (!lifeRef.current.userTouched) fitCameraRef.current(1400); }}
        enableNodeDrag={false}
        warmupTicks={0}
        cooldownTime={7000}
        d3AlphaDecay={0.014}
        d3VelocityDecay={0.28}
        showNavInfo={false}
      />
    </div>
  );
});

/* ---------- Shared GPU resources ---------- */

/** Care tile with the app mark: a fish facing left, eye punched, two legs, forked tail. */
function paintMark(ctx: CanvasRenderingContext2D, size: number, fill: string, ink: string) {
  const r = size * 0.28;
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

  const s = size / 100;
  ctx.save();
  ctx.translate(11 * s, 24 * s);
  ctx.scale(s, s);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(2, 26);
  ctx.bezierCurveTo(18, 4, 50, 2, 62, 18);
  ctx.bezierCurveTo(68, 24, 68, 30, 62, 34);
  ctx.bezierCurveTo(50, 50, 18, 48, 2, 26);
  ctx.closePath();
  ctx.moveTo(38, 24);
  ctx.ellipse(28, 25, 11, 6.2, -0.35, 0, Math.PI * 2);
  ctx.rect(20, 40, 11, 16);
  ctx.rect(40, 40, 11, 16);
  ctx.moveTo(58, 20);
  ctx.lineTo(84, 0);
  ctx.lineTo(78, 12);
  ctx.lineTo(64, 26);
  ctx.closePath();
  ctx.moveTo(60, 32);
  ctx.lineTo(86, 52);
  ctx.lineTo(76, 56);
  ctx.lineTo(58, 38);
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.restore();
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
  const placeholderTextures = new Map<string, THREE.Texture>();
  const photoTextures = new Map<string, THREE.Texture>();
  const pending = new Set<string>();
  const waiting = new Map<string, Set<string>>();
  const photoQueue: Array<{ url: string; nodeId: string }> = [];
  const ready: Array<{ nodeId: string; tex: THREE.Texture; url: string }> = [];
  const failedPhotos = new Set<string>();
  let active = 0;
  let disposed = false;
  let colors: GraphColors = { ...resolveColors(null) };
  let markKey = '';
  let markTex: THREE.Texture | null = null;

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

  const markMap = () => {
    const key = `${colors.careBright}|${colors.node1}`;
    if (markTex && markKey === key) return markTex;
    if (markTex) {
      markTex.dispose();
      const idx = textures.indexOf(markTex);
      if (idx >= 0) textures.splice(idx, 1);
    }
    markKey = key;
    markTex = makeCanvasTexture(256, (ctx, s) => paintMark(ctx, s, colors.careBright, colors.node1));
    return markTex;
  };

  const api = {
    discTexture,
    pulseMaterial,
    pulseDimMaterial,
    photoQueue,

    setColors(next: GraphColors) {
      colors = next;
      const care = parseColor(next.care).color;
      pulseMaterial.color.set(care);
      pulseDimMaterial.color.set(care);
    },
    dotMaterial(color: number, opacity: number) {
      const op = opacity.toFixed(3);
      return cached(`dot:${color}:${op}`, () => new THREE.SpriteMaterial({
        map: discTexture, color, transparent: true, opacity, depthWrite: false,
      }));
    },
    markMaterial(dim: boolean) {
      const map = markMap();
      return cached(`mark:${dim ? 1 : 0}:${colors.careBright}:${colors.node1}`, () => new THREE.SpriteMaterial({
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
    placeholderMaterial(node: { name?: string; isCenter?: boolean }, deleted: boolean) {
      const initial = (String(node.name ?? '?')[0] || '?').toUpperCase();
      const key = `${initial}:${node.isCenter ? 1 : 0}`;
      let tex = placeholderTextures.get(key);
      if (!tex) {
        tex = makeCanvasTexture(128, (ctx) => {
          ctx.fillStyle = '#1b332e';
          ctx.beginPath();
          ctx.arc(64, 64, 64, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e7eeeb';
          ctx.font = 'bold 64px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initial, 64, 68);
        });
        placeholderTextures.set(key, tex);
      }
      return cached(`ph:${key}:${deleted}`, () => new THREE.SpriteMaterial({
        map: tex!, transparent: true, opacity: deleted ? 0.45 : 1, depthWrite: false,
      }));
    },
    photoMaterial(url: string, deleted: boolean, tex: THREE.Texture) {
      return cached(`photo:${url}:${deleted}`, () => new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: deleted ? 0.5 : 1,
      }));
    },

    /** Queue a photo download (via the API proxy to bypass CORS); drawn as a circle on a 128px canvas. */
    requestPhoto(url: string, nodeId: string) {
      if (failedPhotos.has(url)) return;
      const tex = photoTextures.get(url);
      if (tex) { ready.push({ nodeId, tex, url }); return; }
      let set = waiting.get(url);
      if (!set) { set = new Set(); waiting.set(url, set); }
      if (set.has(nodeId)) return;
      set.add(nodeId);
      if (!pending.has(url)) {
        pending.add(url);
        photoQueue.push({ url, nodeId });
      }
    },
    pumpPhotos(apply: (nodeId: string, tex: THREE.Texture, url: string) => void) {
      while (active < PHOTO_CONCURRENCY && photoQueue.length && !disposed) {
        const job = photoQueue.shift()!;
        active++;
        const src = job.url.startsWith('/') || job.url.startsWith('data:') || job.url.startsWith('blob:') || job.url.startsWith(window.location.origin)
          ? job.url
          : `/api/image-proxy?url=${encodeURIComponent(job.url)}`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          active--;
          if (disposed) return;
          const tex = makeCanvasTexture(128, (ctx, s) => {
            ctx.beginPath();
            ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, 0, 0, s, s);
          });
          photoTextures.set(job.url, tex);
          for (const id of waiting.get(job.url) ?? []) ready.push({ nodeId: id, tex, url: job.url });
          waiting.delete(job.url);
          pending.delete(job.url);
        };
        img.onerror = () => {
          active--;
          failedPhotos.add(job.url);
          pending.delete(job.url);
          waiting.delete(job.url);
        };
        img.src = src;
      }
      while (ready.length) {
        const r = ready.shift()!;
        apply(r.nodeId, r.tex, r.url);
      }
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
      photoQueue.length = 0;
    },
  };
  return api;
}
