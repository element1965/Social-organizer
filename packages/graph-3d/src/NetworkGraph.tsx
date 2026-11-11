import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { createAvatarClient } from './avatarCache';
import { introSeenOf, isLayoutSettled, layoutOf, setLayoutSettled, writeLayout } from './layoutCache';
import {
  type GraphColors,
  GRAPH_COLORS_LIGHT,
  colorsKey,
  depthColor,
  lineColor,
  overlayColors,
  parseColor,
  resolveColors,
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

/** An active incoming Need: a signal that travels along the handshake path towards me. */
export interface GraphImpulse {
  id: string;
  /**
   * Node ids from the asker to me. The pulses travel in array order and arrive at the last id, which is
   * normally the centre. Unknown ids are ignored: the graph uses the run of the path that ends at the last
   * id, is in the graph and is on a shown ring (an asker beyond the drawn rings starts from the nearest drawn person).
   */
  path: string[];
}

export interface NetworkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Node ids from me to the target. Unknown ids are ignored. Fewer than two matches: no dimming. */
  highlightPath?: string[];
  /**
   * Active incoming Needs, nearest first. The graph draws the first five that have a run on the drawn rings (so
   * the screen may pass a few more: one that is entirely on a hidden ring does not take a slot). Each one gets its path drawn as a
   * curved care-coloured link and small pulses that travel from the asker to me; the asker keeps a breathing
   * ring. With no `highlightPath` the impulse paths are the highlight (the rest of the scene dims). With a
   * `highlightPath` (a selected person) that path is the highlight and the impulses keep running, dimmed.
   * With `prefers-reduced-motion` nothing moves: a steady bead gradient points from the asker to me.
   */
  impulses?: GraphImpulse[];
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
  /** Scene palette when `colors` is not given: the dark scene (default) or the light one for a light app theme. */
  sceneTheme?: 'light' | 'dark';
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
  /**
   * People beyond the drawn rings, nearest first (e.g. [4th, 5th]), drawn only as a dust of dots around
   * the ball. Pass rounded counts: the dots never map to particular people.
   */
  farRings?: number[];
  /** Height in CSS px of the UI laid over the bottom of the canvas: names that would fall under it are hidden. */
  labelInsetBottom?: number;
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
/** Most dots in the far-ring dust; above this, dots stand for several people each. */
const FAR_DOTS_MAX = 700;
const ballOuter = (n: number) => 9 * Math.cbrt(Math.max(1, n)) + 22;
const FOCUS_ROTATE_SPEED = 1.6;  // orbit around a focused node (OrbitControls units)
const FOCUS_FLY_MS = 900;
const BALL_SHELLS = [0, 0.38, 0.7, 1]; // shell radius by depth, as a fraction of the outer radius
const MAX_NODE_SPEED = 4;        // world units per tick; caps the "explosion" of the first ticks
const MIN_DOT_PX = 0.0042;       // far dots stay a few pixels; nearer rings stay larger
// Dot sizes in world units by LOD level (near, mid, far); the near and mid ones grow with connections
const DOT_NEAR = 2.6;
const DOT_MID = 1.75;
const DOT_FAR = 1.1;
// On-screen cap of a dot (CSS px, times sqrt of the connection factor): a dot the camera passes close to
// stays a dot instead of filling the view
const DOT_MAX_PX = 11;
// Same for a photo: big enough to recognise, never a disc across the view
const AVATAR_MAX_PX = 34;
const LOD_HYSTERESIS = 1.08;     // a node must move 8% past a LOD border to switch back (no flicker)
// Nodes the camera flies through fade out instead of filling the screen and blocking the view
const NEAR_HIDE = 6;
const NEAR_FADE = 20;
const NEAR_FADE2 = NEAR_FADE * NEAR_FADE;
const MARK_SIZE = 10;            // centre tile, world units
const NEAREST_LABELS = 8;        // labels on the nearest ring-1/2 nodes, plus the path
const NEAREST_HOLD_MS = 1500;    // a name stays this long after its node leaves the nearest few
const NEAREST_HOLD_EXTRA = 4;    // at most this many held names on top of NEAREST_LABELS
const LABEL_FADE_MS = 180;       // name fade in / out
const PATH_CURVE = 0.15;         // slight bend; 0 is a straight line
const DIM_OPACITY = 0.35;
const LABEL_IDLE_MS = 2000;
// Names are sized on screen, not in the world: close up they stop growing, far away they stop
// shrinking. Height of one text line in CSS pixels (the centre name is a bit larger).
const LABEL_MIN_PX = 9;
const LABEL_MAX_PX = 13;
const LABEL_CENTER_MIN_PX = 11;
const LABEL_CENTER_MAX_PX = 16;
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
  /** Never rendered (DotLayer draws the dots); keeps the size and lets tap / hover find the node. */
  dot: THREE.Sprite;
  /** Dot colour (linear rgb) and alpha for DotLayer */
  dotRgba: [number, number, number, number];
  /** Squared distance to the camera this frame (dot sorting) */
  d2: number;
  /** Label size factor that keeps its lines between LABEL_MIN_PX and LABEL_MAX_PX on screen */
  labelFit: number;
  /** Largest photo size in world units that stays within AVATAR_MAX_PX at the current distance (frame loop) */
  avatarCap: number;
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
  /** 0..1 eased label opacity: names fade in and out instead of blinking while the camera turns */
  labelShow: number;
}

interface PathState {
  /** Resolved ids, in order. Empty when fewer than two ids exist in the graph. */
  set: Set<string>;
  /** Both directions of each consecutive pair. */
  links: Set<string>;
  /** Impulse links that are not part of the highlighted path: drawn curved, but softer. */
  soft: Set<string>;
  dim: boolean;
}

const EMPTY_SET: Set<string> = new Set();
const EMPTY_PATH: PathState = { set: new Set(), links: new Set(), soft: EMPTY_SET, dim: false };

/** The impulse paths in the graph: the run of each one that is drawn, ending at me. */
interface ImpulseState {
  items: { id: string; ids: string[]; /** the run starts at the asker itself */ source: boolean }[];
  links: Set<string>;
  set: Set<string>;
}
const EMPTY_IMPULSES: ImpulseState = { items: [], links: EMPTY_SET, set: EMPTY_SET };

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

/* ---------- Batched layers: one draw call for all links, one for all dots ---------- */

const PATH_SEGMENTS = 20;        // a highlighted (curved) link is drawn with this many segments
const SOFT_LINK_OPACITY = 0.4;   // impulse links outside the highlighted path, relative to the path links
const tmpColor = new THREE.Color();

/** sRGB hex → linear rgb into `out` at `i` (vertex colours are in the working colour space). */
function writeLinear(out: Float32Array, i: number, hex: number, alpha: number) {
  tmpColor.setHex(hex);
  out[i] = tmpColor.r;
  out[i + 1] = tmpColor.g;
  out[i + 2] = tmpColor.b;
  out[i + 3] = alpha;
}

interface LinkEnds {
  a: SimNode;
  b: SimNode;
  /** `${a.id}\0${b.id}` as given in the data, for the path lookup */
  key: string;
}

/**
 * Control point of the slight bend of a curved link from a to b. The bend flips with the order of the ends,
 * so everything that follows a drawn curve (the impulse pulses) must use the order the link is stored in.
 * The result is in `bend`: one shared scratch, no allocation.
 */
const bend = { x: 0, y: 0, z: 0 };
function bendControl(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  let cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
  if (dx === 0 && dy === 0) { cx += PATH_CURVE * -dz; cz += PATH_CURVE * dx; }
  else { cx += PATH_CURVE * dy; cy -= PATH_CURVE * dx; }
  bend.x = cx; bend.y = cy; bend.z = cz;
}

/** Writes the curves of `list` as line segments (PATH_SEGMENTS per link) into `q`. */
function writeCurves(list: LinkEnds[], q: Float32Array) {
  let w = 0;
  for (const { a, b } of list) {
    const ax = a.x ?? 0, ay = a.y ?? 0, az = a.z ?? 0;
    const bx = b.x ?? 0, by = b.y ?? 0, bz = b.z ?? 0;
    bendControl(ax, ay, az, bx, by, bz);
    const cx = bend.x, cy = bend.y, cz = bend.z;
    let px = ax, py = ay, pz = az;
    for (let s = 1; s <= PATH_SEGMENTS; s++) {
      const t = s / PATH_SEGMENTS, u = 1 - t;
      const nx = u * u * ax + 2 * u * t * cx + t * t * bx;
      const ny = u * u * ay + 2 * u * t * cy + t * t * by;
      const nz = u * u * az + 2 * u * t * cz + t * t * bz;
      q[w++] = px; q[w++] = py; q[w++] = pz;
      q[w++] = nx; q[w++] = ny; q[w++] = nz;
      px = nx; py = ny; pz = nz;
    }
  }
}

