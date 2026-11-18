/**
 * "Next": a quiet network; a Need (red) travels a few handshakes and Participation (teal) answers back; dashed
 * warm and blue sparks are the signals we want to add later. The static network is drawn once to an offscreen
 * canvas. Ported from the concept prototype (v9).
 */
interface Node {
  x: number;
  y: number;
  glow: number;
  col: string;
}

type Kind = 'need' | 'part' | 'rec' | 'joint';

interface Signal {
  path: number[];
  t0: number;
  kind: Kind;
  reply?: boolean;
}

const KIND: Record<Kind, [string, boolean]> = {
  need: ['255,106,92', false],
  part: ['95,211,198', false],
  rec: ['242,190,104', true],
  joint: ['173,190,255', true],
};

export interface NextNetHandle {
  update(options: { rtl: boolean }): void;
  destroy(): void;
}

export function initNextNet(cv: HTMLCanvasElement, initial: { rtl: boolean }): NextNetHandle {
  let rtl = initial.rtl;
  const cx = cv.getContext('2d');
  if (!cx) return { update() {}, destroy() {} };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0;
  let H = 0;
  let nodes: Node[] = [];
  let adj: number[][] = [];
  let sig: Signal[] = [];
  let visible = false;
  let last = 0;
  let base: HTMLCanvasElement | null = null;

  const build = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * d;
    cv.height = H * d;
    cx.setTransform(d, 0, 0, d, 0, 0);
    const wide = W > 860;
    // the network sits beside the words: on the right, or on the left in a right-to-left language
    const x0 = wide ? (rtl ? 20 : W * 0.5) : 20;
    const x1 = wide ? (rtl ? W * 0.5 : W - 20) : W - 20;
    const n = wide ? 230 : 120;
    let tries = 0;
    nodes = [];
    sig = [];
    while (nodes.length < n && tries++ < 6000) {
      const x = x0 + Math.random() * (x1 - x0);
      const y = 30 + Math.random() * (H - 60);
      let ok = true;
      for (let i = 0; i < nodes.length && ok; i++) {
        const dx = nodes[i]!.x - x;
        const dy = nodes[i]!.y - y;
        if (dx * dx + dy * dy < 34 * 34) ok = false;
      }
      if (ok) nodes.push({ x, y, glow: 0, col: '' });
    }
    adj = nodes.map(() => []);
    nodes.forEach((a, i) => {
      const near = nodes
        .map((b, j): [number, number] => [(a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y), j])
        .sort((p, q) => p[0] - q[0])
        .slice(1, 4);
      near.forEach((e) => {
        if (adj[i]!.indexOf(e[1]) < 0) {
          adj[i]!.push(e[1]);
          adj[e[1]]!.push(i);
        }
      });
    });
    base = document.createElement('canvas');
    base.width = cv.width;
    base.height = cv.height;
    const bx = base.getContext('2d');
    if (!bx) return;
    bx.setTransform(d, 0, 0, d, 0, 0);
    bx.lineWidth = 1;
    bx.strokeStyle = 'rgba(159,176,170,.16)';
    bx.beginPath();
    adj.forEach((l, i) => {
      l.forEach((j) => {
        if (j > i) {
          bx.moveTo(nodes[i]!.x, nodes[i]!.y);
          bx.lineTo(nodes[j]!.x, nodes[j]!.y);
        }
      });
    });
    bx.stroke();
    bx.fillStyle = 'rgba(207,222,217,.55)';
    nodes.forEach((nd) => {
      bx.beginPath();
      bx.arc(nd.x, nd.y, 2, 0, 6.283);
      bx.fill();
    });
  };
  const walk = (from: number, len: number) => {
    const path = [from];
    let prev = -1;
    for (let k = 0; k < len; k++) {
      const c = adj[path[path.length - 1]!]!.filter((j) => j !== prev && path.indexOf(j) < 0);
      if (!c.length) break;
      prev = path[path.length - 1]!;
      path.push(c[(Math.random() * c.length) | 0]!);
    }
    return path;
  };
  const spawn = (now: number) => {
    if (!nodes.length) return;
    const r = Math.random();
    const from = (Math.random() * nodes.length) | 0;
    if (r < 0.62) {
      const p = walk(from, 3 + ((Math.random() * 3) | 0));
      if (p.length > 1) sig.push({ path: p, t0: now, kind: 'need', reply: true });
    } else sig.push({ path: walk(from, 4 + ((Math.random() * 3) | 0)), t0: now, kind: r < 0.81 ? 'rec' : 'joint' });
  };
  let raf = 0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (!visible || document.hidden || !base) return;
    if (now - last > (reduce ? 1e9 : 650)) {
      last = now;
      spawn(now);
    }
    cx.clearRect(0, 0, W, H);
    cx.drawImage(base, 0, 0, W, H);
    for (let s = sig.length - 1; s >= 0; s--) {
      const g = sig[s]!;
      const segs = g.path.length - 1;
      const dur = segs * 520;
      const k = (now - g.t0) / dur;
      if (k >= 1 || segs < 1) {
        const end = nodes[g.path[segs]!];
        if (end) {
          end.glow = 1;
          end.col = KIND[g.kind][0];
        }
        if (g.reply) sig.push({ path: g.path.slice().reverse(), t0: now + 160, kind: 'part' });
        sig.splice(s, 1);
        continue;
      }
      if (k < 0) continue;
      const f = k * segs;
      const i0 = Math.floor(f);
      const u = f - i0;
      const a = nodes[g.path[i0]!]!;
      const b = nodes[g.path[i0 + 1]!]!;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      const c = KIND[g.kind];
      cx.strokeStyle = `rgba(${c[0]},.55)`;
      cx.lineWidth = 1.6;
      if (c[1]) cx.setLineDash([4, 4]);
      cx.beginPath();
      cx.moveTo(nodes[g.path[0]!]!.x, nodes[g.path[0]!]!.y);
      for (let q = 1; q <= i0; q++) cx.lineTo(nodes[g.path[q]!]!.x, nodes[g.path[q]!]!.y);
      cx.lineTo(x, y);
      cx.stroke();
      cx.setLineDash([]);
      const gr = cx.createRadialGradient(x, y, 0, x, y, 12);
      gr.addColorStop(0, `rgba(${c[0]},1)`);
      gr.addColorStop(1, `rgba(${c[0]},0)`);
      cx.fillStyle = gr;
      cx.beginPath();
      cx.arc(x, y, 12, 0, 6.283);
      cx.fill();
    }
    nodes.forEach((n) => {
      if (n.glow > 0) {
        cx.fillStyle = `rgba(${n.col},${(n.glow * 0.9).toFixed(3)})`;
        cx.beginPath();
        cx.arc(n.x, n.y, 3 + n.glow * 4, 0, 6.283);
        cx.fill();
        n.glow = Math.max(0, n.glow - 0.012);
      }
    });
  };
  const onResize = () => {
    if (cv.clientWidth !== W || cv.clientHeight !== H) build();
  };
  build();
  addEventListener('resize', onResize);
  const io = new IntersectionObserver(
    (es) => {
      visible = es[0]!.isIntersecting;
    },
    { threshold: 0.1 },
  );
  io.observe(cv);
  raf = requestAnimationFrame(draw);
  return {
    update(next) {
      if (next.rtl !== rtl) {
        rtl = next.rtl;
        build();
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      io.disconnect();
      base = null;
    },
  };
}
