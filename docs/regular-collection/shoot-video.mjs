/**
 * Records the video instruction "regular collection + QR" from a LOCAL instance only, per app locale.
 *
 * Prereqs (see mechanics.ru.md / mechanics.en.md, section 7):
 *   - isolated local DB `so_video_demo` (seed-demo.mjs is re-run automatically per locale)
 *   - apps/api on :3001 (JWT_SECRET=local-video-demo, no REDIS_URL, no TELEGRAM_BOT_TOKEN)
 *   - apps/web (vite) on :3000 with VITE_WEB_APP_URL=http://localhost:3000
 * Run: DATABASE_URL=<local so_video_demo> PLAYWRIGHT_PATH=<.../playwright/index.js> node shoot-video.mjs [locale ...|all]
 *   (default locale: ru). FFMPEG_THREADS=2 lowers encoder memory on a busy machine. The app language is switched the way the app does it: localStorage `language`
 *   (apps/web/src/lib/i18n.ts) plus the browser locale; demo users get `language` = locale.
 * Output: regular-collection-instruction.<locale>.mp4 next to this file (720x1280, captions on top).
 * Captions come from captions.mjs; UI labels inside them and all selectors come from packages/i18n/locales.
 */
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS } from './captions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(HERE, '../../packages/i18n/locales');
const WEB = process.env.WEB || 'http://localhost:3000';
if (!/^http:\/\/localhost/.test(WEB)) throw new Error('local instance only');
const JWT_SECRET = process.env.JWT_SECRET || 'local-video-demo';
const FFMPEG = process.env.FFMPEG || 'C:/ffmpeg/bin/ffmpeg.exe';
const SHOTS = process.env.SHOTS; // optional dir for debug screenshots
const VIEW = { width: 390, height: 650 };
const FRAME = { w: 720, h: 1280 };
const SHOT = { w: 600, h: 1000, x: 60, y: 240 };
const CAP_H = 200;
const CHAT = 'https://t.me/+DemoCommunityChat';
const QR_TITLE = 'QR-код'; // hardcoded (not translated) in CollectionPage.tsx
const QR_CAPTION = 'Отсканируйте, чтобы присоединиться'; // hardcoded (not translated) in CollectionPage.tsx

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
/** Longest literal fragment of a string with {{placeholders}} — used to find interpolated text. */
function fragment(l, key) {
  const raw = dig(readLocale(l), key) ?? dig(EN, key);
  return raw.split(/\{\{\w+\}\}/).map((s) => s.trim().replace(/[:：]$/, '')).sort((a, b) => b.length - a.length)[0];
}

function token(sub, type, ttl) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'HS256', typ: 'JWT' });
  const p = b({ sub, type, iat: now, exp: now + ttl });
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const auth = (uid) => ({ accessToken: token(uid, 'access', 3600), refreshToken: token(uid, 'refresh', 86400), userId: uid });

const OVERLAY = `(() => {
  if (document.getElementById('__cursor')) return;
  const cur = document.createElement('div'); cur.id='__cursor';
  cur.style.cssText='position:fixed;z-index:99999;width:22px;height:22px;pointer-events:none;left:0;top:0;';
  cur.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M0,0 L0,26 L7,20 L12,31 L18,28 L13,17 L22,16 Z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
  document.body.appendChild(cur);
  const ring = document.createElement('div'); ring.id='__ring';
  ring.style.cssText='position:fixed;z-index:99997;border:3px solid #f59e0b;border-radius:10px;pointer-events:none;opacity:0;transition:opacity .2s, all .25s;box-shadow:0 0 0 9999px rgba(0,0,0,.35);';
  document.body.appendChild(ring);
  document.addEventListener('mousemove', (e) => { cur.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)'; }, true);
  window.__ringRect = (r) => { if (!r) { ring.style.opacity='0'; return; }
    Object.assign(ring.style, { opacity:'1', top:(r.y-5)+'px', left:(Math.max(3,r.x-5))+'px', width:(Math.min(window.innerWidth-6, r.width+10))+'px', height:(r.height+10)+'px' }); };
})();`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Take {
  constructor(lines) { this.rec = Date.now(); this.caps = []; this.trim = 0; this.lines = lines; this.n = 0; }
  at() { return (Date.now() - this.rec) / 1000; }
  reset() { this.trim = this.at(); }
  /** Next caption from captions.mjs (captions are consumed in scene order). */
  say() {
    const prev = this.caps[this.caps.length - 1];
    if (prev && prev.to == null) prev.to = this.at();
    this.caps.push({ from: this.at(), to: null, lines: this.lines[this.n++] });
  }
  skip() { this.n++; }
  end() { const prev = this.caps[this.caps.length - 1]; if (prev && prev.to == null) prev.to = this.at() + 1.5; }
}

