import type { CapacitorConfig } from '@capacitor/cli';

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
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e293b',
    },
    App: {
      // Deep links for invite URLs
    },
  },
};

export default config;
