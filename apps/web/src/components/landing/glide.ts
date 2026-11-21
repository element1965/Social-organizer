/**
 * The finish of the scroll for the whole landing, and on touch screens the scrolling itself.
 *
 * Rest points: the middle of every story beat (its words centred, its animation done), the top of every section
 * after the story, for a section taller than the screen also its last screen, and the very bottom of the page.
 * Inside a section taller than the screen nothing pulls: the reader scrolls through it freely.
 *
 * Wheel and keys keep the native scrolling: when a gesture ends between rest points, the page glides to the
 * nearest one in the direction of the gesture, never the one it started from, so it never pulls the reader back;
 * a gesture shorter than 40 px changes nothing; any wheel, key or click cancels a glide.
 *
 * Touch: the page follows the finger itself, so one fling cannot carry the reader past half the story. A swipe
 * in the story moves one beat; the momentum is shorter than the native one and stops at the next rest point
 * ahead (the top of the next section, the last screen of a tall one), so no section can be skipped. Taps,
 * horizontal drags, two fingers, a zoomed-in page, form controls and boxes that scroll on their own keep the
 * native behaviour. Off with prefers-reduced-motion. Ported from the concept prototype (v8/v9).
 */
export function initGlide(beats: HTMLElement[], main: HTMLElement, root: HTMLElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const html = document.documentElement;
  /** Taller than this many screens, a section scrolls freely and gets a rest point at its end too. */
  const TALL = 1.02;
  /** Touch momentum: the distance a fling travels per px/ms of finger speed (the native one is about 500). */
  const MOMENTUM_MS = 260;
  let idle = 0;
  let anim = 0;
  let touching = false;
  let anchorY = scrollY; // where the page rested before the current gesture

  const sections = () => Array.from(main.querySelectorAll<HTMLElement>(':scope > .sec'));
  const maxY = () => html.scrollHeight - innerHeight;
  const restPoints = () => {
    const pts = beats.map((b, k) => {
      const r = b.getBoundingClientRect();
      return k === 0 ? r.top + scrollY : r.top + scrollY + r.height * 0.5 - innerHeight * 0.5;
    });
    for (const sec of sections()) {
      const r = sec.getBoundingClientRect();
      const top = r.top + scrollY;
      pts.push(top);
      if (r.height > innerHeight * TALL) pts.push(top + r.height - innerHeight);
    }
    const max = maxY();
    pts.push(max); // the very bottom, so the footer can always be reached
    return pts.map((v) => Math.max(0, Math.min(max, v))).sort((a, b) => a - b);
  };
  /** Inside a tall section, between its top and its last screen: the reader is reading, nothing pulls. */
  const inFreeZone = (y: number) =>
    sections().some((sec) => {
      const r = sec.getBoundingClientRect();
      if (r.height <= innerHeight * TALL) return false;
      const top = r.top + scrollY;
      return y > top + 1 && y < top + r.height - innerHeight - 1;
    });
  /** The rest point nearest to y among those in the direction dir from `from`, never `from` itself. */
  const nearestAhead = (pts: number[], from: number, y: number, dir: number) => {
    let best: number | null = null;
    let bd = Infinity;
    for (const v of pts) {
      if (Math.abs(v - from) < 6 || Math.sign(v - from) !== dir) continue;
      const d = Math.abs(v - y);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  };

  const setScroll = (y: number) => window.scrollTo(0, Math.max(0, Math.min(maxY(), y)));
  const stop = () => {
    if (anim) {
      cancelAnimationFrame(anim);
      anim = 0;
      anchorY = scrollY;
      html.style.scrollBehavior = '';
    }
  };
  const finish = () => {
    anim = 0;
    anchorY = scrollY;
    touching = false;
    html.style.scrollBehavior = '';
  };
  /** Glides to `to`; `speed` (px/ms) is the speed it starts with, so a fling flows on instead of jumping. */
  const glideTo = (to: number, speed = 0) => {
    const y0 = scrollY;
    const dy = Math.max(0, Math.min(maxY(), to)) - y0;
    if (Math.abs(dy) < 1) {
      finish();
      return;
    }
    // CSS smooth scrolling would animate every step of the glide
    html.style.scrollBehavior = 'auto';
    const t0 = performance.now();
    let dur: number;
    let curve: (x: number) => number;
    if (speed > 0.05) {
      // ease-out cubic starts at three times its average speed
      dur = Math.min(1100, Math.max(260, (3 * Math.abs(dy)) / speed));
      curve = (x) => 1 - Math.pow(1 - x, 3);
    } else {
      dur = Math.min(950, 380 + Math.abs(dy) * 0.6);
      curve = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    }
    anchorY = Math.max(0, Math.min(maxY(), to));
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      setScroll(y0 + dy * curve(k));
      if (k < 1) anim = requestAnimationFrame(step);
      else finish();
    };
    anim = requestAnimationFrame(step);
  };

  // ---- wheel and keys: native scrolling, finished when the gesture ends ----
  const settle = () => {
    if (anim || touching) return;
    const y0 = scrollY;
    const from = anchorY;
    if (Math.abs(y0 - from) < 40 || inFreeZone(y0)) {
      anchorY = y0;
      return;
    }
    const dir = Math.sign(y0 - from);
    const best = nearestAhead(restPoints(), from, y0, dir);
    if (best === null || Math.abs(best - y0) < 3 || Math.abs(best - y0) > innerHeight * 1.1) {
      anchorY = y0;
      return;
    }
    glideTo(best);
  };
  const onScroll = () => {
    if (anim || touching) return;
    clearTimeout(idle);
    idle = window.setTimeout(settle, 190);
  };

  // ---- touch: the page follows the finger, then a short momentum that stops at the next rest point ----
  interface Track {
    x0: number;
    y0: number;
    s0: number;
    vertical: boolean;
    samples: [number, number][];
  }
  let track: Track | null = null;
  let dragFrame = 0;
  let dragY: number | null = null;
  let scrollContainers = new WeakMap<Element, boolean>();
  const onResize = () => { scrollContainers = new WeakMap(); };
  const NATIVE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="dialog"], [aria-modal="true"], [data-native-scroll]';
  const keepsNative = (target: EventTarget | null) => {
    if ((window.visualViewport?.scale ?? 1) > 1.01) return true; // zoomed in: one finger pans the zoom
    let n = target instanceof Element ? target : null;
    if (!n || !root.contains(n)) return true;
    for (; n && n !== root; n = n.parentElement) {
      if (n.matches(NATIVE)) return true;
      let scrollable = scrollContainers.get(n);
      if (scrollable === undefined) {
        const overflow = getComputedStyle(n).overflowY;
        scrollable = overflow === 'auto' || overflow === 'scroll';
        scrollContainers.set(n, scrollable);
      }
      if (scrollable && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  };
  const cancelTouch = () => {
    if (dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    dragY = null;
    track = null;
    if (touching) finish();
  };
  const flushDrag = () => {
    dragFrame = 0;
    if (dragY !== null) setScroll(dragY);
    dragY = null;
  };
  const onTouchStart = (e: TouchEvent) => {
    cancelTouch();
    if (e.touches.length !== 1 || keepsNative(e.target)) return;
    stop();
    clearTimeout(idle);
    const t = e.touches[0]!;
    track = { x0: t.clientX, y0: t.clientY, s0: scrollY, vertical: false, samples: [[e.timeStamp, t.clientY]] };
    touching = true;
    anchorY = scrollY;
  };
  const onTouchMove = (e: TouchEvent) => {
    const tr = track;
    if (!tr) return;
    if (e.touches.length !== 1 || !e.cancelable) {
      cancelTouch();
      return;
    }
    const t = e.touches[0]!;
    const dx = t.clientX - tr.x0;
    const dy = t.clientY - tr.y0;
    if (!tr.vertical) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        cancelTouch();
        return;
      }
      tr.vertical = true;
      html.style.scrollBehavior = 'auto';
    }
    e.preventDefault();
    dragY = tr.s0 - dy;
    if (!dragFrame) dragFrame = requestAnimationFrame(flushDrag);
    tr.samples.push([e.timeStamp, t.clientY]);
    while (tr.samples.length > 2 && e.timeStamp - tr.samples[0]![0] > 100) tr.samples.shift();
  };
  const onTouchEnd = (e: TouchEvent) => {
    const tr = track;
    if (!tr?.vertical) return cancelTouch();
    track = null;
    // the speed of the last 100 ms of the gesture; a finger that rested before lifting has none
    let v = 0;
    const s = tr.samples;
    const lastS = s[s.length - 1]!;
    if (s.length >= 2 && e.timeStamp - lastS[0] < 60) {
      const firstS = s[0]!;
      v = -(lastS[1] - firstS[1]) / Math.max(16, lastS[0] - firstS[0]);
    }
    if (dragFrame) cancelAnimationFrame(dragFrame);
    flushDrag();
    touching = false;
    release(tr.s0, v);
  };
  const release = (from: number, v: number) => {
    const y0 = scrollY;
    const moved = y0 - from;
    const dir = Math.sign(Math.abs(moved) > 2 ? moved : v);
    if (!dir || (Math.abs(moved) < 40 && Math.abs(v) < 0.3)) {
      finish();
      return;
    }
    const pts = restPoints();
    // the next rest point ahead of the finger: the momentum may not carry past it
    const ahead = dir > 0 ? pts.find((p) => p > y0 + 1) : [...pts].reverse().find((p) => p < y0 - 1);
    let target = y0 + v * MOMENTUM_MS;
    if (Math.sign(target - y0) !== dir) target = y0;
    if (ahead !== undefined && (dir > 0 ? target > ahead : target < ahead)) target = ahead;
    let dest: number;
    if (inFreeZone(target)) dest = target; // reading a tall section: just the momentum
    else if (Math.abs(v) < 0.3) dest = nearestAhead(pts, from, y0, dir) ?? ahead ?? target; // a slow drag
    else dest = ahead ?? target;
    glideTo(dest, Math.abs(v));
  };

  const cancelEvents = ['wheel', 'keydown', 'mousedown'] as const;
  for (const ev of cancelEvents) addEventListener(ev, stop, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize, { passive: true });
  addEventListener('touchstart', onTouchStart, { passive: true });
  // The browser must see the blocking listener before a gesture starts, even during a busy touch-down.
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  addEventListener('touchend', onTouchEnd, { passive: true });
  addEventListener('touchcancel', cancelTouch, { passive: true });
  if (import.meta.env.DEV) (window as unknown as { __lvRest?: () => number[] }).__lvRest = () => restPoints().map(Math.round);
  return () => {
    stop();
    cancelTouch();
    clearTimeout(idle);
    html.style.scrollBehavior = '';
    for (const ev of cancelEvents) removeEventListener(ev, stop);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    removeEventListener('touchend', onTouchEnd);
    removeEventListener('touchcancel', cancelTouch);
    if (import.meta.env.DEV) delete (window as unknown as { __lvRest?: unknown }).__lvRest;
  };
}
