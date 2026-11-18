/**
 * The story scene of the landing: instanced starlings over a photographed sky; the scroll position drives the
 * camera and the story. Ported from the concept prototype (local/media/concept-6, v9) with its numbers unchanged.
 *
 * Two formations: the ribbon of the opening shot and the cloud in which the story is told. The cloud has fixed
 * neighbours (7 nearest, made mutual); Maria's Need spreads by breadth-first search, nearest first.
 * Loaded with a dynamic import, so Three.js stays out of the app bundle.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export interface SceneElements {
  /** The landing root; gets `past` once the story has scrolled away. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  sky: HTMLElement;
  night: HTMLElement;
  story: HTMLElement;
  beats: HTMLElement[];
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
}

export interface SceneHandle {
  update(options: SceneOptions): void;
  destroy(): void;
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
  halo: number;
  ring: number;
  T: { you?: boolean; oleg?: boolean; maria?: boolean; lena?: boolean };
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const remap = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function initScene(els: SceneElements, initial: SceneOptions): SceneHandle {
  let opts = initial;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 760;
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
  const N = small ? 2000 : lowEnd ? 4000 : 6500;
  const { canvas, sky: skyEl, night: nightEl, beats, story } = els;

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
    for (let i = 0; i < N; i++) {
      const gx = Math.floor(NET[i * 3]! / CELL);
      const gy = Math.floor(NET[i * 3 + 1]! / CELL);
      const gz = Math.floor(NET[i * 3 + 2]! / CELL);
      const cand: [number, number][] = [];
      for (let a = -2; a <= 2; a++)
        for (let b = -2; b <= 2; b++)
          for (let c = -2; c <= 2; c++)
            for (let j = head[hh(gx + a, gy + b, gz + c)]!; j !== -1; j = nxt[j]!)
              if (j !== i)
                cand.push([
                  (NET[j * 3]! - NET[i * 3]!) ** 2 + (NET[j * 3 + 1]! - NET[i * 3 + 1]!) ** 2 + (NET[j * 3 + 2]! - NET[i * 3 + 2]!) ** 2,
                  j,
                ]);
      cand.sort((p, q) => p[0] - q[0]);
      res[i] = [];
      const seen = new Set<number>();
      for (const [, j] of cand) {
        if (!seen.has(j)) {
          seen.add(j);
          res[i]!.push(j);
        }
        if (res[i]!.length === k) break;
      }
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
  const reach = fromMaria.q.slice(1, 301); // up to 300 people, nearest first

  const parts = [you, oleg];
  for (const i of reach) if (parts.length < 44 && i !== you && i !== oleg && rnd() < 0.2) parts.push(i);
  let lena = parts[2]!;
  for (const i of parts.slice(2))
    if (fromMaria.d[i] === 1) {
      lena = i;
      break;
    }
  const menu = [1, 2, 3, 5, 5, 5, 10, 10, 10, 15, 20];
  const amt = parts.map((_, i) => (i === 0 ? 5 : menu[(rnd() * menu.length) | 0]!));
  {
    let sum = amt.reduce((a, b) => a + b, 0);
    let i = 1;
    while (sum !== 300) {
      const d = Math.sign(300 - sum);
      if (amt[i]! + d >= 1) {
        amt[i] = amt[i]! + d;
        sum += d;
      }
      i = 1 + (i % (amt.length - 1));
    }
  }

  // ---- rendering ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
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
  const glowTex = spriteTex((x) => {
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,106,92,1)');
    gr.addColorStop(0.25, 'rgba(255,106,92,.5)');
    gr.addColorStop(1, 'rgba(255,106,92,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
  });
  const ringTex = spriteTex((x) => {
    x.strokeStyle = 'rgba(255,255,255,.95)';
    x.lineWidth = 5;
    x.beginPath();
    x.arc(64, 64, 50, 0, 6.283);
    x.stroke();
  });
  const haloMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const ringMat = new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, fog: false });
  const halo = new THREE.Sprite(haloMat);
  const ringS = new THREE.Sprite(ringMat);
  scene.add(halo, ringS);

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

  // ---- motion: the shape breathes and drifts; every bird flaps and bobs; neighbours stay neighbours ----
  const P = new Float32Array(N * 3);
  const PREV = new Float32Array(N * 3);
  const DIR = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) DIR[i * 3] = 1;
  const place = (T: number, morph: number, calm: number) => {
    const ampH = 1.8;
    const ampN = lerp(1.6, 0.7, calm);
    const drift = 3 * Math.sin(T * 0.045);
    const bob = reduce ? 0 : 0.14;
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const ph = PH[i]!;
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
      P[ix] = lerp(hx, nx, s);
      P[ix + 1] = lerp(hy, ny, s) + lift;
      P[ix + 2] = lerp(hz, nz, s);
    }
  };
  const M4 = new THREE.Matrix4();
  const QT = new THREE.Quaternion();
  const SC = new THREE.Vector3();
  const PO = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const D = new THREE.Vector3();
  const syncBirds = (morph: number) => {
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
      const sc = 0.58 * scl[i]! * lerp(1.45, 1, s);
      SC.set(sc, sc, sc);
      PO.set(P[ix]!, P[ix + 1]!, P[ix + 2]!);
      M4.compose(PO, QT, SC);
      birds.setMatrixAt(i, M4);
    }
    birds.instanceMatrix.needsUpdate = true;
    PREV.set(P);
  };

  // ---- scroll → story time t (beat index + progress) ----
  const storyT = () => {
    const mid = innerHeight * 0.5;
    let t = 0;
    beats.forEach((el, k) => {
      const r = el.getBoundingClientRect();
      if (k === 0) t = clamp((mid - r.top) / (r.height * 0.5) - 1, 0, 1);
      else if (r.top <= mid) t = k + clamp((mid - r.top) / r.height);
    });
    return t;
  };

  // ---- camera shots, one per beat ----
  const V = (i: number, o: THREE.Vector3) => o.set(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const shot = (k: number, o: Shot) => {
    const wide = innerWidth > 860;
    // the subject sits beside the words: to the right of them, or to the left in a right-to-left language
    const side = opts.rtl ? -1 : 1;
    const off = wide ? 0.2 * side : 0;
    const offY = wide ? 0 : 0.16;
    o.off = off;
    o.offY = offY;
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
        V(you, o.t);
        o.d = 44;
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
      default:
        V(you, o.t);
        o.d = 66;
        o.yaw = 0.1;
        o.pitch = 0.05;
    }
    return o;
  };
  const mk = (): Shot => ({ t: new THREE.Vector3(), d: 0, yaw: 0, pitch: 0, off: 0, offY: 0 });
  const SA = mk();
  const SB = mk();
  const CAM = mk();
  const CS = mk();
  let csInit = false;
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
      shot(Math.min(k, 8), SB);
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
    csInit = true;
    CS.t.lerp(CAM.t, a);
    CS.d = lerp(CS.d, CAM.d, a);
    CS.yaw = lerp(CS.yaw, CAM.yaw, a);
    CS.pitch = lerp(CS.pitch, CAM.pitch, a);
    CS.off = lerp(CS.off, CAM.off, a);
    CS.offY = lerp(CS.offY, CAM.offY, a);
    const yaw = CS.yaw + (reduce ? 0 : 0.02 * Math.sin(T * 0.2));
    const cp = Math.cos(CS.pitch);
    camera.position.set(CS.t.x + Math.sin(yaw) * CS.d * cp, CS.t.y + Math.sin(CS.pitch) * CS.d, CS.t.z + Math.cos(yaw) * CS.d * cp);
    camera.lookAt(CS.t);
    const w = innerWidth;
    const h = innerHeight;
    camera.setViewOffset(w, h, -CS.off * w, CS.offY * h, w, h);
    fog.near = CS.d * 0.55;
    fog.far = CS.d * 2.6 + 40;
    camera.near = Math.max(0.1, CS.d * 0.5); // no birds between the camera and the subject
    camera.updateProjectionMatrix();
  };

  // chapter rail: shows where you are
  const rail = (t: number) => {
    const k = Math.floor(t + 0.02);
    els.rail.classList.toggle('on', k >= 1 && k <= 8);
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
  const setT = (i: number, c: THREE.Color, s = 1) => {
    colT[i * 3] = c.r;
    colT[i * 3 + 1] = c.g;
    colT[i * 3 + 2] = c.b;
    scl[i] = lerp(scl[i]!, s, 0.15);
  };
  const beatState = (t: number): BeatOut => {
    const k = Math.floor(t);
    const p = t - k;
    els.lates.forEach((el, j) => {
      if (el) el.classList.toggle('on', j < k || (j === k && p > 0.2));
    });
    for (let i = 0; i < N; i++) setT(i, C.base, 1);
    const out: BeatOut = { thin: [], thick: [], halo: -1, ring: -1, T: {} };
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
      reported = 300;
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
    if (k >= 8) {
      // next time the Need may start from you
      const n = Math.round(ease(remap(p, 0.06, 0.46)) * 600);
      for (let r = 1; r < Math.min(n, fromYou.q.length); r++) setT(fromYou.q[r]!, C.warm, 1.15);
      setT(you, C.sos, 1.8);
      out.halo = you;
      out.T.you = true;
    }
    els.hud.classList.toggle('on', k >= 4 && k <= 7);
    els.hudReported.classList.toggle('off', k < 6);
    els.hudPeople.classList.toggle('off', k < 6);
    const hud = `${reached}|${reported}|${people}`;
    if (hud !== lastHud) {
      lastHud = hud;
      if (hR) hR.textContent = opts.format(reached);
      if (hRep) hRep.textContent = opts.format(reported);
      if (hP) hP.textContent = opts.format(people);
      if (hRL) hRL.textContent = opts.label('reached', reached);
      if (hPL) hPL.textContent = opts.label('people', people);
    }
    return out;
  };
  const v3 = new THREE.Vector3();
  const tagAt = (el: HTMLElement, i: number, on: boolean | undefined) => {
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
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.add('on');
  };
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    thinMat.resolution.set(innerWidth, innerHeight);
    thickMat.resolution.set(innerWidth, innerHeight);
  };
  resize();
  addEventListener('resize', resize);

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    const e = entries[0];
    if (!e) return;
    visible = e.isIntersecting;
    els.root.classList.toggle('past', !e.isIntersecting && e.boundingClientRect.top < 0);
  });
  io.observe(story);

  let tS = storyT();
  let clock = 0;
  let last = performance.now();
  const tick = (dt: number, target: number) => {
    clock += reduce ? 0 : dt;
    uTime.value = clock;
    tS += (target - tS) * (reduce ? 1 : Math.min(1, dt * 4));
    const morph = clamp((tS - 0.15) / 1.15);
    const calm = clamp(tS - 1);
    place(clock + 20, morph, calm);
    const st = beatState(tS);
    for (let i = 0; i < N * 3; i++) col[i]! += (colT[i]! - col[i]!) * 0.14;
    if (birds.instanceColor) birds.instanceColor.needsUpdate = true;
    syncBirds(morph);
    frameCamera(tS, clock, dt);
    rail(tS);
    setLines(thin, st.thin, P);
    setLines(thick2, st.thick, P);
    thinMat.color.set(Math.floor(tS) === 7 ? 0x5fd3c6 : 0xd9efea);
    thinMat.opacity = Math.floor(tS) === 7 ? 0.4 : 0.7;
    halo.visible = st.halo >= 0;
    if (halo.visible) {
      V(st.halo, halo.position);
      halo.scale.setScalar(CS.d * 0.07);
    }
    ringS.visible = st.ring >= 0;
    if (ringS.visible) {
      V(st.ring, ringS.position);
      ringS.scale.setScalar(CS.d * 0.045);
    }
    tagAt(els.tags.you, you, st.T.you);
    tagAt(els.tags.oleg, oleg, st.T.oleg);
    tagAt(els.tags.maria, maria, st.T.maria);
    tagAt(els.tags.lena, lena, st.T.lena);
    // the evening darkens as the story goes on
    const nt = clamp((tS - 2.6) / 5);
    nightEl.style.opacity = (nt * 0.62).toFixed(3);
    // the sky follows the camera: it slides against the yaw and the side offset, sinks as the camera rises,
    // and closes in on close shots
    const close = clamp((94 - CS.d) / 80);
    skyEl.style.transform = `translate3d(${(-CS.yaw * 9 + CS.off * 5).toFixed(2)}%, ${(clamp(tS / 3) * 5 + CS.pitch * 18).toFixed(2)}%, 0) scale(${(1.04 + close * 0.14).toFixed(3)})`;
    fog.color.setRGB(lerp(0.42, 0.07, nt), lerp(0.5, 0.14, nt), lerp(0.53, 0.13, nt));
    renderer.render(scene, camera);
  };

  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    tick(dt, storyT());
  };
  raf = requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    (window as unknown as { __lvScene?: unknown }).__lvScene = {
      draw: (t: number, n = 40) => {
        for (let i = 0; i < n; i++) tick(1 / 60, t);
        return tS;
      },
      state: () => {
        const t = storyT();
        return { y: Math.round(scrollY), beat: Math.floor(t), p: +(t % 1).toFixed(3) };
      },
      cast: { you, maria, oleg, lena, reach: reach.length, parts: parts.length },
    };
  }

  return {
    update(next) {
      // a new language: numbers are written again; a new direction moves the subject to the other side (the
      // damped camera follow glides there)
      opts = next;
      lastHud = '';
    },
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      io.disconnect();
      els.root.classList.remove('past');
      geo.dispose();
      mat.dispose();
      glowTex.dispose();
      ringTex.dispose();
      haloMat.dispose();
      ringMat.dispose();
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
