import { useCallback, useEffect, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';

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
  highlightPath?: string[];
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  darkMode?: boolean;
  controlsHint?: string;
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
const MIN_DOT_PX = 0.0075;       // far dots never get smaller than ~5px on screen (size / distance)

/* ---------- Depth colors ---------- */
export const DEPTH_COLORS_DARK = [
  { main: '#3b82f6', bg: 'rgba(59,130,246,0.2)', dot: 0x3b82f6 },  // 0: center — blue
  { main: '#6366f1', bg: 'rgba(99,102,241,0.2)', dot: 0x6366f1 },  // 1: indigo
  { main: '#06b6d4', bg: 'rgba(6,182,212,0.2)', dot: 0x06b6d4 },   // 2: cyan
  { main: '#64748b', bg: 'rgba(100,116,139,0.2)', dot: 0x64748b },  // 3: slate
];
export const DEPTH_COLORS_LIGHT = [
  { main: '#2563eb', bg: 'rgba(37,99,235,0.15)', dot: 0x2563eb },   // 0: center — blue
  { main: '#4f46e5', bg: 'rgba(79,70,229,0.15)', dot: 0x4f46e5 },   // 1: indigo
  { main: '#0891b2', bg: 'rgba(8,145,178,0.15)', dot: 0x0891b2 },   // 2: cyan
  { main: '#475569', bg: 'rgba(71,85,105,0.15)', dot: 0x475569 },   // 3: slate
];

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

const noRaycast = () => { /* decorative objects must not take part in hover raycasting */ };

/**
 * three-spritetext regenerates its canvas + texture on every property setter (6x per label if set
 * one by one). Fill the private fields and generate once; also use a lighter 60px font.
 */
function makeLabel(text: string, textHeight: number, color: string, background: string): SpriteText {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = new SpriteText('') as any;
  l._text = text;
  l._textHeight = textHeight;
  l._color = color;
  l._backgroundColor = background;
  l._padding = 1.5;
  l._borderRadius = 3;
  l._fontSize = 60;
  l._genCanvas();
  l.material.depthWrite = false;
  return l as SpriteText;
}

function disposeLabel(l: SpriteText | null) {
  if (!l) return;
  l.material.map?.dispose();
  l.material.dispose();
}

/* ---------- Component ---------- */

export function NetworkGraph({
  nodes,
  edges,
  highlightPath,
  width,
  height,
  onNodeClick,
  darkMode = true,
  controlsHint: _controlsHint,
}: NetworkGraphProps) {
  const fgRef = useRef<FGRef>(null);

  // Latest props for stable callbacks (the force graph must not see new function identities)
  const darkRef = useRef(darkMode);
  darkRef.current = darkMode;
  const highlightKey = (highlightPath ?? []).join(',');
  const highlightRef = useRef<Set<string>>(new Set());
  highlightRef.current = useMemo(() => new Set(highlightPath ?? []), [highlightKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  /* ----- Stable graph data: node objects survive re-renders, layout is kept ----- */

  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const visRef = useRef<Map<string, NodeVis>>(new Map());
  const introSeenRef = useRef<Set<string>>(new Set());
  const needsRefreshRef = useRef(false);
  const depthRef = useRef<Map<string, number>>(new Map());
  const subtreeRef = useRef<Map<string, number>>(new Map());

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

  const applyLevel = useCallback((v: NodeVis, level: number) => {
    const n = v.node;
    const isC = !!n.isCenter;
    const sf = v.sf;
    const avatarSize = (isC ? 12 : 5) * sf;
    v.level = level;

    v.avatar.visible = level === 0;
    v.avatar.scale.set(avatarSize, avatarSize, 1);
    if (v.pulse) {
      v.pulse.visible = v.online && !n.isDeleted && level <= 1;
      const ps = avatarSize + 2.4;
      v.pulse.scale.set(ps, ps, 1);
    }

    v.dot.visible = level >= 1;
    const dotSize = level === 1 ? (isC ? 10 : 4 * sf) : level === 2 ? (isC ? 6 : 2 * sf) : 1;
    v.dot.scale.set(dotSize, dotSize, 1);

    if (v.label) {
      v.label.visible = level <= 1;
      const base = (v.label.userData.baseScale as THREE.Vector3);
      const k = level === 0 ? 1 : 0.83;
      v.label.scale.set(base.x * k, base.y * k, 1);
      v.label.position.y = level === 0 ? -(avatarSize / 2 + 2) : -4;
    }
  }, []);

  const createLabel = useCallback((v: NodeVis) => {
    const n = v.node;
    const dark = darkRef.current;
    const palette = dark ? DEPTH_COLORS_DARK : DEPTH_COLORS_LIGHT;
    const depthColor = palette[Math.min(n.depth ?? (n.isCenter ? 0 : 1), 3)] ?? palette[palette.length - 1]!;
    const hl = highlightRef.current.has(n.id);
    const colors = dark
      ? { deleted: '#888888', highlight: '#f59e0b', deletedBg: 'rgba(80,80,80,0.6)', highlightBg: 'rgba(245,158,11,0.2)' }
      : { deleted: '#9ca3af', highlight: '#d97706', deletedBg: 'rgba(156,163,175,0.3)', highlightBg: 'rgba(217,119,6,0.15)' };

    const label = makeLabel(
      String(n.name ?? ''),
      n.isCenter ? 2.5 : 1.8,
      n.isDeleted ? colors.deleted : hl ? colors.highlight : depthColor.main,
      n.isDeleted ? colors.deletedBg : hl ? colors.highlightBg : depthColor.bg,
    );
    label.raycast = noRaycast;
    label.userData.baseScale = label.scale.clone();
    v.label = label;
    v.inner.add(label);
    // Re-apply the level so the label gets its position/scale/visibility
    applyLevel(v, v.level);
  }, [applyLevel]);

  const nodeThreeObject = useCallback((node: SimNode) => {
    const dark = darkRef.current;
    const palette = dark ? DEPTH_COLORS_DARK : DEPTH_COLORS_LIGHT;
    const depthIdx = Math.min(node.depth ?? (node.isCenter ? 0 : 1), 3);
    const depthColor = palette[depthIdx] ?? palette[palette.length - 1]!;
    const isC = !!node.isCenter;
    const sf = isC ? 1 : sizeFromConnections(node.connectionCount ?? 0);
    const avatarSize = (isC ? 12 : 5) * sf;

    const outer = new THREE.Group();
    const inner = new THREE.Group();
    outer.add(inner);

    const avatar = new THREE.Sprite(res.placeholderMaterial(node, !!node.isDeleted));
    avatar.name = 'avatar';
    inner.add(avatar);

    const dot = new THREE.Sprite(res.dotMaterial(depthColor.dot, !!node.isDeleted));
    dot.visible = false;
    inner.add(dot);

    if (isC) {
      const ring = new THREE.Sprite(res.ringMaterial(0x3b82f6, 0.9));
      ring.scale.set(avatarSize + 2.6, avatarSize + 2.6, 1);
      ring.raycast = noRaycast;
      const glow = new THREE.Sprite(res.ringMaterial(0x60a5fa, 0.35));
      glow.scale.set(avatarSize + 5.2, avatarSize + 5.2, 1);
      glow.raycast = noRaycast;
      inner.add(ring, glow);
    }

    const pulse = new THREE.Sprite(res.pulseMaterial);
    pulse.raycast = noRaycast;
    pulse.visible = false;
    inner.add(pulse);

    const seen = introSeenRef.current.has(node.id);
    const depth = node.depth ?? (isC ? 0 : 1);
    const v: NodeVis = {
      node,
      outer,
      inner,
      avatar,
      dot,
      label: null,
      pulse,
      level: -1,
      sf,
      online: isOnline(node.lastSeen),
      // Staggered pop-in: closer circles first; nodes seen before (theme refresh) appear instantly
      bornAt: seen ? -Infinity : performance.now() + depth * 160 + hash01(node.id) * 260,
      hover: 0,
      phase: hash01(node.id + 'p') * Math.PI * 2,
      realAvatar: false,
      lastScale: -1,
    };
    introSeenRef.current.add(node.id);
    visRef.current.set(node.id, v);
    inner.scale.setScalar(0.0001);
    return outer;
  }, [res]);

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
    const dist = THREE.MathUtils.clamp(r / Math.sin(Math.min(vfov, hfov) / 2), 90, 1600);
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
    let rotTarget = AUTO_ROTATE_SPEED;
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

    // --- Renderer: balanced resolution, dynamic downscale when frames get slow ---
    const renderer = fg.renderer() as THREE.WebGLRenderer;
    const heavy = graphData.nodes.length > 200;
    let pixelRatio = Math.min(window.devicePixelRatio || 1, heavy ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);

    // --- Single frame loop: LOD, lazy labels, intro / hover / float animation ---
    let raf = 0;
    let last = performance.now();
    const mountedAt = last;
    const dtSamples: number[] = [];
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

      // Smooth auto-rotate ramp (no jerk after the user lets go)
      if (controls) {
        rotCur += (rotTarget - rotCur) * Math.min(1, dt * 0.004);
        controls.autoRotateSpeed = rotCur;
      }

      // Adaptive resolution: ~45 frames sample, never below 1x
      if (now - mountedAt > 3500 && dt < 100) {
        dtSamples.push(dt);
        if (dtSamples.length >= 45) {
          const avg = dtSamples.reduce((a, b) => a + b, 0) / dtSamples.length;
          dtSamples.length = 0;
          if (avg > 30 && pixelRatio > 1) {
            pixelRatio = Math.max(1, pixelRatio - 0.25);
            const size = renderer.getSize(new THREE.Vector2());
            renderer.setPixelRatio(pixelRatio);
            renderer.setSize(size.x, size.y);
          }
        }
      }

      const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
      res.pulseMaterial.opacity = 0.3 + 0.3 * pulse;
      let labelBudget = LABELS_PER_FRAME;
      const hoverId = life.hoverId;

      for (const v of visRef.current.values()) {
        const p = v.outer.position;
        const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const level = d2 < LOD_CLOSE2 ? 0 : d2 < LOD_MEDIUM2 ? 1 : d2 < LOD_FAR2 ? 2 : 3;
        if (level !== v.level) applyLevel(v, level);

        // Lazy, budgeted creation of labels and photos for nodes the user can actually see
        if (level <= 1 && !v.label && labelBudget > 0) {
          createLabel(v);
          labelBudget--;
        }
        if (level === 0 && v.node.photoUrl && !v.realAvatar) {
          res.requestPhoto(v.node.photoUrl, v.node.id);
        }

        // Far nodes keep a minimum on-screen size, like stars
        if (level >= 2) {
          const want = Math.sqrt(d2) * MIN_DOT_PX * (v.node.isCenter ? 1.6 : 1);
          const base = level === 2 ? (v.node.isCenter ? 6 : 2 * v.sf) : 1;
          const size = Math.max(base, want);
          if (Math.abs(size - v.dot.scale.x) > size * 0.03) v.dot.scale.set(size, size, 1);
        }

        // Pop-in + hover emphasis
        let s = 1;
        if (now < v.bornAt) s = 0.0001;
        else if (now < v.bornAt + INTRO_MS) s = Math.max(0.0001, easeOutBack((now - v.bornAt) / INTRO_MS));
        v.hover += ((hoverId === v.node.id ? 1 : 0) - v.hover) * 0.22;
        const finalScale = s * (1 + 0.3 * v.hover);
        if (Math.abs(finalScale - v.lastScale) > 0.0005) {
          v.inner.scale.setScalar(finalScale);
          v.lastScale = finalScale;
        }

        // Gentle floating + pulsing — only where it can be seen
        if (level <= 1) {
          v.inner.position.y = Math.sin(now * 0.0011 + v.phase) * BOB_AMPLITUDE;
          if (v.pulse && v.pulse.visible) {
            const ps = ((v.node.isCenter ? 12 : 5) * v.sf + 2.4) * (1 + 0.15 * pulse);
            v.pulse.scale.set(ps, ps, 1);
          }
        }
      }
      res.pumpPhotos((nodeId, tex, url) => {
        const v = visRef.current.get(nodeId);
        if (!v) return;
        v.avatar.material = res.photoMaterial(url, !!v.node.isDeleted, tex);
        v.realAvatar = true;
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

  // Structural changes that need new objects (name/photo/deleted) or new theme colors
  const firstThemeRender = useRef(true);
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    let refresh = needsRefreshRef.current;
    needsRefreshRef.current = false;
    if (firstThemeRender.current) {
      firstThemeRender.current = false;
    } else if (res.theme !== darkMode) {
      refresh = true;
    }
    res.setTheme(darkMode);
    if (refresh) {
      for (const v of visRef.current.values()) disposeLabel(v.label);
      visRef.current.clear();
      res.resetMaterials();
      try { fg.refresh(); } catch { /* noop */ }
    }
  }, [graphData, darkMode, res]);

  // Highlight path: re-color only the labels that changed + links
  const prevHighlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fg = fgRef.current;
    const now = highlightRef.current;
    const dark = darkRef.current;
    const palette = dark ? DEPTH_COLORS_DARK : DEPTH_COLORS_LIGHT;
    const changed = new Set<string>([...prevHighlight.current, ...now].filter((id) => prevHighlight.current.has(id) !== now.has(id)));
    for (const id of changed) {
      const v = visRef.current.get(id);
      if (!v || !v.label) continue;
      const depthColor = palette[Math.min(v.node.depth ?? (v.node.isCenter ? 0 : 1), 3)] ?? palette[palette.length - 1]!;
      const hl = now.has(id);
      v.label.color = v.node.isDeleted ? (dark ? '#888888' : '#9ca3af') : hl ? (dark ? '#f59e0b' : '#d97706') : depthColor.main;
      v.label.backgroundColor = v.node.isDeleted
        ? (dark ? 'rgba(80,80,80,0.6)' : 'rgba(156,163,175,0.3)')
        : hl ? (dark ? 'rgba(245,158,11,0.2)' : 'rgba(217,119,6,0.15)') : depthColor.bg;
    }
    prevHighlight.current = new Set(now);
    if (fg && changed.size) {
      // Re-evaluate link accessors
      fg.linkColor(fg.linkColor());
      fg.linkWidth(fg.linkWidth());
    }
  }, [highlightKey]);

  /* ----- Interaction ----- */

  const handleNodeClick = useCallback((node: { id?: string | number }) => {
    if (!node.id || !onNodeClickRef.current) return;
    const id = String(node.id);
    // Stop rendering right away; the actual WebGL teardown happens on unmount.
    try { fgRef.current?.pauseAnimation(); } catch { /* noop */ }
    onNodeClickRef.current(id);
  }, []);

  const handleNodeHover = useCallback((node: { id?: string | number } | null) => {
    lifeRef.current.hoverId = node?.id != null ? String(node.id) : null;
  }, []);

  const linkColor = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      const hl = highlightRef.current;
      if (src && tgt && hl.has(src) && hl.has(tgt)) return 'rgba(245,158,11,0.8)';
      // Color by max depth of endpoints
      const srcDepth = src ? (depthRef.current.get(src) ?? 3) : 3;
      const tgtDepth = tgt ? (depthRef.current.get(tgt) ?? 3) : 3;
      const maxDepth = Math.min(Math.max(srcDepth, tgtDepth), 3);
      const palette = darkRef.current ? DEPTH_COLORS_DARK : DEPTH_COLORS_LIGHT;
      const color = palette[maxDepth] ?? palette[palette.length - 1]!;
      return color.main + '55';
    },
    [],
  );

  // Width 0 = cheap 1px line; only the highlighted handshake path gets real geometry
  const linkWidth = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      const hl = highlightRef.current;
      return src && tgt && hl.has(src) && hl.has(tgt) ? 1.6 : 0;
    },
    [],
  );

  const nodeLabel = useCallback(
    (node: { name?: string; connectionCount?: number; lastSeen?: string | Date | null }) => {
      const dark = darkRef.current;
      const name = escapeHtml(String(node.name ?? ''));
      const count = Number(node.connectionCount ?? 0) || 0;
      const status = isOnline(node.lastSeen) ? '<span style="color:#22c55e">● Online</span>' : '';
      return `<div style="padding:6px 10px;border-radius:8px;background:${dark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)'};color:${dark ? '#e2e8f0' : '#1e293b'};font-size:12px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none">
        <div style="font-weight:600;font-size:13px">${name}</div>
        <div style="opacity:0.7">🤝 ${count} connections</div>
        ${status ? `<div>${status}</div>` : ''}
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

  const btnStyle = {
    position: 'absolute' as const,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: darkMode ? 'rgba(30,41,59,0.85)' : 'rgba(255,255,255,0.9)',
    color: darkMode ? '#60a5fa' : '#2563eb',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    padding: 0,
    transition: 'background 0.2s, transform 0.15s',
  };

  const rendererConfig = useMemo(
    () => ({
      antialias: (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) < 2,
      powerPreference: 'high-performance' as const,
    }),
    [],
  );

  return (
    <div style={{ position: 'relative', width: width || '100%', height: height || '100%' }}>
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
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        controlType="orbit"
        rendererConfig={rendererConfig}
        backgroundColor="rgba(0,0,0,0)"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeLabel={nodeLabel}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.6}
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
}

/* ---------- Shared GPU resources ---------- */

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
  let active = 0;
  let disposed = false;
  let theme = true;

  const cached = (key: string, make: () => THREE.SpriteMaterial) => {
    let m = materials.get(key);
    if (!m) { m = make(); materials.set(key, m); }
    return m;
  };

  const pulseMaterial = new THREE.SpriteMaterial({
    map: ringTexture, color: 0x22c55e, transparent: true, opacity: 0.5, depthWrite: false,
  });

  const api = {
    get theme() { return theme; },
    setTheme(dark: boolean) { theme = dark; },
    pulseMaterial,
    photoQueue,

    dotMaterial(color: number, deleted: boolean) {
      return cached(`dot:${color}:${deleted}`, () => new THREE.SpriteMaterial({
        map: discTexture, color, transparent: true, opacity: deleted ? 0.5 : 0.9, depthWrite: false,
      }));
    },
    ringMaterial(color: number, opacity: number) {
      return cached(`ring:${color}:${opacity}`, () => new THREE.SpriteMaterial({
        map: ringTexture, color, transparent: true, opacity, depthWrite: false,
      }));
    },
    placeholderMaterial(node: { name?: string; isCenter?: boolean }, deleted: boolean) {
      const initial = (String(node.name ?? '?')[0] || '?').toUpperCase();
      const key = `${initial}:${node.isCenter ? 1 : 0}`;
      let tex = placeholderTextures.get(key);
      if (!tex) {
        tex = makeCanvasTexture(128, (ctx) => {
          const g = ctx.createLinearGradient(0, 0, 128, 128);
          g.addColorStop(0, node.isCenter ? '#3b82f6' : '#6366f1');
          g.addColorStop(1, node.isCenter ? '#1d4ed8' : '#4f46e5');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(64, 64, 64, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 64px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initial, 64, 68);
        });
        placeholderTextures.set(key, tex);
      }
      return cached(`ph:${key}:${deleted}`, () => new THREE.SpriteMaterial({
        map: tex!, transparent: true, opacity: deleted ? 0.5 : 1,
      }));
    },
    photoMaterial(url: string, deleted: boolean, tex: THREE.Texture) {
      return cached(`photo:${url}:${deleted}`, () => new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: deleted ? 0.5 : 1,
      }));
    },

    /** Queue a photo download (via the API proxy to bypass CORS); drawn as a circle on a 128px canvas. */
    requestPhoto(url: string, nodeId: string) {
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
      for (const t of textures) t.dispose();
      textures.length = 0;
      photoQueue.length = 0;
    },
  };
  return api;
}
