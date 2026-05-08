# iOS App Store Deployment Guide

## Prerequisites (one-time setup on Mac)

```bash
# Xcode — install from Mac App Store (if not installed)

# CocoaPods
sudo gem install cocoapods

# pnpm (if not installed)
npm install -g pnpm
```

## Step 1 — Prepare the app icon

Place a **1024×1024 PNG** (no transparency, no rounded corners — Apple rounds them automatically) at:

```
apps/web/resources/icon.png
```

Optionally add a splash screen (2732×2732 PNG):
```
apps/web/resources/splash.png
apps/web/resources/splash-dark.png
```

## Step 2 — Apple Developer Portal (browser, one-time)

1. Go to [developer.apple.com](https://developer.apple.com) → **Account**
2. **Certificates, IDs & Profiles → Identifiers** → `+`
   - Type: App ID → App
   - Bundle ID: `com.socialorganizer.app` (Explicit)
   - Enable: Push Notifications
   - Register
3. **Certificates** → `+`
   - Apple Distribution → follow wizard (needs CSR from Keychain on Mac)
   - Download and double-click to install in Keychain
4. **Profiles** → `+`
   - App Store Connect → select `com.socialorganizer.app`
   - Select Distribution certificate
   - Download the `.mobileprovision` file

## Step 3 — App Store Connect (browser, one-time)

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. **My Apps** → `+` → New App
   - Platform: iOS
   - Name: Social Organizer
   - Bundle ID: `com.socialorganizer.app`
   - SKU: `socialorganizer` (any unique string)
3. Fill in **App Information**, **Pricing**, **App Privacy**
4. Add **Screenshots** (required: 6.7" iPhone — e.g. iPhone 15 Pro Max)
5. Write **Description**, **Keywords**, **Support URL**

## Step 4 — Build & Upload (Mac terminal)

```bash
# Clone / pull latest
git pull

# Run the deploy script
bash scripts/deploy-ios.sh
```

The script will:
- Build the web app
- Add iOS platform (first run only)
- Generate all icon sizes from `resources/icon.png`
- Sync and open Xcode

## Step 5 — Xcode

1. Select **`App` target** (left panel)
2. **Signing & Capabilities** tab
   - Team: select your Apple Developer account
   - Bundle Identifier: `com.socialorganizer.app`
   - Signing: Automatic (or import the `.mobileprovision` manually)
3. Set **Version** (e.g. `1.0`) and **Build** (e.g. `1`)
4. Select destination: **Any iOS Device (arm64)**
5. **Product → Archive** (takes 2–5 min)
6. In Organizer window: **Distribute App**
   - App Store Connect → Upload → Next → Next → Upload
7. Wait ~10 min for processing in App Store Connect

## Step 6 — Submit for Review

1. In App Store Connect → Your app → iOS App → `+` next to Build
2. Select the uploaded build
3. Fill in **What's New**
4. **Add for Review** → **Submit to App Review**

Review takes 1–3 days.

---

## Version bumping (subsequent releases)

Edit `apps/web/ios/App/App.xcodeproj` version in Xcode, or use `agvtool`:
```bash
cd apps/web/ios/App
agvtool new-marketing-version 1.1
agvtool next-version -all
```
