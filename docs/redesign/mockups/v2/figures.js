/* Explainer figures shared by onboarding, the site and the /how page.
   One language: people are avatars with initials, you are the care avatar, handshake depth is a ring,
   an action is a care highlight with a moving pulse, money is a warm coin with the amount. */

const FIG_FONT = 'font-family="Manrope, sans-serif"';

/* The network around you in three frames: 0 rings, 1 request path, 2 chat. viewBox 320×300. */
function netFigure(step) {
  const C = { x: 160, y: 150 }, R1 = 74, R2 = 126;
  const P = (a, r) => ({ x: C.x + Math.cos(a * Math.PI / 180) * r, y: C.y + Math.sin(a * Math.PI / 180) * r });
  const NAMES = ["Кира", "Олег", "Ира", "Дима", "Лена", "Макс"]; // -90, -30, 30, 90, 150, 210
  const ring1 = NAMES.map((n, i) => ({ n, i, ...P(-90 + i * 60, R1) }));
  const kids = [];
  ring1.forEach((p, i) => [-18, 18].forEach((d, k) => kids.push({ p: i, k, ...P(-90 + i * 60 + d, R2) })));
  const asker = kids.find(k => k.p === 1 && k.k === 1); // top-right, child of "И"
  const hi = step === 1 ? new Set(["me", "r1-1", "k-1-1"]) : step === 2 ? new Set(["r1-1", "r1-4", "k-1-1"]) : new Set();
  const dim = step > 0;
  const glyph = (x, y, r, color) => `<circle cx="${x}" cy="${(+y - r * .2).toFixed(1)}" r="${(r * .27).toFixed(1)}" fill="${color}"/><path d="M${(+x - r * .52).toFixed(1)} ${(+y + r * .66).toFixed(1)} a${(r * .52).toFixed(1)} ${(r * .52).toFixed(1)} 0 0 1 ${(r * 1.04).toFixed(1)} 0z" fill="${color}"/>`;
  const lbl = (x, y, r, name, color) => name ? `<text x="${x}" y="${(+y + r + 13).toFixed(1)}" text-anchor="middle" ${FIG_FONT} font-size="11" font-weight="700" fill="${color}">${name}</text>` : "";
  const ava = (x, y, r, name, cls) => `<g class="${cls}"><circle cx="${x}" cy="${y}" r="${r}" fill="var(--paper)" stroke="var(--line-strong)" stroke-width="1.5"/>${glyph(x, y, r, "var(--ink)")}${lbl(x, y, r, name, "var(--muted)")}</g>`;
  const avaHot = (x, y, r, name) => `<g><circle cx="${x}" cy="${y}" r="${r}" fill="var(--care-soft)" stroke="var(--care)" stroke-width="2"/>${glyph(x, y, r, "var(--care)")}${lbl(x, y, r, name, "var(--care)")}</g>`;
  let base = `<circle cx="${C.x}" cy="${C.y}" r="${R1}" fill="none" stroke="var(--line)" stroke-dasharray="2 6" stroke-linecap="round"/><circle cx="${C.x}" cy="${C.y}" r="${R2}" fill="none" stroke="var(--line)" stroke-dasharray="2 6" stroke-linecap="round" opacity=".8"/>`;
  base += ring1.map(p => `<line x1="${C.x}" y1="${C.y}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="var(--line-strong)" stroke-width="1.5"/>`).join("");
  base += kids.map(k => `<line x1="${ring1[k.p].x.toFixed(1)}" y1="${ring1[k.p].y.toFixed(1)}" x2="${k.x.toFixed(1)}" y2="${k.y.toFixed(1)}" stroke="var(--line)" stroke-width="1.2"/>`).join("");
  base += kids.map(k => (k === asker && step > 0) ? "" : `<circle cx="${k.x.toFixed(1)}" cy="${k.y.toFixed(1)}" r="7" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="1.2"/>`).join("");
  base += ring1.map(p => hi.has("r1-" + p.i) ? "" : ava(p.x.toFixed(1), p.y.toFixed(1), 17, p.n, "")).join("");
  const you = (hot) => `<g>${step === 0 ? `<circle cx="${C.x}" cy="${C.y}" r="32" fill="none" stroke="var(--care)" stroke-width="1.5" opacity=".45"/>` : ""}<circle cx="${C.x}" cy="${C.y}" r="22" fill="var(--care)"/><text x="${C.x}" y="${C.y + 5}" text-anchor="middle" ${FIG_FONT} font-size="13" font-weight="800" fill="var(--on-care)">Вы</text></g>`;
  let top = "";
  if (step === 1) {
    const o = ring1[1];
    top += `<path d="M${asker.x.toFixed(1)} ${asker.y.toFixed(1)} L${o.x.toFixed(1)} ${o.y.toFixed(1)} L${C.x} ${C.y}" fill="none" stroke="var(--care)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    top += avaHot(o.x.toFixed(1), o.y.toFixed(1), 17, o.n) + avaHot(asker.x.toFixed(1), asker.y.toFixed(1), 15, "Мария");
    top += `<g><rect x="${(asker.x - 40).toFixed(1)}" y="${(asker.y - 40).toFixed(1)}" width="50" height="22" rx="11" fill="var(--care)"/><text x="${(asker.x - 15).toFixed(1)}" y="${(asker.y - 25).toFixed(1)}" text-anchor="middle" ${FIG_FONT} font-size="11" font-weight="800" fill="var(--on-care)">300 $</text></g>`;
    top += `<circle r="5" fill="var(--care)"><animateMotion dur="2.2s" repeatCount="indefinite" path="M${asker.x.toFixed(1)} ${asker.y.toFixed(1)} L${o.x.toFixed(1)} ${o.y.toFixed(1)} L${C.x} ${C.y}"/></circle>`;
    top += you(true);
  } else if (step === 2) {
    const card = { x: 62, y: 236, w: 196, h: 54 };
    const cx = card.x + card.w / 2;
    [ring1[4], ring1[1], asker].forEach(p => { top += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${cx}" y2="${card.y + 2}" stroke="var(--care)" stroke-width="2" stroke-linecap="round" opacity=".7"/>`; });
    top += avaHot(ring1[4].x.toFixed(1), ring1[4].y.toFixed(1), 17, ring1[4].n) + avaHot(ring1[1].x.toFixed(1), ring1[1].y.toFixed(1), 17, ring1[1].n) + avaHot(asker.x.toFixed(1), asker.y.toFixed(1), 15, "Мария");
    top += you(false);
    top += `<g><rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="27" fill="var(--paper)" stroke="var(--line)"/>`;
    [["care", "on-care", "М"], ["ink", "canvas", "О"], ["muted", "canvas", "Л"]].forEach(([bg, fg, t], i) => { const x = card.x + 26 + i * 18; top += `<circle cx="${x}" cy="${card.y + 27}" r="12" fill="var(--${bg})" stroke="var(--paper)" stroke-width="2"/>${glyph(x, card.y + 27, 11, `var(--${fg})`)}`; });
    top += `<text x="${card.x + 86}" y="${card.y + 23}" ${FIG_FONT} font-size="13" font-weight="800" fill="var(--ink)">Чат сбора</text><text x="${card.x + 86}" y="${card.y + 40}" ${FIG_FONT} font-size="11" font-weight="700" fill="var(--muted)">Мария · Олег · Лена</text></g>`;
  } else {
    top += you(false);
  }
  return `<svg viewBox="0 0 320 300" role="img" aria-label="Схема круга"><g opacity="${dim ? .38 : 1}">${base}</g>${top}</svg>`;
}

