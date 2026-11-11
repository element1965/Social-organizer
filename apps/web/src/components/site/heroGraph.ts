/*
 * Landing hero backdrop: a small 3D network drawn with Canvas 2D and a hand-rolled perspective projection.
 * No WebGL, no three.js: the site stays light. It copies the look of the Circle scene in the app
 * (packages/graph-3d): a ball of people on depth shells around you, thin links, care-coloured paths with a comet,
 * on the dark scene. The data is fake (about 90 people) and the story plays in a loop:
 * a Need lights up on the far shell, a comet carries it by handshakes to you, a wave tells your circle,
 * shares come back from all over the ball until the ring around the asker is full.
 *
 * Cheap by design: per frame it is a few hundred arcs and three stroked paths; the glow and the stars are
 * pre-rendered; the pixel ratio is capped and drops to 1 if frames are slow; nothing runs while the hero is off
 * screen or the tab is hidden. Drag rotates the ball (vertical swipes still scroll the page); a mouse tilts it a
 * little. Under prefers-reduced-motion it is one still frame that only redraws while dragged.
 */

export interface HeroGraphLabels {
  you: string;
  /** Pill over the asker while the request travels. */
  ask: string;
  /** Pill once the ring is full. */
  done: string;
}

export interface HeroGraphHandle {
  destroy: () => void;
}

const TAU = Math.PI * 2;
/** Depth shells: count, radius (ball radius = 1), dot radius in px at the reference scale. */
const SHELLS = [
  { n: 7, r: 0.38, size: 4.6 },
  { n: 24, r: 0.7, size: 3.4 },
  { n: 58, r: 1, size: 2.5 },
] as const;
const CROSS_LINKS = 16;
const DUST = 200;
const STARS = 90;
/** Camera distance in ball radii: lower = stronger perspective. */
const CAM = 3.2;
const AUTO_YAW = 0.11; // rad/s, about a turn a minute
const PITCH = 0.3;
const AUTO_RESUME_MS = 2500;
const HELPERS = 6;
const BOB = 0.012;
const PATH_CURVE = 0.12;

/** One story loop, seconds. */
const T = 11;
const PH = { ask: [0, 1], signal: [1, 3.6], wave: [3.6, 5], help: [5, 8.8], done: [8.8, 11] } as const;
/** Moment shown under reduced motion: the Need has reached you, the path is lit. */
const STILL_T = 3.45;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

function tokenRgb(el: Element, name: string): [number, number, number] {
  const raw = getComputedStyle(el).getPropertyValue(`--so-${name}`).trim();
  const p = raw.split(/[\s,]+/).filter(Boolean).map(Number);
  return p.length >= 3 ? [p[0]!, p[1]!, p[2]!] : [0, 0, 0];
}
const rgba = (c: [number, number, number], a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** Soft round glow, drawn once and blitted. */
function glowSprite(c: [number, number, number], size = 64): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, rgba(c, 0.9));
  gr.addColorStop(0.35, rgba(c, 0.35));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return s;
}

