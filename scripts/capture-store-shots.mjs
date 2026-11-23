// Draws the store screenshots and the Google Play feature graphic from the app's own screens.
//
//   node scripts/capture-store-shots.mjs [--origin http://localhost:3130] [--lang en,ru] [--sheet <dir>]
//
// Without --origin it starts the web dev server on port 3130 and stops it at the end. It opens
// apps/web/dev/store-shots.html in headless Edge (Chrome works too: set BROWSER) and writes, per language:
//   play-store-assets/<locale>/phone-1-circle.png ... phone-5-add.png   1080 x 1920 (9:16)
//   play-store-assets/<locale>/feature-graphic.png                     1024 x 500
//   apps/web/ios/App/fastlane/screenshots/<locale>/01_iphone_circle.png ... 05_iphone_add.png   1290 x 2796
//   apps/web/ios/App/fastlane/screenshots/<locale>/06_ipad_circle.png ... 10_ipad_add.png       2048 x 2732
// and a contact sheet of everything to --sheet (default: the system temp folder). All files are opaque RGB PNG, as
// both stores require. Nothing is uploaded: the files are for the owner to upload by hand or with fastlane.
// First it photographs the example network with the app's graph (apps/web/dev/landing-app-graph.html) for the
// phone and the iPad Circle at the canvas's pixel density, and hands the stills to the page.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const sharp = require('sharp');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DEV_PORT = 3130;
let origin = arg('origin', '').replace(/\/$/, '');
const langs = arg('lang', 'en,ru').split(',');
const sheetDir = arg('sheet', os.tmpdir());
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9343;

/** The stores' folders per language: Google Play's language codes and fastlane deliver's. */
const LOCALES = { en: { play: 'en-US', ios: 'en-US' }, ru: { play: 'ru-RU', ios: 'ru' } };
const SHOTS = ['circle', 'need', 'join', 'ask', 'add'];
/** The page's canvas in CSS px and the pixel ratio that gives the store size (the page keeps the same table). */
const DEVICES = {
  play: { width: 540, height: 960, dpr: 2 },
  iphone: { width: 430, height: 932, dpr: 3 },
  ipad: { width: 1024, height: 1366, dpr: 2 },
  feature: { width: 1024, height: 500, dpr: 2, out: { width: 1024, height: 500 } },
};
/** The Circle's scene for the graph stills: the phone's (scene-box.ts) and the iPad's (store-shots.tsx). */
const GRAPHS = {
  phone: { width: 390, height: 465, dpr: 3 },
  tablet: { width: 1024, height: 768, dpr: 2 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- the dev server ------------------------------------------------------------------------------------------------
let server = null;
async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
if (!origin) {
  origin = `http://localhost:${DEV_PORT}`;
  if (!(await reachable(`${origin}/dev/store-shots.html`))) {
    server = spawn('pnpm', ['--filter', '@so/web', 'exec', 'vite', '--port', String(DEV_PORT), '--strictPort'], {
      cwd: root,
      shell: true,
      stdio: 'ignore',
      // The Add screen shows the public link, not a local apps/web/.env address (Vite prefers the process env)
      env: { ...process.env, VITE_WEB_APP_URL: 'https://www.orginizer.com' },
    });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      up = await reachable(`${origin}/dev/store-shots.html`);
    }
    if (!up) throw new Error(`the dev server did not start on ${origin}`);
  }
}
function stopServer() {
  if (!server) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
    else server.kill();
  } catch { /* already gone */ }
}

// --- the browser over CDP -------------------------------------------------------------------------------------------
const profile = path.join(os.tmpdir(), 'so-store-shots-profile');
rmSync(profile, { recursive: true, force: true });
const browser = spawn(BROWSER, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });

async function pageSocket() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('the browser did not start');
}

const ws = new WebSocket(await pageSocket());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') console.warn('page error:', m.params.exceptionDetails?.exception?.description?.split(String.fromCharCode(10))[0]);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};
const viewport = (width, height, dpr) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
const capture = async (width, height) =>
  Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } })).data, 'base64');

