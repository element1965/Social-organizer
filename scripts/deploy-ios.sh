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

# 2. Check icon source
echo "[2/6] Checking resources..."
if [ ! -f "$WEB_DIR/resources/icon.png" ]; then
  echo ""
  echo "  MISSING: apps/web/resources/icon.png (1024x1024 PNG, no transparency)"
  echo "  Put your app icon there, then re-run this script."
  echo ""
  exit 1
fi

# 3. Install dependencies
echo "[3/6] Installing dependencies..."
cd "$ROOT_DIR"
pnpm install

# 4. Build web app
echo "[4/6] Building web app..."
pnpm --filter @so/web build

# 5. Add iOS platform if not exists
cd "$WEB_DIR"
if [ ! -d "ios" ]; then
  echo "[5/6] Adding iOS platform (first time)..."
  npx cap add ios
else
  echo "[5/6] iOS platform already exists, syncing..."
fi

# 6. Generate icons and splash screens
echo "[6/6] Generating iOS icons & splash screens..."
npx capacitor-assets generate --ios

# 7. Sync web build to iOS
echo "[7/6] Syncing to iOS..."
npx cap sync ios

echo ""
echo "=== Done! Opening Xcode... ==="
echo ""
echo "In Xcode:"
echo "  1. Select 'App' target → Signing & Capabilities"
echo "  2. Set Team to your Apple Developer account"
echo "  3. Bundle ID: com.socialorganizer.app"
echo "  4. Version: bump if needed"
echo "  5. Product → Archive"
echo "  6. Distribute App → App Store Connect → Upload"
echo ""

npx cap open ios
