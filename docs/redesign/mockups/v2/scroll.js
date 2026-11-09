/* Scroll-driven playback for the site and /how: figures play their sequence when they come into view,
   sections and cards fade in once. Everything collapses to the final state under prefers-reduced-motion. */
const SCROLL_REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* call cb when at least `threshold` of el is visible; repeat on every entry when opts.repeat */
function onEnter(el, cb, opts) {
  const o = opts || {};
  if (!el || !("IntersectionObserver" in window)) { cb(); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { cb(e); if (!o.repeat) io.unobserve(el); } });
  }, { threshold: o.threshold ?? .5, rootMargin: o.rootMargin || "0px" });
  io.observe(el);
}

/* a sequence of steps with a gap between them; re-running cancels the previous run */
function seq(fn, steps, gap) {
  let timers = [];
  return () => {
    timers.forEach(clearTimeout);
    if (SCROLL_REDUCE) { fn(steps[steps.length - 1]); return; }
    timers = steps.map((k, i) => setTimeout(() => fn(k), i * gap));
  };
}

/* fade-in for sections and cards; cards inside one container come in with an 80 ms stagger */
function reveal(root) {
  const r = root || document;
  r.querySelectorAll(".hero, .sec, .cta, .hero1").forEach((el) => { el.classList.add("rv"); onEnter(el, () => el.classList.add("in"), { threshold: .15 }); });
  r.querySelectorAll(".steps, .nots, .stores").forEach((box) => {
    const kids = [...box.children];
    kids.forEach((k, i) => { k.classList.add("rv"); k.style.transitionDelay = (i * 80) + "ms"; });
    onEnter(box, () => kids.forEach((k) => k.classList.add("in")), { threshold: .2 });
  });
}