/**
 * Every link of the graph in a few draw calls instead of one per link: all straight links in one
 * LineSegments with per-vertex colour and alpha, and the few links of a highlighted path, curved,
 * in a second one on top (plus a third, softer one for impulse links outside the highlighted path).
 * Positions are rewritten only while the layout moves.
 */
class LinkLayer {
  readonly group = new THREE.Group();
  private readonly plainGeom = new THREE.BufferGeometry();
  private readonly pathGeom = new THREE.BufferGeometry();
  private readonly softGeom = new THREE.BufferGeometry();
  private readonly plainMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  private readonly pathMat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
  private readonly softMat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
  private links: LinkEnds[] = [];
  private onPath: LinkEnds[] = [];
  private onSoft: LinkEnds[] = [];
  private pos = new Float32Array(0);
  private col = new Float32Array(0);
  private pathPos = new Float32Array(0);
  private softPos = new Float32Array(0);

  constructor() {
    const plain = new THREE.LineSegments(this.plainGeom, this.plainMat);
    const soft = new THREE.LineSegments(this.softGeom, this.softMat);
    const path = new THREE.LineSegments(this.pathGeom, this.pathMat);
    for (const obj of [plain, soft, path]) {
      obj.raycast = noRaycast;
      obj.frustumCulled = false;
      this.group.add(obj);
    }
    // Under the nodes; the path over the other links
    plain.renderOrder = -2;
    soft.renderOrder = -1.5;
    path.renderOrder = -1;
    this.group.name = 'so-links';
  }

  setLinks(links: LinkEnds[]) {
    this.links = links;
    this.plainGeom.dispose(); // the attributes below are replaced; free the old GL buffers
    this.pos = new Float32Array(links.length * 6);
    this.col = new Float32Array(links.length * 8);
    const posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.plainGeom.setAttribute('position', posAttr);
    this.plainGeom.setAttribute('color', colAttr);
    this.plainGeom.setDrawRange(0, links.length * 2);
  }

  /**
   * A curved layer for `list`: reuses `cur` while it is big enough (only the draw range changes) and grows it
   * otherwise. A replaced attribute is not freed by three, so the geometry is disposed first (it drops the GL
   * buffers of its current attributes and uploads the new one on the next render).
   */
  private curves(geom: THREE.BufferGeometry, list: LinkEnds[], cur: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
    const need = list.length * PATH_SEGMENTS * 6;
    let buf = cur;
    if (cur.length < need || cur.length === 0) {
      geom.dispose();
      buf = new Float32Array(Math.max(need, cur.length * 2, PATH_SEGMENTS * 6 * 4));
      geom.setAttribute('position', new THREE.BufferAttribute(buf, 3).setUsage(THREE.DynamicDrawUsage));
    }
    geom.setDrawRange(0, list.length * PATH_SEGMENTS * 2);
    return buf;
  }

  /** Colours and the path set. Cheap; call when the path, hidden rings or palette change. */
  paint(opts: {
    isPath: (key: string) => boolean;
    isSoft: (key: string) => boolean;
    shown: (n: SimNode) => boolean;
    plain: number; plainOp: number;
    care: number; careOp: number;
  }) {
    const onPath: LinkEnds[] = [];
    const onSoft: LinkEnds[] = [];
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i]!;
      const shown = opts.shown(l.a) && opts.shown(l.b);
      const path = shown && opts.isPath(l.key);
      const soft = shown && !path && opts.isSoft(l.key);
      if (path) onPath.push(l);
      else if (soft) onSoft.push(l);
      const alpha = shown && !path && !soft ? opts.plainOp : 0;
      writeLinear(this.col, i * 8, opts.plain, alpha);
      writeLinear(this.col, i * 8 + 4, opts.plain, alpha);
    }
    const colAttr = this.plainGeom.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (colAttr) colAttr.needsUpdate = true;

    this.onPath = onPath;
    this.onSoft = onSoft;
    this.pathPos = this.curves(this.pathGeom, onPath, this.pathPos);
    this.softPos = this.curves(this.softGeom, onSoft, this.softPos);
    this.pathMat.color.setHex(opts.care);
    this.pathMat.opacity = opts.careOp;
    this.softMat.color.setHex(opts.care);
    this.softMat.opacity = opts.careOp * SOFT_LINK_OPACITY;
  }

  /** Writes link positions from the current node positions. */
  update() {
    const p = this.pos;
    for (let i = 0; i < this.links.length; i++) {
      const { a, b } = this.links[i]!;
      const o = i * 6;
      p[o] = a.x ?? 0; p[o + 1] = a.y ?? 0; p[o + 2] = a.z ?? 0;
      p[o + 3] = b.x ?? 0; p[o + 4] = b.y ?? 0; p[o + 5] = b.z ?? 0;
    }
    const posAttr = this.plainGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (posAttr) posAttr.needsUpdate = true;

    // Path links: a slight quadratic bend, as before
    writeCurves(this.onPath, this.pathPos);
    const pathAttr = this.pathGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (pathAttr) pathAttr.needsUpdate = true;
    writeCurves(this.onSoft, this.softPos);
    const softAttr = this.softGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (softAttr) softAttr.needsUpdate = true;
  }

  dispose() {
    this.plainGeom.dispose();
    this.pathGeom.dispose();
    this.softGeom.dispose();
    this.plainMat.dispose();
    this.pathMat.dispose();
    this.softMat.dispose();
  }
}

const DOT_VERTEX = /* glsl */ `
attribute float size;
attribute vec4 rgba;
uniform float uScale;
varying vec4 vRgba;
void main() {
  vRgba = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Same on-screen size as a sprite of \`size\` world units
  gl_PointSize = size * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const DOT_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vRgba;
void main() {
  float a = vRgba.a * texture2D(uMap, gl_PointCoord).a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vRgba.rgb, a);
  #include <colorspace_fragment>
}
`;

/**
 * The dots of all nodes in one draw call (they used to be one sprite each). The frame loop hands in the
 * visible dots sorted far to near, so overlapping dots blend like the sprites did. The per-node sprite
 * stays in the scene, with a material that never renders, only so tap and hover keep finding the node.
 */
class DotLayer {
  readonly points: THREE.Points;
  private readonly geom = new THREE.BufferGeometry();
  readonly material: THREE.ShaderMaterial;
  private cap = 0;
  private pos = new Float32Array(0);
  private rgba = new Float32Array(0);
  private size = new Float32Array(0);

  constructor(map: THREE.Texture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 1 } },
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geom, this.material);
    this.points.name = 'so-dots';
    this.points.raycast = noRaycast;
    this.points.frustumCulled = false;
    this.ensure(64);
  }

  private ensure(n: number) {
    if (n <= this.cap) return;
    this.cap = Math.max(n, this.cap * 2);
    this.pos = new Float32Array(this.cap * 3);
    this.rgba = new Float32Array(this.cap * 4);
    this.size = new Float32Array(this.cap);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
  }

  /** Pixels per world unit at distance 1: matches how sprites are sized. */
  setScale(scale: number) {
    this.material.uniforms.uScale!.value = scale;
  }

  /** `list` is far → near. */
  write(list: NodeVis[]) {
    this.ensure(list.length);
    const p = this.pos, c = this.rgba, s = this.size;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      const o = v.outer.position;
      p[i * 3] = o.x;
      p[i * 3 + 1] = o.y + v.inner.position.y;
      p[i * 3 + 2] = o.z;
      c[i * 4] = v.dotRgba[0]; c[i * 4 + 1] = v.dotRgba[1]; c[i * 4 + 2] = v.dotRgba[2]; c[i * 4 + 3] = v.dotRgba[3];
      s[i] = v.dot.scale.x * v.inner.scale.x;
    }
    for (const name of ['position', 'rgba', 'size']) {
      (this.geom.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
    this.geom.setDrawRange(0, list.length);
  }

  dispose() {
    this.geom.dispose();
    this.material.dispose();
  }
}

/* ---------- Impulses: pulses travelling along the paths of active incoming Needs ---------- */

