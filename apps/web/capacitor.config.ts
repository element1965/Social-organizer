import type { CapacitorConfig } from '@capacitor/cli';
import {
  DEFAULT_ANDROID_APP_PACKAGE,
  DEFAULT_APPLE_BUNDLE_ID,
  DEFAULT_WEB_APP_URL,
} from '../../packages/shared/src/deployment-defaults';

// Light --so-canvas from src/styles/tokens.css, closest to the existing white native splash.
const startupCanvas = '#f3f6f4';

const config: CapacitorConfig = {
  appId: process.argv.includes('ios')
    ? process.env.VITE_APPLE_BUNDLE_ID || DEFAULT_APPLE_BUNDLE_ID
    : process.env.VITE_ANDROID_APP_PACKAGE || DEFAULT_ANDROID_APP_PACKAGE,
  appName: 'Social Organizer',
  webDir: 'dist',
  server: {
    // Point to the production API — the Android app is a standalone client
    url: process.env.VITE_WEB_APP_URL || DEFAULT_WEB_APP_URL,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: startupCanvas,
  },
  ios: {
    scheme: 'socialorganizer',
    preferredContentMode: 'mobile',
    backgroundColor: startupCanvas,
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: startupCanvas,
      overlaysWebView: false,
    },
    App: {
      // Deep links for invite URLs
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Live QR scan draws the camera behind the WebView. Android is wired by cap sync.
    // This iOS project is SPM. @capacitor-mlkit/barcode-scanning 8.2.2 ships CocoaPods only,
    // so a store build needs the pod (or an SPM port) before native scan works on iOS.
    // Until then the scanner falls back to the browser camera.
    BarcodeScanner: {},
  },
};

export default config;
