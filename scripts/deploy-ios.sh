#!/bin/bash
# iOS App Store build script — run on macOS with Xcode installed
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$ROOT_DIR/apps/web"

echo "=== Social Organizer — iOS App Store Build ==="
echo ""

# 1. Check prerequisites
echo "[1/6] Checking prerequisites..."
command -v xcodebuild >/dev/null 2>&1 || { echo "ERROR: Xcode not found. Install from App Store."; exit 1; }
command -v pod >/dev/null 2>&1 || { echo "ERROR: CocoaPods not found. Run: sudo gem install cocoapods"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not found. Run: npm install -g pnpm"; exit 1; }

# 2. Install dependencies
echo "[2/6] Installing dependencies..."
cd "$ROOT_DIR"
pnpm install

# 3. Add the iOS platform if needed
cd "$WEB_DIR"
if [ ! -d "ios" ]; then
  echo "[3/6] Adding iOS platform (first time)..."
  npx cap add ios
else
  echo "[3/6] Using the existing iOS project..."
fi

# 4. Generate the web and native brand assets together
echo "[4/6] Generating brand assets..."
cd "$ROOT_DIR"
node scripts/generate-site-icons.mjs

# 5. Build web app
echo "[5/6] Building web app..."
pnpm --filter '@so/web...' build
# The wrapper loads the production URL, so large static media (served by the web app) stays out of the bundle.
rm -rf "$WEB_DIR/dist/videos"

# 6. Sync web build to iOS
echo "[6/6] Syncing to iOS..."
cd "$WEB_DIR"
npx cap sync ios

echo ""
echo "=== Done! Opening Xcode... ==="
echo ""
echo "In Xcode:"
echo "  1. Select 'App' target → Signing & Capabilities"
echo "  2. Set Team to your Apple Developer account"
echo "  3. Bundle ID: ${VITE_APPLE_BUNDLE_ID:-com.socialorganizer.app}"
echo "  4. Version: bump if needed"
echo "  5. Product → Archive"
echo "  6. Distribute App → App Store Connect → Upload"
echo ""

npx cap open ios
