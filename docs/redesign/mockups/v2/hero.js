/* Hero scene for the site: a living network that tells the idea in a loop.
   A request lights up at the edge, travels by handshakes to you, a wave tells everyone,
   shares come back from all over the network until the ring around the asker is full. */
function heroScene(canvas, opts) {
  const o = opts || {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const COL = { n1: "#e7eeeb", n2: "#9fb0aa", n3: "#5f7069", care: "#5fd3c6", bright: "#0d9488", warm: "#f2be68", star: "rgba(231,238,235,.9)", edge: "rgba(231,238,235,.13)", ink: "#0b1513" };
  let W = 560, H = 480, dpr = 1;
  const fit = () => { const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(2, devicePixelRatio || 1); canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit(); addEventListener("resize", fit);
  let s = 11; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;

  /* network: three rings around you */
  const C = () => ({ x: W / 2, y: H / 2 + 6 });
  const RING = [{ n: 6, r: .145, size: 6.5 }, { n: 16, r: .285, size: 4.8 }, { n: 30, r: .42, size: 3.4 }];
  const nodes = [{ ring: -1, a: 0, rr: 0, j: 0, ph: 0, parent: null }];
  RING.forEach((ring, k) => { for (let i = 0; i < ring.n; i++) { const a = (i / ring.n) * Math.PI * 2 + (R() - .5) * .25 - Math.PI / 2; const rr = ring.r * (1 + (R() - .5) * .14); nodes.push({ ring: k, a, rr, size: ring.size, ph: R() * Math.PI * 2, parent: null }); } });
  nodes.forEach((n) => { if (n.ring <= 0) { n.parent = n.ring === 0 ? 0 : null; return; } let best = -1, bd = 9; nodes.forEach((m, j) => { if (m.ring !== n.ring - 1) return; let d = Math.abs(((n.a - m.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (d < bd) { bd = d; best = j; } }); n.parent = best; });
  const stars = []; for (let i = 0; i < 70; i++) stars.push({ x: R(), y: R(), r: R() * .9 + .3, o: R() * .5 + .15 });
  const pos = (n, t) => { if (n.ring < 0) return C(); const c = C(), base = Math.min(W, H); const d = Math.sin(t * .7 + n.ph) * 3; return { x: c.x + Math.cos(n.a) * (n.rr * base + d), y: c.y + Math.sin(n.a) * (n.rr * base + d) }; };
  const pathTo = (i) => { const p = []; let k = i; while (k != null && k >= 0) { p.push(k); if (k === 0) break; k = nodes[k].parent; } return p; }; // asker → … → you
  const ring3 = nodes.map((n, i) => n.ring === 2 ? i : -1).filter(i => i >= 0);

  /* story: one loop of 10 s */
  const T = 10, phases = { ask: [0, .8], signal: [.8, 2.8], wave: [2.8, 4.2], help: [4.2, 7.8], done: [7.8, 10] };
  let cycle = 0, asker = ring3[3], path = pathTo(asker), helpers = [];
  const pickHelpers = () => { const c = []; const pool = nodes.map((n, i) => i).filter(i => i !== 0 && i !== asker && !path.includes(i)); while (c.length < 6 && pool.length) c.push(pool.splice(Math.floor(R() * pool.length), 1)[0]); return c; };
  helpers = pickHelpers();
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const along = (pts, k) => { const segs = pts.length - 1; const f = Math.min(segs - 1e-6, Math.max(0, k * segs)); const i = Math.floor(f); return lerp(pts[i], pts[i + 1], f - i); };
  const pill = (x, y, txt, fill, color) => { ctx.font = "700 12px Manrope, sans-serif"; const w = ctx.measureText(txt).width + 20; ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 11, w, 22, 11); ctx.fill(); ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, x, y + 1); };
  const dot = (p, r, fill, glow) => { if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; } ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; };

  function frame(tAbs) {
    const t = reduce ? 2.8 : (tAbs / 1000) % T;
    const cyc = reduce ? 0 : Math.floor(tAbs / 1000 / T);
    if (cyc !== cycle) { cycle = cyc; asker = ring3[(cycle * 7 + 3) % ring3.length]; path = pathTo(asker); helpers = pickHelpers(); }
    ctx.clearRect(0, 0, W, H);
    stars.forEach(st => { ctx.globalAlpha = st.o; dot({ x: st.x * W, y: st.y * H }, st.r, COL.star); }); ctx.globalAlpha = 1;
    const c = C(), base = Math.min(W, H);
    const g = ctx.createRadialGradient(c.x, c.y - 10, 10, c.x, c.y, base * .5); g.addColorStop(0, "rgba(27,51,46,.95)"); g.addColorStop(.7, "rgba(19,36,32,.4)"); g.addColorStop(1, "rgba(11,21,19,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, base * .5, 0, Math.PI * 2); ctx.fill();
    const P = nodes.map(n => pos(n, t + cycle * T));
    const pathPts = path.map(i => P[i]);
    const inSignal = t >= phases.signal[0] && t < phases.signal[1];
    const sigK = inSignal ? ease((t - phases.signal[0]) / (phases.signal[1] - phases.signal[0])) : t >= phases.signal[1] ? 1 : 0;
    const lit = new Set(); if (sigK > 0) { const n = path.length - 1; for (let i = 0; i <= Math.floor(sigK * n + 1e-6); i++) lit.add(path[i]); }
    /* edges */
    ctx.lineWidth = 1; nodes.forEach((n, i) => { if (n.parent == null || n.parent < 0) return; const a = P[i], b = P[n.parent]; const hot = lit.has(i) && lit.has(n.parent); ctx.strokeStyle = hot ? COL.care : COL.edge; ctx.lineWidth = hot ? 2 : 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });
    /* wave */
    if (t >= phases.wave[0] && t < phases.wave[1]) { const k = (t - phases.wave[0]) / (phases.wave[1] - phases.wave[0]); ctx.strokeStyle = COL.care; ctx.globalAlpha = (1 - k) * .7; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, k * base * .47, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    const waveR = t >= phases.wave[0] ? Math.min(1, (t - phases.wave[0]) / (phases.wave[1] - phases.wave[0])) * base * .47 : 0;
    /* nodes */
    nodes.forEach((n, i) => { if (i === 0) return; const p = P[i]; const isHelper = helpers.includes(i) && t >= phases.help[0]; const d = Math.hypot(p.x - c.x, p.y - c.y); const heard = waveR > 0 && d <= waveR; const col = n.ring === 0 ? COL.n1 : n.ring === 1 ? COL.n2 : COL.n3; if (i === asker) return; dot(p, n.size + (lit.has(i) ? 1.5 : 0), lit.has(i) ? COL.care : heard && t < phases.help[0] ? COL.n1 : col, lit.has(i) ? COL.care : null); });
    /* you */
    dot(c, 13, COL.bright, COL.care); ctx.fillStyle = COL.n1; ctx.font = "800 11px Manrope, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Вы", c.x, c.y + 1);
    /* asker */
    const pa = P[asker]; const askK = t < phases.ask[1] ? ease(t / phases.ask[1]) : 1; const doneK = t >= phases.done[0] ? (t - phases.done[0]) / (phases.done[1] - phases.done[0]) : 0;
    const fade = doneK > .6 ? 1 - (doneK - .6) / .4 : 1;
    ctx.globalAlpha = fade; dot(pa, 5 + 4 * askK, COL.care, COL.care);
    /* help: coins from helpers to the asker, progress ring fills */
    let arrived = 0;
    if (t >= phases.help[0]) { helpers.forEach((h, j) => { const t0 = phases.help[0] + j * .42, dur = 1.5; const k = (t - t0) / dur; if (k < 0) return; if (k >= 1) { arrived++; return; } const route = [...pathTo(h).map(i => P[i]), ...path.slice(0, -1).reverse().map(i => P[i])]; const p = along(route, ease(k)); dot(p, 5, COL.warm, COL.warm); ctx.fillStyle = COL.ink; ctx.font = "800 7px Manrope, sans-serif"; ctx.fillText("15", p.x, p.y + .5); }); }
    if (arrived > 0) { ctx.strokeStyle = COL.warm; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(pa.x, pa.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * arrived / helpers.length); ctx.stroke(); }
    const full = arrived === helpers.length;
    if (askK > 0) pill(pa.x, pa.y - 28, full ? "собрано 300 $" : "просьба · 300 $", full ? COL.bright : "rgba(231,238,235,.14)", full ? COL.n1 : COL.n1);
    ctx.globalAlpha = 1;
    /* signal pulse */
    if (inSignal) { const p = along(pathPts, sigK); dot(p, 5, COL.care, COL.care); }
  }
  let raf = 0, running = false;
  const loop = (ts) => { frame(ts); if (running && !reduce) raf = requestAnimationFrame(loop); };
  const start = () => { if (running) return; running = true; raf = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach(e => e.isIntersecting ? start() : stop()), { threshold: .1 }).observe(canvas); else start();
  if (reduce) frame(0);
  return { start, stop };
}
