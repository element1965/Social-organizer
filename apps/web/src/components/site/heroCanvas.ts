/*
 * Hero scene for the site: a living network that tells the idea in a loop.
 * A request lights up at the edge, travels by handshakes to you, a wave tells everyone,
 * shares come back from all over the network until the ring around the asker is full.
 * Port of docs/redesign/mockups/v2/hero.js. Colours come from the scene tokens (same in both themes).
 * Draws only while the canvas is on screen; under prefers-reduced-motion it is one still frame with the path.
 */

export interface HeroSceneLabels {
  you: string;
  /** Pill over the asker while the request travels. */
  ask: string;
  /** Pill once the ring is full. */
  done: string;
  /** Text on each coin. */
  coin: string;
}

export interface HeroSceneHandle {
  start: () => void;
  stop: () => void;
  destroy: () => void;
}

type Pt = { x: number; y: number };
type Node = { ring: number; a: number; rr: number; size: number; ph: number; parent: number | null };

/** Reads an "R G B" token triplet and returns an rgba() string. */
function tokenColor(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--so-${name}`).trim();
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const [r, g, b] = parts.length >= 3 ? parts : ['0', '0', '0'];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function heroScene(canvas: HTMLCanvasElement, getLabels: () => HeroSceneLabels, reduce: boolean): HeroSceneHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { start() {}, stop() {}, destroy() {} };
  const COL = {
    n1: tokenColor('node-1'),
    n2: tokenColor('node-2'),
    n3: tokenColor('node-3'),
    care: tokenColor('care-scene'),
    bright: tokenColor('care-bright'),
    warm: tokenColor('warm'),
    star: tokenColor('node-1', 0.9),
    edge: tokenColor('node-1', 0.13),
    askPill: tokenColor('node-1', 0.14),
    ink: tokenColor('scene'),
    glow0: tokenColor('scene-3', 0.95),
    glow1: tokenColor('scene-2', 0.4),
    glow2: tokenColor('scene', 0),
  };

  let W = 560;
  let H = 480;
  let lastT = 0;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frame(lastT);
  };

  let s = 11;
  const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;

  /* network: three rings around you */
  const C = (): Pt => ({ x: W / 2, y: H / 2 + 6 });
  const RING = [
    { n: 6, r: 0.145, size: 6.5 },
    { n: 16, r: 0.285, size: 4.8 },
    { n: 30, r: 0.42, size: 3.4 },
  ];
  const nodes: Node[] = [{ ring: -1, a: 0, rr: 0, size: 0, ph: 0, parent: null }];
  RING.forEach((ring, k) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + (R() - 0.5) * 0.25 - Math.PI / 2;
      const rr = ring.r * (1 + (R() - 0.5) * 0.14);
      nodes.push({ ring: k, a, rr, size: ring.size, ph: R() * Math.PI * 2, parent: null });
    }
  });
  nodes.forEach((n) => {
    if (n.ring <= 0) {
      n.parent = n.ring === 0 ? 0 : null;
      return;
    }
    let best = -1;
    let bd = 9;
    nodes.forEach((m, j) => {
      if (m.ring !== n.ring - 1) return;
      const d = Math.abs(((n.a - m.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    n.parent = best;
  });
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < 70; i++) stars.push({ x: R(), y: R(), r: R() * 0.9 + 0.3, o: R() * 0.5 + 0.15 });
  const pos = (n: Node, t: number): Pt => {
    if (n.ring < 0) return C();
    const c = C();
    const base = Math.min(W, H);
    const d = Math.sin(t * 0.7 + n.ph) * 3;
    return { x: c.x + Math.cos(n.a) * (n.rr * base + d), y: c.y + Math.sin(n.a) * (n.rr * base + d) };
  };
  /** asker → … → you */
  const pathTo = (i: number): number[] => {
    const p: number[] = [];
    let k: number | null = i;
    while (k != null && k >= 0) {
      p.push(k);
      if (k === 0) break;
      k = nodes[k]!.parent;
    }
    return p;
  };
  const ring3 = nodes.map((n, i) => (n.ring === 2 ? i : -1)).filter((i) => i >= 0);

  /* story: one loop of 10 s */
  const T = 10;
  const phases = { ask: [0, 0.8], signal: [0.8, 2.8], wave: [2.8, 4.2], help: [4.2, 7.8], done: [7.8, 10] } as const;
  let cycle = 0;
  let asker = ring3[3]!;
  let path = pathTo(asker);
  const pickHelpers = () => {
    const c: number[] = [];
    const pool = nodes.map((_n, i) => i).filter((i) => i !== 0 && i !== asker && !path.includes(i));
    while (c.length < 6 && pool.length) c.push(pool.splice(Math.floor(R() * pool.length), 1)[0]!);
    return c;
  };
  let helpers = pickHelpers();
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const along = (pts: Pt[], k: number): Pt => {
    if (pts.length < 2) return pts[0] ?? C();
    const segs = pts.length - 1;
    const f = Math.min(segs - 1e-6, Math.max(0, k * segs));
    const i = Math.floor(f);
    return lerp(pts[i]!, pts[i + 1]!, f - i);
  };
  const pill = (x: number, y: number, txt: string, fill: string, color: string) => {
    ctx.font = '700 12px Manrope, sans-serif';
    const w = ctx.measureText(txt).width + 20;
    // Keep the whole pill inside the card (the phone card is only 240 px tall).
    x = Math.min(Math.max(x, w / 2 + 8), W - w / 2 - 8);
    y = Math.min(Math.max(y, 19), H - 19);
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x - w / 2, y - 11, w, 22, 11);
    else ctx.rect(x - w / 2, y - 11, w, 22);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
  };
  const dot = (p: Pt, r: number, fill: string, glow?: string | null) => {
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  function frame(tAbs: number) {
    lastT = tAbs;
    const L = getLabels();
    const t = reduce ? 2.8 : (tAbs / 1000) % T;
    const cyc = reduce ? 0 : Math.floor(tAbs / 1000 / T);
    if (cyc !== cycle) {
      cycle = cyc;
      asker = ring3[(cycle * 7 + 3) % ring3.length]!;
      path = pathTo(asker);
      helpers = pickHelpers();
    }
    ctx!.clearRect(0, 0, W, H);
    stars.forEach((st) => {
      ctx!.globalAlpha = st.o;
      dot({ x: st.x * W, y: st.y * H }, st.r, COL.star);
    });
    ctx!.globalAlpha = 1;
    const c = C();
    const base = Math.min(W, H);
    const g = ctx!.createRadialGradient(c.x, c.y - 10, 10, c.x, c.y, base * 0.5);
    g.addColorStop(0, COL.glow0);
    g.addColorStop(0.7, COL.glow1);
    g.addColorStop(1, COL.glow2);
    ctx!.fillStyle = g;
    ctx!.beginPath();
    ctx!.arc(c.x, c.y, base * 0.5, 0, Math.PI * 2);
    ctx!.fill();
    const P = nodes.map((n) => pos(n, t + cycle * T));
    const pathPts = path.map((i) => P[i]!);
    const inSignal = t >= phases.signal[0] && t < phases.signal[1];
    const sigK = inSignal ? ease((t - phases.signal[0]) / (phases.signal[1] - phases.signal[0])) : t >= phases.signal[1] ? 1 : 0;
    const lit = new Set<number>();
    if (sigK > 0) {
      const n = path.length - 1;
      for (let i = 0; i <= Math.floor(sigK * n + 1e-6); i++) lit.add(path[i]!);
    }
    /* edges */
    nodes.forEach((n, i) => {
      if (n.parent == null || n.parent < 0) return;
      const a = P[i]!;
      const b = P[n.parent]!;
      const hot = lit.has(i) && lit.has(n.parent);
      ctx!.strokeStyle = hot ? COL.care : COL.edge;
      ctx!.lineWidth = hot ? 2 : 1;
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();
    });
    /* wave */
    if (t >= phases.wave[0] && t < phases.wave[1]) {
      const k = (t - phases.wave[0]) / (phases.wave[1] - phases.wave[0]);
      ctx!.strokeStyle = COL.care;
      ctx!.globalAlpha = (1 - k) * 0.7;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.arc(c.x, c.y, k * base * 0.47, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.globalAlpha = 1;
    }
    const waveR = t >= phases.wave[0] ? Math.min(1, (t - phases.wave[0]) / (phases.wave[1] - phases.wave[0])) * base * 0.47 : 0;
    /* nodes */
    nodes.forEach((n, i) => {
      if (i === 0 || i === asker) return;
      const p = P[i]!;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      const heard = waveR > 0 && d <= waveR;
      const col = n.ring === 0 ? COL.n1 : n.ring === 1 ? COL.n2 : COL.n3;
      dot(p, n.size + (lit.has(i) ? 1.5 : 0), lit.has(i) ? COL.care : heard && t < phases.help[0] ? COL.n1 : col, lit.has(i) ? COL.care : null);
    });
    /* you */
    dot(c, 13, COL.bright, COL.care);
    ctx!.fillStyle = COL.n1;
    ctx!.font = '800 11px Manrope, sans-serif';
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.fillText(L.you, c.x, c.y + 1);
    /* asker */
    const pa = P[asker]!;
    const askK = t < phases.ask[1] ? ease(t / phases.ask[1]) : 1;
    const doneK = t >= phases.done[0] ? (t - phases.done[0]) / (phases.done[1] - phases.done[0]) : 0;
    const fade = doneK > 0.6 ? 1 - (doneK - 0.6) / 0.4 : 1;
    ctx!.globalAlpha = fade;
    dot(pa, 5 + 4 * askK, COL.care, COL.care);
    /* help: coins from helpers to the asker, progress ring fills */
    let arrived = 0;
    if (t >= phases.help[0]) {
      helpers.forEach((h, j) => {
        const t0 = phases.help[0] + j * 0.42;
        const k = (t - t0) / 1.5;
        if (k < 0) return;
        if (k >= 1) {
          arrived++;
          return;
        }
        const route = [...pathTo(h).map((i) => P[i]!), ...path.slice(0, -1).reverse().map((i) => P[i]!)];
        const p = along(route, ease(k));
        dot(p, 5, COL.warm, COL.warm);
        ctx!.fillStyle = COL.ink;
        ctx!.font = '800 7px Manrope, sans-serif';
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(L.coin, p.x, p.y + 0.5);
      });
    }
    if (arrived > 0) {
      ctx!.strokeStyle = COL.warm;
      ctx!.lineWidth = 3;
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.arc(pa.x, pa.y, 15, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * arrived) / helpers.length);
      ctx!.stroke();
    }
    const full = arrived === helpers.length;
    if (askK > 0) pill(pa.x, pa.y - 28 < 19 ? pa.y + 28 : pa.y - 28, full ? L.done : L.ask, full ? COL.bright : COL.askPill, COL.n1);
    ctx!.globalAlpha = 1;
    /* signal pulse */
    if (inSignal) dot(along(pathPts, sigK), 5, COL.care, COL.care);
  }

  let raf = 0;
  let running = false;
  const loop = (ts: number) => {
    frame(ts);
    if (running && !reduce) raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fit()) : null;
  ro?.observe(canvas);
  let io: IntersectionObserver | null = null;
  let inView = typeof IntersectionObserver === 'undefined';
  if (reduce) frame(0);
  else if (!inView) {
    io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          inView = e.isIntersecting;
          if (inView && !document.hidden) start();
          else stop();
        }),
      { threshold: 0.1 },
    );
    io.observe(canvas);
  } else start();

  // Pause while the tab is hidden, resume if the card is still on screen.
  const onVis = () => {
    if (document.hidden) stop();
    else if (!reduce && inView) start();
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    start,
    stop,
    destroy: () => {
      stop();
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