let shotN = 0;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`) }); }

async function overlay(page) { await page.evaluate(OVERLAY); }
async function focus(page, loc) {
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await wait(650);
  const b = await loc.boundingBox();
  if (!b) return;
  await page.mouse.move(b.x + Math.min(b.width / 2, 150), b.y + b.height / 2, { steps: 18 });
  await page.evaluate((r) => window.__ringRect(r), { x: b.x, y: b.y, width: b.width, height: b.height });
}
async function clear(page) { await page.evaluate(() => window.__ringRect(null)); }
async function click(page, loc) { await focus(page, loc); await wait(500); await clear(page); await loc.click(); }
async function type(page, loc, text) { await focus(page, loc); await loc.click(); await clear(page); await loc.pressSequentially(text, { delay: 90 }); }
async function login(page, uid, url, lang) {
  await page.evaluate(({ a, lang }) => { localStorage.clear(); localStorage.setItem('language', lang); for (const [k, v] of Object.entries(a)) localStorage.setItem(k, v); }, { a: auth(uid), lang });
  await page.goto(url, { waitUntil: 'networkidle' });
  await overlay(page);
}

async function scene(page, take, l, cap) {
  const t = i18nFor(l);
  const btn = (key, exact = false) => page.getByRole('button', { name: t(key), exact }).first();

  await page.goto(`${WEB}/privacy`, { waitUntil: 'domcontentloaded' });
  await login(page, 'u_author', `${WEB}/create`, l);
  await wait(1200);
  take.reset();

  // 1. Create
  take.say();
  await wait(2600);
  take.say();
  await click(page, btn('create.regular', true));
  await wait(2000);
  take.say();
  await type(page, page.locator('#amount'), '7000');
  await page.locator('#currency').selectOption('USD');
  await wait(1200);
  const reach = page.getByText(fragment(l, 'create.networkReach'));
  if (await reach.count()) {
    take.say();
    await focus(page, reach.first());
    await wait(3000);
    await clear(page);
  } else take.skip();
  await snap(page, 'amount');

  take.say();
  await click(page, page.getByText(t('create.chatHelpToggle')).first());
  await wait(1200);
  await focus(page, page.getByText(fragment(l, 'create.chatHelpTitle')).first().locator('..'));
  await wait(3200);
  await clear(page);
  await type(page, page.locator('#chatLink'), CHAT);
  await wait(900);
  await snap(page, 'chat');

  take.say();
  await click(page, btn('create.submit'));
  await wait(1500);
  await snap(page, 'warn');
  take.say();
  await click(page, btn('create.entryWarningProceed'));
  await wait(1200);
  await click(page, page.getByText(t('create.confirmCheckbox')).first());
  await wait(600);
  await snap(page, 'confirm');
  await click(page, btn('create.confirmButton', true));
  await page.waitForURL(/\/collection\//);
  await page.waitForLoadState('networkidle');
  await overlay(page);
  const collectionUrl = page.url().split('?')[0];
  const collectionId = collectionUrl.split('/').pop();
  await wait(800);

  // 2. QR
  take.say();
  await wait(2800);
  take.say();
  await click(page, page.locator(`button[title="${QR_TITLE}"]`));
  await wait(1000);
  await focus(page, page.getByText(QR_CAPTION).locator('..'));
  await snap(page, 'qr');
  take.say();
  await wait(3000);
  take.say();
  await wait(2800);
  await clear(page);
  take.say();
  await focus(page, btn('collection.sosInviteButton'));
  await wait(2600);
  await clear(page);

  // 3. Scanner
  await page.evaluate((lang) => { localStorage.clear(); localStorage.setItem('language', lang); }, l);
  await page.goto(`${WEB}/sos/${collectionId}`, { waitUntil: 'networkidle' });
  await overlay(page);
  take.say();
  await wait(2800);
  await snap(page, 'sos');
  take.say();
  await focus(page, page.getByText(t('sos.joinBtn')).first());
  await wait(3200);
  await clear(page);

  await login(page, 'u_scanner', `${WEB}/collection/${collectionId}?sos=true`, l);
  await wait(1500);
  take.say();
  await snap(page, 'scanner-collection');
  await wait(3000);
  take.say();
  const amt = page.getByPlaceholder(/./).and(page.locator('input[type="number"]')).first();
  await amt.fill('');
  await type(page, amt, '50');
  await wait(600);
  await click(page, btn('collection.submit', true));
  await wait(1800);
  await snap(page, 'scanner-pledged');
  take.say();
  const chat = page.getByText(t('collection.openChat'));
  if (await chat.count()) { await focus(page, chat.first()); }
  await wait(3200);
  await clear(page);

  // 4. Author sees it
  await login(page, 'u_author', `${WEB}/network`, l);
  await wait(1500);
  take.say();
  await click(page, page.getByText(t('dashboard.handshakeOrdinal', { depth: 1 })).first());
  await wait(1200);
  const anna = page.getByText(cap.newcomer);
  if (await anna.count()) await focus(page, anna.first());
  await snap(page, 'author-network');
  await wait(3200);
  await clear(page);
  take.say();
  await page.goto(collectionUrl, { waitUntil: 'networkidle' });
  await overlay(page);
  await wait(800);
  const part = page.getByText(cap.newcomer);
  if (await part.count()) await focus(page, part.first().locator('xpath=ancestor::div[contains(@class,"py-1")][1]'));
  await snap(page, 'author-collection');
  await wait(3400);
  await clear(page);
  take.say();
  await wait(3200);
  take.end();
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
    await page.locator('#w').screenshot({ path: f, omitBackground: true });
    files.push(f);
  }
  await page.close();
  return files;
}

async function shoot(browser, l) {
  const cap = CAPTIONS[l];
  if (!cap) throw new Error(`no captions for ${l}`);
  const t = i18nFor(l);
  const fill = (s) => s.replace(/\{hs1\}/g, t('dashboard.handshakeOrdinal', { depth: 1 })).replace(/\{([\w.]+)\}/g, (_, k) => t(k));
  const lines = cap.c.map((pair) => pair.map(fill));

  if (process.env.DATABASE_URL) {
    const r = spawnSync(process.execPath, [path.join(HERE, 'seed-demo.mjs')], { env: { ...process.env, SEED_LANG: l }, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('seed failed');
  } else if (!process.env.SKIP_SEED) throw new Error('set DATABASE_URL (local so_video_demo) or SKIP_SEED=1');

  const TMP = path.join(os.tmpdir(), `so-regular-rec-${l}`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  shotN = 0;
  const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: TMP, size: VIEW }, locale: l, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
  const recStart = Date.now();
  const page = await ctx.newPage();
  const take = new Take(lines);
  take.rec = recStart;
  try { await scene(page, take, l, cap); } catch (e) { await snap(page, `ERROR-${l}`); throw e; } finally { await ctx.close(); }

  const webm = readdirSync(TMP).find((f) => f.endsWith('.webm'));
  const trim = Math.max(0, take.trim - 0.2);
  for (const c of take.caps) { c.from = Math.max(0, c.from - trim); if (c.to != null) c.to = Math.max(0, c.to - trim); }
  const pngs = await renderCaptions(browser, l, take.caps, TMP);
  const chain = take.caps.map((c, i) =>
    `[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${c.from.toFixed(2)},${(c.to ?? c.from + 2).toFixed(2)})'[v${i + 1}]`);
  const filter = [
    `color=c=#0f172a:s=${FRAME.w}x${FRAME.h}:r=25[bg]`,
    `[0:v]scale=${SHOT.w}:${SHOT.h}:flags=lanczos,format=yuv420p[shot]`,
    `[bg][shot]overlay=${SHOT.x}:${SHOT.y}:shortest=1[v0]`,
    ...chain,
    `[v${take.caps.length}]fps=25,format=yuv420p[v]`,
  ].join(';');
  writeFileSync(path.join(TMP, 'filter.txt'), filter);
  const out = path.join(HERE, `regular-collection-instruction.${l}.mp4`);
  await new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-y', '-ss', trim.toFixed(2), '-i', path.join(TMP, webm), ...pngs.flatMap((f) => ['-i', f]),
      '-filter_complex_script', path.join(TMP, 'filter.txt'), '-map', '[v]',
      ...(process.env.FFMPEG_THREADS ? ['-threads', process.env.FFMPEG_THREADS] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-800)))));
  });
  console.log(`done [${l}]:`, out, 'captions:', take.caps.length, 'length ~', (take.at() - trim).toFixed(1), 's');
}

const args = process.argv.slice(2);
const locales = args.includes('all') ? Object.keys(CAPTIONS) : (args.length ? args : ['ru']);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PATH).href : 'playwright');
const chromium = pw.chromium ?? pw.default?.chromium;
const browser = await chromium.launch();
const failed = [];
try {
  for (const l of locales) {
    try { await shoot(browser, l); } catch (e) { failed.push(l); console.error(`FAILED [${l}]:`, e.message); }
  }
} finally { await browser.close(); }
if (failed.length) { console.error('failed locales:', failed.join(' ')); process.exitCode = 1; }
