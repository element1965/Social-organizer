/**
 * Records the Russian video instruction "regular collection + QR" from a LOCAL instance only.
 *
 * Prereqs (see mechanics.ru.md, section 7):
 *   - isolated local DB `so_video_demo` seeded by seed-demo.mjs
 *   - apps/api on :3001 (JWT_SECRET=local-video-demo, no REDIS_URL, no TELEGRAM_BOT_TOKEN)
 *   - apps/web (vite) on :3000 with VITE_WEB_APP_URL=http://localhost:3000
 * Run: PLAYWRIGHT_PATH=<.../node_modules/playwright/index.js> node shoot-video.mjs
 * Output: regular-collection-instruction.ru.mp4 next to this file (720x1280, captions on top).
 */
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB || 'http://localhost:3000';
if (!/^http:\/\/localhost/.test(WEB)) throw new Error('local instance only');
const JWT_SECRET = process.env.JWT_SECRET || 'local-video-demo';
const FFMPEG = process.env.FFMPEG || 'C:/ffmpeg/bin/ffmpeg.exe';
const TMP = path.join(os.tmpdir(), 'so-regular-rec');
const SHOTS = process.env.SHOTS; // optional dir for debug screenshots
const fontPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
const FONT = fontPath('C:/Windows/Fonts/segoeui.ttf');
const FONT_B = fontPath('C:/Windows/Fonts/segoeuib.ttf');
const VIEW = { width: 390, height: 650 };
const FRAME = { w: 720, h: 1280 };
const SHOT = { w: 600, h: 1000, x: 60, y: 240 };
const CHAT = 'https://t.me/+DemoCommunityChat';

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
  constructor() { this.rec = Date.now(); this.caps = []; this.trim = 0; }
  at() { return (Date.now() - this.rec) / 1000; }
  reset() { this.trim = this.at(); }
  say(lines) {
    const prev = this.caps[this.caps.length - 1];
    if (prev && prev.to == null) prev.to = this.at();
    this.caps.push({ from: this.at(), to: null, lines });
  }
  end() { const prev = this.caps[this.caps.length - 1]; if (prev && prev.to == null) prev.to = this.at() + 1.5; }
}

