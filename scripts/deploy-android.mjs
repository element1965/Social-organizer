#!/usr/bin/env node
/**
 * Build web → sync Capacitor → build AAB → upload to Google Play
 *
 * Requirements:
 *   - GOOGLE_PLAY_SERVICE_ACCOUNT env var (JSON string of service account key)
 *     OR a file at scripts/google-play-service-account.json
 *   - JAVA_HOME set to Android Studio JBR
 *   - Android SDK / Gradle installed via Android Studio
 *
 * Usage:
 *   node scripts/deploy-android.mjs [--track internal|alpha|beta|production]
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, createReadStream } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const ANDROID_DIR = resolve(WEB_DIR, 'android');
const AAB_PATH = resolve(ANDROID_DIR, 'app/build/outputs/bundle/release/app-release.aab');
const PACKAGE_NAME = 'com.socialorganizer.app';

const trackArg = process.argv.indexOf('--track');
const TRACK = trackArg !== -1 ? process.argv[trackArg + 1] : 'internal';

const JAVA_HOME = process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const isWindows = process.platform === 'win32';

function run(cmd, cwd = ROOT) {
  const winCmd = isWindows ? cmd.replace(/^npx /, 'npx.cmd ') : cmd;
  console.log(`\n▶ ${winCmd}`);
  execSync(winCmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, JAVA_HOME },
    shell: isWindows ? 'cmd.exe' : undefined,
  });
}

// ── 1. Build web ──────────────────────────────────────────────────────────────
console.log('\n━━━ 1/4  Building web app ━━━');
run('pnpm --filter @so/web build');

// ── 2. Sync Capacitor ─────────────────────────────────────────────────────────
console.log('\n━━━ 2/4  Syncing Capacitor ━━━');
run('npx cap sync android', WEB_DIR);

// ── 3. Build AAB ──────────────────────────────────────────────────────────────
console.log('\n━━━ 3/4  Building Android AAB ━━━');
const gradleCmd = isWindows
  ? `"${resolve(ANDROID_DIR, 'gradlew.bat')}" bundleRelease`
  : './gradlew bundleRelease';
run(gradleCmd, ANDROID_DIR);

if (!existsSync(AAB_PATH)) {
  console.error(`\n✗ AAB not found at ${AAB_PATH}`);
  process.exit(1);
}
console.log(`\n✓ AAB built: ${AAB_PATH}`);

// ── 4. Upload to Google Play ──────────────────────────────────────────────────
console.log(`\n━━━ 4/4  Uploading to Google Play (track: ${TRACK}) ━━━`);

// Load service account credentials
let serviceAccount;
const saFile = resolve(__dirname, 'google-play-service-account.json');
if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);
} else if (existsSync(saFile)) {
  serviceAccount = JSON.parse(readFileSync(saFile, 'utf8'));
} else {
  console.error('\n✗ No service account found.');
  console.error('  Option 1: set GOOGLE_PLAY_SERVICE_ACCOUNT env var (JSON string)');
  console.error('  Option 2: place scripts/google-play-service-account.json');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const androidPublisher = google.androidpublisher({ version: 'v3', auth });

(async () => {
  // Create edit
  const editRes = await androidPublisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = editRes.data.id;
  console.log(`  Edit created: ${editId}`);

  // Upload AAB
  const uploadRes = await androidPublisher.edits.bundles.upload({
    packageName: PACKAGE_NAME,
    editId,
    requestBody: {},
    media: {
      mimeType: 'application/octet-stream',
      body: createReadStream(AAB_PATH),
    },
  });
  const versionCode = uploadRes.data.versionCode;
  console.log(`  AAB uploaded, versionCode: ${versionCode}`);

  // Assign to track
  await androidPublisher.edits.tracks.update({
    packageName: PACKAGE_NAME,
    editId,
    track: TRACK,
    requestBody: {
      track: TRACK,
      releases: [{ versionCodes: [String(versionCode)], status: 'completed' }],
    },
  });
  console.log(`  Assigned to track: ${TRACK}`);

  // Commit edit
  await androidPublisher.edits.commit({ packageName: PACKAGE_NAME, editId });
  console.log(`\n✓ Upload complete! versionCode ${versionCode} is live on track "${TRACK}"`);
})().catch((err) => {
  console.error('\n✗ Upload failed:', err.message || err);
  process.exit(1);
});
