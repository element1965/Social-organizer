import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy to the API. A phone on the same Wi-Fi opens http://<pc-ip>:3000, so the browser sends
// Origin http://<pc-ip>:3000; it is rewritten to localhost:3000, which the API's CORS allowlist accepts.
// Production serves web and API from one domain and never goes through this proxy.
const apiProxy = (extra: Record<string, unknown> = {}) => ({
  target: 'http://localhost:3001',
  changeOrigin: true,
  configure: (proxy: { on: (event: string, cb: (req: { getHeader: (k: string) => unknown; setHeader: (k: string, v: string) => void }) => void) => void }) => {
    proxy.on('proxyReq', (proxyReq) => {
      if (proxyReq.getHeader('origin')) proxyReq.setHeader('origin', 'http://localhost:3000');
    });
  },
  ...extra,
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Listen on all interfaces so the app can be opened from a phone on the same network
    // (see docs/redesign/README.md, "Testing on a phone").
    host: true,
    proxy: {
      '/trpc': apiProxy(),
      '/api': apiProxy(),
      '/gun': apiProxy({ ws: true }),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three/')) return 'r3f';
          if (id.includes('react-force-graph') || id.includes('three-spritetext')) return 'force-graph';
          if (id.includes('node_modules/gun/')) return 'gun';
        },
      },
    },
  },
});