let shotN = 0;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`) }); }

async function overlay(page) { await page.evaluate(OVERLAY); }
async function focus(page, loc) {
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await wait(400);
  await wait(250);
  const b = await loc.boundingBox();
  if (!b) return;
  await page.mouse.move(b.x + Math.min(b.width / 2, 150), b.y + b.height / 2, { steps: 18 });
  await page.evaluate((r) => window.__ringRect(r), { x: b.x, y: b.y, width: b.width, height: b.height });
}
async function clear(page) { await page.evaluate(() => window.__ringRect(null)); }
async function click(page, loc) { await focus(page, loc); await wait(500); await clear(page); await loc.click(); }
async function type(page, loc, text) { await focus(page, loc); await loc.click(); await clear(page); await loc.pressSequentially(text, { delay: 90 }); }
async function login(page, uid, url) {
  await page.evaluate((a) => { localStorage.clear(); for (const [k, v] of Object.entries(a)) localStorage.setItem(k, v); }, auth(uid));
  await page.goto(url, { waitUntil: 'networkidle' });
  await overlay(page);
}

async function scene(page, take) {
  await page.goto(`${WEB}/privacy`, { waitUntil: 'domcontentloaded' });
  await login(page, 'u_author', `${WEB}/create`);
  await wait(1200);
  take.reset();

  // 1. Create
  take.say(['Регулярный сбор за 1 минуту', 'Экран «Создать» → «Нужно»']);
  await wait(2600);
  take.say(['1. Выберите тип «Регулярный»', 'сбор повторяется каждые 28 дней']);
  await click(page, page.getByRole('button', { name: 'Регулярный', exact: true }));
  await wait(2000);
  take.say(['2. Введите сумму: 7000 USD', 'это цель на один 28-дневный цикл']);
  await type(page, page.locator('#amount'), '7000');
  await page.locator('#currency').selectOption('USD');
  await wait(1200);
  const reach = page.getByText('Ваш сигнал увидят');
  if (await reach.count()) {
    take.say(['Столько людей получат оповещение', '1 доллар цели = 1 человек, до 7000']);
    await focus(page, reach.first());
    await wait(3000);
    await clear(page);
  }
  await snap(page, 'amount');

  take.say(['3. Заранее создайте чат', 'в Telegram и вставьте ссылку']);
  await click(page, page.getByText('Как создать Telegram-чат?'));
  await wait(1200);
  await focus(page, page.getByText('Как получить ссылку на чат:').locator('..'));
  await wait(3200);
  await clear(page);
  await type(page, page.locator('#chatLink'), CHAT);
  await wait(900);
  await snap(page, 'chat');

  take.say(['4. Нажмите «Уведомить»', 'оповещение уйдёт ОДИН раз']);
  await click(page, page.getByRole('button', { name: 'Уведомить' }));
  await wait(1500);
  await snap(page, 'warn');
  take.say(['Система предупредит, что это', 'реальный сигнал для людей']);
  await click(page, page.getByRole('button', { name: 'Понимаю, продолжить' }));
  await wait(1200);
  await click(page, page.getByText('Я подумал и подтверждаю'));
  await wait(600);
  await snap(page, 'confirm');
  await click(page, page.getByRole('button', { name: 'Подтвердить', exact: true }));
  await page.waitForURL(/\/collection\//);
  await page.waitForLoadState('networkidle');
  await overlay(page);
  const collectionUrl = page.url().split('?')[0];
  const collectionId = collectionUrl.split('/').pop();
  await wait(800);

  // 2. QR
  take.say(['Сбор создан: люди по цепочке', 'рукопожатий уже получили сигнал']);
  await wait(2800);
  take.say(['5. Нажмите значок QR', 'рядом с «Поделиться SOS-ссылкой»']);
  await click(page, page.locator('button[title="QR-код"]'));
  await wait(1000);
  const qrBox = page.getByText('Отсканируйте, чтобы присоединиться').locator('..');
  await focus(page, qrBox);
  await snap(page, 'qr');
  take.say(['Этот QR и эта ссылка ведут', 'прямо на ваш сбор']);
  await wait(3000);
  take.say(['Разместите QR на сайте,', 'в рассылке, на слайде']);
  await wait(2800);
  await clear(page);
  take.say(['Кнопка слева копирует', 'ту же ссылку текстом']);
  await focus(page, page.getByRole('button', { name: /SOS-ссылк/ }));
  await wait(2600);
  await clear(page);

  // 3. Scanner
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${WEB}/sos/${collectionId}`, { waitUntil: 'networkidle' });
  await overlay(page);
  take.say(['Человек сканирует QR', 'и видит страницу вашего сбора']);
  await wait(2800);
  await snap(page, 'sos');
  take.say(['Кнопка открывает Telegram:', 'вход в приложение — автоматически']);
  await focus(page, page.getByText('Присоединиться и помочь'));
  await wait(3200);
  await clear(page);

  await login(page, 'u_scanner', `${WEB}/collection/${collectionId}?sos=true`);
  await wait(1500);
  take.say(['Он сразу попадает в ваш', 'первый круг рукопожатий']);
  await snap(page, 'scanner-collection');
  await wait(3000);
  take.say(['Вписывает сумму в месяц', 'и нажимает «Подтвердить»']);
  const amt = page.getByPlaceholder(/./).and(page.locator('input[type="number"]')).first();
  await amt.fill('');
  await type(page, amt, '50');
  await wait(600);
  await click(page, page.getByRole('button', { name: 'Подтвердить', exact: true }));
  await wait(1800);
  await snap(page, 'scanner-pledged');
  take.say(['После этого ему открывается', 'ссылка на ваш чат']);
  const chat = page.getByText('Открыть чат');
  if (await chat.count()) { await focus(page, chat.first()); }
  await wait(3200);
  await clear(page);

  // 4. Author sees it
  await login(page, 'u_author', `${WEB}/network`);
  await wait(1500);
  take.say(['У вас он появился в «Сети»', 'в 1-м рукопожатии (было 12, стало 13)']);
  await click(page, page.getByText('1-е рукопожатие').first());
  await wait(1200);
  const anna = page.getByText('Анна (новый человек)');
  if (await anna.count()) await focus(page, anna.first());
  await snap(page, 'author-network');
  await wait(3200);
  await clear(page);
  take.say(['А в сборе — его намерение', 'Оплату отмечаете галочкой']);
  await page.goto(collectionUrl, { waitUntil: 'networkidle' });
  await overlay(page);
  await wait(800);
  const part = page.getByText('Анна (новый человек)');
  if (await part.count()) await focus(page, part.first().locator('xpath=ancestor::div[contains(@class,"py-1")][1]'));
  await snap(page, 'author-collection');
  await wait(3400);
  await clear(page);
  take.say(['Через 28 дней цикл обновится,', 'намерения переходят в новый']);
  await wait(3200);
  take.end();
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PATH).href : 'playwright');
const chromium = pw.chromium ?? pw.default?.chromium;
const browser = await chromium.launch();
const recStart = Date.now();
const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: TMP, size: VIEW }, locale: 'ru-RU', colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const take = new Take();
take.rec = recStart;
try { await scene(page, take); } catch (e) { await snap(page, 'ERROR'); throw e; } finally { await ctx.close(); await browser.close(); }

const webm = readdirSync(TMP).find((f) => f.endsWith('.webm'));
const trim = Math.max(0, take.trim - 0.2);
for (const c of take.caps) { c.from = Math.max(0, c.from - trim); if (c.to != null) c.to = Math.max(0, c.to - trim); }
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/,/g, '\\,');
const draws = take.caps.flatMap((c) => c.lines.map((line, i) =>
  `drawtext=fontfile='${i === 0 ? FONT_B : FONT}':text='${esc(line)}':fontcolor=${i === 0 ? '#ffffff' : '#c7d2fe'}:fontsize=${i === 0 ? 36 : 30}` +
  `:x=(w-text_w)/2:y=${i === 0 ? 80 : 140}:enable='between(t,${c.from.toFixed(2)},${(c.to ?? c.from + 2).toFixed(2)})'`));
const filter = [
  `color=c=#0f172a:s=${FRAME.w}x${FRAME.h}:r=25[bg]`,
  `[0:v]scale=${SHOT.w}:${SHOT.h}:flags=lanczos,format=yuv420p[shot]`,
  `[bg][shot]overlay=${SHOT.x}:${SHOT.y}:shortest=1[v0]`,
  `[v0]${draws.join(',')},fps=25[v]`,
].join(';');
writeFileSync(path.join(TMP, 'filter.txt'), filter);
const out = path.join(HERE, 'regular-collection-instruction.ru.mp4');
await new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, ['-y', '-ss', trim.toFixed(2), '-i', path.join(TMP, webm), '-filter_complex_script', path.join(TMP, 'filter.txt'), '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-800)))));
});
console.log('done:', out, 'captions:', take.caps.length, 'length ~', take.at().toFixed(1) - trim, 's');
