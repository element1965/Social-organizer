/**
 * The story scene of the landing: instanced starlings over a photographed sky; the scroll position drives the
 * camera and the story. Ported from the concept prototype (local/media/concept-6, v9) with its numbers unchanged.
 *
 * Three formations: the ribbon of the opening shot, the cloud in which the story is told, and at the end the
 * graph the app draws: the same people as rings of dots around you (your acquaintances, theirs, then a dust),
 * over the app's dark scene. The cloud has fixed neighbours (7 nearest, made mutual); Maria's Need spreads by
 * breadth-first search, nearest first. Loaded with a dynamic import, so Three.js stays out of the app bundle.
 */
import * as THREE from 'three';
import { formatIsolatedMoney } from '../ui2/format';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { canvasRgb, landingCanvasPalette } from './canvasPalette';

export interface SceneElements {
  /** The landing root; gets `past` once the story has scrolled away and `graph` while the graph is shown. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  sky: HTMLElement;
  night: HTMLElement;
  /** The app's dark scene with its centre wash; fades in as the flock turns into the graph. */
  graphBg: HTMLElement;
  story: HTMLElement;
  /** The hero, then the story's beats. */
  beats: HTMLElement[];
  /** How many of the scene's phases each of `beats` tells (the hero tells one); the scene has one shot per phase. */
  phases: number[];
  /** Words that come in late, one per beat. */
  lates: (HTMLElement | null)[];
  tags: { you: HTMLElement; oleg: HTMLElement; maria: HTMLElement; lena: HTMLElement };
  hud: HTMLElement;
  hudReached: HTMLElement;
  hudReported: HTMLElement;
  hudPeople: HTMLElement;
  rail: HTMLElement;
  railLinks: HTMLElement[];
}

export interface SceneOptions {
  rtl: boolean;
  format: (n: number) => string;
  /** The words under a counter, in the plural form its number takes. */
  label: (key: 'reached' | 'people', n: number) => string;
  /** The shortfall and your share in the reader's currency (money.ts): the participants' sums add up to the shortfall. */
  money: { shortfall: number; mine: number };
}

export interface SceneHandle {
  update(options: SceneOptions): void;
  destroy(): void;
}

export interface SceneIntro {
  /**
   * The flock may fly into the frame if the reader is still on the opening screen when the scene is ready. False
   * when the page was opened at a later section (it may still be scrolling there): then the scene only fades in.
   */
  flyIn?: boolean;
}

interface Shot {
  t: THREE.Vector3;
  d: number;
  yaw: number;
  pitch: number;
  off: number;
  offY: number;
}

interface BeatOut {
  thin: [number, number][];
  thick: [number, number][];
  /** The Need's way to you in the app: asker, link, you (drawn as a bent line with pulses). */
  path: number[] | null;
  halo: number;
  ring: number;
  T: { you?: boolean; oleg?: boolean; maria?: boolean; lena?: boolean };
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const remap = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function initScene(els: SceneElements, initial: SceneOptions, intro: SceneIntro = {}): SceneHandle {
  let opts = initial;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 760;
  const palette = landingCanvasPalette(els.root);
  const white = palette('white');
  const careBright = palette('care-bright');
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
  const N = small ? 2000 : lowEnd ? 4000 : 6500;
  const { canvas, sky: skyEl, night: nightEl, graphBg, beats, story } = els;
  /** Where each beat starts on the scene's time line, in phases. */
  const phasesOf = (k: number) => Math.max(1, els.phases[k] ?? 1);
  const phaseStart: number[] = [];
  let phaseCount = 0;
  beats.forEach((_, k) => {
    phaseStart.push(phaseCount);
    phaseCount += phasesOf(k);
  });
  /** The last phase: the network as the app shows it. The one before it turns the flock into that graph. */
  const LAST = phaseCount - 1;
  const MORPH = LAST - 1;
  /** A beat's late words come in once the scene is 0.2 into the beat's last phase. */
  const lateAt = beats.map((_, k) => phaseStart[k]! + phasesOf(k) - 0.8);

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => {
    let u = 0;
    while (!u) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * rnd());
  };

