/**
 * One-off: adds the "why" intro (why.mjs) to first-steps files recorded before it existed, without re-shooting.
 * Run once per file — a second run would add a second intro.
 * Run: PLAYWRIGHT_PATH=<.../playwright/index.js> FFMPEG=<ffmpeg with libx264> node add-why.mjs [locale ...|all]
 *   videos: apps/web/public/videos/<invite-link|app-start>/<locale>.mp4; STEPS_DIR=<dir> also updates <video>-<locale>.jpg there.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WHY, prependWhyVideo, addWhyBanner } from './why.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_ROOT = path.join(HERE, '../../apps/web/public/videos');
const DIRS = ['invite-link', 'app-start'];
const STEPS_DIR = process.env.STEPS_DIR;

const args = process.argv.slice(2);
const locales = !args.length || args.includes('all') ? Object.keys(WHY) : args;
const pw = await import(process.env.PLAYWRIGHT_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PATH).href : 'playwright');
const chromium = pw.chromium ?? pw.default?.chromium;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const l of locales) for (const d of DIRS) {
    const mp4 = path.join(VIDEOS_ROOT, d, `${l}.mp4`);
    if (existsSync(mp4)) console.log(`video [${d} ${l}]: +${await prependWhyVideo(browser, l, mp4)} s`);
    const jpg = STEPS_DIR && path.join(STEPS_DIR, `${d}-${l}.jpg`);
    if (jpg && existsSync(jpg)) { await addWhyBanner(browser, l, jpg); console.log(`sheet [${d} ${l}]`); }
  }
} finally { await browser.close(); }