const IMPULSE_MAX = 5;                  // impulses drawn at once; the screen passes the nearest first
const IMPULSE_SLOTS = IMPULSE_MAX + 3;  // plus a few that are fading out
const IMPULSE_NODES = 8;                // longest run of a path (people)
const IMPULSE_POINTS = 16;              // points per impulse: the head and its tail (dense, so it reads as one comet)
const IMPULSE_PERIOD = 6000;            // one cycle: the trip and a rest, ms
const IMPULSE_MS_PER_LINK = 1500;
const IMPULSE_MAX_TRAVEL = 4200;
const IMPULSE_TAIL = 26;                // tail length, world units
const IMPULSE_HEAD_SIZE = 6;            // world units (a ring-1 dot is 2.6)
const IMPULSE_TAIL_SIZE = 1.8;
const IMPULSE_LAUNCH_MS = 700;          // the asker's ring swells for this long at each launch
const IMPULSE_FADE_IN = 500;
const IMPULSE_FADE_OUT = 600;
const IMPULSE_DIM = 0.4;                // gain of an impulse outside the highlighted path

const IMPULSE_VERTEX = /* glsl */ `
attribute float size;
attribute float alpha;
uniform float uScale;
uniform float uPx;
varying float vA;
void main() {
  vA = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = size * uScale / max(0.001, -mv.z);
  // On screen the head stays 11 to 28 CSS px: it does not vanish when zoomed out, nor become a blob close up
  gl_PointSize = alpha > 0.004 ? clamp(px, (3.0 + 1.4 * size) * uPx, (10.0 + 3.0 * size) * uPx) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const IMPULSE_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  // A soft halo around a brighter core; the tail points are dimmer, so only the head has a white-hot core
  float halo = pow(1.0 - d, 2.0);
  float core = smoothstep(0.55, 0.0, d) * smoothstep(0.25, 0.9, vA);
  float a = clamp(vA * (0.75 * halo + 0.5 * core), 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uGlow, uCore, core), a);
  #include <colorspace_fragment>
}
`;

interface ImpulseSlot {
  used: boolean;
  id: string;
  /** Asker first, me last */
  nodes: SimNode[];
  /** Segment j (nodes[j] to nodes[j + 1]) is stored as nodes[j + 1] to nodes[j] in the link data */
  rev: boolean[];
  travelMs: number;
  phase: number;
  /** 0..1, eased in and out when the impulse appears or goes */
  fade: number;
  target: number;
  dimmed: boolean;
  /** The first node is the asker itself (not just the nearest drawn person) */
  source: boolean;
  /** 1 at the moment of launch, then falls to 0: swells the asker's ring */
  launch: number;
  /** Reduced motion and rest: the points are rewritten only when something changed */
  dirty: boolean;
  sig: number;
  lastFade: number;
  /** Alphas are all zero in the buffer */
  zeroed: boolean;
  shown: boolean;
}

interface ImpulseInput {
  id: string;
  nodes: SimNode[];
  dimmed: boolean;
  source: boolean;
}

/**
 * A few glowing pulses (one `THREE.Points`, one draw call, fixed buffers) that run along the curved
 * path links from the asker to me: a bright head with a short fading tail. Positions are evaluated every frame from
 * the node positions with the same bend as LinkLayer, so they stay on the drawn line while the layout moves
 * or the camera turns. Nothing is allocated per frame. Reduced motion: no travel, a steady bead gradient
 * that grows towards me.
 */
class ImpulseLayer {
  readonly points: THREE.Points;
  readonly slots: ImpulseSlot[] = [];
  /** Any slot in use (visible or fading): the frame loop calls update() only then */
  live = false;
  private readonly geom = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly pos = new Float32Array(IMPULSE_SLOTS * IMPULSE_POINTS * 3);
  private readonly alpha = new Float32Array(IMPULSE_SLOTS * IMPULSE_POINTS);
  private readonly size = new Float32Array(IMPULSE_SLOTS * IMPULSE_POINTS);
  private fwd = new Map<SimNode, Set<SimNode>>();
  private wasReduced = false;
  private sig = 0;
  // Per-frame scratch
  private readonly cum = new Float32Array(IMPULSE_NODES);
  private readonly segA = new Float32Array(IMPULSE_NODES * 3);
  private readonly segB = new Float32Array(IMPULSE_NODES * 3);
  private readonly segC = new Float32Array(IMPULSE_NODES * 3);
  private readonly at = { x: 0, y: 0, z: 0 };

