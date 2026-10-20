/**
 * Records the first-steps video instructions from a LOCAL instance only, per app locale:
 *   link — "you got a link: what next" (invite link → Telegram → request → inviter confirms → your network);
 *   app  — "you installed the app: what next" (register → invite friends / QR → confirm a request → SOS, contacts).
 *
 * Prereqs (same local stack as docs/regular-collection, see its mechanics.*.md section 7):
 *   - isolated local DB `so_video_demo` (seed-demo.mjs is re-run automatically before every take)
 *   - apps/api on :3001 (JWT_SECRET=local-video-demo, no REDIS_URL, no TELEGRAM_BOT_TOKEN)
 *   - apps/web (vite) on :3000 with VITE_WEB_APP_URL=http://localhost:3000
 * Run: DATABASE_URL=<local so_video_demo> PLAYWRIGHT_PATH=<.../playwright/index.js> node shoot-video.mjs <link|app|all> [locale ...|all]
 *   (default locale: ru). CHROMIUM_PATH overrides the browser binary, FFMPEG the encoder.
 *   STEPS_DIR=<dir> also writes <video>-<locale>.jpg: the 12 steps as one illustration sheet (screenshot + caption per step).
 * Output: apps/web/public/videos/<invite-link|app-start>/<locale>.mp4 (720x1280, captions on top), played by VideoGuide.tsx.
 *   Both the video and the sheet start with the "why" intro from why.mjs (the goal first, then the steps).
 * Captions come from captions.mjs; UI labels inside them and all selectors come from packages/i18n/locales.
 */
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS } from './captions.mjs';
import { prependWhyVideo, addWhyBanner } from './why.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(HERE, '../../packages/i18n/locales');
const VIDEOS_ROOT = path.join(HERE, '../../apps/web/public/videos');
const WEB = process.env.WEB || 'http://localhost:3000';
if (!/^http:\/\/localhost/.test(WEB)) throw new Error('local instance only');
if (!/localhost:5434\/so_video_demo/.test(process.env.DATABASE_URL || '')) throw new Error('DATABASE_URL must be local so_video_demo');
const JWT_SECRET = process.env.JWT_SECRET || 'local-video-demo';
const FFMPEG = process.env.FFMPEG || 'C:/ffmpeg/bin/ffmpeg.exe';
const SHOTS = process.env.SHOTS; // optional dir for debug screenshots
const STEPS_DIR = process.env.STEPS_DIR; // optional: also write a step-by-step illustration sheet per video/locale
const VIEW = { width: 390, height: 650 };
const FRAME = { w: 720, h: 1280 };
const SHOT = { w: 600, h: 1000, x: 60, y: 240 };
const CAP_H = 200;
const NEW_EMAIL = 'newcomer@example.com';

const { getDb } = await import(pathToFileURL(path.join(HERE, '../../packages/db/dist/index.js')).href);
const db = getDb();

// ---------- i18n: same resolution as the app (key in locale, fallback en, {{var}} interpolation)
const readLocale = (l) => JSON.parse(readFileSync(path.join(LOCALES_DIR, `${l}.json`), 'utf8'));
const EN = readLocale('en');
const dig = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
function i18nFor(l) {
  const json = readLocale(l);
  return (key, vars = {}) => {
    const v = dig(json, key) ?? dig(EN, key);
    if (typeof v !== 'string') throw new Error(`no i18n key ${key}`);
    return v.replace(/\{\{(\w+)\}\}/g, (_, n) => String(vars[n] ?? ''));
  };
}

function token(sub, type, ttl) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'HS256', typ: 'JWT' });
  const p = b({ sub, type, iat: now, exp: now + ttl });
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const auth = (uid) => ({ accessToken: token(uid, 'access', 3600), refreshToken: token(uid, 'refresh', 86400), userId: uid });

