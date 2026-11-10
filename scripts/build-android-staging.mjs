#!/usr/bin/env node
/**
 * Build the staging Android app (wraps https://social-organizer-staging.up.railway.app)
 * and install it on a connected device over adb.
 *
 * The staging app has its own package id (com.socialorganizer.app.staging) and name
 * ("SO Staging"), so it installs next to the Google Play app without touching it.
 *
 * Usage:
 *   node scripts/build-android-staging.mjs [--no-web] [--no-install] [--url <staging url>]
 *
 *   --no-web      skip `pnpm --filter @so/web build` (reuse apps/web/dist)
 *   --no-install  only build the APK
 *   --url         wrap another URL (default: Railway staging)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const ANDROID_DIR = resolve(WEB_DIR, 'android');
const APK_PATH = resolve(ANDROID_DIR, 'app/build/outputs/apk/staging/app-staging.apk');
const PACKAGE = 'com.socialorganizer.app.staging';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const urlArg = args.indexOf('--url');
const STAGING_URL = urlArg !== -1 ? args[urlArg + 1] : null;

const isWindows = process.platform === 'win32';
// Gradle 8.14 runs on JDK 17–24. Newer Android Studio ships JBR 25, so prefer a JDK 21 in ~/.jdks.
function findJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const jdks = resolve(homedir(), '.jdks');
  const jdk21 = existsSync(jdks) && readdirSync(jdks).find((d) => /^jdk-21/.test(d));
  if (jdk21) return resolve(jdks, jdk21);
  return 'C:\\Program Files\\Android\\Android Studio\\jbr';
}
const JAVA_HOME = findJavaHome();
// Windows JDKs open an AF_UNIX socket in %TEMP% for NIO pipes; on some machines that fails
// ("Unable to establish loopback connection"). A short dedicated directory avoids it.
const UDS_DIR = resolve(homedir(), '.jdk-uds');
mkdirSync(UDS_DIR, { recursive: true });
const JAVA_TOOL_OPTIONS = [process.env.JAVA_TOOL_OPTIONS, `-Djdk.net.unixdomain.tmpdir=${UDS_DIR}`]
  .filter(Boolean)
  .join(' ');
const SDK =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (isWindows ? resolve(process.env.LOCALAPPDATA || '', 'Android/Sdk') : resolve(process.env.HOME || '', 'Android/Sdk'));
const ADB = resolve(SDK, 'platform-tools', isWindows ? 'adb.exe' : 'adb');

function run(cmd, cwd = ROOT) {
  const winCmd = isWindows ? cmd.replace(/^npx /, 'npx.cmd ') : cmd;
  console.log(`\n▶ ${winCmd}`);
  execSync(winCmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, JAVA_HOME, JAVA_TOOL_OPTIONS, ANDROID_HOME: SDK },
    shell: isWindows ? 'cmd.exe' : undefined,
  });
}

if (!flag('--no-web') || !existsSync(resolve(WEB_DIR, 'dist/index.html'))) {
  console.log('\n━━━ Building web app ━━━');
  run('pnpm --filter @so/web build');
}
// The wrapper loads the remote URL, so large static media stays out of the APK.
rmSync(resolve(WEB_DIR, 'dist/videos'), { recursive: true, force: true });

console.log('\n━━━ Syncing Capacitor ━━━');
run('npx cap sync android', WEB_DIR);

console.log('\n━━━ Building staging APK ━━━');
const gradlew = isWindows ? `"${resolve(ANDROID_DIR, 'gradlew.bat')}"` : './gradlew';
run(`${gradlew} assembleStaging${STAGING_URL ? ` -PstagingUrl=${STAGING_URL}` : ''}`, ANDROID_DIR);

if (!existsSync(APK_PATH)) {
  console.error(`\n✗ APK not found at ${APK_PATH}`);
  process.exit(1);
}
console.log(`\n✓ APK built: ${APK_PATH}`);

if (flag('--no-install')) process.exit(0);

console.log('\n━━━ Installing on device ━━━');
if (!existsSync(ADB)) {
  console.error(`✗ adb not found at ${ADB}. Install Android SDK Platform-Tools.`);
  process.exit(1);
}
run(`"${ADB}" install -r "${APK_PATH}"`);
run(`"${ADB}" shell monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
console.log(`\n✓ Installed and launched ${PACKAGE}`);