  constructor(material: THREE.ShaderMaterial) {
    this.material = material;
    for (let i = 0; i < IMPULSE_SLOTS; i++) {
      this.slots.push({
        used: false, id: '', nodes: [], rev: [], travelMs: 1500, phase: 0,
        fade: 0, target: 0, dimmed: false, source: false, launch: 0,
        dirty: true, sig: 0, lastFade: -1, zeroed: false, shown: false,
      });
    }
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geom, material);
    this.points.name = 'so-impulses';
    this.points.raycast = noRaycast;
    this.points.frustumCulled = false;
    // After the links (-2..-1), before every node sprite, dot layer (0) and label: a pulse that passes through
    // a person dips under their avatar. Nothing writes depth before it, so no quad can hide it.
    this.points.renderOrder = -0.5;
    this.points.visible = false;
  }

  /** Device pixels per world unit at distance 1 (as for the dots), and the renderer's pixel ratio. */
  setView(scale: number, pixelRatio: number) {
    this.material.uniforms.uScale!.value = scale;
    this.material.uniforms.uPx!.value = pixelRatio;
  }

  /** The links as stored, to know which way each curve bends. */
  setLinks(links: LinkEnds[]) {
    const fwd = new Map<SimNode, Set<SimNode>>();
    for (const { a, b } of links) {
      let set = fwd.get(a);
      if (!set) { set = new Set(); fwd.set(a, set); }
      set.add(b);
    }
    this.fwd = fwd;
    for (const sl of this.slots) if (sl.used) this.bindDirections(sl);
  }

  private bindDirections(sl: ImpulseSlot) {
    sl.rev.length = 0;
    sl.dirty = true;
    for (let j = 0; j + 1 < sl.nodes.length; j++) {
      const p = sl.nodes[j]!, q = sl.nodes[j + 1]!;
      sl.rev.push(!this.fwd.get(p)?.has(q) && !!this.fwd.get(q)?.has(p));
    }
  }

  /** Phase of a new impulse: as far as possible in the cycle from the running ones, so heads do not pile up. */
  private pickPhase(id: string): number {
    const jitter = hash01(id) * (IMPULSE_PERIOD / 12);
    let best = jitter;
    let bestGap = -1;
    for (let i = 0; i < 12; i++) {
      const c = (i * IMPULSE_PERIOD / 12 + jitter) % IMPULSE_PERIOD;
      let gap = IMPULSE_PERIOD;
      for (const s of this.slots) {
        if (!s.used || s.target <= 0) continue;
        const d = Math.abs(c - s.phase);
        gap = Math.min(gap, d, IMPULSE_PERIOD - d);
      }
      if (gap > bestGap) { bestGap = gap; best = c; }
    }
    return best;
  }

  /** The impulses that are on now. Ones that are gone fade out and free their slot. */
  set(items: ImpulseInput[]) {
    const keep = new Set<string>();
    for (const it of items) {
      if (it.nodes.length < 2) continue;
      keep.add(it.id);
      let sl = this.slots.find((s) => s.used && s.id === it.id);
      if (!sl) {
        sl = this.slots.find((s) => !s.used);
        if (!sl) {
          // Full: take the faintest one that is on its way out
          for (const s of this.slots) if (s.target <= 0 && (!sl || s.fade < sl.fade)) sl = s;
        }
        if (!sl) continue;
        sl.used = true;
        sl.id = it.id;
        sl.fade = 0;
        sl.phase = this.pickPhase(it.id);
      }
      sl.target = 1;
      sl.nodes.length = 0;
      for (let i = 0; i < it.nodes.length && i < IMPULSE_NODES; i++) sl.nodes.push(it.nodes[i]!);
      sl.travelMs = Math.min(IMPULSE_MAX_TRAVEL, IMPULSE_MS_PER_LINK * (sl.nodes.length - 1));
      sl.dimmed = it.dimmed;
      sl.source = it.source;
      this.bindDirections(sl);
    }
    this.live = false;
    for (const s of this.slots) {
      if (s.used && !keep.has(s.id)) s.target = 0;
      if (s.used) this.live = true;
    }
    if (!this.live) this.points.visible = false;
  }

  /** Chord lengths and bend control points of the run; the total length, or -1 while a node has no position yet. */
  private measure(sl: ImpulseSlot): number {
    let total = 0;
    let sig = 0;
    this.cum[0] = 0;
    for (let j = 0; j + 1 < sl.nodes.length; j++) {
      const p = sl.nodes[j]!, q = sl.nodes[j + 1]!;
      if (typeof p.x !== 'number' || typeof q.x !== 'number') return -1;
      const a = sl.rev[j] ? q : p;
      const b = sl.rev[j] ? p : q;
      const ax = a.x ?? 0, ay = a.y ?? 0, az = a.z ?? 0;
      const bx = b.x ?? 0, by = b.y ?? 0, bz = b.z ?? 0;
      bendControl(ax, ay, az, bx, by, bz);
      const o = j * 3;
      this.segA[o] = ax; this.segA[o + 1] = ay; this.segA[o + 2] = az;
      this.segB[o] = bx; this.segB[o + 1] = by; this.segB[o + 2] = bz;
      this.segC[o] = bend.x; this.segC[o + 1] = bend.y; this.segC[o + 2] = bend.z;
      const dx = q.x - p.x, dy = (q.y ?? 0) - (p.y ?? 0), dz = (q.z ?? 0) - (p.z ?? 0);
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.cum[j + 1] = total;
      sig += p.x + (p.y ?? 0) * 3 + (p.z ?? 0) * 7;
    }
    this.sig = sig;
    return Number.isFinite(total) ? total : -1;
  }

  /** Point at `dist` along the run (0..total) on the curves; into `this.at`. */
  private locate(sl: ImpulseSlot, dist: number) {
    const last = sl.nodes.length - 2;
    let j = 0;
    while (j < last && dist > this.cum[j + 1]!) j++;
    const len = Math.max(1e-6, this.cum[j + 1]! - this.cum[j]!);
    let t = Math.min(1, Math.max(0, (dist - this.cum[j]!) / len));
    if (sl.rev[j]) t = 1 - t;
    const u = 1 - t;
    const o = j * 3;
    const at = this.at;
    at.x = u * u * this.segA[o]! + 2 * u * t * this.segC[o]! + t * t * this.segB[o]!;
    at.y = u * u * this.segA[o + 1]! + 2 * u * t * this.segC[o + 1]! + t * t * this.segB[o + 1]!;
    at.z = u * u * this.segA[o + 2]! + 2 * u * t * this.segC[o + 2]! + t * t * this.segB[o + 2]!;
  }

  update(now: number, dt: number, reduced: boolean) {
    let any = false;
    let used = false;
    let changed = false;
    if (reduced !== this.wasReduced) {
      this.wasReduced = reduced;
      for (const s of this.slots) s.dirty = true;
    }
    for (let si = 0; si < this.slots.length; si++) {
      const sl = this.slots[si]!;
      const base = si * IMPULSE_POINTS;
      if (!sl.used) continue;
      // Fade in and out (reduced motion: at once)
      if (reduced) sl.fade = sl.target;
      else if (sl.fade < sl.target) sl.fade = Math.min(sl.target, sl.fade + dt / IMPULSE_FADE_IN);
      else if (sl.fade > sl.target) sl.fade = Math.max(sl.target, sl.fade - dt / IMPULSE_FADE_OUT);
      if (sl.fade <= 0 && sl.target <= 0) {
        sl.used = false;
        sl.launch = 0;
        sl.shown = false;
        for (let k = 0; k < IMPULSE_POINTS; k++) this.alpha[base + k] = 0;
        changed = true;
        continue;
      }
      used = true;

      // Where in the cycle we are. The rest part of the cycle writes nothing but a one-off clear.
      sl.launch = 0;
      let prog = 0;
      if (!reduced) {
        const cyc = (now + sl.phase) % IMPULSE_PERIOD;
        prog = cyc / sl.travelMs;
        if (cyc < IMPULSE_LAUNCH_MS) sl.launch = (1 - cyc / IMPULSE_LAUNCH_MS) ** 2;
      }
      const resting = !reduced && prog >= 1;
      const total = resting ? 0 : this.measure(sl);
      if (total <= 0) {
        sl.shown = false;
        if (!sl.zeroed) {
          for (let k = 0; k < IMPULSE_POINTS; k++) this.alpha[base + k] = 0;
          sl.zeroed = true;
          changed = true;
        }
        continue;
      }
      // Reduced motion: the picture is static, so rewrite it only when the layout, the impulse or the fade moved
      if (reduced && !sl.dirty && this.sig === sl.sig && sl.fade === sl.lastFade) {
        if (sl.shown) any = true;
        continue;
      }
      sl.dirty = false;
      sl.sig = this.sig;
      sl.lastFade = sl.fade;

      const gain = sl.fade * (sl.dimmed ? IMPULSE_DIM : 1);
      const tail = Math.min(IMPULSE_TAIL, total * 0.5);
      const headDist = reduced ? total * 0.97 : prog * prog * (3 - 2 * prog) * (total + tail);
      let wrote = false;
      for (let k = 0; k < IMPULSE_POINTS; k++) {
        const f = k / (IMPULSE_POINTS - 1);
        const d = reduced ? headDist - f * total * 0.95 : headDist - f * tail;
        const i = base + k;
        if (d < 0 || d > total) {
          this.alpha[i] = 0;
          continue;
        }
        this.locate(sl, d);
        this.pos[i * 3] = this.at.x;
        this.pos[i * 3 + 1] = this.at.y;
        this.pos[i * 3 + 2] = this.at.z;
        // Soft ends: the pulse comes out of the asker and sinks into the next person
        const edge = reduced ? 1 : Math.min(1, d / 4, (total - d) / 6);
        this.size[i] = IMPULSE_TAIL_SIZE + (IMPULSE_HEAD_SIZE - IMPULSE_TAIL_SIZE) * Math.pow(1 - f, 1.2);
        this.alpha[i] = Math.pow(1 - f, reduced ? 1.0 : 1.4) * edge * gain * (reduced ? 0.9 : 1);
        wrote = true;
      }
      sl.shown = wrote;
      sl.zeroed = !wrote;
      changed = true;
      if (wrote) any = true;
    }
    this.live = used;
    this.points.visible = any;
    if (changed && any) {
      for (const name of ['position', 'alpha', 'size']) {
        (this.geom.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  dispose() {
    this.geom.dispose();
  }
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
  v.labelShow = 0;
}

const NO_HINT = () => '';

/* ---------- Component ---------- */

export const NetworkGraph = forwardRef<NetworkGraphHandle, NetworkGraphProps>(function NetworkGraph({
  nodes,
  edges,
  highlightPath,
  impulses,
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
  farRings,
  labelInsetBottom = 0,
  sceneTheme = 'dark',
}, ref) {
  const fgRef = useRef<FGRef>(null);
  const theme: 'light' | 'dark' = themeProp ?? (darkMode ? 'dark' : 'light');
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const baseColors = colorsProp ?? (sceneTheme === 'light' ? GRAPH_COLORS_LIGHT : null);
  const colorKey = `${sceneTheme}|${colorsKey(colorsProp)}`;
  const colors = useMemo(() => resolveColors(baseColors), [colorKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const focusRef = useRef<{ id: string | null; kick: number; lift: number; before: GraphView | null }>({
    id: null,
    kick: 0, // auto-rotate speed to switch to on the next frame (0: none)
    lift: 0,
    before: null,
  });
  focusRef.current.lift = focusLift;
  const labelInsetRef = useRef(labelInsetBottom);
  labelInsetRef.current = labelInsetBottom;

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
    // A layout saved before the simulation stopped (the person left early) is only a start: nothing is
    // frozen or pinned, the graph settles from there instead of from scratch.
    const settled = !centerId || isLayoutSettled(centerId);
    let hold = !!layout && next.length > 0 && settled;
    if (layout && settled) {
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
    // Shown-once memory per owner outlives the component: coming back does not replay the pop-in
    if (centerId) introSeenRef.current = introSeenOf(centerId);
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
  const hiddenKey = (hiddenRings ?? []).join(',');
  const hiddenRef = useRef<Set<number>>(new Set());
  hiddenRef.current = useMemo(() => {
    const next = new Set<number>();
    for (const ring of hiddenRings ?? []) if (ring > 0) next.add(ring);
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKey]);

  // Impulses: for each one the run of its path that ends at me, is in the graph, on a shown ring and linked
  // person to person. An asker beyond the drawn rings (or on a hidden ring) simply starts from the nearest
  // drawn person; ids that are not in the graph are ignored.
  const impulsesKey = (impulses ?? []).map((i) => i.id + '\u0002' + i.path.join('\u0003')).join('\u0001');
  const impulseState = useMemo<ImpulseState>(() => {
    if (!impulses?.length) return EMPTY_IMPULSES;
    const map = nodeMapRef.current;
    const edgeKeys = new Set<string>();
    for (const e of edges) edgeKeys.add(`${e.source}\0${e.target}`).add(`${e.target}\0${e.source}`);
    const shown = (n: SimNode) => {
      const depth = n.depth ?? depthRef.current.get(n.id) ?? (n.isCenter ? 0 : 1);
      return n.isCenter || depth <= 0 || !hiddenRef.current.has(depth);
    };
    const items: ImpulseState['items'] = [];
    const links = new Set<string>();
    const set = new Set<string>();
    const seenIds = new Set<string>();
    for (const imp of impulses) {
      if (items.length >= IMPULSE_MAX) break;
      if (!imp?.id || seenIds.has(imp.id) || !Array.isArray(imp.path)) continue;
      seenIds.add(imp.id);
      const run: string[] = [];
      for (let i = imp.path.length - 1; i >= 0 && run.length < IMPULSE_NODES; i--) {
        const id = imp.path[i]!;
        const node = id ? map.get(id) : undefined;
        if (!node || run.includes(id) || !shown(node)) break;
        if (run.length && !edgeKeys.has(`${id}\0${run[run.length - 1]}`)) break;
        run.push(id);
      }
      if (run.length < 2) continue;
      run.reverse();
      for (let i = 0; i < run.length; i++) {
        set.add(run[i]!);
        if (i > 0) links.add(`${run[i - 1]}\0${run[i]}`).add(`${run[i]}\0${run[i - 1]}`);
      }
      items.push({ id: imp.id, ids: run, source: run[0] === imp.path[0] });
    }
    return items.length ? { items, links, set } : EMPTY_IMPULSES;
    // impulsesKey covers the array; signature covers the nodes and edges; hiddenKey the rings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impulsesKey, hiddenKey, signature]);

  const highlightKey = (highlightPath ?? []).join('\u0001');
  const pathState = useMemo<PathState>(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of highlightPath ?? []) {
      if (!id || seen.has(id) || !nodeMapRef.current.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length >= 2) {
      const links = new Set<string>();
      for (let i = 1; i < ids.length; i++) links.add(`${ids[i - 1]}\0${ids[i]}`).add(`${ids[i]}\0${ids[i - 1]}`);
      // A selected person's path is the highlight; impulse links outside it stay drawn, but softer
      const soft = new Set<string>();
      for (const key of impulseState.links) if (!links.has(key)) soft.add(key);
      return { set: new Set(ids), links, soft, dim: true };
    }
    // No selection: the impulse paths are the highlight
    if (impulseState.items.length) return { set: impulseState.set, links: impulseState.links, soft: EMPTY_SET, dim: true };
    return EMPTY_PATH;
    // highlightKey covers the array; signature covers membership in the graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, impulseState, signature]);
  const pathRef = useRef<PathState>(pathState);
  pathRef.current = pathState;
  /** Askers of the live impulses: they keep their ring even when they are not on the highlighted path */
  const sourceIdsRef = useRef<Set<string>>(new Set());

  const nearestRef = useRef<Set<string>>(new Set());
  const reducedRef = useRef(false);
  const sceneFxRef = useRef<{ stars: THREE.Points | null; glow: THREE.Mesh | null }>({ stars: null, glow: null });

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
  // Batched layers: every link in one draw call, every dot in one (see LinkLayer / DotLayer)
  const graphDataRef = useRef(graphData);
  graphDataRef.current = graphData;
  /** Links with their node objects (the simulation moves those in place) */
  const resolveLinks = useCallback((): LinkEnds[] => {
    const map = nodeMapRef.current;
    const out: LinkEnds[] = [];
    for (const l of graphDataRef.current.links as Array<{ source: string | SimNode; target: string | SimNode }>) {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      const a = map.get(String(sid));
      const b = map.get(String(tid));
      if (a && b) out.push({ a, b, key: `${a.id}\0${b.id}` });
    }
    return out;
  }, []);
  const linksRef = useRef<LinkLayer | null>(null);
  const dotsRef = useRef<DotLayer | null>(null);
  const impulseRef = useRef<ImpulseLayer | null>(null);
  /** Link colours need repainting: the path, hidden rings or palette changed, or new data */
  const linkPaintRef = useRef(true);
  /** Link positions need one rewrite although the layout is not moving */
  const linkMoveRef = useRef(true);
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

  /** Shown on the scene: the centre always, others unless their ring is hidden. */
  const shownNode = useCallback((n: SimNode) => {
    if (n.isCenter) return true;
    const depth = n.depth ?? depthRef.current.get(n.id) ?? 1;
    return depth <= 0 || !hiddenRef.current.has(depth);
  }, []);

  const paintLinks = useCallback(() => {
    const layer = linksRef.current;
    if (!layer) return;
    const path = pathRef.current;
    const ink = readInk();
    layer.paint({
      isPath: (key) => path.dim && path.links.has(key),
      isSoft: (key) => path.soft.has(key),
      shown: shownNode,
      plain: path.dim ? ink.dim : ink.plain,
      plainOp: path.dim ? ink.dimOp : ink.plainOp,
      care: ink.care,
      careOp: ink.careOp,
    });
    linkPaintRef.current = false;
    linkMoveRef.current = true;
  }, [readInk, shownNode]);

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
    // Drawn by DotLayer: keep the colour and alpha on the node
    tmpColor.setHex(parsed.color);
    v.dotRgba[0] = tmpColor.r;
    v.dotRgba[1] = tmpColor.g;
    v.dotRgba[2] = tmpColor.b;
    v.dotRgba[3] = dim ? base * DIM_OPACITY : base;
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
    const avatarSize = isC ? MARK_SIZE : Math.min(5 * sf, v.avatarCap);
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
      const dotSize = (level <= 1 ? DOT_NEAR * sf : level === 2 ? DOT_MID * sf : DOT_FAR) * boost;
      v.dot.scale.set(dotSize, dotSize, 1);
    }

    // The pulse ring exists only on nodes that have shown it (online or on the path): one object
    // less per node for the renderer to walk every frame
    const showPulse = !isC && !n.isDeleted && ((v.online && level <= 1) || onPath || sourceIdsRef.current.has(n.id));
    if (showPulse && !v.pulse) {
      const pulse = new THREE.Sprite(res.pulseMaterial);
      pulse.raycast = noRaycast;
      pulse.renderOrder = 3;
      v.inner.add(pulse);
      v.pulse = pulse;
    }
    if (v.pulse) {
      v.pulse.visible = showPulse;
      const body = isC ? MARK_SIZE : (v.avatar.visible ? avatarSize : v.dot.scale.x);
      v.pulse.scale.set(body * (isC ? 1.38 : 1.9), body * (isC ? 1.38 : 1.9), 1);
      v.pulse.material = pathRef.current.dim && !onPath ? res.pulseDimMaterial : res.pulseMaterial;
    }

    if (v.label) {
      const base = v.label.userData.baseScale as THREE.Vector3;
      // labelFit keeps the text within a readable on-screen size, whatever the distance (frame loop)
      const k = (isC || v.avatar.visible ? 1 : 0.9) * v.labelFit;
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
    label.userData.lines = labelLines(String(n.name ?? ''), !!n.isCenter).split('\n').length;
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

    // Never rendered: DotLayer draws all dots at once. The sprite keeps the size and the hit area.
    const dot = new THREE.Sprite(res.hitMaterial);
    dot.visible = !isC && !showCached;
    if (!isC) {
      const dotSize = (depth <= 1 ? DOT_NEAR : depth === 2 ? DOT_MID : DOT_FAR) * sf;
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
      pulse: null,
      level: showCached ? 0 : -1,
      sf,
      online: isOnline(node.lastSeen),
      // Staggered pop-in: closer circles first; nodes seen before (theme refresh) appear instantly
      bornAt: seen || isC ? -Infinity : performance.now() + depth * 160 + hash01(node.id) * 260,
      hover: 0,
      phase: hash01(node.id + 'p') * Math.PI * 2,
      realAvatar: !!cachedPhoto,
      lastScale: -1,
      dotRgba: [1, 1, 1, 0],
      d2: 0,
      labelFit: 1,
      avatarCap: Infinity,
      unwantedAt: 0,
      wantedAt: 0,
      labelShow: 0,
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
    // Resolution: the screen's (at most 2), lowered by the frame loop while frames come late
    // (see "Adaptive resolution" there) and raised back once they are fast again
    const quality = { scale: 1, slowSince: 0, fastSince: 0, changedAt: 0, dtAvg: 16.7 };
    const applyDpr = () => {
      const max = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(Math.max(1, max * quality.scale));
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

    const scene = fg.scene() as THREE.Scene;

    // Batched links and dots (replace the per-link lines and per-node dot sprites)
    const linkLayer = new LinkLayer();
    const dotLayer = new DotLayer(res.discTexture);
    // Dots go after every avatar and the mark (0..2) and before pulses (3) and labels (4). They are one
    // draw call, so the renderer cannot sort them among the sprites; drawn after them and depth-tested,
    // a dot in front of a face shows and a dot behind it hides, whatever the camera angle.
    dotLayer.points.renderOrder = 2.5;
    scene.add(linkLayer.group, dotLayer.points);
    linksRef.current = linkLayer;
    dotsRef.current = dotLayer;
    const impulseLayer = new ImpulseLayer(res.impulseMaterial);
    scene.add(impulseLayer.points);
    impulseRef.current = impulseLayer;
    const firstLinks = resolveLinks();
    linkLayer.setLinks(firstLinks);
    impulseLayer.setLinks(firstLinks);
    linkPaintRef.current = true;
    // The impulse work runs only while the canvas is on screen (and the tab visible: rAF stops by itself)
    let onScreen = true;
    const screenObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) onScreen = last.isIntersecting;
      });
    screenObserver?.observe(renderer.domElement);
    const dotList: NodeVis[] = [];
    const farFirst = (a: NodeVis, b: NodeVis) => b.d2 - a.d2;

    // Soft centre wash + a few stars, behind the nodes. Added once per scene.
    const existingStars = scene.getObjectByName('so-stars') as THREE.Points | undefined;
    if (existingStars) {
      sceneFxRef.current.stars = existingStars;
      sceneFxRef.current.glow = (scene.getObjectByName('so-glow') as THREE.Mesh | undefined) ?? null;
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

      const glow = new THREE.Mesh(res.washGeometry, res.sceneGlowMaterial(colorsRef.current.scene));
      glow.name = 'so-glow';
      glow.frustumCulled = false; // billboarded in the shader: the plane's own bounds do not apply
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
    // Labels that would sit on top of another label on screen (recomputed a few times a second)
    const crowded = new Set<string>();
    // Last time each node was among the nearest few (label hold)
    const nearSince = new Map<string, number>();
    const projV = new THREE.Vector3();
    const flyV = new THREE.Vector3();
    const flyQ = new THREE.Quaternion();
    const flyQ2 = new THREE.Quaternion();
    let liftCur = 0;

    // Performance checks: a page that sets `window.__SO_GRAPH_DEBUG__ = {}` gets the force graph and
    // the time our frame work takes. Nothing happens without it.
    const debug = (globalThis as { __SO_GRAPH_DEBUG__?: { fg?: unknown; frameMs?: number } }).__SO_GRAPH_DEBUG__;
    if (debug) debug.fg = fg;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t0 = debug ? performance.now() : 0;
      frameBody(now);
      if (debug) debug.frameMs = (debug.frameMs ?? 0) * 0.9 + (performance.now() - t0) * 0.1;
    };
    const frameBody = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;

      // Adaptive resolution: when frames keep coming late (under ~42 fps for 1.5 s) the canvas renders
      // fewer pixels, step by step down to 1 device pixel; after 10 s of fast frames it steps back up.
      // Long gaps (tab in the background, a one-off hitch) are ignored.
      if (dt < 60) {
        quality.dtAvg += (dt - quality.dtAvg) * 0.05;
        const max = Math.min(window.devicePixelRatio || 1, 2);
        const slow = quality.dtAvg > 24;
        const fast = quality.dtAvg < 14;
        quality.slowSince = slow ? quality.slowSince || now : 0;
        quality.fastSince = fast ? quality.fastSince || now : 0;
        // A screen capped at 30 Hz (battery saver) also looks "slow": there one step only (×0.75);
        // down to 1 device pixel only when frames are really late (under ~25 fps)
        const floor = quality.dtAvg > 40 ? 1 / max : Math.max(1 / max, 0.75);
        if (slow && now - quality.slowSince > 1500 && now - quality.changedAt > 2000 && quality.scale > floor + 0.01) {
          quality.scale = Math.max(floor, quality.scale - 0.25);
          quality.changedAt = now;
          quality.slowSince = 0;
          quality.dtAvg = 16.7;
          applyDpr();
        } else if (fast && now - quality.fastSince > 10000 && quality.scale < 1) {
          quality.scale = Math.min(1, quality.scale + 0.25);
          quality.changedAt = now;
          quality.fastSince = 0;
          applyDpr();
        }
        if (debug) (debug as { quality?: unknown }).quality = { scale: quality.scale, dtAvg: +quality.dtAvg.toFixed(1) };
      }
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
        const speed = foc.kick;
        foc.kick = 0;
        if (!reducedRef.current && controls) {
          controls.autoRotate = true;
          rotTarget = speed;
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
          if (id) { next.add(id); nearSince.set(id, now); }
        }
        // A name that just dropped out of the nearest few keeps its place a little longer, so a turning
        // camera does not hand the names from person to person every few frames
        for (const id of nearestRef.current) {
          if (next.has(id) || next.size >= NEAREST_LABELS + NEAREST_HOLD_EXTRA) continue;
          if (now - (nearSince.get(id) ?? 0) < NEAREST_HOLD_MS) next.add(id);
        }
        for (const [id, at] of nearSince) if (now - at > NEAREST_HOLD_MS * 4) nearSince.delete(id);
        nearestRef.current = next;
      }

      if (labelFrame % 6 === 1) {
        // Greedy pass in screen pixels, on the label's real box (it hangs under its node): the centre and
        // path labels keep their place, the nearest others next. A name that would cover a kept name, or
        // an avatar nearer to the camera than its own person, is hidden until the view changes. Names that
        // fall under the panel at the bottom of the canvas are hidden too.
        const el = (fg.renderer() as THREE.WebGLRenderer).domElement;
        const W = el.clientWidth || 1;
        const H = el.clientHeight || 1;
        const ppu = ((cam as THREE.PerspectiveCamera).projectionMatrix.elements[5] ?? 1) * H * 0.5;
        const bandTop = H - Math.max(0, labelInsetRef.current);
        type Box = { x0: number; y0: number; x1: number; y1: number };
        const boxAt = (world: THREE.Vector3, w: number, h: number): Box | null => {
          const dist = Math.max(1, world.distanceTo(camPos));
          projV.copy(world).project(cam);
          if (projV.z > 1) return null;
          const cx = (projV.x + 1) * 0.5 * W;
          const cy = (1 - projV.y) * 0.5 * H;
          const hw = (w * ppu) / dist / 2;
          const hh = (h * ppu) / dist / 2;
          return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
        };
        const overlaps = (a: Box, b: Box, pad: number) =>
          a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

        const items: { id: string; box: Box; prio: number; d2: number }[] = [];
        const faces: { id: string; box: Box; d2: number }[] = [];
        for (const v of visRef.current.values()) {
          if (!v.outer.parent) continue;
          const s = Math.max(0, v.lastScale);
          if (s < 0.01) continue;
          v.outer.getWorldPosition(projV);
          const d2 = projV.distanceToSquared(camPos);
          if (v.avatar.visible) {
            const size = (v.node.isCenter ? MARK_SIZE : v.avatar.scale.x) * s * 0.9;
            const box = boxAt(projV.clone(), size, size);
            if (box) faces.push({ id: v.node.id, box, d2 });
          }
          if (!v.label) continue;
          const lw = v.label.scale.x * s;
          const lh = v.label.scale.y * s;
          v.label.getWorldPosition(projV);
          const box = boxAt(projV, lw, lh);
          if (!box) continue;
          const onPath = pathRef.current.set.has(v.node.id) && !v.node.isDeleted;
          items.push({ id: v.node.id, box, prio: v.node.isCenter ? 0 : onPath ? 1 : 2, d2 });
        }
        items.sort((a, b) => a.prio - b.prio || a.d2 - b.d2);
        crowded.clear();
        const kept: Box[] = [];
        for (const it of items) {
          if (it.prio > 0 && it.box.y1 > bandTop) {
            crowded.add(it.id);
            continue;
          }
          if (it.prio === 2) {
            const hitsName = kept.some((k) => overlaps(k, it.box, 4));
            const hitsFace = !hitsName && faces.some((f) => f.id !== it.id && f.d2 < it.d2 && overlaps(f.box, it.box, 0));
            if (hitsName || hitsFace) {
              crowded.add(it.id);
              continue;
            }
          }
          kept.push(it.box);
        }
      }

      dotList.length = 0;
      // CSS pixels per world unit at distance 1 (label sizing)
      const pxPerUnit = ((cam as THREE.PerspectiveCamera).projectionMatrix.elements[5] ?? 1)
        * ((fg.renderer() as THREE.WebGLRenderer).domElement.clientHeight || 1) * 0.5;
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
          const wantShown = showLabel && !crowded.has(v.node.id) ? 1 : 0;
          if (reduced) v.labelShow = wantShown;
          else if (v.labelShow !== wantShown) {
            const step = dt / LABEL_FADE_MS;
            v.labelShow = wantShown > v.labelShow ? Math.min(1, v.labelShow + step) : Math.max(0, v.labelShow - step);
          }
          v.label.visible = v.labelShow > 0.01;
          // On-screen size of one text line at fit 1; keep it between the limits
          if (v.label.visible) {
            const base = v.label.userData.baseScale as THREE.Vector3;
            const lines = (v.label.userData.lines as number | undefined) ?? 1;
            const k = v.node.isCenter || v.avatar.visible ? 1 : 0.9;
            const linePx = ((base.y * k) / lines) * pxPerUnit / Math.max(1, Math.sqrt(d2));
            const lo = v.node.isCenter ? LABEL_CENTER_MIN_PX : LABEL_MIN_PX;
            const hi = v.node.isCenter ? LABEL_CENTER_MAX_PX : LABEL_MAX_PX;
            const fit = linePx > hi ? hi / linePx : linePx < lo ? lo / linePx : 1;
            if (Math.abs(fit - v.labelFit) > v.labelFit * 0.03) {
              v.labelFit = fit;
              applyLevel(v, v.level);
            }
          }
          const dimLabel = pathRef.current.dim && !pathRef.current.set.has(v.node.id);
          const mat = v.label.material as THREE.SpriteMaterial;
          const op = (dimLabel ? DIM_OPACITY : 1) * v.labelShow;
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

        // Dots keep their on-screen size in bounds: far ones a minimum, like stars; near ones a cap, so a dot
        // the camera passes close to does not balloon
        if (!v.node.isCenter && v.dot.visible) {
          const onPath = pathRef.current.set.has(v.node.id) && !v.node.isDeleted;
          const boost = onPath ? 1.4 : 1;
          const dist = Math.max(1, Math.sqrt(d2));
          const base = (level <= 1 ? DOT_NEAR * v.sf : level === 2 ? DOT_MID * v.sf : DOT_FAR) * boost;
          const min = level >= 2 ? dist * MIN_DOT_PX * (onPath ? 1.35 : 1) : 0;
          const max = (DOT_MAX_PX * Math.sqrt(v.sf) * boost * dist) / pxPerUnit;
          const size = Math.min(Math.max(base, min), max);
          if (Math.abs(size - v.dot.scale.x) > size * 0.03) v.dot.scale.set(size, size, 1);
        }
        if (!v.node.isCenter && v.avatar.visible) {
          const cap = (AVATAR_MAX_PX * Math.max(1, Math.sqrt(d2))) / pxPerUnit;
          const want = Math.min(5 * v.sf, cap);
          if (Math.abs(want - v.avatar.scale.x) > want * 0.03) {
            v.avatarCap = cap;
            applyLevel(v, v.level); // resizes the photo, its pulse ring and the label offset together
          }
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
          const body = v.node.isCenter ? MARK_SIZE : (v.dot.visible ? v.dot.scale.x : v.avatar.scale.x);
          const ps = body * (v.node.isCenter ? 1.38 : 1.9) * (1 + 0.12 * pulse);
          v.pulse.scale.set(ps, ps, 1);
        }
        if (v.dot.visible && v.outer.visible && v.lastScale > 0.001) {
          v.d2 = d2;
          dotList.push(v);
        }
      }

      // All dots in one draw call, far to near so overlapping ones blend like separate sprites did
      const dots = dotsRef.current;
      if (dots) {
        dotList.sort(farFirst);
        const canvasH = (fg.renderer() as THREE.WebGLRenderer).domElement.height;
        dots.setScale(((cam as THREE.PerspectiveCamera).projectionMatrix.elements[5] ?? 1) * canvasH * 0.5);
        dots.write(dotList);
      }

      // Links: colours when the path / rings / palette change, positions while the layout moves
      const links = linksRef.current;
      if (links) {
        if (linkPaintRef.current) paintLinks();
        if (simRef.current || linkMoveRef.current) {
          links.update();
          linkMoveRef.current = false;
        }
      }

      // Impulses: pulses along the incoming-Need paths, after the links so both read the same positions.
      // Nothing runs while there are none, the canvas is off screen or the tab is hidden.
      const imp = impulseRef.current;
      if (imp && imp.live && onScreen && !document.hidden) {
        const gl = fg.renderer() as THREE.WebGLRenderer;
        imp.setView(
          ((cam as THREE.PerspectiveCamera).projectionMatrix.elements[5] ?? 1) * gl.domElement.height * 0.5,
          gl.getPixelRatio(),
        );
        imp.update(now, dt, reduced);
        // The asker's ring swells at each launch (steady and a bit larger with reduced motion)
        // (two impulses from one asker: the larger swell wins; the ring keeps its usual breathing)
        for (let a = 0; a < imp.slots.length; a++) {
          const sl = imp.slots[a]!;
          if (!sl.used || !sl.source || sl.fade <= 0) continue;
          let swell = 0;
          let first = true;
          for (let b = 0; b < imp.slots.length; b++) {
            const o = imp.slots[b]!;
            if (!o.used || !o.source || o.fade <= 0 || o.nodes[0] !== sl.nodes[0]) continue;
            if (b < a) { first = false; break; }
            swell = Math.max(swell, (reduced ? 0.3 : 0.45 * o.launch) * o.fade);
          }
          if (!first) continue;
          const v = visRef.current.get(sl.nodes[0]!.id);
          if (!v?.pulse || !v.pulse.visible) continue;
          const body = v.dot.visible ? v.dot.scale.x : v.avatar.scale.x;
          const ps = body * 1.9 * (1 + swell) * (1 + 0.12 * pulse);
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
      screenObserver?.disconnect();
      scene.remove(linkLayer.group, dotLayer.points, impulseLayer.points);
      linkLayer.dispose();
      dotLayer.dispose();
      impulseLayer.dispose();
      if (linksRef.current === linkLayer) linksRef.current = null;
      if (dotsRef.current === dotLayer) dotsRef.current = null;
      if (impulseRef.current === impulseLayer) impulseRef.current = null;
      if (controls) {
        controls.removeEventListener('start', onStart);
        controls.removeEventListener('end', onEnd);
      }
      // Leaving while the layout still moves: keep where everyone is now, so the next visit starts here
      // and only finishes settling (the engine-stop save never comes for this graph)
      const owner = ownerRef.current;
      if (owner && simRef.current) {
        writeLayout(owner, nodeMapRef.current.values());
        setLayoutSettled(owner, false);
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
    // New data: the link layer takes the new set of links (node objects are kept by id)
    const links = resolveLinks();
    linksRef.current?.setLinks(links);
    impulseRef.current?.setLinks(links);
    linkPaintRef.current = true;
    if (refresh) {
      for (const v of visRef.current.values()) disposeLabel(v.label);
      visRef.current.clear();
      res.resetMaterials();
      try { fg.refresh(); } catch { /* noop */ }
    }
  }, [graphData, res, resolveLinks]);

  // Far rings (4th, 5th handshake) as an anonymous dust around the ball: no nodes, no links, no names.
  // Dots stand for a rounded count and are scattered at random, so they say "how many", never "who" or "via whom".
  const farKey = (farRings ?? []).join(',');
  useEffect(() => {
    const fg = fgRef.current;
    const scene = fg?.scene?.() as THREE.Scene | undefined;
    if (!scene) return;
    const old = scene.getObjectByName('so-far');
    if (old) {
      scene.remove(old);
      ((old as THREE.Points).geometry as THREE.BufferGeometry).dispose();
      ((old as THREE.Points).material as THREE.Material).dispose();
    }
    const counts = (farRings ?? []).map((n) => Math.max(0, Math.round(n)));
    const want = counts.reduce((sum, n) => sum + n, 0);
    if (want === 0) return;
    // One dot is one person only for a small network; a big one is drawn at a fixed density
    const scale = Math.min(1, FAR_DOTS_MAX / want);
    const outer = ballOuter(sizeRef.current);
    const positions: number[] = [];
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    counts.forEach((n, i) => {
      const dots = Math.max(n > 0 ? 3 : 0, Math.round(n * scale));
      const inner = outer * (1.25 + i * 0.45);
      const thick = outer * 0.4;
      for (let k = 0; k < dots; k++) {
        const z = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const r = inner + rand() * thick;
        const ring = Math.sqrt(1 - z * z);
        positions.push(Math.cos(a) * ring * r, z * r, Math.sin(a) * ring * r);
      }
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const parsed = parseColor(colorsRef.current.node3);
    const mat = new THREE.PointsMaterial({
      color: parsed.color,
      opacity: 0.55,
      transparent: true,
      size: 2.2,
      sizeAttenuation: true,
      depthWrite: false,
      map: res.discTexture,
      alphaTest: 0.3,
    });
    const dust = new THREE.Points(geom, mat);
    dust.name = 'so-far';
    dust.raycast = noRaycast;
    dust.frustumCulled = false;
    scene.add(dust);
    return () => {
      scene.remove(dust);
      geom.dispose();
      mat.dispose();
    };
    // sizeRef follows graphData; farKey covers the counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farKey, graphData, res]);

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
    linkPaintRef.current = true;
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
    linkPaintRef.current = true;
  }, [hiddenKey]);

  // Hand the impulses to the layer. One that is not on the highlighted path (a person is selected) runs dimmed.
  useEffect(() => {
    const layer = impulseRef.current;
    if (!layer) return;
    const map = nodeMapRef.current;
    const items: ImpulseInput[] = [];
    for (const it of impulseState.items) {
      const nodes: SimNode[] = [];
      for (const id of it.ids) {
        const node = map.get(id);
        if (node) nodes.push(node);
      }
      if (nodes.length < 2) continue;
      let onHighlight = true;
      for (let i = 1; i < it.ids.length && onHighlight; i++) onHighlight = pathState.links.has(`${it.ids[i - 1]}\0${it.ids[i]}`);
      items.push({ id: it.id, nodes, dimmed: pathState.dim && !onHighlight, source: it.source });
    }
    layer.set(items);
    // Askers get their ring (applyLevel reads sourceIdsRef); refresh the ones that gained or lost it
    const prev = sourceIdsRef.current;
    const next = new Set<string>();
    for (const it of items) if (it.source) next.add(it.nodes[0]!.id);
    sourceIdsRef.current = next;
    for (const id of [...prev, ...next]) {
      if (prev.has(id) === next.has(id)) continue;
      const v = visRef.current.get(id);
      if (v && v.level >= 0) applyLevel(v, v.level);
    }
  }, [impulseState, pathState, graphData, applyLevel]);

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
        f.kick = FOCUS_ROTATE_SPEED;
      };
      go(12);
    } else if (prev) {
      // Back to the overview around me, at the usual rotation speed
      const b = f.before;
      f.before = null;
      f.kick = AUTO_ROTATE_SPEED;
      if (b) {
        flyPose(
          new THREE.Vector3(b.position.x, b.position.y, b.position.z),
          new THREE.Vector3(b.target.x, b.target.y, b.target.z),
          FOCUS_FLY_MS,
        );
      } else {
        fitCameraRef.current(FOCUS_FLY_MS);
      }
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

  const [canHover] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(hover: hover)').matches);
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
      // While a person is focused, hand out the pose from before the focus: a screen that saves the view
      // and remounts later (Person page, then Back) must come back to the overview, not orbit that person
      const before = focusRef.current.id ? focusRef.current.before : null;
      if (before) return { position: { ...before.position }, target: { ...before.target } };
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
        // A touch screen has no hover: the hint would stay after a tap and cover the graph (a tap opens the person)
        nodeLabel={canHover ? nodeLabel : NO_HINT}
        // Links are drawn by LinkLayer (one draw call); the library only uses them for the layout
        linkVisibility={false}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onEngineTick={() => { simRef.current = true; }}
        onEngineStop={() => {
          simRef.current = false;
          linkMoveRef.current = true;
          const owner = ownerRef.current;
          if (owner) {
            writeLayout(owner, nodeMapRef.current.values());
            setLayoutSettled(owner, true);
          }
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

/*
 * Centre wash: a camera-facing quad whose radial gradient is computed per pixel and dithered.
 * It used to be a 256px canvas texture: a very dark, low-alpha 8-bit gradient (premultiplied in the
 * canvas) stretched over most of the screen, which showed as visible rings ("staircase") and blocks.
 * Colours are sRGB and written as-is: the default framebuffer holds sRGB values (no colorspace chunk).
 */
const WASH_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Billboard like THREE.Sprite: keep the centre in view space, offset the corners by the world scale
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}
`;

const WASH_FRAGMENT = /* glsl */ `
uniform vec3 uWash;
uniform vec3 uWashEdge;
varying vec2 vUv;

// Two-circle radial gradient as in canvas createRadialGradient (canvas units, y down)
const vec2 C0 = vec2(0.5, 0.42);
const float R0 = 0.04;
const vec2 C1 = vec2(0.5, 0.46);
const float R1 = 0.5;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  vec2 d = C1 - C0;
  float dr = R1 - R0;
  vec2 q = p - C0;
  float a = dot(d, d) - dr * dr;
  float b = dot(q, d) + R0 * dr;
  float c = dot(q, q) - R0 * R0;
  float disc = max(b * b - a * c, 0.0);
  float t = clamp((b - sqrt(disc)) / a, 0.0, 1.0);

  // Stops (premultiplied): wash at 0.85, washEdge at 0.28 (t = 0.62), transparent at 1
  vec4 s0 = vec4(uWash * 0.85, 0.85);
  vec4 s1 = vec4(uWashEdge * 0.28, 0.28);
  vec4 col = t < 0.62 ? mix(s0, s1, t / 0.62) : mix(s1, vec4(0.0), (t - 0.62) / 0.38);
  if (col.a <= 0.0) discard;

  // Triangular dither of about +-1 LSB breaks the 8-bit steps of such a dark gradient
  vec2 fc = gl_FragCoord.xy;
  float n = ign(fc) + ign(fc + vec2(47.0, 17.0)) - 1.0;
  col.rgb += n / 255.0;
  gl_FragColor = col;
}
`;

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

  // Impulse pulses: one material, tinted from the palette (care for the glow, a lighter care for the core)
  const impulseMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 1 },
      uPx: { value: 1 },
      uCore: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
    },
    vertexShader: IMPULSE_VERTEX,
    fragmentShader: IMPULSE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const tintImpulse = (care: string) => {
    const hex = parseColor(care).color;
    (impulseMaterial.uniforms.uGlow!.value as THREE.Color).setHex(hex);
    (impulseMaterial.uniforms.uCore!.value as THREE.Color).setHex(hex).lerp(tmpColor.setHex(0xffffff), 0.7);
  };
  tintImpulse(colors.care);

  // Centre wash: one quad and one shader material (premultiplied output over the scene colour)
  const washGeometry = new THREE.PlaneGeometry(1, 1);
  const washMaterial = new THREE.ShaderMaterial({
    vertexShader: WASH_VERTEX,
    fragmentShader: WASH_FRAGMENT,
    uniforms: { uWash: { value: new THREE.Color() }, uWashEdge: { value: new THREE.Color() } },
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });

  // Uniforms are sRGB numbers used as is (the shader writes them straight to the screen, like the old constants)
  const tintWash = () => {
    (washMaterial.uniforms.uWash!.value as THREE.Color).setHex(parseColor(colors.wash).color, THREE.LinearSRGBColorSpace);
    (washMaterial.uniforms.uWashEdge!.value as THREE.Color).setHex(parseColor(colors.washEdge).color, THREE.LinearSRGBColorSpace);
  };
  tintWash();

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

  // Tap / hover target that never renders (the dot itself is drawn by DotLayer)
  const hitMaterial = new THREE.SpriteMaterial({ visible: false });

  const api = {
    discTexture,
    hitMaterial,
    pulseMaterial,
    pulseDimMaterial,
    impulseMaterial,

    setColors(next: GraphColors) {
      colors = next;
      tintImpulse(next.care);
      tintWash();
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
      // Writes depth inside the tile only (alphaTest): names and dots behind "me" no longer show through it
      return cached(`mark:${dim ? 1 : 0}:${colors.careBright}:${colors.careOn}`, () => new THREE.SpriteMaterial({
        map, transparent: true, opacity: dim ? 0.35 : 1, alphaTest: 0.5,
      }));
    },
    glowMaterial() {
      const color = parseColor(colors.care).color;
      return cached(`glow:${color}`, () => new THREE.SpriteMaterial({
        map: discTexture, color, transparent: true, opacity: 0.22, depthWrite: false,
      }));
    },
    washGeometry,
    /** The wash is drawn over the scene clear colour, so it does not depend on it. */
    sceneGlowMaterial(_scene: string) {
      return washMaterial;
    },
    photoMaterial(url: string, deleted: boolean, tex: THREE.Texture) {
      // The photo is a disc on a square texture: alphaTest keeps the clear corners out of the depth buffer,
      // so they no longer cut dots, names and other avatars behind them
      return cached(`photo:${url}:${deleted}`, () => new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: deleted ? 0.5 : 1, alphaTest: 0.5,
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
      impulseMaterial.dispose();
      hitMaterial.dispose();
      washMaterial.dispose();
      washGeometry.dispose();
      for (const t of textures) t.dispose();
      textures.length = 0;
      // Avatar textures stay in the module cache. release() only drops this graph's pins.
      avatars.release();
    },
  };
  return api;
}