/* The hui table: six seats, a pot in the middle, coins that go to the pot and then to the taker. */
function mountHui(root, opts) {
  const o = opts || {};
  const NAMES = o.names || ["Линь", "Чен", "Мэй", "Го", "Сунь", "Хуан"];
  const MONTHS = o.months || ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь"];
  const SHARE = o.share || 15;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || o.static;
  root.classList.add("hui-ring");
  const S = root.clientWidth || 440, c = S / 2, R = S * .4;
  const seat = (i) => { const a = (-90 + i * 60) * Math.PI / 180; return { x: c + Math.cos(a) * R, y: c + Math.sin(a) * R }; };
  const arcPath = (m) => { if (m === 0) return ""; const a0 = -90, a1 = -90 + m * 60; const p = (a) => `${(c + Math.cos(a * Math.PI / 180) * R).toFixed(1)} ${(c + Math.sin(a * Math.PI / 180) * R).toFixed(1)}`; return `M${p(a0)} A${R} ${R} 0 ${m * 60 > 180 ? 1 : 0} 1 ${p(a1)}`; };
  root.innerHTML = `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--line)" stroke-width="1.5"/>${NAMES.map((_, i) => { const p = seat(i); return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--line-strong)"/>`; }).join("")}<path class="arc" d="" fill="none" stroke="var(--care)" stroke-width="4" stroke-linecap="round"/></svg>
