import { canvasRgb, landingCanvasPalette } from './canvasPalette';

export const GROW_MIN = 30;
export const GROW_MAX = 150;
const MAX_HANDSHAKES = 5;
const MAX_PEOPLE = 1_000_000;
const SAMPLES_PER_WAVE = [22, 42, 76, 122, 168];
const STEP_MS = 600;
const FLY = 480;
const TURN = Math.PI * 2;

function reachByHandshake(acquaintances: number): number[] {
  const totals = [1];
  let total = 1;
  let newcomers = 1;
  for (let wave = 1; wave <= MAX_HANDSHAKES && total < MAX_PEOPLE; wave++) {
    // Only the previous wave adds connections. The assumed unique share falls from 100% to
    // 94%, 91%, etc. toward 88% as circles overlap. This illustrates reach; it isn't measured data.
    const uniqueShare = 0.88 + 0.12 * 0.5 ** (wave - 1);
    newcomers = Math.round(newcomers * acquaintances * uniqueShare);
    total = Math.min(MAX_PEOPLE, total + newcomers);
    totals.push(total);
  }
  return totals;
}

export interface GrowElements {
  canvas: HTMLCanvasElement;
  chart: HTMLCanvasElement;
  slider: HTMLInputElement;
  value: HTMLElement;
  unit: HTMLElement;
  people: HTMLElement;
  peopleLabel: HTMLElement;
  waves: HTMLElement;
  wavesLabel: HTMLElement;
  state: HTMLElement;
  restart: HTMLElement;
}

export interface GrowOptions {
  rtl: boolean;
  formatInt: (value: number) => string;
  labels: { full: string; axisX: string; axisY: string };
  count: (key: 'unit' | 'statPeople' | 'statWaves', n: number) => string;
}

export interface GrowHandle {
  update(options: GrowOptions): void;
  destroy(): void;
}

interface Point { x: number; y: number }
interface Sample extends Point { parent: Point }

