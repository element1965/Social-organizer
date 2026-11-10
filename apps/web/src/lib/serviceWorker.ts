import { isTelegramWebApp } from '@so/tg-adapter';

/**
 * Register /sw.js (offline app shell + Web Push). One registration serves both: the push subscription code
 * calls this with `force` and gets the same one.
 *
 * Skipped on purpose:
 *  - dev (`import.meta.env.DEV`): the worker would cache Vite modules;
 *  - the Telegram Mini App webview: it is always opened from a Telegram chat (so there is a connection), it
 *    needs a fresh shell with the launch parameters, and Telegram's webviews handle workers inconsistently.
 *    The saved-copy screens still work there if the connection drops after the app has loaded.
 * Browsers without service workers (iOS WKWebView wrappers) simply have no offline shell.
 */
export function registerServiceWorker(options: { force?: boolean } = {}): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!options.force && (import.meta.env.DEV || isTelegramWebApp())) return Promise.resolve(null);
  // updateViaCache: 'none' makes every update check fetch /sw.js from the network, so a kill-switch or a fixed
  // worker is picked up on the next visit.
  return navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .catch(() => null);
}

/** Register once the page has loaded, so the first paint never waits for it. */
export function registerServiceWorkerOnLoad() {
  const run = () => void registerServiceWorker();
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