const OVERLAY = `((pos) => {
  if (document.getElementById('__cursor')) return;
  const cur = document.createElement('div'); cur.id='__cursor';
  cur.style.cssText='position:fixed;z-index:99999;width:22px;height:22px;pointer-events:none;left:0;top:0;opacity:0;';
  if (pos) { cur.style.transform='translate('+pos.x+'px,'+pos.y+'px)'; cur.style.opacity='1'; }
  cur.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M0,0 L0,26 L7,20 L12,31 L18,28 L13,17 L22,16 Z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
  document.body.appendChild(cur);
  const ring = document.createElement('div'); ring.id='__ring';
  ring.style.cssText='position:fixed;z-index:99997;border:3px solid #f59e0b;border-radius:10px;pointer-events:none;opacity:0;transition:opacity .2s, all .25s;box-shadow:0 0 0 9999px rgba(15,23,42,.18);';
  document.body.appendChild(ring);
  document.addEventListener('mousemove', (e) => { cur.style.opacity='1'; cur.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)'; }, true);
  window.__ringRect = (r) => { if (!r) { ring.style.opacity='0'; return; }
    Object.assign(ring.style, { opacity:'1', top:(r.y-5)+'px', left:(Math.max(3,r.x-5))+'px', width:(Math.min(window.innerWidth-6, r.width+10))+'px', height:(r.height+10)+'px' }); };
})`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Take {
  constructor(lines) { this.rec = Date.now(); this.caps = []; this.trim = 0; this.lines = lines; this.n = 0; this.stills = []; this.gaps = []; }
  at() { return (Date.now() - this.rec) / 1000; }
  reset() { this.trim = this.at(); this.gaps = []; }
  /** Page loads between these marks are cut from the video (no white flashes / spinners). */
  gapStart() { const g = this.gaps[this.gaps.length - 1]; if (!g || g[1] != null) this.gaps.push([this.at(), null]); }
  gapEnd() { const g = this.gaps[this.gaps.length - 1]; if (g && g[1] == null) g[1] = this.at(); }
  /** Next caption from captions.mjs (captions are consumed in scene order). */
  say() {
    const prev = this.caps[this.caps.length - 1];
    if (prev && prev.to == null) prev.to = this.at();
    this.caps.push({ from: this.at(), to: null, lines: this.lines[this.n++] });
  }
  /** Remember the current screen as the illustration for the caption on screen now. */
  async still(page) { if (!STEPS_DIR) return; await wait(500); this.stills.push({ img: (await page.screenshot()).toString('base64'), lines: this.lines[this.n - 1] }); }
  end() {
    const prev = this.caps[this.caps.length - 1];
    if (prev && prev.to == null) prev.to = this.at() + 1.5;
    if (this.n !== this.lines.length) throw new Error(`used ${this.n} of ${this.lines.length} captions`);
  }
}

