import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, normalizePath, type HtmlTagDescriptor, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { SUPPORTED_LANGUAGES } from '../../packages/i18n/src/languages';
import { renderPublicSitemap } from '../../packages/shared/src/web-routes';
import { DEFAULT_WEB_APP_URL } from '../../packages/shared/src/deployment-defaults';

// Packages that exist only to draw the Circle graph. Kept together so the
// guest landing does not download them (Three.js has a chunk of its own, see below).
const GRAPH_PACKAGES = new Set([
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

// Dev proxy to the API. A phone on the same Wi-Fi sends its LAN origin (http://<pc-ip>:<port>); it is rewritten
// to http://localhost:3000, which the API's CORS allowlist always accepts locally, whatever DEV_WEB_PORT is.
// Production serves web and API from one domain and never goes through this proxy.
const apiProxy = (target: string, extra: Record<string, unknown> = {}) => ({
  target,
  changeOrigin: true,
  configure: (proxy: { on: (event: string, cb: (req: { getHeader: (k: string) => unknown; setHeader: (k: string, v: string) => void }) => void) => void }) => {
    proxy.on('proxyReq', (proxyReq) => {
      if (proxyReq.getHeader('origin')) proxyReq.setHeader('origin', 'http://localhost:3000');
    });
  },
  ...extra,
});

function siteMetadata(siteUrl: string): Plugin {
  const render = (template: string) => template.replaceAll('%WEB_APP_URL%', () => siteUrl);
  const files = ['robots.txt', 'sitemap.xml'];
  const content = (name: string) => name === 'sitemap.xml'
    ? renderPublicSitemap(siteUrl, SUPPORTED_LANGUAGES)
    : render(readFileSync(new URL('./site/' + name, import.meta.url), 'utf8'));
  return {
    name: 'site-metadata',
    transformIndexHtml: { order: 'pre', handler: render },
    configureServer(server) {
      for (const name of files) {
        server.middlewares.use('/' + name, (_req, res) => {
          res.setHeader('Content-Type', name.endsWith('.xml') ? 'application/xml' : 'text/plain');
          res.end(content(name));
        });
      }
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: 'asset', fileName: name, source: content(name) });
    },
  };
}

function firstPaintPreloads(): Plugin {
  const englishLocale = normalizePath(fileURLToPath(new URL('../../packages/i18n/locales/en.json', import.meta.url)));
  return {
    name: 'first-paint-preloads',
    transformIndexHtml(_html, { bundle }) {
      // Discover both assets in the HTML, after the entry and render-blocking stylesheet.
      const tags: HtmlTagDescriptor[] = [{
        tag: 'link',
        attrs: { rel: 'preload', href: '/fonts/manrope-latin.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
        injectTo: 'head',
      }];
      const english = bundle && Object.values(bundle).find((entry) =>
        entry.type === 'chunk' && entry.facadeModuleId && normalizePath(entry.facadeModuleId) === englishLocale,
      );
      if (english) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'modulepreload', href: `/${english.fileName}`, crossorigin: '' },
          injectTo: 'head',
        });
      }
      return tags;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['DEV_', 'VITE_']);
  const apiTarget = env.DEV_API_TARGET || 'http://localhost:3001';
  const siteUrl = (env.VITE_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');
  return {
    plugins: [react(), siteMetadata(siteUrl), firstPaintPreloads()],
    resolve: {
      alias: [{
        find: /^three\/webgpu$/,
        replacement: fileURLToPath(new URL('./build/webgpu-shim.ts', import.meta.url)),
      }],
    },
    server: {
      port: Number(env.DEV_WEB_PORT) || 3000,
      strictPort: true,
      // Listen on all interfaces so the app can be opened from a phone on the same network
      // (see docs/redesign/README.md, "Testing on a phone").
      host: true,
      proxy: {
        '/health': apiProxy(apiTarget),
        '/trpc': apiProxy(apiTarget),
        '/api': apiProxy(apiTarget),
        '/gun': apiProxy(apiTarget, { ws: true }),
      },
    },
    build: {
      outDir: 'dist',
      // No public source maps in production. `pnpm --filter @so/web build --sourcemap` for local debugging.
      sourcemap: false,
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
            // Three.js core alone: the guest landing's flock scene needs it without the graph libraries. The
            // examples the graph uses (controls, renderers) go with the graph; the landing's line addons stay
            // with the scene that imports them.
            if (pkg === 'three') {
              if (/[\\/]three[\\/]examples[\\/]jsm[\\/]lines[\\/]/.test(id)) return;
              return /[\\/]three[\\/]examples[\\/]/.test(id) ? 'graph3d' : 'three';
            }
            if (GRAPH_PACKAGES.has(pkg) || pkg.startsWith('@react-three/') || pkg.startsWith('d3-') || pkg.startsWith('ngraph.')) {
              return 'graph3d';
            }
          },
        },
      },
    },
  };
});