export function heroGraph(canvas: HTMLCanvasElement, getLabels: () => HeroGraphLabels, reduce: boolean): HeroGraphHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy() {} };
  const host = canvas.parentElement ?? canvas;

  const C = {
    n1: tokenRgb(canvas, 'node-1'),
    n2: tokenRgb(canvas, 'node-2'),
    n3: tokenRgb(canvas, 'node-3'),
    care: tokenRgb(canvas, 'care-scene'),
    bright: tokenRgb(canvas, 'care-bright'),
    warm: tokenRgb(canvas, 'warm'),
    scene: tokenRgb(canvas, 'scene'),
    scene2: tokenRgb(canvas, 'scene-2'),
    scene3: tokenRgb(canvas, 'scene-3'),
  };
  const S = {
    n: [rgba(C.n1), rgba(C.n2), rgba(C.n3)],
    n1: rgba(C.n1),
    care: rgba(C.care),
    careHalo: rgba(C.care, 0.55),
    bright: rgba(C.bright),
    warm: rgba(C.warm),
    warmHalo: rgba(C.warm, 0.6),
    line: rgba(C.n1, 0.2),
    dust: rgba(C.n1, 0.5),
    pillAsk: rgba(C.n1, 0.14),
  };
  const glowCare = glowSprite(C.care);
  const glowWarm = glowSprite(C.warm);

  /* ---------- fake network ---------- */
  let seed = 7;
  const R = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const bx: number[] = [0];
  const by: number[] = [0];
  const bz: number[] = [0];
  const depth: number[] = [0];
  const size: number[] = [0];
  const phase: number[] = [0];
  const parent: number[] = [-1];
  const shellOf: number[][] = [[0]];
  SHELLS.forEach((sh, k) => {
    const ids: number[] = [];
    const off = R() * TAU;
    for (let i = 0; i < sh.n; i++) {
      // Fibonacci sphere with jitter: even cover, no grid look.
      const y = 1 - (2 * (i + 0.5)) / sh.n + (R() - 0.5) * (0.6 / sh.n);
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996 + off + (R() - 0.5) * 0.4;
      const r = sh.r * (1 + (R() - 0.5) * 0.16);
      bx.push(Math.cos(a) * rr * r);
      by.push(y * r * 0.92);
      bz.push(Math.sin(a) * rr * r);
      depth.push(k + 1);
      size.push(sh.size * (0.85 + R() * 0.35));
      phase.push(R() * TAU);
      parent.push(-1);
      ids.push(bx.length - 1);
    }
    shellOf.push(ids);
  });
  const N = bx.length;
  const dist2 = (a: number, b: number) => (bx[a]! - bx[b]!) ** 2 + (by[a]! - by[b]!) ** 2 + (bz[a]! - bz[b]!) ** 2;
  const nearestIn = (i: number, pool: number[], skip = -1) => {
    let best = pool[0]!;
    let bd = Infinity;
    for (const j of pool) {
      if (j === skip) continue;
      const d = dist2(i, j);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  };
  // Links: each person to the nearest one a shell closer (the handshake tree), plus a few cross links.
  const ea: number[] = [];
  const eb: number[] = [];
  for (let i = 1; i < N; i++) {
    parent[i] = nearestIn(i, shellOf[depth[i]! - 1]!);
    ea.push(i);
    eb.push(parent[i]!);
  }
  for (let c = 0; c < CROSS_LINKS; c++) {
    const i = 1 + Math.floor(R() * (N - 1));
    const pool = shellOf[depth[i]!]!;
    const j = nearestIn(i, pool, i);
    if (j !== i && parent[j] !== i && parent[i] !== j) {
      ea.push(i);
      eb.push(j);
    }
  }
  const E = ea.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const dz: number[] = [];
  for (let i = 0; i < DUST; i++) {
    const u = R() * 2 - 1;
    const a = R() * TAU;
    const r = 1.12 + R() * 0.45;
    const rr = Math.sqrt(1 - u * u);
    dx.push(Math.cos(a) * rr * r);
    dy.push(u * r * 0.9);
    dz.push(Math.sin(a) * rr * r);
  }
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < STARS; i++) stars.push({ x: R(), y: R(), r: R() * 0.9 + 0.3, o: R() * 0.45 + 0.12 });

  /* ---------- per-frame buffers ---------- */
  const wx = new Float32Array(N);
  const wy = new Float32Array(N);
  const wz = new Float32Array(N);
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const sz = new Float32Array(N);
  const sk = new Float32Array(N); // perspective factor relative to z = 0
  const order = Array.from({ length: N }, (_v, i) => i);
  const bucket = new Uint8Array(E);

  /* ---------- layout (CSS owns it: see .site-hero in site.css) ---------- */
  let W = 1;
  let H = 1;
  let cx = 0;
  let cy = 0;
  let rpx = 200; // ball radius in px
  let scale = 1; // dot scale vs the reference hero
  let dprCap = (navigator.hardwareConcurrency ?? 8) <= 4 ? 1 : 1.5;
  let dpr = 1;
  let backdrop: HTMLCanvasElement | null = null;

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    const cs = getComputedStyle(host);
    const gx = parseFloat(cs.getPropertyValue('--hero-gx')) || 0.5;
    const gr = parseFloat(cs.getPropertyValue('--hero-gr')) || 0.3;
    const zone = parseFloat(cs.getPropertyValue('--hero-graph-h')) || H;
    cx = W * gx;
    cy = Math.min(H, zone) / 2;
    rpx = Math.max(60, Math.min(zone * 0.4, W * gr));
    scale = clamp(rpx / 250, 0.75, 1.2);
    dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    // Keep the backing store under ~2.4 MP on huge screens.
    dpr = Math.min(dpr, Math.sqrt(2.4e6 / (W * H)));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    backdrop = makeBackdrop();
    draw();
  };

  /** Scene glow around the ball and the stars, drawn once per resize. */
  const makeBackdrop = () => {
    const b = document.createElement('canvas');
    b.width = canvas.width;
    b.height = canvas.height;
    const g = b.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gr = g.createRadialGradient(cx, cy - 10, 10, cx, cy, rpx * 1.45);
    gr.addColorStop(0, rgba(C.scene3, 0.95));
    gr.addColorStop(0.65, rgba(C.scene2, 0.4));
    gr.addColorStop(1, rgba(C.scene, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = S.n1;
    for (const st of stars) {
      g.globalAlpha = st.o;
      g.beginPath();
      g.arc(st.x * W, st.y * H, st.r, 0, TAU);
      g.fill();
    }
    return b;
  };

  /* ---------- camera ---------- */
  let yaw = -0.6;
  let pitch = PITCH;
  let vYaw = AUTO_YAW;
  let tiltX = 0;
  let tiltY = 0;
  let tiltTX = 0;
  let tiltTY = 0;
  let dragging = false;
  let autoAt = 0;
  let cyw = 1;
  let syw = 0;
  let cp = 1;
  let sp = 0;
  let focal = 1;
  // Scratch output of `project`, so the hot path allocates nothing.
  let px = 0;
  let py = 0;
  let pz = 0;
  let pk = 1;
  const project = (x: number, y: number, z: number) => {
    const x1 = x * cyw + z * syw;
    const z1 = -x * syw + z * cyw;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const k = focal / (CAM - z2);
    px = cx + x1 * k;
    py = cy - y2 * k;
    pz = z2;
    pk = k / rpx;
  };
  /** Fade with depth: the back of the ball is dimmer. */
  const fade = (z: number) => 0.32 + 0.68 * clamp((z + 1) / 2, 0, 1);

  /* ---------- story ---------- */
  const shell3 = shellOf[3]!;
  let cycle = -1;
  let asker = shell3[0]!;
  let path: number[] = [];
  const onPath = new Uint8Array(N);
  let helpers: number[] = [];
  let routes: number[][] = [];
  const pathTo = (i: number) => {
    const p: number[] = [];
    for (let k = i; k >= 0; k = parent[k]!) p.push(k);
    return p; // asker → … → 0
  };
  const newCycle = (c: number) => {
    cycle = c;
    // Ask from a person in front of the ball but well off its middle (a front-facing one would sit on top of
    // you), leaning to the side away from the copy, so the whole trip is in view.
    let best = shell3[0]!;
    let bs = -Infinity;
    for (const i of shell3) {
      const off = Math.hypot(sx[i]! - cx, sy[i]! - cy) / rpx;
      const s =
        (sz[i]! > 0 ? 1 : -2) + Math.min(off, 0.85) * 2 + (sx[i]! > cx ? 0.3 : 0) + (R() - 0.5) * 0.6 - (i === asker ? 5 : 0);
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    asker = best;
    path = pathTo(asker);
    onPath.fill(0);
    for (const i of path) onPath[i] = 1;
    const pool: number[] = [];
    for (let i = 1; i < N; i++) if (!onPath[i] && sz[i]! > -0.4) pool.push(i);
    helpers = [];
    while (helpers.length < HELPERS && pool.length) helpers.push(pool.splice(Math.floor(R() * pool.length), 1)[0]!);
    const back = path.slice(0, -1).reverse(); // 0 → … → asker, without 0
    routes = helpers.map((h) => [...pathTo(h), ...back]);
  };

  /** Point at `k` (0..1) along a route of node ids, in world space, then projected. */
  const along = (ids: number[], k: number) => {
    if (ids.length < 2) {
      const i = ids[0] ?? 0;
      project(wx[i]!, wy[i]!, wz[i]!);
      return;
    }
    const segs = ids.length - 1;
    const f = clamp(k, 0, 1) * segs;
    const s = Math.min(segs - 1, Math.floor(f));
    const u = f - s;
    const a = ids[s]!;
    const b = ids[s + 1]!;
    project(wx[a]! + (wx[b]! - wx[a]!) * u, wy[a]! + (wy[b]! - wy[a]!) * u, wz[a]! + (wz[b]! - wz[a]!) * u);
  };

  const widths = new Map<string, number>();
  const textW = (txt: string) => {
    let w = widths.get(txt);
    if (w === undefined) {
      w = ctx.measureText(txt).width;
      if (widths.size > 64) widths.clear();
      widths.set(txt, w);
    }
    return w;
  };
  const pill = (x: number, y: number, txt: string, fill: string) => {
    ctx.font = '700 12px Manrope, sans-serif';
    const w = textW(txt) + 20;
    x = clamp(x, w / 2 + 8, W - w / 2 - 8);
    y = clamp(y, 19, H - 19);
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - w / 2, y - 11, w, 22, 11);
    else ctx.rect(x - w / 2, y - 11, w, 22);
    ctx.fill();
    ctx.fillStyle = S.n1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
  };
  const disc = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
  const glow = (img: HTMLCanvasElement, x: number, y: number, r: number) => ctx.drawImage(img, x - r, y - r, r * 2, r * 2);

  /* ---------- frame ---------- */
  let time = 0; // seconds of played story; does not advance while paused
  function draw() {
    const L = getLabels();
    const t = reduce ? STILL_T : time % T;
    const c = reduce ? 0 : Math.floor(time / T);
    const tw = reduce ? 0 : time;

    const yw = yaw + tiltX;
    const pt = pitch + tiltY;
    cyw = Math.cos(yw);
    syw = Math.sin(yw);
    cp = Math.cos(pt);
    sp = Math.sin(pt);
    focal = rpx * (CAM - 0);

    for (let i = 0; i < N; i++) {
      wx[i] = bx[i]!;
      wy[i] = by[i]! + (i ? Math.sin(tw * 0.8 + phase[i]!) * BOB : 0);
      wz[i] = bz[i]!;
      project(wx[i]!, wy[i]!, wz[i]!);
      sx[i] = px;
      sy[i] = py;
      sz[i] = pz;
      sk[i] = pk;
    }
    if (c !== cycle) newCycle(c);

    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    if (backdrop) ctx!.drawImage(backdrop, 0, 0);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* dust beyond the drawn rings */
    ctx!.fillStyle = S.dust;
    for (let i = 0; i < DUST; i++) {
      project(dx[i]!, dy[i]!, dz[i]!);
      ctx!.globalAlpha = 0.12 + 0.3 * clamp((pz + 1.5) / 3, 0, 1);
      const s = 1.3 * pk * scale;
      ctx!.fillRect(px - s / 2, py - s / 2, s, s);
    }
    ctx!.globalAlpha = 1;

    /* story state */
    const sigK = t < PH.signal[0] ? 0 : ease((t - PH.signal[0]) / (PH.signal[1] - PH.signal[0]));
    const inSignal = t >= PH.signal[0] && t < PH.signal[1];
    const litTo = sigK > 0 ? Math.floor(sigK * (path.length - 1) + 1e-6) : -1; // path[0..litTo] are lit
    const doneK = t >= PH.done[0] ? (t - PH.done[0]) / (PH.done[1] - PH.done[0]) : 0;
    const storyA = doneK > 0.6 ? 1 - (doneK - 0.6) / 0.4 : 1; // the whole story fades out at the end
    const lit = (i: number) => onPath[i] === 1 && path.indexOf(i) <= litTo;
    const waveK = t >= PH.wave[0] && t < PH.help[0] ? (t - PH.wave[0]) / (PH.wave[1] - PH.wave[0]) : t >= PH.help[0] ? 2 : -1;
    const waveR = waveK < 0 ? -1 : waveK * 1.05;

    /* links: three depth buckets in one path each */
    for (let e = 0; e < E; e++) {
      const z = (sz[ea[e]!]! + sz[eb[e]!]!) / 2;
      bucket[e] = z < -0.35 ? 0 : z < 0.35 ? 1 : 2;
    }
    ctx!.strokeStyle = S.line;
    ctx!.lineWidth = 1;
    for (let b = 0; b < 3; b++) {
      ctx!.globalAlpha = b === 0 ? 0.4 : b === 1 ? 0.7 : 1;
      ctx!.beginPath();
      for (let e = 0; e < E; e++) {
        if (bucket[e] !== b) continue;
        const a = ea[e]!;
        const d = eb[e]!;
        if (lit(a) && lit(d)) continue;
        ctx!.moveTo(sx[a]!, sy[a]!);
        ctx!.lineTo(sx[d]!, sy[d]!);
      }
      ctx!.stroke();
    }
    /* the lit part of the path, slightly bent like in the app */
    if (litTo >= 1) {
      ctx!.globalAlpha = storyA;
      ctx!.strokeStyle = S.care;
      ctx!.lineWidth = 1.6;
      ctx!.beginPath();
      for (let j = 0; j < litTo; j++) {
        const a = path[j]!;
        const d = path[j + 1]!;
        const mx = (sx[a]! + sx[d]!) / 2;
        const my = (sy[a]! + sy[d]!) / 2;
        ctx!.moveTo(sx[a]!, sy[a]!);
        ctx!.quadraticCurveTo(mx - (sy[d]! - sy[a]!) * PATH_CURVE, my + (sx[d]! - sx[a]!) * PATH_CURVE, sx[d]!, sy[d]!);
      }
      ctx!.stroke();
      ctx!.globalAlpha = 1;
    }

    /* wave from you through the circle */
    if (waveK >= 0 && waveK <= 1) {
      ctx!.strokeStyle = S.care;
      ctx!.globalAlpha = (1 - waveK) * 0.55;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.arc(cx, cy, waveK * 1.05 * rpx, 0, TAU);
      ctx!.stroke();
      ctx!.globalAlpha = 1;
    }

    /* people, far to near; you are drawn when the sort passes z = 0 */
    order.sort((a, b) => sz[a]! - sz[b]!);
    let youDrawn = false;
    const helping = t >= PH.help[0];
    for (let o = 0; o < N; o++) {
      const i = order[o]!;
      if (i === 0) continue;
      if (!youDrawn && sz[i]! > 0) {
        drawYou(L.you);
        youDrawn = true;
      }
      const x = sx[i]!;
      const y = sy[i]!;
      const k = sk[i]!;
      let r = size[i]! * k * scale;
      const f = fade(sz[i]!);
      if (i === asker && storyA > 0) continue; // drawn on top
      const isLit = lit(i);
      if (isLit) {
        ctx!.globalAlpha = storyA;
        glow(glowCare, x, y, r * 4);
        ctx!.fillStyle = S.care;
        disc(x, y, r + 0.8);
        ctx!.strokeStyle = S.careHalo;
        ctx!.lineWidth = 1.2;
        ctx!.beginPath();
        ctx!.arc(x, y, r + 5, 0, TAU);
        ctx!.stroke();
        ctx!.globalAlpha = 1;
        if (storyA >= 1) continue;
      }
      // The wave brightens each shell as it passes.
      let flash = 0;
      if (waveR > 0 && waveK <= 1) {
        const d = SHELLS[depth[i]! - 1]!.r;
        if (waveR >= d) flash = clamp(1 - (waveR - d) / 0.3, 0, 1);
      }
      ctx!.globalAlpha = f * (isLit ? 1 - storyA : 1);
      ctx!.fillStyle = flash > 0.05 ? S.n1 : S.n[depth[i]! - 1]!;
      r += flash * 1.4;
      disc(x, y, r);
      if (helping && helpers.includes(i)) {
        ctx!.globalAlpha = storyA * f;
        ctx!.strokeStyle = S.warmHalo;
        ctx!.lineWidth = 1.2;
        ctx!.beginPath();
        ctx!.arc(x, y, r + 4, 0, TAU);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
    }
    if (!youDrawn) drawYou(L.you);

    /* the asker, breathing */
    const ax = sx[asker]!;
    const ay = sy[asker]!;
    const askK = ease(t / PH.ask[1]);
    if (storyA > 0) {
      const ar = (size[asker]! + 2.2 * askK) * sk[asker]! * scale;
      ctx!.globalAlpha = storyA;
      glow(glowCare, ax, ay, ar * 5);
      ctx!.fillStyle = S.care;
      disc(ax, ay, ar);
      ctx!.strokeStyle = S.careHalo;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.arc(ax, ay, ar + 6 + Math.sin(tw * 3) * 1.5, 0, TAU);
      ctx!.stroke();
      ctx!.globalAlpha = 1;
    }

    /* comet: head and a short tail along the path */
    if (inSignal) {
      for (let j = 7; j >= 0; j--) {
        along(path, sigK - j * 0.022);
        const s = (j === 0 ? 3.6 : 2.4 * (1 - j / 9)) * pk * scale;
        ctx!.globalAlpha = j === 0 ? 1 : 0.6 * (1 - j / 8);
        if (j === 0) glow(glowCare, px, py, s * 5);
        ctx!.fillStyle = j === 0 ? S.n1 : S.care;
        disc(px, py, s);
      }
      ctx!.globalAlpha = 1;
    }

    /* shares travel from helpers through you to the asker; the ring around the asker fills */
    let arrived = 0;
    if (helping && storyA > 0) {
      ctx!.globalAlpha = storyA;
      helpers.forEach((_h, j) => {
        const k = (t - PH.help[0] - j * 0.45) / 1.6;
        if (k < 0) return;
        if (k >= 1) {
          arrived++;
          return;
        }
        along(routes[j]!, ease(k));
        const s = 3.4 * pk * scale;
        glow(glowWarm, px, py, s * 4);
        ctx!.fillStyle = S.warm;
        disc(px, py, s);
      });
      if (arrived > 0) {
        ctx!.strokeStyle = S.warm;
        ctx!.lineWidth = 3;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.arc(ax, ay, 15, -Math.PI / 2, -Math.PI / 2 + (TAU * arrived) / helpers.length);
        ctx!.stroke();
        ctx!.lineCap = 'butt';
      }
      ctx!.globalAlpha = 1;
    }
    if (storyA > 0 && askK > 0) {
      const full = helpers.length > 0 && arrived === helpers.length;
      ctx!.globalAlpha = storyA * askK;
      pill(ax, ay - 30 < 19 ? ay + 30 : ay - 30, full ? L.done : L.ask, full ? S.bright : S.pillAsk);
      ctx!.globalAlpha = 1;
    }
  }

  /** The centre tile, as in the app: a care-bright rounded square with your label. */
  function drawYou(label: string) {
    ctx!.font = '800 11px Manrope, sans-serif';
    const w = Math.max(30, textW(label) + 14) * scale;
    const h = 30 * scale;
    glow(glowCare, cx, cy, 34 * scale);
    ctx!.fillStyle = S.bright;
    ctx!.beginPath();
    if (typeof ctx!.roundRect === 'function') ctx!.roundRect(cx - w / 2, cy - h / 2, w, h, 9 * scale);
    else ctx!.rect(cx - w / 2, cy - h / 2, w, h);
    ctx!.fill();
    ctx!.fillStyle = S.n1;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.fillText(label, cx, cy + 1);
  }

  /* ---------- loop ---------- */
  let raf = 0;
  let running = false;
  let last = 0;
  let slowAcc = 0;
  let slowN = 0;
  const loop = (ts: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    if (!reduce) {
      time += dt;
      if (!dragging) {
        if (ts > autoAt) vYaw += (AUTO_YAW - vYaw) * Math.min(1, dt * 1.5);
        else vYaw *= Math.exp(-dt * 3);
        yaw += vYaw * dt;
        pitch += (PITCH - pitch) * Math.min(1, dt * 0.4);
      }
      tiltX += (tiltTX - tiltX) * Math.min(1, dt * 4);
      tiltY += (tiltTY - tiltY) * Math.min(1, dt * 4);
    }
    draw();
    // One step down if frames are slow: back to 1x pixels.
    if (dt > 0 && dprCap > 1) {
      slowAcc += dt;
      if (++slowN === 90) {
        if (slowAcc / slowN > 0.026) {
          dprCap = 1;
          fit();
        }
        slowAcc = 0;
        slowN = 0;
      }
    }
    if (running && !reduce) raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduce) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const redraw = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  /* ---------- input ---------- */
  let lastX = 0;
  let lastY = 0;
  let lastMove = 0;
  let pid = -1;
  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    dragging = true;
    pid = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMove = e.timeStamp;
    vYaw = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add('drag');
  };
  const onMove = (e: PointerEvent) => {
    if (dragging && e.pointerId === pid) {
      const ddx = e.clientX - lastX;
      const ddy = e.clientY - lastY;
      const dt = Math.max(1, e.timeStamp - lastMove) / 1000;
      lastX = e.clientX;
      lastY = e.clientY;
      lastMove = e.timeStamp;
      yaw += ddx * 0.0065;
      pitch = clamp(pitch + ddy * 0.004, -0.5, 0.95);
      vYaw = clamp((ddx * 0.0065) / dt, -3, 3);
      if (reduce) redraw();
    }
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    dragging = false;
    pid = -1;
    autoAt = performance.now() + AUTO_RESUME_MS;
    if (e.timeStamp - lastMove > 80) vYaw = 0;
    canvas.classList.remove('drag');
  };
  /** A mouse over the hero tilts the ball a little toward it. */
  const onHover = (e: PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = host.getBoundingClientRect();
    tiltTX = ((e.clientX - r.left) / r.width - 0.5) * 0.18;
    tiltTY = ((e.clientY - r.top) / r.height - 0.5) * 0.12;
  };
  const onLeave = () => {
    tiltTX = 0;
    tiltTY = 0;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  host.addEventListener('pointermove', onHover);
  host.addEventListener('pointerleave', onLeave);

  /* ---------- visibility ---------- */
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fit()) : null;
  ro?.observe(canvas);
  let inView = typeof IntersectionObserver === 'undefined';
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              inView = e.isIntersecting;
              if (inView && !document.hidden) start();
              else stop();
            }),
          { threshold: 0.05 },
        );
  io?.observe(canvas);
  if (inView) start();
  const onVis = () => {
    if (document.hidden) stop();
    else if (inView) start();
  };
  document.addEventListener('visibilitychange', onVis);
  // Manrope may arrive after the first frame: redraw so the pills use it.
  document.fonts?.ready.then(() => {
    widths.clear();
    draw();
  });

  return {
    destroy: () => {
      stop();
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointermove', onHover);
      host.removeEventListener('pointerleave', onLeave);
    },
  };
}
