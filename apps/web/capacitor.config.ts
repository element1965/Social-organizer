import type { CapacitorConfig } from '@capacitor/cli';

// Light --so-canvas from src/styles/tokens.css, closest to the existing white native splash.
const startupCanvas = '#f3f6f4';

const config: CapacitorConfig = {
  appId: 'com.socialorganizer.app',
  appName: 'Social Organizer',
  webDir: 'dist',
  server: {
    // Point to the production API — the Android app is a standalone client
    url: 'https://www.orginizer.com',
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