export function initGrow(els: GrowElements, initial: GrowOptions): GrowHandle {
  let opts = initial;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const { canvas, chart, slider } = els;
  const networkContext = canvas.getContext('2d');
  const chartContext = chart.getContext('2d');
  if (!networkContext || !chartContext) return { update() {}, destroy() {} };
  const cx = networkContext;
  const gx = chartContext;

  const palette = landingCanvasPalette(canvas);
  const care = palette('care-scene');
  const warm = palette('warm');
  const white = palette('white');
  const careFill = canvasRgb(care);
  const careStroke = canvasRgb(care, 0.38);
  const olderEdge = canvasRgb(palette('node-mid'), 0.22);
  const olderNode = canvasRgb(palette('network-node'), 0.78);
  const warmFill = canvasRgb(warm);
  const warmGlow = canvasRgb(warm, 0.9);
  const warmFade = canvasRgb(warm, 0);

  let width = 0;
  let height = 0;
  let chartWidth = 0;
  let chartHeight = 0;
  let totals = reachByHandshake(Number(slider.value));
  let wave = 0;
  let samples: Sample[][] = [];
  let seed: Point = { x: 0, y: 0 };
  let customSeed: Point | undefined;
  let visible = false;
  let started = false;
  let last = 0;
  let raf = 0;

  function drawChart() {
    const w = chartWidth;
    const h = chartHeight;
    const left = 4;
    const right = w - 4;
    const bottom = h - 15;
    const end = totals.length - 1;
    const top = totals[wave]!;
    const x = (i: number) => opts.rtl
      ? right - (i / end) * (right - left)
      : left + (i / end) * (right - left);
    const y = (total: number) => bottom - (total / top) * (bottom - 13);
    gx.clearRect(0, 0, w, h);
    gx.strokeStyle = canvasRgb(white, 0.18);
    gx.lineWidth = 1;
    gx.beginPath();
    gx.moveTo(left, bottom + 0.5);
    gx.lineTo(right, bottom + 0.5);
    gx.stroke();
    gx.fillStyle = canvasRgb(white, 0.62);
    gx.font = '600 10px Manrope, sans-serif';
    gx.direction = opts.rtl ? 'rtl' : 'ltr';
    gx.textAlign = 'start';
    gx.fillText(opts.labels.axisY, x(0), 10, right - left);
    gx.textAlign = 'end';
    gx.fillText(opts.labels.axisX, x(end), h - 1, right - left);
    gx.strokeStyle = careFill;
    gx.lineWidth = 2;
    gx.lineJoin = 'round';
    gx.beginPath();
    gx.moveTo(x(0), bottom);
    for (let i = 1; i <= wave; i++) gx.lineTo(x(i), y(totals[i]!));
    gx.stroke();
    gx.fillStyle = careFill;
    for (let i = 0; i <= wave; i++) {
      gx.beginPath();
      gx.arc(x(i), i ? y(totals[i]!) : bottom, 2.6, 0, TURN);
      gx.fill();
    }
  }

  function showStats() {
    const people = totals[wave]!;
    els.people.textContent = opts.formatInt(people);
    els.waves.textContent = opts.formatInt(wave);
    els.peopleLabel.textContent = opts.count('statPeople', people);
    els.wavesLabel.textContent = opts.count('statWaves', wave);
    const state = wave === totals.length - 1 ? opts.labels.full : '';
    if (els.state.textContent !== state) els.state.textContent = state;
    drawChart();
  }

  function showValue() {
    const value = Number(slider.value);
    const formatted = opts.formatInt(value);
    const unit = opts.count('unit', value);
    els.value.textContent = formatted;
    els.unit.textContent = unit;
    slider.setAttribute('aria-valuetext', [formatted, unit].join(' '));
  }

  function makeSamples() {
    const pad = 12;
    const wide = width > 860;
    seed = {
      x: customSeed ? Math.max(pad, Math.min(width - pad, customSeed.x * width)) : width * (wide ? (opts.rtl ? 0.27 : 0.73) : 0.5),
      y: customSeed ? Math.max(pad, Math.min(height - pad, customSeed.y * height)) : height / 2,
    };
    const reachX = width * (wide ? 0.25 : 0.49);
    const reachY = height * (wide ? 0.42 : 0.49);
    samples = [];
    for (let i = 1; i < totals.length; i++) {
      const newcomers = totals[i]! - totals[i - 1]!;
      // Keep the drawing bounded. Only the counters and chart represent the full modeled population.
      const count = Math.min(newcomers, SAMPLES_PER_WAVE[i - 1]!);
      const previous = samples[i - 2];
      const rotation = Math.random() * TURN;
      const layer: Sample[] = [];
      for (let j = 0; j < count; j++) {
        const angle = (j + Math.random() * 0.85) / count * TURN;
        const direction = angle + rotation;
        const dx = Math.cos(direction);
        const dy = Math.sin(direction);
        const radius = (i - 0.25 + (Math.random() - 0.5) * 0.9) / (totals.length - 1);
        const x = seed.x + dx * radius * Math.min(reachX, dx < 0 ? seed.x - pad : width - pad - seed.x);
        const y = seed.y + dy * radius * Math.min(reachY, dy < 0 ? seed.y - pad : height - pad - seed.y);
        let parent: Point = seed;
        if (previous?.length) {
          let distance = Infinity;
          for (const point of previous) {
            const candidate = (point.x - x) ** 2 + (point.y - y) ** 2;
            if (candidate < distance) {
              distance = candidate;
              parent = point;
            }
          }
        }
        layer.push({ x, y, parent });
      }
      samples.push(layer);
    }
  }

  function measure() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * scale;
      canvas.height = height * scale;
      cx.setTransform(scale, 0, 0, scale, 0, 0);
      if (started) makeSamples();
    }
    if (chart.clientWidth !== chartWidth || chart.clientHeight !== chartHeight) {
      chartWidth = chart.clientWidth;
      chartHeight = chart.clientHeight;
      chart.width = chartWidth * scale;
      chart.height = chartHeight * scale;
      gx.setTransform(scale, 0, 0, scale, 0, 0);
      drawChart();
    }
  }

  function drawNetwork(progress: number) {
    cx.clearRect(0, 0, width, height);
    cx.lineWidth = 1;
    for (let i = 0; i < wave; i++) {
      const fresh = i === wave - 1;
      const e = fresh ? progress : 1;
      const layer = samples[i]!;
      cx.strokeStyle = fresh ? careStroke : olderEdge;
      cx.beginPath();
      for (const { x, y, parent } of layer) {
        cx.moveTo(parent.x, parent.y);
        cx.lineTo(parent.x + (x - parent.x) * e, parent.y + (y - parent.y) * e);
      }
      cx.stroke();
      cx.fillStyle = fresh ? careFill : olderNode;
      const radius = 2.35 - i * 0.29;
      cx.beginPath();
      for (const { x, y, parent } of layer) {
        const px = parent.x + (x - parent.x) * e;
        const py = parent.y + (y - parent.y) * e;
        cx.moveTo(px + radius, py);
        cx.arc(px, py, radius, 0, TURN);
      }
      cx.fill();
    }
    const glow = cx.createRadialGradient(seed.x, seed.y, 0, seed.x, seed.y, 22);
    glow.addColorStop(0, warmGlow);
    glow.addColorStop(1, warmFade);
    cx.fillStyle = glow;
    cx.beginPath();
    cx.arc(seed.x, seed.y, 22, 0, TURN);
    cx.fill();
    cx.fillStyle = warmFill;
    cx.beginPath();
    cx.arc(seed.x, seed.y, 4.5, 0, TURN);
    cx.fill();
  }

  function requestDraw() {
    if (!raf && visible && started && !document.hidden) raf = requestAnimationFrame(draw);
  }

  function draw(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    const end = totals.length - 1;
    if (motion.matches && wave < end) {
      wave = end;
      showStats();
    } else if (wave < end && now - last >= STEP_MS) {
      wave++;
      last = now;
      showStats();
    }
    const elapsed = now - last;
    const progress = motion.matches ? 1 : 1 - (1 - Math.min(1, elapsed / FLY)) ** 3;
    drawNetwork(progress);
    if (!motion.matches && (wave < end || elapsed < FLY)) requestDraw();
  }

  function restart() {
    totals = reachByHandshake(Number(slider.value));
    wave = started && visible && motion.matches ? totals.length - 1 : 0;
    last = performance.now();
    if (started) makeSamples();
    showStats();
    requestDraw();
  }

  function onInput() {
    showValue();
    restart();
  }

  function onTap(event: MouseEvent) {
    const box = canvas.getBoundingClientRect();
    customSeed = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
    restart();
  }

  const resize = new ResizeObserver(() => {
    measure();
    requestDraw();
  });
  resize.observe(canvas);
  resize.observe(chart);

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry!.intersectionRatio >= 0.6;
    if (!visible) return;
    measure();
    if (!started) {
      started = true;
      restart();
    }
    requestDraw();
  }, { threshold: [0.6] });
  observer.observe(canvas);

  measure();
  showValue();
  showStats();
  slider.addEventListener('input', onInput);
  els.restart.addEventListener('click', restart);
  canvas.addEventListener('click', onTap);
  motion.addEventListener('change', requestDraw);
  document.addEventListener('visibilitychange', requestDraw);

  return {
    update(next) {
      const mirror = opts.rtl !== next.rtl;
      opts = next;
      if (mirror && started && !customSeed) makeSamples();
      showValue();
      showStats();
      requestDraw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      resize.disconnect();
      slider.removeEventListener('input', onInput);
      els.restart.removeEventListener('click', restart);
      canvas.removeEventListener('click', onTap);
      motion.removeEventListener('change', requestDraw);
      document.removeEventListener('visibilitychange', requestDraw);
    },
  };
}
