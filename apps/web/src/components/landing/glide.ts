/**
 * A gentle finish of the scroll for the whole landing. Rest points: the middle of every story beat (its words
 * centred, its animation done), the top of every section after the story, for a section clearly taller than the
 * screen also its bottom, and the very bottom of the page. When a scroll gesture ends, the page glides to the nearest rest
 * point in the direction of the gesture, never the one it started from, so it never pulls the reader back; a gesture shorter than 40 px
 * changes nothing; inside a tall section the reader scrolls freely; any wheel, touch or key cancels a glide.
 * Off with prefers-reduced-motion. Ported from the concept prototype (v8/v9).
 */
export function initGlide(beats: HTMLElement[], main: HTMLElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let idle = 0;
  let anim = 0;
  let anchorY = scrollY; // where the page rested before the current gesture
  const sections = () => Array.from(main.querySelectorAll<HTMLElement>(':scope > .sec'));
  const restPoints = () => {
    const pts = beats.map((b, k) => {
      const r = b.getBoundingClientRect();
      return k === 0 ? r.top + scrollY : r.top + scrollY + r.height * 0.5 - innerHeight * 0.5;
    });
    for (const sec of sections()) {
      const r = sec.getBoundingClientRect();
      const top = r.top + scrollY;
      pts.push(top);
      // a section only a little taller than the screen keeps one stop: two stops a few pixels apart would pull
      // a scroll that left the section back into it
      if (r.height > innerHeight * 1.2) pts.push(top + r.height - innerHeight);
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    pts.push(max); // the very bottom, so the footer can always be reached
    return pts.map((v) => Math.max(0, Math.min(max, v))).sort((a, b) => a - b);
  };
  const inFreeZone = (y: number) =>
    sections().some((sec) => {
      const r = sec.getBoundingClientRect();
      const top = r.top + scrollY;
      const bottom = top + r.height - innerHeight;
      return r.height > innerHeight * 1.05 && y > top + innerHeight * 0.2 && y < bottom - innerHeight * 0.2;
    });
  const cancel = () => {
    if (anim) {
      cancelAnimationFrame(anim);
      anim = 0;
      anchorY = scrollY;
    }
  };
  const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const settle = () => {
    const y0 = scrollY;
    const from = anchorY;
    if (anim) return;
    if (Math.abs(y0 - from) < 40 || inFreeZone(y0)) {
      anchorY = y0;
      return;
    }
    const pts = restPoints();
    const startPt = pts.find((v) => Math.abs(v - from) < 6);
    // only rest points the gesture went towards: two close points (a tall section's top and bottom) must not
    // turn a scroll up into a glide down
    const dir = Math.sign(y0 - from);
    let best: number | null = null;
    let bd = Infinity;
    for (const v of pts) {
      if (v === startPt || Math.sign(v - from) !== dir) continue;
      const d = Math.abs(v - y0);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (best === null || bd < 3 || bd > innerHeight * 1.1) {
      anchorY = y0;
      return;
    }
    const dy = best - y0;
    const t0 = performance.now();
    const dur = Math.min(950, 380 + Math.abs(dy) * 0.6);
    anchorY = best;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      window.scrollTo({ top: y0 + dy * easeIO(k), behavior: 'instant' });
      anim = k < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  };
  const onScroll = () => {
    if (anim) return;
    clearTimeout(idle);
    idle = window.setTimeout(settle, 190);
  };
  const cancelEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
  for (const ev of cancelEvents) addEventListener(ev, cancel, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  if (import.meta.env.DEV) (window as unknown as { __lvRest?: () => number[] }).__lvRest = () => restPoints().map(Math.round);
  return () => {
    cancel();
    clearTimeout(idle);
    for (const ev of cancelEvents) removeEventListener(ev, cancel);
    removeEventListener('scroll', onScroll);
    if (import.meta.env.DEV) delete (window as unknown as { __lvRest?: unknown }).__lvRest;
  };
}