  // ---- formation 1: the ribbon of the opening shot ----
  const RIB = new Float32Array(N * 3);
  const TAN = new Float32Array(N * 3);
  const U = new Float32Array(N);
  const PH = new Float32Array(N);
  const ribbonAt = (u: number, o: number[]) => {
    o[0] = 8 + 46 * u;
    o[1] = 13 + 7 * Math.sin(Math.PI * (1.1 * u + 0.1)) - 6 * u;
    o[2] = -4 + 8 * Math.sin(6.283 * u + 0.5);
  };
  const thick = (u: number) => 1.4 + 8.5 * Math.exp(-(((u - 0.62) / 0.22) ** 2)) + 2 * Math.exp(-(((u - 0.25) / 0.1) ** 2));
  {
    const c = [0, 0, 0];
    const d = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      let u: number;
      do {
        u = rnd();
      } while (rnd() * 10.4 > thick(u));
      U[i] = u;
      PH[i] = rnd() * 6.283;
      ribbonAt(u, c);
      ribbonAt(Math.min(1, u + 0.01), d);
      const r = thick(u);
      RIB[i * 3] = c[0]! + gauss() * r * 0.8;
      RIB[i * 3 + 1] = c[1]! + gauss() * r * 0.46;
      RIB[i * 3 + 2] = c[2]! + gauss() * r * 0.7;
      const tx = d[0]! - c[0]!;
      const ty = d[1]! - c[1]!;
      const tz = d[2]! - c[2]!;
      const tl = Math.hypot(tx, ty, tz) || 1;
      TAN[i * 3] = tx / tl;
      TAN[i * 3 + 1] = ty / tl;
      TAN[i * 3 + 2] = tz / tl;
    }
  }

  // ---- formation 2: the cloud in which the story is told (fixed neighbours) ----
  const NET = new Float32Array(N * 3);
  const CEN = new THREE.Vector3(16, 9, 0);
  const RAD = small ? [16, 8, 10] : [25, 10, 15];
  for (let i = 0; i < N; i++) {
    let x: number, y: number, z: number;
    do {
      x = rnd() * 2 - 1;
      y = rnd() * 2 - 1;
      z = rnd() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    NET[i * 3] = CEN.x + x * RAD[0]!;
    NET[i * 3 + 1] = CEN.y + y * RAD[1]!;
    NET[i * 3 + 2] = CEN.z + z * RAD[2]!;
  }
  const CELL = 2.2;
  const TB = 16384;
  const head = new Int32Array(TB);
  const nxt = new Int32Array(N);
  const hh = (x: number, y: number, z: number) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & (TB - 1);
  const grid = (A: Float32Array) => {
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      const h = hh(Math.floor(A[i * 3]! / CELL), Math.floor(A[i * 3 + 1]! / CELL), Math.floor(A[i * 3 + 2]! / CELL));
      nxt[i] = head[h]!;
      head[h] = i;
    }
  };
  for (let it = 0; it < 6; it++) {
    // relax: an even, natural spacing
    grid(NET);
    for (let i = 0; i < N; i++) {
      const gx = Math.floor(NET[i * 3]! / CELL);
      const gy = Math.floor(NET[i * 3 + 1]! / CELL);
      const gz = Math.floor(NET[i * 3 + 2]! / CELL);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (let c = -1; c <= 1; c++)
            for (let j = head[hh(gx + a, gy + b, gz + c)]!; j !== -1; j = nxt[j]!)
              if (j > i) {
                const dx = NET[j * 3]! - NET[i * 3]!;
                const dy = NET[j * 3 + 1]! - NET[i * 3 + 1]!;
                const dz = NET[j * 3 + 2]! - NET[i * 3 + 2]!;
                const dd = Math.hypot(dx, dy, dz);
                if (dd < 1.5 && dd > 1e-4) {
                  const k = ((1.5 - dd) / dd) * 0.25;
                  NET[i * 3]! -= dx * k;
                  NET[i * 3 + 1]! -= dy * k;
                  NET[i * 3 + 2]! -= dz * k;
                  NET[j * 3]! += dx * k;
                  NET[j * 3 + 1]! += dy * k;
                  NET[j * 3 + 2]! += dz * k;
                }
              }
    }
  }
  const knn = (k: number): number[][] => {
    grid(NET);
    const res: number[][] = new Array(N);
    // the k nearest so far, nearest first. A candidate goes after those at the same distance and a bucket met
    // twice is skipped, so this keeps exactly the neighbours, in the order, that a stable sort of all candidates
    // would; it only spares the sort (it ran for most of a second on a desktop before the flock could fly in).
    const bd = new Float64Array(k);
    const bj = new Int32Array(k);
    for (let i = 0; i < N; i++) {
      const gx = Math.floor(NET[i * 3]! / CELL);
      const gy = Math.floor(NET[i * 3 + 1]! / CELL);
      const gz = Math.floor(NET[i * 3 + 2]! / CELL);
      let n = 0;
      for (let a = -2; a <= 2; a++)
        for (let b = -2; b <= 2; b++)
          for (let c = -2; c <= 2; c++)
            for (let j = head[hh(gx + a, gy + b, gz + c)]!; j !== -1; j = nxt[j]!) {
              if (j === i) continue;
              const d = (NET[j * 3]! - NET[i * 3]!) ** 2 + (NET[j * 3 + 1]! - NET[i * 3 + 1]!) ** 2 + (NET[j * 3 + 2]! - NET[i * 3 + 2]!) ** 2;
              if (n === k && d >= bd[k - 1]!) continue;
              let dup = false;
              for (let m = 0; m < n; m++)
                if (bj[m] === j) {
                  dup = true;
                  break;
                }
              if (dup) continue;
              let p = n < k ? n++ : k - 1;
              while (p > 0 && bd[p - 1]! > d) {
                bd[p] = bd[p - 1]!;
                bj[p] = bj[p - 1]!;
                p--;
              }
              bd[p] = d;
              bj[p] = j;
            }
      res[i] = Array.from(bj.subarray(0, n));
    }
    for (let i = 0; i < N; i++) for (const j of res[i]!) if (!res[j]!.includes(i)) res[j]!.push(i);
    return res;
  };
  const adj = knn(7);
  const bfs = (src: number) => {
    const d = new Int16Array(N).fill(-1);
    const par = new Int32Array(N).fill(-1);
    const q = [src];
    d[src] = 0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h]!;
      for (const v of adj[u]!)
        if (d[v]! < 0) {
          d[v] = d[u]! + 1;
          par[v] = u;
          q.push(v);
        }
    }
    return { d, par, q };
  };
  const nearest = (x: number, y: number, z: number) => {
    let b = 1e9;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const d = (NET[i * 3]! - x) ** 2 + (NET[i * 3 + 1]! - y) ** 2 + (NET[i * 3 + 2]! - z) ** 2;
      if (d < b) {
        b = d;
        k = i;
      }
    }
    return k;
  };

  // the cast: you sit at the front of the cloud; Maria is two handshakes away; Oleg links you
  const you = nearest(CEN.x - RAD[0]! * 0.25, CEN.y - RAD[1]! * 0.1, CEN.z + RAD[2]! * 0.55);
  const fromYou = bfs(you);
  const two = fromYou.q.filter((i) => fromYou.d[i] === 2);
  let maria = two[0]!;
  let bestD = -1;
  for (const i of two) {
    const dz = Math.abs(NET[i * 3 + 2]! - NET[you * 3 + 2]!);
    const dd = (NET[i * 3]! - NET[you * 3]!) ** 2 + (NET[i * 3 + 1]! - NET[you * 3 + 1]!) ** 2 - dz * dz * 2;
    if (dd > bestD) {
      bestD = dd;
      maria = i;
    }
  }
  const oleg = fromYou.par[maria]!;
  const fromMaria = bfs(maria);
  // the cast that follows the sum: up to one person per dollar hears of the Need, nearest first; some of them
  // take part (you with five steps, Oleg), Lena among those who know Maria directly. The participants' sums are
  // in steps of a fifth of your share and add up to the shortfall.
  const menu = [1, 2, 3, 5, 5, 5, 10, 10, 10, 15, 20];
  let reach: number[] = [];
  let parts: number[] = [];
  let lena = oleg;
  let amt: number[] = [];
  let shortfallTotal = 0;
  const setMoney = (m: SceneOptions['money']) => {
    let s = 7; // a sequence of its own: a new sum must not move the birds
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    reach = fromMaria.q.slice(1, m.shortfall + 1);
    parts = [you, oleg];
    for (const i of reach) if (parts.length < 44 && i !== you && i !== oleg && r() < 0.2) parts.push(i);
    lena = parts.slice(2).find((i) => fromMaria.d[i] === 1) ?? parts[2] ?? oleg;
    const step = m.mine / 5;
    const total = Math.max(parts.length * 2, Math.round(m.shortfall / step));
    const a = parts.map((_, i) => (i === 0 ? 5 : menu[(r() * menu.length) | 0]!));
    let sum = a.reduce((x, y) => x + y, 0);
    let i = 1;
    while (sum !== total) {
      const d = Math.sign(total - sum);
      if (a[i]! + d >= 1) {
        a[i] = a[i]! + d;
        sum += d;
      }
      i = 1 + (i % (a.length - 1));
    }
    amt = a.map((v) => v * step);
    shortfallTotal = total * step;
  };
  setMoney(opts.money);

  // ---- formation 3: the same people as the app draws them, rings of dots around you ----
  // Shell radii by handshake (the app's ball: 0.38, 0.7 and 1 of the outer radius). People beyond the third
  // handshake are a dust around it; the farthest leave the picture.
  const SHELL = [0, 3.6, 6.7, 9.6];
  const DUST = 6;
  const dep = fromYou.d;
  const GPOS = new Float32Array(N * 3);
  /** When a bird sets off: your acquaintances first, the dust last. */
  const GO = new Float32Array(N);
  /** How much of a dot the graph shows: 1 on a ring, less for the dust, 0 for a bird that leaves. */
  const GV = new Float32Array(N);
  /** Dot size in world units. */
  const GSZ = new Float32Array(N);
  /** Each bird's progress into the graph this frame. */
  const GI = new Float32Array(N);
  {
    const yx = NET[you * 3]!;
    const yy = NET[you * 3 + 1]!;
    const yz = NET[you * 3 + 2]!;
    const dotK = small ? 1.3 : 1;
    // directions from you: your acquaintances spread all round; everyone else sits near the person they came
    // through, so the links run outwards in short branches, as the app's force layout draws them
    const DX = new Float32Array(N * 3);
    const unit = (i: number, x: number, y: number, z: number) => {
      const m = Math.hypot(x, y, z) || 1;
      DX[i * 3] = x / m;
      DX[i * 3 + 1] = y / m;
      DX[i * 3 + 2] = z / m;
    };
    for (let i = 0; i < N; i++) unit(i, gauss(), gauss(), gauss());
    for (const i of fromYou.q) {
      const d = dep[i]!;
      // the chain of the last beat has its own places: Oleg below you and to the side, Maria further out, both
      // across the camera's line of sight, so the Need's way to you always reads as a bend
      if (i === oleg) unit(i, -0.55, -0.8, 0.15);
      else if (i === maria) unit(i, -0.95, -0.35, 0.1);
      else if (d === 1) {
        const rx = NET[i * 3]! - yx;
        const ry = NET[i * 3 + 1]! - yy;
        const rz = NET[i * 3 + 2]! - yz;
        const l = Math.hypot(rx, ry, rz) || 1;
        unit(i, rx / l + gauss() * 0.7, ry / l + gauss() * 0.7, rz / l + gauss() * 0.7);
      } else if (d > 1) {
        const p = fromYou.par[i]! * 3;
        const spread = d <= 3 ? 0.42 : 0.6;
        unit(i, DX[p]! + gauss() * spread, DX[p + 1]! + gauss() * spread, DX[p + 2]! + gauss() * spread);
      }
    }
    for (let i = 0; i < N; i++) {
      const d = dep[i]! < 0 ? 99 : dep[i]!;
      const r = d === 0 ? 0 : d <= 3 ? SHELL[d]! * (0.9 + 0.2 * rnd()) : SHELL[3]! * (1.3 + 0.28 * (d - 4) + 0.35 * rnd());
      const far = d > DUST ? 1.8 : 1;
      GPOS[i * 3] = yx + DX[i * 3]! * r * far;
      GPOS[i * 3 + 1] = yy + DX[i * 3 + 1]! * r * far;
      GPOS[i * 3 + 2] = yz + DX[i * 3 + 2]! * r * far;
      GO[i] = (Math.min(d, DUST + 1) / (DUST + 1)) * 0.55 + rnd() * 0.08;
      GV[i] = d === 0 ? 0 : d <= 3 ? 1 : d <= DUST ? 0.55 - 0.12 * (d - 4) : 0;
      GSZ[i] = dotK * (d === 1 ? 0.34 : d === 2 ? 0.26 : d === 3 ? 0.21 : 0.12);
    }
  }
  const ring1 = fromYou.q.filter((i) => dep[i] === 1);
  // links as the app draws them: each person to the one they came through, and some inside the rings
  const gEdges: number[] = [];
  for (let i = 0; i < N; i++) if (dep[i]! >= 2 && dep[i]! <= 3) gEdges.push(i, fromYou.par[i]!);
  for (let i = 0; i < N; i++) {
    const d = dep[i]!;
    if (d < 1 || d > 3) continue;
    for (const j of adj[i]!) {
      if (j <= i || dep[j]! < 1 || dep[j]! > 3 || Math.abs(dep[j]! - d) > 1 || rnd() >= 0.3) continue;
      // a link inside the rings only between people the layout put near each other: no chords across the ball
      const gd = Math.hypot(GPOS[i * 3]! - GPOS[j * 3]!, GPOS[i * 3 + 1]! - GPOS[j * 3 + 1]!, GPOS[i * 3 + 2]! - GPOS[j * 3 + 2]!);
      if (gd < 4.2) gEdges.push(i, j);
    }
  }

  // ---- rendering ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  let sceneDirty = true;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0x6c7f86, 40, 200);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);

  // a starling seen from above: a slim body with a tail and two swept wings; aWing marks the wing tips
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([0.5, 0, 0, -0.42, 0, 0.07, -0.42, 0, -0.07, 0.16, 0, 0.02, -0.14, 0, 0.03, -0.04, 0, 0.7, 0.16, 0, -0.02, -0.04, 0, -0.7, -0.14, 0, -0.03]),
      3,
    ),
  );
  geo.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 1, 0]), 1));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(PH, 1));
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader =
      'attribute float aWing; attribute float aPhase; uniform float uTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n float f = sin(uTime * 15.0 + aPhase); transformed.y += aWing * f * .34; transformed.z *= 1.0 - aWing * (.18 + .18 * f);',
      );
  };
  const birds = new THREE.InstancedMesh(geo, mat, N);
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new Float32Array(N * 3);
  const colT = new Float32Array(N * 3);
  const scl = new Float32Array(N).fill(1);
  birds.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
  birds.frustumCulled = false;
  scene.add(birds);

  // brand colours (tokens.css): nodes, care for Participation, sos for a Need, warm for those who heard of it
  const C = {
    base: new THREE.Color(0x0d1715),
    you: new THREE.Color(0xffffff),
    n1: new THREE.Color(0xffffff),
    n2: new THREE.Color(0xd3e6e1),
    n3: new THREE.Color(0xa3c2ba),
    warm: new THREE.Color(0xf2be68),
    care: new THREE.Color(0x5fd3c6),
    sos: new THREE.Color(0xff6a5c),
    dim: new THREE.Color(0x3a4a46),
    // the app's graph (graph-3d palette): dots by handshake, the dust, the scene
    g1: new THREE.Color(0xe7eeeb),
    g2: new THREE.Color(0x9fb0aa),
    g3: new THREE.Color(0x5f7069),
    dust: new THREE.Color(0x4d5d58),
    scene: new THREE.Color(0x0b1513),
  };
  const ringCol = (i: number) => {
    const d = dep[i]!;
    return d === 0 ? C.you : d === 1 ? C.g1 : d === 2 ? C.g2 : d === 3 ? C.g3 : C.dust;
  };
  for (let i = 0; i < N; i++) {
    col[i * 3] = C.base.r;
    col[i * 3 + 1] = C.base.g;
    col[i * 3 + 2] = C.base.b;
  }

  const spriteTex = (draw: (x: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    if (x) draw(x);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const glow = (r: number, g: number, b: number) =>
    spriteTex((x) => {
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gr.addColorStop(0.25, `rgba(${r},${g},${b},.5)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
    });
  const glowTex = glow(255, 106, 92);
  const careTex = glow(95, 211, 198);
  const ringTex = spriteTex((x) => {
    x.strokeStyle = canvasRgb(white, 0.95);
    x.lineWidth = 5;
    x.beginPath();
    x.arc(64, 64, 50, 0, 6.283);
    x.stroke();
  });
  // you in the app: the logo on a care tile (as BrandMark draws it), drawn once the logo has loaded
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileCanvas.height = 128;
  const tileTex = new THREE.CanvasTexture(tileCanvas);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  const drawTile = (img: HTMLImageElement | null) => {
    const x = tileCanvas.getContext('2d');
    if (!x) return;
    x.clearRect(0, 0, 128, 128);
    x.fillStyle = canvasRgb(careBright);
    x.beginPath();
    if (typeof x.roundRect === 'function') x.roundRect(4, 4, 120, 120, 35);
    else x.rect(4, 4, 120, 120);
    x.fill();
    if (img && img.naturalWidth) {
      const w = 82;
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const m = document.createElement('canvas');
      m.width = w;
      m.height = h;
      const mx = m.getContext('2d');
      if (mx) {
        mx.drawImage(img, 0, 0, w, h);
        mx.globalCompositeOperation = 'source-in';
        mx.fillStyle = canvasRgb(white);
        mx.fillRect(0, 0, w, h);
        x.drawImage(m, 64 - w / 2, 64 - h / 2);
      }
    }
    tileTex.needsUpdate = true;
  };
  drawTile(null);
  const logo = new Image();
  logo.onload = () => {
    drawTile(logo);
    sceneDirty = true;
  };
  logo.src = '/logo.png';

  const haloMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const ringMat = new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, fog: false });
  const tileMat = new THREE.SpriteMaterial({ map: tileTex, transparent: true, depthWrite: false, depthTest: false, fog: false });
  const careMat = new THREE.SpriteMaterial({ map: careTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Sprite(haloMat);
  const ringS = new THREE.Sprite(ringMat);
  const tile = new THREE.Sprite(tileMat);
  const tileGlow = new THREE.Sprite(careMat);
  tileGlow.renderOrder = 2;
  tile.renderOrder = 3;
  const pulses = [0, 1, 2].map(() => new THREE.Sprite(careMat));
  scene.add(halo, ringS, tileGlow, tile, ...pulses);

  // the graph's dots: one draw for all, round, sized by handshake; they take over from the birds
  const P = new Float32Array(N * 3);
  const dotAlpha = new Float32Array(N);
  const dotSize = new Float32Array(N);
  const dotGeo = new THREE.BufferGeometry();
  const dotPosAttr = new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage);
  const dotColAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const dotAlphaAttr = new THREE.BufferAttribute(dotAlpha, 1).setUsage(THREE.DynamicDrawUsage);
  const dotSizeAttr = new THREE.BufferAttribute(dotSize, 1).setUsage(THREE.DynamicDrawUsage);
  dotGeo.setAttribute('position', dotPosAttr);
  dotGeo.setAttribute('aColor', dotColAttr);
  dotGeo.setAttribute('aAlpha', dotAlphaAttr);
  dotGeo.setAttribute('aSize', dotSizeAttr);
  const dotMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uMax: { value: 16 }, uMin: { value: 1.5 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
      uniform float uScale; uniform float uMax; uniform float uMin;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = aSize * uScale / max(0.001, -mv.z);
        // far dots stay a few pixels and fade instead of vanishing; near ones are capped (the app does the same)
        vAlpha = aAlpha * clamp(px / uMin, 0.0, 1.0);
        gl_PointSize = clamp(px, uMin, uMax);
        vColor = aColor;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.38, r) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  dots.frustumCulled = false;
  dots.visible = false;
  scene.add(dots);

  // the graph's links: thin, faint, one draw
  const linkArr = new Float32Array(gEdges.length * 3);
  const linkGeo = new THREE.BufferGeometry();
  const linkAttr = new THREE.BufferAttribute(linkArr, 3).setUsage(THREE.DynamicDrawUsage);
  linkGeo.setAttribute('position', linkAttr);
  const linkMat = new THREE.LineBasicMaterial({ color: 0xe7eeeb, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const links = new THREE.LineSegments(linkGeo, linkMat);
  links.frustumCulled = false;
  links.visible = false;
  scene.add(links);

  const thinMat = new LineMaterial({ color: 0xd9efea, linewidth: 1.4, transparent: true, opacity: 0.7, depthWrite: false });
  const thickMat = new LineMaterial({ color: 0xffffff, linewidth: 3, transparent: true, opacity: 0.95, depthWrite: false });
  thinMat.fog = false;
  thickMat.fog = false;
  const thinGeo = new LineSegmentsGeometry();
  const thickGeo = new LineSegmentsGeometry();
  const thin = new LineSegments2(thinGeo, thinMat);
  const thick2 = new LineSegments2(thickGeo, thickMat);
  thin.frustumCulled = thick2.frustumCulled = false;
  scene.add(thin, thick2);
  // lines reuse one buffer each: positions are written in place, only the count changes
  const MAXSEG = 64;
  const lineBuf = new Map<LineSegments2, THREE.InterleavedBuffer>();
  for (const o of [thin, thick2]) {
    o.geometry.setPositions(new Float32Array(MAXSEG * 6));
    lineBuf.set(o, (o.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data);
  }
  const setLines = (obj: LineSegments2, pairs: [number, number][], Pp: Float32Array) => {
    const n = Math.min(pairs.length, MAXSEG);
    obj.visible = n > 0;
    if (!n) return;
    const buf = lineBuf.get(obj);
    if (!buf) return;
    const a = buf.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const i = pairs[k]![0] * 3;
      const j = pairs[k]![1] * 3;
      const o = k * 6;
      a[o] = Pp[i]!;
      a[o + 1] = Pp[i + 1]!;
      a[o + 2] = Pp[i + 2]!;
      a[o + 3] = Pp[j]!;
      a[o + 4] = Pp[j + 1]!;
      a[o + 5] = Pp[j + 2]!;
    }
    buf.needsUpdate = true;
    obj.geometry.instanceCount = n;
  };
  // the Need's way in the app: each step a gentle bend (graph-3d PATH_CURVE), sampled into the thick line
  const CURVE_STEPS = 14;
  const curve = new Float32Array((CURVE_STEPS * 2 + 1) * 3);
  let curvePts = 0;
  const setCurve = (ids: number[]) => {
    let n = 0;
    for (let s = 0; s + 1 < ids.length; s++) {
      const a = ids[s]! * 3;
      const b = ids[s + 1]! * 3;
      const ax = P[a]!, ay = P[a + 1]!, az = P[a + 2]!;
      const bx = P[b]!, by = P[b + 1]!, bz = P[b + 2]!;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const cx = (ax + bx) / 2;
      const cy = (ay + by) / 2 + len * 0.15;
      const cz = (az + bz) / 2;
      for (let k = s === 0 ? 0 : 1; k <= CURVE_STEPS; k++) {
        const u = k / CURVE_STEPS;
        const w0 = (1 - u) * (1 - u);
        const w1 = 2 * u * (1 - u);
        const w2 = u * u;
        curve[n * 3] = w0 * ax + w1 * cx + w2 * bx;
        curve[n * 3 + 1] = w0 * ay + w1 * cy + w2 * by;
        curve[n * 3 + 2] = w0 * az + w1 * cz + w2 * bz;
        n++;
      }
    }
    curvePts = n;
    const segs = Math.min(n - 1, MAXSEG);
    thick2.visible = segs > 0;
    const buf = lineBuf.get(thick2);
    if (!buf || segs <= 0) return;
    const arr = buf.array as Float32Array;
    for (let k = 0; k < segs; k++) {
      arr.set(curve.subarray(k * 3, k * 3 + 6), k * 6);
    }
    buf.needsUpdate = true;
    thick2.geometry.instanceCount = segs;
  };
  /** A point a fraction `u` along the sampled path (by length). */
  const along = (u: number, out: THREE.Vector3) => {
    let total = 0;
    for (let k = 1; k < curvePts; k++)
      total += Math.hypot(curve[k * 3]! - curve[k * 3 - 3]!, curve[k * 3 + 1]! - curve[k * 3 - 2]!, curve[k * 3 + 2]! - curve[k * 3 - 1]!);
    let left = u * total;
    for (let k = 1; k < curvePts; k++) {
      const seg = Math.hypot(curve[k * 3]! - curve[k * 3 - 3]!, curve[k * 3 + 1]! - curve[k * 3 - 2]!, curve[k * 3 + 2]! - curve[k * 3 - 1]!);
      if (left <= seg || k === curvePts - 1) {
        const f = seg > 0 ? clamp(left / seg) : 0;
        return out.set(
          lerp(curve[k * 3 - 3]!, curve[k * 3]!, f),
          lerp(curve[k * 3 - 2]!, curve[k * 3 + 1]!, f),
          lerp(curve[k * 3 - 1]!, curve[k * 3 + 2]!, f),
        );
      }
      left -= seg;
    }
    return out.set(curve[0]!, curve[1]!, curve[2]!);
  };

  // ---- motion: the shape breathes and drifts; every bird flaps and bobs; neighbours stay neighbours ----
  const PREV = new Float32Array(N * 3);
  /** Each bird starts facing along the ribbon. */
  const DIR = new Float32Array(TAN);
  // ---- the arrival: on the opening screen the flock flies in from beyond the left edge, out of the haze ----
  // Each bird carries an offset from its place that decays to nothing; the scroll-driven state underneath is
  // untouched, so scrolling during the arrival only makes the offset die away sooner, it never jumps.
  /** A bird's start minus its place in the ribbon. */
  const AOFF = new Float32Array(N * 3);
  /** A bend on the way, up or down: no two birds fly the same straight line. */
  const ALIFT = new Float32Array(N);
  /** When a bird sets off, in seconds: the head of the ribbon first, its tail streaming in after. */
  const ADEL = new Float32Array(N);
  /** Each bird's flight, in seconds: some birds take longer, so the cloud loosens and gathers as it comes. */
  const AFLY = new Float32Array(N);
  /** How much of the offset the scroll leaves: 1 while the reader stays, 0 once they have moved on; 0 = no arrival. */
  let arrK = 0;
  /** Seconds of the arrival shown so far (only drawn frames count). */
  let arrT = 0;
  let arrEnd = 0;
  const place = (T: number, morph: number, calm: number, g: number) => {
    const ampH = 1.8;
    const ampN = lerp(1.6, 0.7, calm);
    const drift = 3 * Math.sin(T * 0.045);
    const bob = reduce ? 0 : 0.14;
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const ph = PH[i]!;
      // the graph: each bird glides to its ring, the nearer rings first, with a small arc on the way
      const gi = g <= 0 ? 0 : ease(clamp((g - 0.5 * GO[i]!) / 0.5));
      GI[i] = gi;
      if (gi >= 1) {
        // arrived: the flight no longer matters
        P[ix] = GPOS[ix]!;
        P[ix + 1] = GPOS[ix + 1]!;
        P[ix + 2] = GPOS[ix + 2]!;
        continue;
      }
      let hx = RIB[ix]! + drift;
      let hy = RIB[ix + 1]!;
      let hz = RIB[ix + 2]!; // the ribbon: a slow wave runs along it
      hx += ampH * Math.sin(hy * 0.13 + T * 0.33);
      hy += ampH * 0.7 * Math.sin(hx * 0.09 + T * 0.29);
      hz += ampH * Math.sin(hx * 0.07 - T * 0.21);
      let nx = NET[ix]!;
      let ny = NET[ix + 1]!;
      let nz = NET[ix + 2]!; // the cloud: a gentler, low-frequency breathing
      nx += ampN * Math.sin(ny * 0.14 + T * 0.27 + nz * 0.05);
      ny += ampN * 0.6 * Math.sin(nx * 0.1 + T * 0.23);
      nz += ampN * 0.8 * Math.sin(nx * 0.08 - T * 0.19);
      nx += bob * Math.sin(T * 1.1 + ph);
      ny += bob * Math.sin(T * 1.3 + ph * 1.7);
      nz += bob * Math.sin(T * 0.9 + ph * 2.3);
      const s = ease(clamp((morph - 0.38 * (1 - U[i]!)) / 0.62));
      const lift = Math.sin(Math.PI * s) * (3 + 5 * ((ph * 7) % 1));
      let px = lerp(hx, nx, s);
      let py = lerp(hy, ny, s) + lift;
      let pz = lerp(hz, nz, s);
      if (gi > 0) {
        px = lerp(px, GPOS[ix]!, gi);
        py = lerp(py, GPOS[ix + 1]!, gi) + Math.sin(Math.PI * gi) * (1 + 2 * ((ph * 3) % 1));
        pz = lerp(pz, GPOS[ix + 2]!, gi);
      }
      if (arrK > 0) {
        // fast in, settling slowly (ease-out cubic): what is left of the way is (1 - a)^3
        const rest = (1 - clamp((arrT - ADEL[i]!) / AFLY[i]!)) ** 3;
        const w = rest * arrK;
        px += AOFF[ix]! * w;
        py += AOFF[ix + 1]! * w + Math.sin(Math.PI * rest) * ALIFT[i]! * arrK;
        pz += AOFF[ix + 2]! * w;
      }
      P[ix] = px;
      P[ix + 1] = py;
      P[ix + 2] = pz;
    }
  };
  const M4 = new THREE.Matrix4();
  const QT = new THREE.Quaternion();
  const SC = new THREE.Vector3();
  const PO = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const D = new THREE.Vector3();
  const syncBirds = (morph: number, closeBirdCap: number) => {
    // Cap the 1.4-unit wingspan at 44 CSS px at the bird's camera depth. Keep the close passes legible in
    // the narrow frame without changing distant birds, desktop shots, or the transition to the graph.
    const unitsPerPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
    const scalePerDepth = (44 * unitsPerPixel) / 1.4;
    const view = camera.matrixWorldInverse.elements;
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const s = clamp(morph * 1.4 - 0.2 * (1 - U[i]!));
      let dx = lerp(TAN[ix]!, 1, s);
      let dy = lerp(TAN[ix + 1]!, 0.05, s);
      let dz = lerp(TAN[ix + 2]!, 0.25, s);
      dx += (P[ix]! - PREV[ix]!) * 6;
      dy += (P[ix + 1]! - PREV[ix + 1]!) * 6;
      dz += (P[ix + 2]! - PREV[ix + 2]!) * 6;
      const l = Math.hypot(dx, dy, dz) || 1;
      DIR[ix] = lerp(DIR[ix]!, dx / l, 0.12);
      DIR[ix + 1] = lerp(DIR[ix + 1]!, dy / l, 0.12);
      DIR[ix + 2] = lerp(DIR[ix + 2]!, dz / l, 0.12);
      D.set(DIR[ix], DIR[ix + 1]!, DIR[ix + 2]!).normalize();
      QT.setFromUnitVectors(X, D);
      // a bird shrinks into its dot as it reaches the graph
      PO.set(P[ix]!, P[ix + 1]!, P[ix + 2]!);
      let sc = 0.58 * scl[i]! * lerp(1.45, 1, s) * (1 - clamp(GI[i]! * 1.25));
      if (closeBirdCap > 0) {
        const depth = -(view[2]! * PO.x + view[6]! * PO.y + view[10]! * PO.z + view[14]!);
        sc = lerp(sc, Math.min(sc, Math.max(0, depth) * scalePerDepth), closeBirdCap);
      }
      SC.setScalar(sc);
      M4.compose(PO, QT, SC);
      birds.setMatrixAt(i, M4);
    }
    birds.instanceMatrix.needsUpdate = true;
    PREV.set(P);
  };
  // the dots follow the birds into the graph: size by handshake, a highlight grows them like the birds
  const syncDots = () => {
    for (let i = 0; i < N; i++) {
      const gi = GI[i]!;
      dotAlpha[i] = gi <= 0 ? 0 : clamp(gi * 1.6 - 0.25) * GV[i]!;
      dotSize[i] = GSZ[i]! * (0.6 + 0.4 * scl[i]!);
    }
    dotPosAttr.needsUpdate = true;
    dotColAttr.needsUpdate = true;
    dotAlphaAttr.needsUpdate = true;
    dotSizeAttr.needsUpdate = true;
  };
  const syncLinks = () => {
    for (let e = 0; e < gEdges.length; e++) {
      const i = gEdges[e]! * 3;
      linkArr[e * 3] = P[i]!;
      linkArr[e * 3 + 1] = P[i + 1]!;
      linkArr[e * 3 + 2] = P[i + 2]!;
    }
    linkAttr.needsUpdate = true;
  };

  // ---- scroll → page time (beat index + progress) → scene time (phase index + progress) ----
  let beatBounds: { top: number; height: number }[] = [];
  let layoutDirty = true;
  let mariaWidth = els.tags.maria.offsetWidth;
  const invalidateLayout = () => {
    layoutDirty = sceneDirty = true;
  };
  const canObserveLayout = typeof ResizeObserver !== 'undefined';
  const layoutObserver = canObserveLayout ? new ResizeObserver(invalidateLayout) : null;
  if (layoutObserver) {
    layoutObserver.observe(story);
    for (const beat of beats) layoutObserver.observe(beat);
  }
  // Recheck edge placement when the tag's text, font, or graph styling changes its width.
  const tagsObserver = canObserveLayout ? new ResizeObserver(() => {
    mariaWidth = els.tags.maria.offsetWidth;
    sceneDirty = true;
  }) : null;
  tagsObserver?.observe(els.tags.maria, { box: 'border-box' });
  const storyT = () => {
    const y = scrollY;
    if (layoutDirty) {
      beatBounds = beats.map((el) => {
        const { top, height } = el.getBoundingClientRect();
        return { top: top + y, height };
      });
      if (!tagsObserver) mariaWidth = els.tags.maria.offsetWidth;
      layoutDirty = false;
    }
    const mid = innerHeight * 0.5;
    let t = 0;
    beatBounds.forEach(({ top, height }, k) => {
      const dy = mid - (top - y);
      if (k === 0) t = clamp(dy / (height * 0.5) - 1, 0, 1);
      else if (dy >= 0) t = k + clamp(dy / height);
    });
    return t;
  };
  /**
   * A beat of n phases runs through n - 0.5 of them by its middle, where the page rests (the last phase fully
   * told), and through the second half of the last one after it; a beat of one phase maps one to one.
   */
  const sceneT = (d: number) => {
    const k = Math.min(Math.floor(d), beats.length - 1);
    const p = d - k;
    const n = phasesOf(k);
    const s = phaseStart[k]!;
    return p <= 0.5 ? s + p * (2 * n - 1) : s + n - 1 + p;
  };

  // ---- camera shots, one per beat ----
  const V = (i: number, o: THREE.Vector3) => o.set(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  let clock = 0;
  const shot = (k: number, o: Shot) => {
    const wide = innerWidth > 860;
    // the subject sits beside the words: to the right of them, or to the left in a right-to-left language
    const side = opts.rtl ? -1 : 1;
    const off = wide ? 0.2 * side : 0;
    const offY = wide ? 0 : 0.16;
    o.off = off;
    o.offY = offY;
    // the graph fills the width of a phone: the camera stands back by the screen's narrowness
    const narrow = Math.max(1, 0.9 / (innerWidth / innerHeight));
    switch (k) {
      case 0:
        o.t.set(14, 9, 0);
        o.d = 94;
        o.yaw = 0;
        o.pitch = 0.03;
        o.off = wide && opts.rtl ? -0.34 : 0;
        o.offY = wide ? 0 : -0.08;
        break;
      case 1:
        V(you, o.t);
        o.d = 14;
        o.yaw = 0.45;
        o.pitch = 0.12;
        break;
      case 2:
        // the page stops here for both the starling and the people (a glide passes the close-up of phase 1), so
        // the shot stays near enough for the bird's links and wide enough for the handshakes spreading round it
        V(you, o.t);
        o.d = 32;
        o.yaw = 0.22;
        o.pitch = 0.08;
        break;
      case 3:
        V(you, o.t);
        o.d = 20;
        o.yaw = -0.25;
        o.pitch = 0.1;
        break;
      case 4:
        V(maria, o.t);
        o.d = small ? 60 : 54;
        o.yaw = 0.12;
        o.pitch = 0.06;
        break;
      case 5:
        V(you, tmpA);
        V(maria, tmpB);
        o.t.copy(tmpA).add(tmpB).multiplyScalar(0.5);
        o.d = Math.max(20, tmpA.distanceTo(tmpB) * 2.6);
        o.yaw = 0.2;
        o.pitch = 0.08;
        break;
      case 6:
        V(maria, o.t);
        o.d = 44;
        o.yaw = -0.05;
        o.pitch = 0.06;
        break;
      case 7:
        V(maria, o.t);
        o.d = 32;
        o.yaw = -0.2;
        o.pitch = 0.1;
        break;
      case MORPH:
        // the flock gathers round you into the app's rings
        o.t.set(NET[you * 3]!, NET[you * 3 + 1]!, NET[you * 3 + 2]!);
        o.d = 46 * narrow;
        o.yaw = 0.1;
        o.pitch = 0.1;
        break;
      default:
        // the app's view: the camera sways slowly round the graph, never so far that the chain turns end-on
        o.t.set(NET[you * 3]!, NET[you * 3 + 1]!, NET[you * 3 + 2]!);
        o.d = 42 * narrow;
        o.yaw = 0.1 + (reduce ? 0 : 0.35 * Math.sin(clock * 0.08));
        o.pitch = 0.16;
    }
    return o;
  };
  const mk = (): Shot => ({ t: new THREE.Vector3(), d: 0, yaw: 0, pitch: 0, off: 0, offY: 0 });
  const SA = mk();
  const SB = mk();
  const CAM = mk();
  const CS = mk();
  let csInit = false;
  /** From "You" to "In the app" the graph turns round its own axis a few times as the page scrolls. */
  const SPIN_TURNS = 2;
  let spin = 0;
  /** The graph is still turning: the labels beside it wait, or they would jump from side to side. */
  let spinning = false;
  const frameCamera = (t: number, T: number, dt: number) => {
    const k = Math.floor(t);
    const p = t - k;
    if (k === 0) {
      shot(0, SA);
      SA.d -= p * 10;
      CAM.t.copy(SA.t);
      CAM.d = SA.d;
      CAM.yaw = SA.yaw;
      CAM.pitch = SA.pitch;
      CAM.off = SA.off;
      CAM.offY = SA.offY;
    } else {
      shot(k - 1, SA);
      shot(Math.min(k, LAST), SB);
      const e = easeIO(remap(p, 0, 0.42));
      CAM.t.lerpVectors(SA.t, SB.t, e);
      CAM.d = lerp(SA.d, SB.d, e);
      CAM.yaw = lerp(SA.yaw, SB.yaw, e);
      CAM.pitch = lerp(SA.pitch, SB.pitch, e);
      CAM.off = lerp(SA.off, SB.off, e);
      CAM.offY = lerp(SA.offY, SB.offY, e);
    }
    // a second, damped follow removes the kinks where one shot hands over to the next
    const a = csInit ? 1 - Math.exp(-dt * 3) : 1;
    // the turn follows the scroll with its own, slower pace, so it eases out after the page has stopped;
    // it is a separate angle, so the sky behind, which follows the yaw, does not run away
    const spinE = reduce ? 0 : easeIO(remap(t, MORPH + 0.5, LAST + 0.45));
    const spinT = spinE * SPIN_TURNS * Math.PI * 2;
    spin = csInit ? spin + (spinT - spin) * (1 - Math.exp(-dt * 1.6)) : spinT;
    spinning = Math.abs(spinT - spin) > 0.2 || (spinE > 0.005 && spinE < 0.995);
    csInit = true;
    CS.t.lerp(CAM.t, a);
    CS.d = lerp(CS.d, CAM.d, a);
    CS.yaw = lerp(CS.yaw, CAM.yaw, a);
    CS.pitch = lerp(CS.pitch, CAM.pitch, a);
    CS.off = lerp(CS.off, CAM.off, a);
    CS.offY = lerp(CS.offY, CAM.offY, a);
    const yaw = CS.yaw + spin + (reduce ? 0 : 0.02 * Math.sin(T * 0.2));
    const cp = Math.cos(CS.pitch);
    camera.position.set(CS.t.x + Math.sin(yaw) * CS.d * cp, CS.t.y + Math.sin(CS.pitch) * CS.d, CS.t.z + Math.cos(yaw) * CS.d * cp);
    camera.lookAt(CS.t);
    // the labels are placed before the render: they need this frame's camera, not the last one
    camera.updateMatrixWorld();
    const w = innerWidth;
    const h = innerHeight;
    camera.setViewOffset(w, h, -CS.off * w, CS.offY * h, w, h);
    fog.near = CS.d * 0.55;
    fog.far = CS.d * 2.6 + 40;
    camera.near = Math.max(0.1, CS.d * 0.5); // no birds between the camera and the subject
    camera.updateProjectionMatrix();
  };

  // chapter rail: shows where you are (in page time: one mark per beat)
  const rail = (d: number) => {
    const k = Math.floor(d + 0.02);
    els.rail.classList.toggle('on', k >= 1 && k <= beats.length - 1);
    els.railLinks.forEach((a, n) => {
      const b = n + 1;
      a.classList.toggle('on', b === k);
      a.classList.toggle('done', b < k);
      if (b === k) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
  };

  // ---- what each beat shows ----
  const hR = els.hudReached.querySelector('b');
  const hRep = els.hudReported.querySelector('b');
  const hP = els.hudPeople.querySelector('b');
  const hRL = els.hudReached.querySelector('span');
  const hPL = els.hudPeople.querySelector('span');
  let lastHud = '';
  const tmpC = new THREE.Color();
  const setT = (i: number, c: THREE.Color, s = 1) => {
    colT[i * 3] = c.r;
    colT[i * 3 + 1] = c.g;
    colT[i * 3 + 2] = c.b;
    scl[i] = lerp(scl[i]!, s, 0.15);
  };
  /** In the graph a colour is reached as the bird arrives: a dark bird on the sky, a light dot on the scene. */
  const setG = (i: number, c: THREE.Color, s = 1) => setT(i, tmpC.copy(C.base).lerp(c, GI[i]!), s);
  /**
   * Until the scene is ready every late word is shown. Words already on screen or above it when it arrives stay
   * shown until the reader goes back before their beat and the words have left the screen below, so nothing the
   * reader has seen vanishes (a sticky paragraph can be on screen while the scene time is still in the beat before).
   * The position is read only while a word is kept and the time is before its beat.
   */
  const keepLate = els.lates.map((el) => !!el && el.getBoundingClientRect().top < innerHeight);
  const showLates = (t: number) =>
    els.lates.forEach((el, j) => {
      if (!el) return;
      if (keepLate[j] && t < (phaseStart[j] ?? 0) && el.getBoundingClientRect().top >= innerHeight) keepLate[j] = false;
      el.classList.toggle('on', t > (lateAt[j] ?? Infinity) || !!keepLate[j]);
    });
  const beatState = (t: number): BeatOut => {
    const k = Math.floor(t);
    const p = t - k;
    showLates(t);
    const out: BeatOut = { thin: [], thick: [], path: null, halo: -1, ring: -1, T: {} };
    if (k >= MORPH) for (let i = 0; i < N; i++) setG(i, ringCol(i), 1);
    else for (let i = 0; i < N; i++) setT(i, C.base, 1);
    let reached = 0;
    let reported = 0;
    let people = 0;
    if (k === 1) {
      // one bird and its neighbours
      const e = remap(p, 0.06, 0.4);
      setT(you, C.you, 1.6);
      out.ring = you;
      adj[you]!.forEach((j, n) => {
        if (n < Math.round(e * adj[you]!.length)) {
          setT(j, C.n1, 1.35);
          out.thin.push([you, j]);
        }
      });
    }
    if (k === 2) {
      // handshakes spread from that bird
      const rd = remap(p, 0.04, 0.44) * 3.6;
      for (let i = 0; i < N; i++) {
        const d = fromYou.d[i]!;
        if (d >= 0 && d <= rd) setT(i, d === 0 ? C.you : d === 1 ? C.n1 : d === 2 ? C.n2 : C.n3, d === 0 ? 1.7 : d === 1 ? 1.45 : d === 2 ? 1.3 : 1.18);
      }
      out.ring = you;
      adj[you]!.forEach((j) => out.thin.push([you, j]));
    }
    if (k === 3) {
      // you and your circle
      setT(you, C.you, 1.6);
      out.ring = you;
      out.T.you = true;
      adj[you]!.forEach((j) => {
        setT(j, C.n1, 1.35);
        out.thin.push([you, j]);
      });
    }
    if (k === 4) {
      // Maria's Need travels nearest first
      const n = Math.round(ease(remap(p, 0.06, 0.44)) * reach.length);
      reached = n;
      for (let r = 0; r < n; r++) setT(reach[r]!, C.warm, 1.2);
      setT(maria, C.sos, 1.7);
      out.halo = maria;
      out.T.maria = true;
    }
    if (k === 5) {
      // the chain you → Oleg → Maria
      reached = reach.length;
      for (const i of reach) setT(i, C.dim, 1);
      setT(you, C.you, 1.7);
      setT(oleg, C.you, 1.5);
      setT(maria, C.sos, 1.7);
      out.thick = [
        [you, oleg],
        [oleg, maria],
      ];
      out.halo = maria;
      out.ring = you;
      out.T.you = out.T.oleg = out.T.maria = true;
    }
    if (k === 6) {
      // Participation adds up
      reached = reach.length;
      const e = remap(p, 0.06, 0.44);
      const n = Math.round(e * parts.length);
      for (const i of reach) setT(i, e > 0.05 ? C.dim : C.warm, 1);
      for (let r = 0; r < n; r++) {
        setT(parts[r]!, C.care, 1.45);
        reported += amt[r]!;
      }
      people = n;
      setT(maria, C.sos, 1.7);
      out.halo = maria;
      out.T.maria = true;
      out.T.you = true;
      out.ring = you;
    }
    if (k === 7) {
      // the participants' chat
      reached = reach.length;
      reported = shortfallTotal;
      people = parts.length;
      for (const i of reach) setT(i, C.dim, 1);
      parts.forEach((i) => {
        setT(i, C.care, 1.45);
        out.thin.push([i, maria]);
      });
      setT(maria, C.sos, 1.7);
      out.halo = maria;
      out.T.maria = true;
      out.T.lena = true;
    }
    if (k === MORPH) {
      // next time the Need may start from you: the flock becomes your rings, and the people you know hear first
      // the Need spreads once the rings have formed: your acquaintances, then theirs, one person per dollar
      const n = Math.round(ease(Math.min(spread, remap(p, 0.18, 0.5))) * reach.length);
      for (let r = 1; r < Math.min(n + 1, fromYou.q.length); r++) setG(fromYou.q[r]!, C.warm, 1.25);
      setT(you, C.sos, 1.8);
      out.halo = you;
      out.T.you = true;
    }
    if (k >= LAST) {
      // the app's view: your rings, and a Need on its way to you along the chain Maria → Oleg → you
      setG(maria, C.sos, 1.6);
      setG(oleg, C.care, 1.35);
      out.thin = ring1.map((j) => [you, j] as [number, number]);
      out.path = [maria, oleg, you];
      out.ring = maria;
      out.T.you = out.T.oleg = out.T.maria = true;
    }
    els.hud.classList.toggle('on', k >= 4 && k <= 7);
    els.hudReported.classList.toggle('off', k < 6);
    els.hudPeople.classList.toggle('off', k < 6);
    // the counters keep their last numbers while they fade out
    const hud = `${reached}|${reported}|${people}`;
    if (k >= 4 && k <= 7 && hud !== lastHud) {
      lastHud = hud;
      if (hR) hR.textContent = opts.format(reached);
      if (hRep) hRep.textContent = formatIsolatedMoney(reported);
      if (hP) hP.textContent = opts.format(people);
      if (hRL) hRL.textContent = opts.label('reached', reached);
      if (hPL) hPL.textContent = opts.label('people', people);
    }
    return out;
  };
  const v3 = new THREE.Vector3();
  /** Where Oleg's label was put this frame: Maria's goes to the side away from it. */
  let olegX = -1;
  const supportsTagTranslate = typeof CSS !== 'undefined' && CSS.supports?.('translate', '1px 1px');
  const tagPos = new Map<HTMLElement, string>();
  const tagAt = (el: HTMLElement, i: number, on: boolean | undefined) => {
    if (el === els.tags.oleg) olegX = -1;
    if (!on) {
      el.classList.remove('on');
      return;
    }
    v3.set(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!).project(camera);
    if (v3.z > 1) {
      el.classList.remove('on');
      return;
    }
    const x = clamp(((v3.x + 1) / 2) * innerWidth, 40, innerWidth - 40);
    const y = clamp(((1 - v3.y) / 2) * innerHeight, 90, innerHeight - 40);
    if (el === els.tags.oleg) olegX = x;
    if (el === els.tags.maria) {
      // her label sits beside the dot: in the graph on the side away from Oleg's, and wherever it would leave
      // the screen, on the other side (the story's pill is on the right; the graph's label starts on the left in
      // a right-to-left page)
      const w = mariaWidth + 20;
      const startLeft = opts.rtl && graphOn;
      let left = graphOn && olegX >= 0 ? x < olegX : startLeft;
      if (left && x - w < 8) left = false;
      else if (!left && x + w > innerWidth - 8) left = true;
      el.classList.toggle('flip', left !== startLeft);
    }
    const pos = `${x}px ${y}px`;
    if (tagPos.get(el) !== pos) {
      tagPos.set(el, pos);
      // Individual translate composes with the label's CSS anchor transform.
      if (supportsTagTranslate) el.style.translate = `${pos} 0px`;
      else {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    }
    el.classList.add('on');
  };
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    thinMat.resolution.set(innerWidth, innerHeight);
    thickMat.resolution.set(innerWidth, innerHeight);
    // a dot of size s at distance z is s * uScale / z device pixels tall
    const pr = renderer.getPixelRatio();
    dotMat.uniforms.uScale!.value = (innerHeight * pr * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    dotMat.uniforms.uMax!.value = 12 * pr;
    dotMat.uniforms.uMin!.value = 1.6 * pr;
    invalidateLayout();
  };
  const onContextRestored = () => { sceneDirty = true; };
  resize();
  // Apply a burst of resize events once, just before drawing the next frame.
  let resizePending = false;
  const onResize = () => { resizePending = true; };
  let layoutSettle = 0;
  const onScroll = () => {
    clearTimeout(layoutSettle);
    layoutSettle = window.setTimeout(invalidateLayout, 150);
  };
  addEventListener('resize', onResize);
  if (!layoutObserver) addEventListener('scroll', onScroll, { passive: true });
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    const e = entries[0];
    if (!e) return;
    visible = e.isIntersecting;
    if (visible) sceneDirty = true;
    els.root.classList.toggle('past', !e.isIntersecting && e.boundingClientRect.top < 0);
  });
  io.observe(story);

  /** Page time, eased towards the scroll; the scene's time follows from it. */
  let tD = storyT();
  let tS = sceneT(tD);
  let gS = 0;
  /** How far the Need of the morph beat has spread, 0 to 1; it starts when the rings are nearly formed. */
  let spread = 0;
  let last = performance.now();
  let lastBg = '';
  let graphOn = false;
  const fogNight = new THREE.Color();
  const tmpP = new THREE.Vector3();

  // The scene never pops in: on the opening screen the flock flies in; anywhere else (a link to a later section,
  // a fast scroll, a slow network) or with reduced motion, the scene only fades in, and so do the evening and the
  // app's scene over the photograph. The sky eases into the camera's framing instead of jumping to it.
  const flyIn = !reduce && intro.flyIn !== false && tD < 0.3;
  const FADE = flyIn ? 0.5 : reduce ? 0.3 : 0.6;
  const SETTLE = flyIn ? 1.8 : FADE;
  let introT = 0;
  let introDone = false;
  canvas.style.opacity = '0';
  /** Page time when the arrival began, and the furthest the reader has scrolled from it since. */
  let arrFrom = tD;
  let arrGone = 0;
  if (flyIn) {
    frameCamera(tS, 0, 0); // the opening shot as the first frame shows it
    let s = 23; // a sequence of its own: the birds' places must not change
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const h = new THREE.Vector3();
    const ray = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      h.set(RIB[ix]!, RIB[ix + 1]!, RIB[ix + 2]!);
      const far = h.distanceTo(camera.position) * (1.3 + 0.45 * r());
      h.project(camera);
      // the start: just beyond the left edge of the frame, higher up, and further away, so the birds come out
      // of the haze; a loose cloud that tightens into the ribbon as it arrives
      ray.set(-1.1 - 0.35 * r(), lerp(h.y, 0.35, 0.5) + (r() - 0.5) * 0.6, 0.5).unproject(camera).sub(camera.position).normalize();
      AOFF[ix] = camera.position.x + ray.x * far - RIB[ix]!;
      AOFF[ix + 1] = camera.position.y + ray.y * far - RIB[ix + 1]!;
      AOFF[ix + 2] = camera.position.z + ray.z * far - RIB[ix + 2]!;
      ADEL[i] = 0.3 * (1 - U[i]!) + 0.12 * r();
      AFLY[i] = 1.2 + 0.45 * r();
      ALIFT[i] = (r() - 0.4) * 14;
      arrEnd = Math.max(arrEnd, ADEL[i]! + AFLY[i]!);
    }
    arrK = 1;
  }
  /** The first drawn frame has no previous one: the birds start without a turn. */
  let primed = false;

  const tick = (dt: number, target: number) => {
    clock += reduce ? 0 : dt;
    uTime.value = clock;
    tD += (target - tD) * (reduce ? 1 : Math.min(1, dt * 4));
    tS = sceneT(tD);
    if (arrK > 0) {
      // the arrival dies away in time, and sooner as the reader scrolls on: half the opening beat ends it
      arrT += dt;
      arrGone = Math.max(arrGone, tD - arrFrom);
      arrK = arrT >= arrEnd ? 0 : 1 - ease(clamp(arrGone / 0.5));
    }
    introT += dt;
    const fade = ease(clamp(introT / FADE));
    const settle = ease(clamp(introT / SETTLE));
    if (!introDone) {
      canvas.style.opacity = fade < 1 ? fade.toFixed(3) : '';
      introDone = fade >= 1 && settle >= 1;
    }
    // the graph has its own, slower pace: the flock takes a moment to gather however fast the page moves
    const gTarget = clamp((tS - MORPH) / 0.3);
    gS += (gTarget - gS) * (reduce ? 1 : Math.min(1, dt * 1.1));
    if (Math.abs(gTarget - gS) < 1e-3) gS = gTarget;
    spread = reduce ? 1 : clamp(spread + (Math.floor(tS) === MORPH && gS > 0.8 ? dt / 1.8 : -dt / 0.6));
    const morph = clamp((tS - 0.15) / 1.15);
    const calm = clamp(tS - 1);
    place(clock + 20, morph, calm, gS);
    const st = beatState(tS);
    for (let i = 0; i < N * 3; i++) col[i]! += (colT[i]! - col[i]!) * 0.14;
    const allDots = gS >= 1;
    birds.visible = !allDots;
    if (!primed) {
      PREV.set(P);
      primed = true;
    }
    frameCamera(tS, clock, dt);
    if (!allDots) {
      if (birds.instanceColor) birds.instanceColor.needsUpdate = true;
      const closeBirdCap = innerWidth <= 600 ? 1 - ease(remap(tS, 3.5, 4)) : 0;
      syncBirds(morph, closeBirdCap);
    } else PREV.set(P);
    dots.visible = gS > 0;
    links.visible = gS > 0.4;
    if (dots.visible) syncDots();
    if (links.visible) {
      syncLinks();
      linkMat.opacity = 0.14 * ease(remap(gS, 0.4, 1));
    }
    rail(tD);
    const k = Math.floor(tS);
    setLines(thin, st.thin, P);
    if (st.path) setCurve(st.path);
    else setLines(thick2, st.thick, P);
    const graphView = k >= LAST;
    thinMat.color.set(k === 7 || graphView ? 0x5fd3c6 : 0xd9efea);
    thinMat.opacity = k === 7 ? 0.4 : graphView ? 0.55 : 0.7;
    thickMat.color.set(graphView ? 0x5fd3c6 : 0xffffff);
    thickMat.linewidth = graphView ? 2.2 : 3;
    halo.visible = st.halo >= 0;
    if (halo.visible) {
      V(st.halo, halo.position);
      halo.scale.setScalar(CS.d * 0.07);
    }
    ringS.visible = st.ring >= 0;
    if (ringS.visible) {
      V(st.ring, ringS.position);
      // in the app the person with the Need keeps a breathing ring
      const breathe = graphView && !reduce ? 1 + 0.18 * Math.sin(clock * 3) : 1;
      ringS.scale.setScalar(CS.d * (graphView ? 0.022 : 0.045) * breathe);
      ringMat.color.set(graphView ? 0xff6a5c : 0xffffff);
    }
    // you become the app's tile: the logo on care
    const tileA = ease(remap(gS, 0.45, 0.9));
    tile.visible = tileGlow.visible = tileA > 0;
    if (tile.visible) {
      V(you, tile.position);
      tileGlow.position.copy(tile.position);
      tile.scale.setScalar(CS.d * 0.032 * (0.6 + 0.4 * tileA));
      tileGlow.scale.setScalar(CS.d * 0.075);
      tileMat.opacity = tileA;
      careMat.opacity = 0.55 * tileA;
    }
    // pulses travel along the Need's way to you
    pulses.forEach((s, n) => {
      s.visible = !!st.path && curvePts > 1 && !reduce;
      if (!s.visible) return;
      along((clock * 0.3 + n / pulses.length) % 1, s.position);
      s.scale.setScalar(CS.d * 0.03);
    });
    tagAt(els.tags.you, you, st.T.you);
    tagAt(els.tags.oleg, oleg, st.T.oleg && !spinning);
    tagAt(els.tags.maria, maria, st.T.maria && !spinning);
    tagAt(els.tags.lena, lena, st.T.lena);
    const nowGraph = gS > 0.55;
    if (nowGraph !== graphOn) {
      graphOn = nowGraph;
      els.root.classList.toggle('graph', graphOn);
      // The graph changes the label styling. Refresh its width for the next placement.
      if (!tagsObserver) mariaWidth = els.tags.maria.offsetWidth;
    }
    // the evening darkens as the story goes on; then the app's scene takes over, its wash centred on you
    const nt = clamp((tS - 2.6) / 5);
    nightEl.style.opacity = (nt * 0.62 * fade).toFixed(3);
    const bgA = ease(gS);
    if (bgA > 0) {
      V(you, tmpP).project(camera);
      const bg = `${(bgA * fade).toFixed(3)}|${Math.round(((tmpP.x + 1) / 2) * innerWidth)}|${Math.round(((1 - tmpP.y) / 2) * innerHeight)}`;
      if (bg !== lastBg) {
        lastBg = bg;
        const [a, gx, gy] = bg.split('|');
        graphBg.style.opacity = a!;
        graphBg.style.setProperty('--gx', `${gx}px`);
        graphBg.style.setProperty('--gy', `${gy}px`);
      }
    } else if (lastBg) {
      lastBg = '';
      graphBg.style.opacity = '0';
    }
    // the sky follows the camera: it slides against the yaw and the side offset, sinks as the camera rises,
    // and closes in on close shots
    if (bgA < 1) {
      const close = clamp((94 - CS.d) / 80);
      // (before the scene the photograph is unmoved: it eases from there into the framing)
      skyEl.style.transform = `translate3d(${((-CS.yaw * 9 + CS.off * 5) * settle).toFixed(2)}%, ${((clamp(tS / 3) * 5 + CS.pitch * 18) * settle).toFixed(2)}%, 0) scale(${(1 + (0.04 + close * 0.14) * settle).toFixed(3)})`;
    }
    fogNight.setRGB(lerp(0.42, 0.07, nt), lerp(0.5, 0.14, nt), lerp(0.53, 0.13, nt));
    fog.color.copy(fogNight).lerp(C.scene, bgA);
    renderer.render(scene, camera);
  };

  let raf = 0;
  let stillTime = 0;
  let stillFrames = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (resizePending) {
      resizePending = false;
      resize();
    }
    // the first frame's timestamp can precede the end of the setup above: no negative step
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    const target = storyT();
    if (reduce) {
      if (!introDone || sceneDirty || target !== tD) {
        stillTime = stillFrames = 0;
      } else {
        // The camera damps by elapsed time, colours and sizes by frame count.
        if (stillTime >= 4 && stillFrames >= 60) return;
        stillTime += dt;
        stillFrames++;
      }
    }
    sceneDirty = false;
    tick(dt, target);
  };
  raf = requestAnimationFrame(frame);
  // the late words take their state now, before the page marks the scene ready, not a frame later
  showLates(tS);

  if (import.meta.env.DEV) {
    (window as unknown as { __lvScene?: unknown }).__lvScene = {
      /** Draws n frames at page time d; returns the scene time. */
      draw: (d: number, n = 40) => {
        for (let i = 0; i < n; i++) tick(1 / 60, d);
        return tS;
      },
      /** Plays the scene's entrance again from where the page is (the fly-in only if the page opened with it). */
      replay: () => {
        introT = 0;
        introDone = false;
        if (flyIn) {
          arrT = 0;
          arrGone = 0;
          arrFrom = tD;
          arrK = 1;
        }
      },
      state: () => {
        const d = storyT();
        const t = sceneT(d);
        return { y: Math.round(scrollY), page: +d.toFixed(3), beat: Math.floor(t), p: +(t % 1).toFixed(3), g: +gS.toFixed(3), spin: +spin.toFixed(2), spinning, flyIn, arrival: +arrK.toFixed(3), arrT: +arrT.toFixed(2) };
      },
      cast: {
        you,
        maria,
        oleg,
        lena,
        reach: reach.length,
        parts: parts.length,
        rings: [1, 2, 3, 4, 5, 6].map((d) => fromYou.q.filter((i) => dep[i] === d).length),
        links: gEdges.length / 2,
        shortfall: shortfallTotal,
      },
    };
  }

  return {
    update(next) {
      // a new language: numbers are written again; a new direction moves the subject to the other side (the
      // damped camera follow glides there); a new currency gives the participants new sums
      if (next.money.shortfall !== opts.money.shortfall || next.money.mine !== opts.money.mine) setMoney(next.money);
      opts = next;
      lastHud = '';
      invalidateLayout();
    },
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (!layoutObserver) {
        removeEventListener('scroll', onScroll);
        clearTimeout(layoutSettle);
      }
      layoutObserver?.disconnect();
      tagsObserver?.disconnect();
      io.disconnect();
      logo.onload = null;
      els.root.classList.remove('past', 'graph');
      canvas.style.opacity = '';
      geo.dispose();
      mat.dispose();
      glowTex.dispose();
      careTex.dispose();
      ringTex.dispose();
      tileTex.dispose();
      haloMat.dispose();
      ringMat.dispose();
      tileMat.dispose();
      careMat.dispose();
      dotGeo.dispose();
      dotMat.dispose();
      linkGeo.dispose();
      linkMat.dispose();
      thinGeo.dispose();
      thickGeo.dispose();
      thinMat.dispose();
      thickMat.dispose();
      birds.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (import.meta.env.DEV) delete (window as unknown as { __lvScene?: unknown }).__lvScene;
    },
  };
}