/**
 * How well a view shows the Need's way: you, Tom and Sarah inside the clear band [top, bottom] of the scene and
 * away from its sides, and at least 80 px apart (seen end-on, the chain would hide behind you). Positive is good.
 * The same formula runs in the page (orbit) and here.
 */
const scoreSource = (top, bottom, width, height) => `(l) => {
  const room = (p) => (p ? Math.min(p[0] - 0.1, 0.9 - p[0], p[1] - ${top}, ${bottom} - p[1]) : -1);
  const gap = (a, b) => (a && b ? Math.hypot((a[0] - b[0]) * ${width}, (a[1] - b[1]) * ${height}) : 0);
  const apart = Math.min(gap(l.you, l.tom), gap(l.tom, l.sarah), gap(l.you, l.sarah));
  return Math.min(room(l.you), room(l.tom), room(l.sarah), (apart - 80) / ${height});
}`;

/**
 * Page code: orbits the graph's camera round you in 15° steps (and five tilts) and keeps the best view by
 * scoreSource. Uses the force graph's handle that graph-capture.tsx exposes (window.__SO_GRAPH_DEBUG__.fg).
 */
const orbit = (score) => `(async () => {
  const fg = window.__SO_GRAPH_DEBUG__ && window.__SO_GRAPH_DEBUG__.fg;
  if (!fg || !fg.cameraPosition) return null;
  const find = (o, id) => {
    if (o.__data && o.__data.id === id && 'x' in o.__data) return o.__data;
    for (const c of o.children) { const f = find(c, id); if (f) return f; }
    return null;
  };
  const you = find(fg.scene(), 'you');
  if (!you) return null;
  const at = { x: you.x, y: you.y, z: you.z };
  const cam = fg.cameraPosition();
  const d = { x: cam.x - at.x, y: cam.y - at.y, z: cam.z - at.z };
  const r = Math.hypot(d.x, d.y, d.z);
  const yaw0 = Math.atan2(d.x, d.z);
  const pitch0 = Math.asin(d.y / r);
  const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const score = ${score};
  const place = (yaw, pitch) => fg.cameraPosition({
    x: at.x + r * Math.cos(pitch) * Math.sin(yaw),
    y: at.y + r * Math.sin(pitch),
    z: at.z + r * Math.cos(pitch) * Math.cos(yaw),
  }, at, 0);
  let best = { score: -9, yaw: yaw0, pitch: pitch0 };
  for (const tilt of [0, 0.35, -0.35, 0.7, -0.7]) {
    for (let i = 0; i < 24; i++) {
      const yaw = yaw0 + (i * Math.PI) / 12;
      const pitch = pitch0 + tilt;
      place(yaw, pitch);
      await frame();
      const s = score(window.__labels());
      if (s > best.score) best = { score: s, yaw, pitch };
    }
  }
  place(best.yaw, best.pitch);
  await frame();
  return best.score;
})()`;

/** The example network on the app's graph, light theme, for one scene size: a PNG data URL and the label spots. */
async function graphStill({ width, height, dpr }) {
  // The layout differs from run to run. Keep the first view where you, Tom and Sarah stand clear of the header
  // (120 px), of the ring chips with their labels and the name under the dot (145 px) and of the sides, so the
  // Need's way is in view; after six layouts, the best view found.
  const source = scoreSource((120 + 24) / height, 1 - 145 / height, width, height);
  const scoreOf = (0, eval)(source);
  let best = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    // the layout settles at 1x: the simulation runs for a fixed time, and at 3x the software renderer manages too
    // few steps in it; then the settled graph is drawn again at the canvas's density
    await viewport(width, height, 1);
    await send('Page.navigate', { url: `${origin}/dev/landing-app-graph.html?theme=light&w=${width}&h=${height}&try=${attempt}` });
    await sleep(10000);
    await viewport(width, height, dpr);
    await sleep(2500);
    // turn the camera round you (the graph is 3D) to the side where Tom and Sarah are best in view
    const orbited = await evaluate(orbit(source));
    if (process.env.DEBUG) console.log(`graph ${width}x${height} try ${attempt}: best view ${orbited}`);
    await sleep(800);
    const labels = await evaluate('window.__labels && window.__labels()');
    if (!labels || Object.keys(labels).length < 4) throw new Error(`graph labels not found: ${JSON.stringify(labels)}`);
    const score = scoreOf(labels);
    if (!best || score > best.score) {
      const png = await capture(width, height);
      best = { score, still: { src: `data:image/png;base64,${png.toString('base64')}`, labels } };
    }
    if (score > 0) break;
  }
  if (best.score <= 0) console.warn(`graph ${width}x${height}: no layout fully clear, kept the best`, best.still.labels);
  return best.still;
}