let shotN = 0;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`) }); }

let mouse = null; // last cursor position, restored on the next page so the cursor does not jump to a corner
async function overlay(page) { await page.evaluate(`${OVERLAY}(${JSON.stringify(mouse)})`); }
async function focus(page, loc) {
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await wait(650);
  const b = await loc.boundingBox();
  if (!b) return;
  mouse = { x: b.x + Math.min(b.width / 2, 150), y: b.y + b.height / 2 };
  await page.mouse.move(mouse.x, mouse.y, { steps: 18 });
  await page.evaluate((r) => window.__ringRect(r), { x: b.x, y: b.y, width: b.width, height: b.height });
}
async function clear(page) { await page.evaluate(() => window.__ringRect(null)); }
async function click(page, loc) { await focus(page, loc); await wait(500); await clear(page); await loc.click(); }
async function type(page, loc, text) { await focus(page, loc); await loc.click(); await clear(page); await loc.pressSequentially(text, { delay: 70 }); }
let currentTake = null; // the take being recorded (for cutting page loads)
async function open(page, url) {
  currentTake?.gapStart();
  await page.goto(url, { waitUntil: 'networkidle' });
  await overlay(page);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 5000 }).catch(() => {});
  await wait(1000); // a fresh page may paint a few frames at 1x before the 2x scale applies — keep them inside the cut
  currentTake?.gapEnd();
}
async function login(page, uid, url, lang) {
  currentTake?.gapStart(); // switching the stored session blanks the current page — cut from here
  await page.evaluate(({ a, lang }) => { localStorage.clear(); localStorage.setItem('language', lang); for (const [k, v] of Object.entries(a)) localStorage.setItem(k, v); }, { a: auth(uid), lang });
  await open(page, url);
}
async function logout(page, url, lang) {
  currentTake?.gapStart();
  await page.evaluate((lang) => { localStorage.clear(); localStorage.setItem('language', lang); }, lang);
  await open(page, url);
}

/** The single pending request on /notifications: its row and its green "accept" button. */
const requestRow = (page, name) => page.getByText(name, { exact: true }).first().locator('xpath=ancestor::div[.//button[contains(@class,"bg-green-100")]][1]');
const acceptButton = (page) => page.locator('button.bg-green-100').first();
const handshake1 = (page, t) => page.getByText(t('dashboard.handshakeOrdinal', { depth: 1 })).first();

async function sceneLink(page, take, l, cap) {
  const t = i18nFor(l);
  const btn = (key) => page.getByRole('button', { name: t(key) }).first();

  await page.goto(`${WEB}/privacy`, { waitUntil: 'domcontentloaded' });
  await logout(page, `${WEB}/invite/demo-invite`, l);
  // The landing's WebGL globe renders as a white sheet in the local headless browser (production is dark);
  // hide that background layer so the dark page gradient shows, as on a real device.
  await page.addStyleTag({ content: '.fixed.inset-0.pointer-events-none:has(canvas){display:none!important}' });
  await wait(1500);
  take.reset();

  // 1. The link opens the landing page
  take.say();
  await wait(1200);
  await take.still(page);
  await wait(1400);
  take.say();
  await wait(1200);
  await take.still(page);
  await wait(1200);
  take.say();
  await focus(page, btn('landing.heroStart'));
  await take.still(page);
  await click(page, btn('landing.heroStart'));
  await wait(1800);
  take.say();
  await focus(page, page.getByText(t('landing.ctaButton')).first().locator('xpath=ancestor::a[1]'));
  await snap(page, 'cta');
  await take.still(page);
  await wait(3200);
  await clear(page);

  // 2. Telegram opens the same invite page, already signed in
  await login(page, 'u_new', `${WEB}/invite/demo-invite`, l);
  await page.getByText(t('pending.requestSent')).first().waitFor();
  await wait(800);
  take.say();
  await focus(page, page.locator('h2').first());
  await snap(page, 'invite');
  await take.still(page);
  await wait(3200);
  await clear(page);
  take.say();
  await focus(page, page.getByText(t('pending.requestSent')).first().locator('..'));
  await take.still(page);
  await wait(3000);
  await clear(page);

  // 3. The inviter confirms
  await login(page, 'u_inviter', `${WEB}/notifications`, l);
  await wait(1000);
  take.say();
  await focus(page, requestRow(page, cap.newcomer));
  await snap(page, 'request');
  await take.still(page);
  await wait(3200);
  await clear(page);
  take.say();
  await focus(page, acceptButton(page));
  await take.still(page);
  await wait(1800);
  await click(page, acceptButton(page));
  await wait(600);

  // 4. The newcomer is in the inviter's circle
  await login(page, 'u_new', `${WEB}/network`, l);
  await wait(1000);
  take.say();
  await click(page, handshake1(page, t));
  await wait(900);
  await focus(page, page.getByText(cap.inviter).first());
  await take.still(page);
  await snap(page, 'network');
  await wait(3000);
  await clear(page);

  // 5. Next steps: invite your own people, SOS
  await open(page, `${WEB}/dashboard`);
  await wait(1000);
  take.say();
  await focus(page, btn('dashboard.inviteTrusted'));
  await take.still(page);
  await wait(2800);
  take.say();
  await click(page, btn('dashboard.inviteTrusted'));
  await wait(4200);
  await snap(page, 'share');
  await take.still(page);
  await open(page, `${WEB}/dashboard`);
  await wait(600);
  take.say();
  await focus(page, page.getByText(t('nav.sos'), { exact: true }).first());
  await take.still(page);
  await wait(3200);
  await clear(page);
  take.end();
}

async function sceneApp(page, take, l, cap) {
  const t = i18nFor(l);
  const btn = (key) => page.getByRole('button', { name: t(key) }).first();

  await page.goto(`${WEB}/privacy`, { waitUntil: 'domcontentloaded' });
  await logout(page, `${WEB}/login`, l);
  await wait(1500);
  take.reset();

  // 1. Register
  take.say();
  await wait(1200);
  await take.still(page);
  await wait(1400);
  take.say();
  await focus(page, btn('auth.newUser'));
  await take.still(page);
  await click(page, btn('auth.newUser'));
  await wait(1200);
  take.say();
  await type(page, page.getByPlaceholder(t('auth.name'), { exact: true }), cap.newcomer);
  await type(page, page.getByPlaceholder(t('auth.email'), { exact: true }), NEW_EMAIL);
  await type(page, page.getByPlaceholder(t('auth.password'), { exact: true }), 'demo-pass-123');
  await wait(800);
  await snap(page, 'register');
  await take.still(page);
  take.say();
  await focus(page, btn('auth.register'));
  await take.still(page);
  await click(page, btn('auth.register'));
  take.gapStart();
  await page.waitForURL(/\/dashboard/);
  await page.waitForLoadState('networkidle');
  await overlay(page);
  await wait(1000);
  take.gapEnd();
  await wait(900);

  // 2. Empty network → invite people you know
  take.say();
  await focus(page, page.getByText(t('dashboard.addFirstConnection')).first().locator('..'));
  await snap(page, 'empty');
  await take.still(page);
  await wait(3200);
  await clear(page);
  take.say();
  await click(page, btn('create.goToInvite'));
  await wait(4200);
  await snap(page, 'share');
  await take.still(page);
  await open(page, `${WEB}/dashboard`);
  await wait(600);
  take.say();
  await focus(page, page.locator('#invite'));
  await take.still(page);
  await wait(3200);
  await clear(page);

  // 3. A friend opened the link → request → accept
  const me = await db.user.findFirst({ where: { email: NEW_EMAIL } });
  if (!me) throw new Error('registered user not found');
  await db.pendingConnection.create({ data: { fromUserId: 'u_friend', toUserId: me.id } });
  await open(page, `${WEB}/notifications`);
  await wait(1000);
  take.say();
  await focus(page, requestRow(page, cap.friend));
  await snap(page, 'request');
  await take.still(page);
  await wait(3200);
  await clear(page);
  take.say();
  await focus(page, acceptButton(page));
  await take.still(page);
  await wait(1800);
  await click(page, acceptButton(page));
  await wait(600);

  // 4. Network, SOS, contacts
  await open(page, `${WEB}/network`);
  await wait(1000);
  take.say();
  await click(page, handshake1(page, t));
  await wait(900);
  await focus(page, page.getByText(cap.friend).first());
  await take.still(page);
  await snap(page, 'network');
  await wait(3000);
  await clear(page);
  take.say();
  await click(page, page.getByText(t('nav.sos'), { exact: true }).first());
  take.gapStart();
  await page.waitForURL(/\/create/);
  await page.waitForLoadState('networkidle');
  await overlay(page);
  await wait(1000);
  take.gapEnd();
  await snap(page, 'sos');
  await take.still(page);
  await wait(3000);
  take.say();
  await open(page, `${WEB}/settings`);
  await wait(800);
  await focus(page, page.getByText(t('settings.contacts')).first().locator('xpath=ancestor::div[2]'));
  await snap(page, 'contacts');
  await take.still(page);
  await wait(3200);
  await clear(page);
  take.end();
}

/** Illustration sheet: one screenshot per caption (taken while the step is highlighted), caption above it, 4 per row. */
async function stepSheet(browser, l, stills, out) {
  mkdirSync(path.dirname(out), { recursive: true });
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cells = stills.map((s) => `<figure><figcaption><b>${esc(s.lines[0])}</b><span>${esc(s.lines[1])}</span></figcaption><img src="data:image/png;base64,${s.img}"></figure>`).join('');
  const page = await browser.newPage({ viewport: { width: 4 * 420 + 40, height: 800 } });
  await page.setContent(`<!doctype html><html lang="${l}" dir="auto"><body style="margin:0;background:#0f172a;font-family:'Segoe UI','Nirmala UI','Leelawadee UI','Microsoft YaHei','Yu Gothic UI','Malgun Gothic',sans-serif">
    <style>main{display:grid;grid-template-columns:repeat(4,400px);gap:28px 20px;padding:28px 20px}figure{margin:0}figcaption{height:84px;display:flex;flex-direction:column;justify-content:flex-end;text-align:center;gap:4px;margin-bottom:10px}
    b{color:#fff;font-size:21px}span{color:#c7d2fe;font-size:17px}img{display:block;width:390px;margin:0 auto;border-radius:14px}</style>
    <main dir="auto">${cells}</main></body></html>`);
  await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 85 });
  await page.close();
}

const VIDEOS = { link: { dir: 'invite-link', scene: sceneLink }, app: { dir: 'app-start', scene: sceneApp } };

/**
 * Scan the raw recording frame by frame (25 fps):
 *  - glitch: Chromium's screencast now and then delivers a frame at 1x, which Playwright pads with grey into the
 *    2x canvas (lower-right quarter flat #808080) — replaced with the previous frame;
 *  - blank: a white page or a lone loading spinner between two screens — cut out of the video.
 */
function scanFrames(webm) {
  const W = 20, H = 30;
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', webm, '-vf', `fps=25,scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`frame scan failed: ${String(r.stderr).slice(-300)}`);
  const glitch = [], blank = [];
  const add = (list, n) => { const last = list[list.length - 1]; if (last && last[1] === n - 1) last[1] = n; else list.push([n, n]); };
  for (let n = 0; (n + 1) * W * H <= r.stdout.length; n++) {
    const px = r.stdout.subarray(n * W * H, (n + 1) * W * H);
    let grey = 0, quarter = 0, white = 0;
    for (let i = 0; i < px.length; i++) {
      const x = i % W, y = Math.floor(i / W);
      if (px[i] > 242) white++;
      if (x >= W / 2 && y >= H / 2) { quarter++; if (Math.abs(px[i] - 128) < 10) grey++; }
    }
    if (n > 0 && grey >= quarter * 0.95) add(glitch, n);
    else if (white >= px.length * 0.97) add(blank, n);
  }
  return { glitch, blank };
}

