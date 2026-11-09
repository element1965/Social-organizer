import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Packages that exist only to draw the Circle graph. Kept together so the
// guest landing does not download them.
const GRAPH_PACKAGES = new Set([
  'three',
  'react-force-graph-3d',
  '3d-force-graph',
  'three-spritetext',
  'three-forcegraph',
  'three-render-objects',
  'accessor-fn',
  'data-bind-mapper',
  'float-tooltip',
  'internmap',
  'jerrypick',
  'kapsule',
  'react-kapsule',
  '@tweenjs/tween.js',
  'tinycolor2',
  // Used only by the graph libraries. Leaving them out splits a chunk that
  // imports the graph chunk back, which is a load cycle.
  '@babel/runtime',
  'lodash-es',
  'polished',
  'preact',
  'prop-types',
]);

function packageName(id: string): string | null {
  const norm = id.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const at = norm.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = norm.slice(at + marker.length).split('/');
  if (parts[0]?.startsWith('@')) return `${parts[0]}/${parts[1] ?? ''}`;
  return parts[0] || null;
}

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
        // Shared modules (React, the CJS helper) must stay out of these chunks.
        // Otherwise the entry statically imports them and the guest landing
        // downloads Three and Gun. Every graph package goes in one chunk so
        // the graph libraries do not import each other across chunks.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const pkg = packageName(id);
          if (!pkg) return;
          if (pkg === 'gun') return 'gun';
          if (GRAPH_PACKAGES.has(pkg) || pkg.startsWith('@react-three/') || pkg.startsWith('d3-') || pkg.startsWith('ngraph.')) {
            return 'graph3d';
          }
        },
      },
    },
  },
});