<div class="pot"><span class="mon"></span><b class="sum"></b><small class="note"></small></div>
${NAMES.map((n, i) => { const p = seat(i); return `<button type="button" class="seat" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px" data-i="${i}"><span class="badge"></span><span class="ava"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.4" r="4.2" fill="currentColor"/><path d="M4 21.5a8 8 0 0 1 16 0z" fill="currentColor"/></svg></span><span class="nm">${n}</span></button>`; }).join("")}
${NAMES.map((_, i) => `<span class="coin" data-i="${i}">${SHARE}</span>`).join("")}`;
  const seats = [...root.querySelectorAll(".seat")], coins = [...root.querySelectorAll(".coin")];
  const pot = root.querySelector(".pot"), mon = pot.querySelector(".mon"), sum = pot.querySelector(".sum"), note = pot.querySelector(".note"), arc = root.querySelector(".arc");
  let month = 0, stage = 0, t1 = 0, t2 = 0, listeners = [];
  const givers = () => NAMES.map((_, i) => i).filter(i => i !== month);
  function placeCoins() {
    coins.forEach((el, i) => {
      el.style.transition = reduce ? "none" : "";
      if (i === month) { el.style.opacity = "0"; return; }
      const p = seat(i); const k = givers().indexOf(i);
      if (stage === 0) { const a = (-90 + i * 60) * Math.PI / 180; el.style.left = (c + Math.cos(a) * R * .72) + "px"; el.style.top = (c + Math.sin(a) * R * .72) + "px"; el.style.opacity = "1"; }
      else if (stage === 1) { el.style.left = (c + (k - 2) * 24) + "px"; el.style.top = (c - 54) + "px"; el.style.opacity = "1"; }
      else { el.style.left = p.x + "px"; el.style.top = p.y + "px"; el.style.opacity = "0"; }
    });
  }
  function paint() {
    seats.forEach((el, i) => { el.classList.toggle("on", i === month && stage >= 1); el.classList.toggle("got", i === month && stage === 2); el.querySelector(".badge").textContent = `+${SHARE * 5} $`; el.setAttribute("aria-pressed", String(i === month)); });
    mon.textContent = MONTHS[month];
    sum.textContent = stage === 0 ? `5 × ${SHARE} $` : `${SHARE * 5} $`;
    note.textContent = stage === 0 ? "каждый кладёт долю" : stage === 1 ? "доли на столе" : `забирает ${NAMES[month]}`;
    arc.setAttribute("d", arcPath(month + (stage === 2 ? 1 : 0)));
    listeners.forEach(f => f(month, stage));
  }
  function run() {
    clearTimeout(t1); clearTimeout(t2);
    if (reduce) { stage = o.static ? (o.stage ?? 1) : 2; placeCoins(); paint(); return; }
    stage = 0; placeCoins(); paint();
    t1 = setTimeout(() => { stage = 1; placeCoins(); paint(); }, 260);
    t2 = setTimeout(() => { stage = 2; placeCoins(); paint(); }, 1500);
  }
  function go(m) { month = m; run(); }
  seats.forEach(el => el.onclick = () => go(+el.dataset.i));
  const api = { go, get month() { return month; }, onChange: (f) => listeners.push(f) };
  go(o.month || 0);
  return api;
}
