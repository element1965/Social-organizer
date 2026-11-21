import { canvasRgb, landingCanvasPalette } from './canvasPalette';

/**
 * The growth model: one person starts; each newcomer invites about R people (low spread: floor(R) plus one more
 * with the fraction's probability; the first person invites at least two). An invitation that reaches someone
 * already in the network (circles overlap, more often as the network grows) adds nobody and flashes warm.
 * Starts once 60% of the field is on screen; idle frames are skipped. Ported from the concept prototype (v9).
 */
export interface GrowElements {
  canvas: HTMLCanvasElement;
  chart: HTMLCanvasElement;
  slider: HTMLInputElement;
  value: HTMLElement;
  people: HTMLElement;
  peopleLabel: HTMLElement;
  waves: HTMLElement;
  wavesLabel: HTMLElement;
  state: HTMLElement;
  restart: HTMLElement;
}

export interface GrowOptions {
  rtl: boolean;
  /** One decimal (the slider value). */
  formatValue: (v: number) => string;
  formatInt: (v: number) => string;
  labels: { grows: string; dies: string; full: string; axisX: string; axisY: string };
  /** The words under a stat, in the plural form its number takes. */
  count: (key: 'statPeople' | 'statWaves', n: number) => string;
}

export interface GrowHandle {
  update(options: GrowOptions): void;
  destroy(): void;
}

interface Person {
  x: number;
  y: number;
  g: number;
  p: Person | null;
  born: number;
}

type GrowState = '' | 'grows' | 'dies' | 'full';