/** One canvas of the page, flattened to opaque RGB at the store size. */
async function shoot(device, shot, lang) {
  const d = DEVICES[device];
  await viewport(d.width, d.height, d.dpr);
  await send('Page.navigate', { url: `${origin}/dev/store-shots.html?device=${device}&shot=${shot}&lang=${lang}` });
  for (let i = 0; i < 100; i++) {
    await sleep(150);
    if (await evaluate('window.__storeShotReady === true').catch(() => false)) break;
    if (i === 99) throw new Error(`${device}/${shot}/${lang} did not get ready`);
  }
  await sleep(400);
  let img = sharp(await capture(d.width, d.height)).flatten({ background: '#087f71' }).removeAlpha();
  if (d.out) img = img.resize(d.out.width, d.out.height, { kernel: 'lanczos3' });
  return img.png({ compressionLevel: 9 }).toBuffer();
}

const written = [];
function write(file, buf) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  written.push(file);
  console.log(path.relative(root, file));
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  // reduced motion: the graph's camera stands still and the screens skip their entrance; the app's light theme
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: 'light' },
    ],
  });
  const graphs = { phone: await graphStill(GRAPHS.phone), tablet: await graphStill(GRAPHS.tablet) };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__STORE_GRAPHS__ = ${JSON.stringify(graphs)};` });

  for (const lang of langs) {
    const loc = LOCALES[lang];
    if (!loc) throw new Error(`no store locale for ${lang}`);
    const play = path.join(root, 'play-store-assets', loc.play);
    const ios = path.join(root, 'apps/web/ios/App/fastlane/screenshots', loc.ios);
    for (const [i, shot] of SHOTS.entries()) {
      write(path.join(play, `phone-${i + 1}-${shot}.png`), await shoot('play', shot, lang));
      write(path.join(ios, `0${i + 1}_iphone_${shot}.png`), await shoot('iphone', shot, lang));
      write(path.join(ios, `${String(i + 6).padStart(2, '0')}_ipad_${shot}.png`), await shoot('ipad', shot, lang));
    }
    write(path.join(play, 'feature-graphic.png'), await shoot('feature', 'circle', lang));
  }

  // the contact sheet: one row per language and device, each picture 300 px tall
  const rows = [];
  for (const lang of langs) {
    for (const kind of ['phone-', '_iphone_', '_ipad_', 'feature-graphic']) {
      const files = written.filter((f) => f.includes(path.sep + LOCALES[lang].play + path.sep) || f.includes(path.sep + LOCALES[lang].ios + path.sep)).filter((f) => path.basename(f).includes(kind));
      if (files.length) rows.push(files);
    }
  }
  const H = 300;
  const GAP = 16;
  const tiles = [];
  let y = GAP;
  let width = 0;
  for (const files of rows) {
    let x = GAP;
    for (const file of files) {
      const buf = await sharp(file).resize({ height: H }).toBuffer();
      const { width: w } = await sharp(buf).metadata();
      tiles.push({ input: buf, left: x, top: y });
      x += w + GAP;
    }
    width = Math.max(width, x);
    y += H + GAP;
  }
  mkdirSync(sheetDir, { recursive: true });
  const sheet = path.join(sheetDir, 'store-shots-contact-sheet.png');
  await sharp({ create: { width, height: y, channels: 3, background: '#e9eeec' } }).composite(tiles).png().toFile(sheet);
  console.log(`contact sheet: ${sheet}`);
} finally {
  try { await send('Browser.close'); } catch { /* already closed */ }
  ws.close();
  browser.kill();
  stopServer();
}