/** Filter steps [0:v] → [clean]: each glitch range is replaced with the frame just before it (freezeframes needs the source twice). */
function freezeGlitches(ranges) {
  if (!ranges.length) return ['[0:v]fps=25[clean]'];
  const steps = ['[0:v]fps=25[g0]'];
  ranges.forEach(([a, b], i) => {
    const out = i === ranges.length - 1 ? 'clean' : `g${i + 1}`;
    steps.push(`[g${i}]split[m${i}][s${i}]`, `[m${i}][s${i}]freezeframes=first=${a}:last=${b}:replace=${a - 1}[${out}]`);
  });
  return steps;
}

/** Transparent frame mask: background color everywhere except a rounded window over the screen recording. */
async function renderMask(browser, dir) {
  const page = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h } });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent"><div id="w" style="position:relative;width:${FRAME.w}px;height:${FRAME.h}px;overflow:hidden">
    <div style="position:absolute;left:${SHOT.x}px;top:${SHOT.y}px;width:${SHOT.w}px;height:${SHOT.h}px;border-radius:30px;box-shadow:0 0 0 2000px #0f172a, inset 0 0 0 2px rgba(255,255,255,.10)"></div></div></body>`);
  const f = path.join(dir, 'mask.png');
  await page.locator('#w').screenshot({ path: f, omitBackground: true, scale: 'css' });
  await page.close();
  return f;
}

/** Captions rendered by Chromium (proper shaping for every script, RTL, CJK fonts) into transparent PNGs. */
async function renderCaptions(browser, l, caps, dir) {
  const page = await browser.newPage({ viewport: { width: FRAME.w, height: CAP_H } });
  const files = [];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const line = (top, color, weight, size, text) =>
    `<div class="l" dir="auto" style="position:absolute;top:${top}px;left:0;width:100%;text-align:center;white-space:nowrap;line-height:1.25;color:${color};font-weight:${weight};font-size:${size}px">${esc(text)}</div>`;
  for (const [i, c] of caps.entries()) {
    await page.setContent(`<!doctype html><html lang="${l}"><body style="margin:0;background:transparent">
      <div id="w" style="position:relative;width:${FRAME.w}px;height:${CAP_H}px;font-family:'Segoe UI','Nirmala UI','Leelawadee UI','Microsoft YaHei','Yu Gothic UI','Malgun Gothic',sans-serif">
        ${line(72, '#ffffff', 700, 36, c.lines[0])}${line(132, '#c7d2fe', 400, 30, c.lines[1])}
      </div></body></html>`);
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.l')) {
        const span = document.createElement('span'); span.textContent = el.textContent; el.textContent = ''; el.appendChild(span);
        let size = parseFloat(el.style.fontSize);
        while (span.getBoundingClientRect().width > 680 && size > 16) { size -= 1; el.style.fontSize = `${size}px`; }
      }
    });
    const f = path.join(dir, `cap${String(i).padStart(2, '0')}.png`);
    await page.locator('#w').screenshot({ path: f, omitBackground: true, scale: 'css' });
    files.push(f);
  }
  await page.close();
  return files;
}

async function shoot(browser, video, l) {
  const cap = CAPTIONS[l];
  if (!cap) throw new Error(`no captions for ${l}`);
  const t = i18nFor(l);
  const fill = (s) => s.replace(/\{hs1\}/g, t('dashboard.handshakeOrdinal', { depth: 1 })).replace(/\{([\w.]+)\}/g, (_, k) => t(k));
  const lines = cap[video].map((pair) => pair.map(fill));

  const r = spawnSync(process.execPath, [path.join(HERE, 'seed-demo.mjs')], { env: { ...process.env, SEED_LANG: l }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('seed failed');

  const TMP = path.join(os.tmpdir(), `so-first-steps-${video}-${l}`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  shotN = 0;
  const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: TMP, size: { width: VIEW.width * 2, height: VIEW.height * 2 } }, locale: l, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
  const recStart = Date.now();
  const page = await ctx.newPage();
  const take = new Take(lines);
  take.rec = recStart;
  currentTake = take;
  try { await VIDEOS[video].scene(page, take, l, cap); } catch (e) { await snap(page, `ERROR-${video}-${l}`); throw e; } finally { await ctx.close(); }

  const webm = readdirSync(TMP).find((f) => f.endsWith('.webm'));
  // Keep [trim, end] minus page loads; each kept segment dips in/out of the background for a soft cut.
  const start = Math.max(0, take.trim - 0.2);
  const end = take.caps[take.caps.length - 1].to;
  const segs = [];
  let cursor = start;
  const scan = scanFrames(path.join(TMP, webm));
  // Page-load marks from the scene plus any blank frames the scan found (±2 frames), in time order.
  const gaps = [...take.gaps.filter((g) => g[1] != null), ...scan.blank.map(([a, b]) => [(a - 2) / 25, (b + 3) / 25])].sort((x, y) => x[0] - y[0]);
  for (const [g0, g1] of gaps) {
    if (g1 == null || g1 <= cursor || g0 >= end) continue;
    if (g0 - cursor > 0.3) segs.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (end - cursor > 0.3) segs.push([cursor, end]);
  /** Recording time → time in the edited video (a moment inside a cut maps to the next segment's start). */
  const remap = (t) => {
    let out = 0;
    for (const [s0, s1] of segs) { if (t <= s0) return out; if (t < s1) return out + (t - s0); out += s1 - s0; }
    return out;
  };
  for (const c of take.caps) { c.from = remap(c.from); c.to = remap(c.to ?? c.from + 2); }
  const pngs = await renderCaptions(browser, l, take.caps, TMP);
  const mask = await renderMask(browser, TMP);
  const FADE = 0.18;
  const cuts = segs.map(([s0, s1], i) => {
    const d = s1 - s0;
    const fades = [i > 0 ? `fade=t=in:st=0:d=${FADE}:color=0x0f172a` : null, i < segs.length - 1 ? `fade=t=out:st=${(d - FADE).toFixed(2)}:d=${FADE}:color=0x0f172a` : null].filter(Boolean);
    return `[r${i}]trim=start=${s0.toFixed(2)}:end=${s1.toFixed(2)},setpts=PTS-STARTPTS,fps=25${fades.length ? ',' + fades.join(',') : ''}[c${i}]`;
  });
  const chain = take.caps.map((c, i) =>
    `[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${c.from.toFixed(2)},${c.to.toFixed(2)})'[v${i + 1}]`);
  const filter = [
    ...freezeGlitches(scan.glitch),
    `[clean]split=${segs.length}${segs.map((_, i) => `[r${i}]`).join('')}`,
    ...cuts,
    `${segs.map((_, i) => `[c${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[raw]`,
    `color=c=#0f172a:s=${FRAME.w}x${FRAME.h}:r=25[bg]`,
    `[raw]scale=${SHOT.w}:${SHOT.h}:flags=lanczos,format=yuv420p[shot]`,
    `[bg][shot]overlay=${SHOT.x}:${SHOT.y}:shortest=1[framed]`,
    `[framed][${pngs.length + 1}:v]overlay=0:0[v0]`,
    ...chain,
    `[v${take.caps.length}]fps=25,format=yuv420p[v]`,
  ].join(';');
  writeFileSync(path.join(TMP, 'filter.txt'), filter);
  const outDir = path.join(VIDEOS_ROOT, VIDEOS[video].dir);
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${l}.mp4`);
  await new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-y', '-i', path.join(TMP, webm), ...pngs.flatMap((f) => ['-i', f]), '-i', mask,
      '-filter_complex_script', path.join(TMP, 'filter.txt'), '-map', '[v]',
      ...(process.env.FFMPEG_THREADS ? ['-threads', process.env.FFMPEG_THREADS] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-800)))));
  });
  const intro = await prependWhyVideo(browser, l, out);
  if (STEPS_DIR) {
    if (take.stills.length !== take.lines.length) throw new Error(`stills ${take.stills.length} of ${take.lines.length}`);
    const sheet = path.join(STEPS_DIR, `${VIDEOS[video].dir}-${l}.jpg`);
    await stepSheet(browser, l, take.stills, sheet);
    await addWhyBanner(browser, l, sheet);
  }
  console.log(`done [${video} ${l}]:`, out, 'captions:', take.caps.length, 'length ~', (intro + remap(end)).toFixed(1), 's');
}

const [which = 'all', ...rest] = process.argv.slice(2);
const videos = which === 'all' ? Object.keys(VIDEOS) : [which];
for (const v of videos) if (!VIDEOS[v]) throw new Error(`unknown video ${v} (link|app|all)`);
const locales = rest.includes('all') ? Object.keys(CAPTIONS) : (rest.length ? rest : ['ru']);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PATH).href : 'playwright');
const chromium = pw.chromium ?? pw.default?.chromium;
// 2x device pixels: the screen is recorded at 780x1300 and downscaled into the frame, so small UI text stays sharp.
const browser = await chromium.launch({ args: ['--force-device-scale-factor=2'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const failed = [];
try {
  for (const v of videos) for (const l of locales) {
    try { await shoot(browser, v, l); } catch (e) { failed.push(`${v}:${l}`); console.error(`FAILED [${v} ${l}]:`, e.message); }
  }
} finally { await browser.close(); await db.$disconnect(); }
if (failed.length) { console.error('failed:', failed.join(' ')); process.exitCode = 1; }
