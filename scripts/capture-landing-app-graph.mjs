// Photographs the example network with the app's own graph for the landing's "In the app" chapter.
//
// Regenerate when the graph's look or the example changes:
//   1. pnpm --filter @so/web dev            (the dev server; another port: --port 3110)
//   2. node scripts/capture-landing-app-graph.mjs [http://localhost:3000]
// It opens apps/web/dev/landing-app-graph.html in headless Edge (Chrome works too: set BROWSER), waits for the
// layout to settle, and writes
//   apps/web/public/landing/app/circle-graph-light.webp and -dark.webp (2x for a ~300 px phone)
//   apps/web/src/components/landing/app/graph-labels.json (where You, Tom, Sarah and Emma stand)
// Both themes come from one layout and one camera, so one set of label positions fits both pictures.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const sharp = require('sharp');

const origin = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const BOX = { width: 390, height: 465 }; // SCENE_BOX in apps/web/src/components/landing/app/scene-box.ts
const SCALE = 600 / 300; // a 390 px scene shown about 300 px wide, at 2x
const DPR = (300 * SCALE) / BOX.width;
const outImg = path.join(root, 'apps/web/public/landing/app');
const outLabels = path.join(root, 'apps/web/src/components/landing/app/graph-labels.json');

const profile = path.join(os.tmpdir(), 'so-landing-graph-profile');
rmSync(profile, { recursive: true, force: true });
const browser = spawn(BROWSER, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageSocket() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
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

async function shoot(theme) {
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: BOX.width, height: BOX.height, scale: 1 },
  });
  const file = path.join(outImg, `circle-graph-${theme}.webp`);
  // the smallest file that keeps the thin links: try qualities from high to low until it fits
  let buf;
  for (const quality of [78, 72, 66, 60, 54]) {
    buf = await sharp(Buffer.from(data, 'base64')).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    if (buf.length < 38 * 1024) break;
  }
  writeFileSync(file, buf);
  console.log(`${path.relative(root, file)}: ${(buf.length / 1024).toFixed(1)} KB`);
}

try {
  mkdirSync(outImg, { recursive: true });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: BOX.width, height: BOX.height, deviceScaleFactor: DPR, mobile: true });
  // reduced motion: the camera stands still and the Need's way is drawn as a steady gradient, not moving pulses
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: 'light' },
    ],
  });
  await send('Page.navigate', { url: `${origin}/dev/landing-app-graph.html?theme=light` });
  await sleep(12000);
  const labels = await evaluate('window.__labels && window.__labels()');
  if (!labels || Object.keys(labels).length < 4) throw new Error(`labels not found: ${JSON.stringify(labels)}`);
  await shoot('light');
  await evaluate("window.__setTheme('dark')");
  await sleep(2500);
  const again = await evaluate('window.__labels()');
  await shoot('dark');
  if (JSON.stringify(again) !== JSON.stringify(labels)) console.warn('the layout moved between the themes:', labels, again);
  writeFileSync(outLabels, JSON.stringify(labels, null, 2) + '\n');
  console.log(`${path.relative(root, outLabels)}: ${JSON.stringify(labels)}`);
} finally {
  try { await send('Browser.close'); } catch { /* already closed */ }
  ws.close();
  browser.kill();
}