export function initGrow(els: GrowElements, initial: GrowOptions): GrowHandle {
  let opts = initial;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { canvas: cv, chart: ch, slider } = els;
  const cx = cv.getContext('2d');
  const gx = ch.getContext('2d');
  if (!cx || !gx) return { update() {}, destroy() {} };
  const palette = landingCanvasPalette(cv);
  const white = palette('white');
  const warm = palette('warm');
  const care = palette('care-scene');
  const careFill = canvasRgb(care);
  const careStroke = canvasRgb(care, 0.45);
  const careHalo = canvasRgb(care, 0.18);
  const olderEdge = canvasRgb(palette('node-mid'), 0.22);
  const olderNode = canvasRgb(palette('network-node'), 0.78);
  const warmFill = canvasRgb(warm);
  const warmGlow = canvasRgb(warm, 0.9);
  const warmFade = canvasRgb(warm, 0);
  let W = 0;
  let H = 0;
  let POP = 400;
  let R = +slider.value || 1.5;
  let nodes: Person[] = [];
  let edges: Person[] = [];
  let flashes: { a: Person; b: Person; t: number }[] = [];
  let frontier: Person[] = [];
  let wave = 0;
  let growingWaves = 0;
  let hist: number[] = [1];
  let seed: { x: number; y: number } | null = null;
  let grid = new Map<number, Person[]>();
  let running = false;
  let last = 0;
  let visible = false;
  let started = false;
  let lastBorn = 0;
  let still = false;
  let state: GrowState = '';
  const CELL = 12;
  const MIN = 11;
  const STEP_MS = 560;
  const FLY = 520;

  const size = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * d;
    cv.height = H * d;
    cx.setTransform(d, 0, 0, d, 0, 0);
    const cw = ch.clientWidth || 200;
    const chh = ch.clientHeight || 64;
    ch.width = cw * d;
    ch.height = chh * d;
    gx.setTransform(d, 0, 0, d, 0, 0);
    POP = Math.round(Math.max(400, Math.min(1400, (W * H) / 950)));
  };
  const key = (x: number, y: number) => ((x / CELL) | 0) * 4096 + ((y / CELL) | 0);
  const around = (x: number, y: number, r: number, fn: (n: Person) => void) => {
    const cx0 = ((x - r) / CELL) | 0;
    const cx1 = ((x + r) / CELL) | 0;
    const cy0 = ((y - r) / CELL) | 0;
    const cy1 = ((y + r) / CELL) | 0;
    for (let a = cx0; a <= cx1; a++)
      for (let b = cy0; b <= cy1; b++) {
        const l = grid.get(a * 4096 + b);
        if (l) for (let i = 0; i < l.length; i++) fn(l[i]!);
      }
  };
  const free = (x: number, y: number) => {
    let ok = true;
    around(x, y, MIN, (n) => {
      if ((n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) < MIN * MIN) ok = false;
    });
    return ok;
  };
  const add = (x: number, y: number, g: number, par: Person | null) => {
    const n: Person = { x, y, g, p: par, born: performance.now() };
    nodes.push(n);
    lastBorn = n.born;
    still = false;
    const k = key(x, y);
    const l = grid.get(k);
    if (l) l.push(n);
    else grid.set(k, [n]);
    if (par) edges.push(n);
    return n;
  };
  const showState = (s: GrowState) => {
    state = s;
    els.state.textContent = s ? opts.labels[s] : '';
  };
  const chart = () => {
    const w = ch.clientWidth || 200;
    const h = ch.clientHeight || 64;
    gx.clearRect(0, 0, w, h);
    const n = Math.max(12, hist.length - 1);
    const top = POP;
    gx.strokeStyle = canvasRgb(white, 0.14);
    gx.lineWidth = 1;
    gx.beginPath();
    gx.moveTo(0, h - 12.5);
    gx.lineTo(w, h - 12.5);
    gx.stroke();
    gx.fillStyle = canvasRgb(white, 0.5);
    gx.font = '600 9px Manrope, sans-serif';
    gx.direction = 'ltr';
    gx.textAlign = 'right';
    gx.fillText(opts.labels.axisX, w, h - 1);
    gx.textAlign = 'left';
    gx.fillText(opts.labels.axisY, 0, 9);
    gx.strokeStyle = careFill;
    gx.lineWidth = 2;
    gx.lineJoin = 'round';
    gx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / n) * w;
      const y = h - 13 - (v / top) * (h - 26);
      if (i) gx.lineTo(x, y);
      else gx.moveTo(x, y);
    });
    gx.stroke();
    const lx = ((hist.length - 1) / n) * w;
    const ly = h - 13 - (hist[hist.length - 1]! / top) * (h - 26);
    gx.fillStyle = careFill;
    gx.beginPath();
    gx.arc(lx, ly, 3, 0, 6.283);
    gx.fill();
  };
  const stats = () => {
    els.people.textContent = opts.formatInt(nodes.length);
    els.waves.textContent = opts.formatInt(wave);
    els.peopleLabel.textContent = opts.count('statPeople', nodes.length);
    els.wavesLabel.textContent = opts.count('statWaves', wave);
    chart();
  };
  const stepWave = () => {
    if (!frontier.length || nodes.length >= POP) return false;
    const next: Person[] = [];
    for (let i = 0; i < frontier.length; i++) {
      const p = frontier[i]!;
      // low spread: above the threshold the network does not die by bad luck
      let k = Math.floor(R) + (Math.random() < R - Math.floor(R) ? 1 : 0);
      if (wave === 0) k = Math.max(k, 2); // the first person always invites a couple of people
      for (let j = 0; j < k; j++) {
        if (Math.random() < nodes.length / POP) {
          // this acquaintance is already in the network
          let q: Person | null = null;
          around(p.x, p.y, 60, (n) => {
            if (n !== p && (!q || Math.random() < 0.3)) q = n;
          });
          if (q) flashes.push({ a: p, b: q, t: performance.now() });
          continue;
        }
        let placed: Person | null = null;
        for (let tr = 0; tr < 12 && !placed; tr++) {
          const an = Math.random() * 6.283;
          const dd = 15 + Math.random() * 24;
          const nx = p.x + Math.cos(an) * dd;
          const ny = p.y + Math.sin(an) * dd;
          if (nx > 10 && ny > 10 && nx < W - 10 && ny < H - 10 && free(nx, ny)) placed = add(nx, ny, wave + 1, p);
        }
        if (placed) next.push(placed);
      }
    }
    // The initial seed is not a newcomer cohort. Require two successive increases after it.
    growingWaves = wave >= 1 && next.length > frontier.length ? growingWaves + 1 : 0;
    wave++;
    frontier = next;
    hist.push(nodes.length);
    stats();
    showState(R > 1 && growingWaves >= 2 ? 'grows' : '');
    return frontier.length > 0 && nodes.length < POP;
  };
  const finish = () => {
    running = false;
    showState(nodes.length > POP * 0.45 ? 'full' : 'dies');
  };
  const restart = (x?: number, y?: number) => {
    size();
    nodes = [];
    edges = [];
    flashes = [];
    grid = new Map();
    wave = 0;
    growingWaves = 0;
    hist = [1];
    const wide = W > 860;
    seed = { x: x ?? W * (wide ? (opts.rtl ? 0.3 : 0.7) : 0.5), y: y ?? H * 0.5 };
    frontier = [add(seed.x, seed.y, 0, null)];
    showState('');
    stats();
    running = true;
    last = performance.now();
    if (reduce) {
      while (stepWave());
      finish();
    }
  };
  const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  let raf = 0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (!visible || !started || document.hidden) return;
    if (!running && !flashes.length && now - lastBorn > FLY + 80) {
      if (still) return;
      still = true;
    } else still = false;
    if (running && now - last > STEP_MS / Math.max(0.8, Math.min(1.6, R))) {
      last = now;
      if (!stepWave()) finish();
    }
    cx.clearRect(0, 0, W, H);
    // invitations: a line from the person who invited
    cx.lineWidth = 1;
    for (let i = 0; i < edges.length; i++) {
      const n = edges[i]!;
      const par = n.p;
      if (!par) continue;
      const e = easeOut((now - n.born) / FLY);
      const x = par.x + (n.x - par.x) * e;
      const y = par.y + (n.y - par.y) * e;
      cx.strokeStyle = n.g >= wave - 1 ? careStroke : olderEdge;
      cx.beginPath();
      cx.moveTo(par.x, par.y);
      cx.lineTo(x, y);
      cx.stroke();
    }
    // invitations that reached someone already in the network
    for (let f = flashes.length - 1; f >= 0; f--) {
      const fl = flashes[f]!;
      const a = 1 - (now - fl.t) / 700;
      if (a <= 0) {
        flashes.splice(f, 1);
        continue;
      }
      cx.strokeStyle = canvasRgb(warm, (a * 0.7).toFixed(3));
      cx.setLineDash([3, 3]);
      cx.beginPath();
      cx.moveTo(fl.a.x, fl.a.y);
      cx.lineTo(fl.b.x, fl.b.y);
      cx.stroke();
      cx.setLineDash([]);
    }
    // people: the newest wave in bright care colour, earlier ones settle, the first person in warm
    for (let k = 0; k < nodes.length; k++) {
      const m = nodes[k]!;
      const par = m.p;
      const e2 = par ? easeOut((now - m.born) / FLY) : 1;
      const mx = par ? par.x + (m.x - par.x) * e2 : m.x;
      const my = par ? par.y + (m.y - par.y) * e2 : m.y;
      const fresh = m.g >= wave - 1 && running;
      if (m.g === 0) {
        const gr = cx.createRadialGradient(mx, my, 0, mx, my, 22);
        gr.addColorStop(0, warmGlow);
        gr.addColorStop(1, warmFade);
        cx.fillStyle = gr;
        cx.beginPath();
        cx.arc(mx, my, 22, 0, 6.283);
        cx.fill();
        cx.fillStyle = warmFill;
        cx.beginPath();
        cx.arc(mx, my, 4.5, 0, 6.283);
        cx.fill();
        continue;
      }
      if (fresh) {
        cx.fillStyle = careHalo;
        cx.beginPath();
        cx.arc(mx, my, 7, 0, 6.283);
        cx.fill();
      }
      cx.fillStyle = fresh ? careFill : olderNode;
      cx.beginPath();
      cx.arc(mx, my, fresh ? 2.9 : 2.3, 0, 6.283);
      cx.fill();
    }
  };

  const showValue = () => {
    els.value.textContent = opts.formatValue(Math.round(R * 10) / 10);
  };
  const onInput = () => {
    R = +slider.value;
    growingWaves = 0;
    if (state === 'grows') showState('');
    showValue();
    if (!running) restart(seed?.x, seed?.y);
  };
  const onChange = () => restart(seed?.x, seed?.y);
  const onRestart = () => restart(seed?.x, seed?.y);
  const onClick = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    restart(e.clientX - r.left, e.clientY - r.top);
  };
  const onResize = () => {
    // phones fire resize when the address bar slides; only a new size of the field restarts the model
    if (started && (cv.clientWidth !== W || cv.clientHeight !== H)) restart();
  };
  slider.addEventListener('input', onInput);
  slider.addEventListener('change', onChange);
  els.restart.addEventListener('click', onRestart);
  cv.addEventListener('click', onClick);
  addEventListener('resize', onResize);
  const io = new IntersectionObserver(
    (es) => {
      visible = es[0]!.intersectionRatio >= 0.6;
      if (visible && !started) {
        started = true;
        restart();
      }
      if (visible) still = false;
    },
    { threshold: [0, 0.6, 1] },
  );
  io.observe(cv);
  showValue();
  stats();
  raf = requestAnimationFrame(draw);

  if (import.meta.env.DEV) {
    (window as unknown as { __lvGrow?: unknown }).__lvGrow = {
      restart,
      step: (n: number) => {
        for (let i = 0; i < n && stepWave(); i++);
        if (!frontier.length) finish();
        return nodes.length;
      },
    };
  }

  return {
    update(next) {
      opts = next;
      showValue();
      showState(state);
      stats();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      slider.removeEventListener('input', onInput);
      slider.removeEventListener('change', onChange);
      els.restart.removeEventListener('click', onRestart);
      cv.removeEventListener('click', onClick);
      removeEventListener('resize', onResize);
      if (import.meta.env.DEV) delete (window as unknown as { __lvGrow?: unknown }).__lvGrow;
    },
  };
}
