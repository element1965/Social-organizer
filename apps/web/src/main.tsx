import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { BrandMark } from './components/ui2/BrandMark';
import { applyStoredFontScale } from './components/profile/fontScale';
import i18n, { i18nReady } from './lib/i18n';
import { registerServiceWorkerOnLoad } from './lib/serviceWorker';
import { isOffline } from './lib/connectivity';
import { sweepSavedCopy } from './lib/savedCopy';
import './index.css';

/** One automatic reload after a stale lazy chunk. The timestamp blocks a loop. */
const PRELOAD_RELOAD_KEY = 'so.preloadReloadAt';
const PRELOAD_RELOAD_WINDOW_MS = 10_000;

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  // No connection: a reload cannot fetch the missing file; the route boundary explains it instead
  if (isOffline()) return;
  let recent = false;
  try {
    const previous = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || '0');
    const now = Date.now();
    recent = Number.isFinite(previous) && previous > 0 && now - previous < PRELOAD_RELOAD_WINDOW_MS;
    if (!recent) sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now));
  } catch {
    return;
  }
  if (!recent) window.location.reload();
});

function reloadLabel(): string {
  const fallback = 'Reload the page';
  if (!i18n.isInitialized) return fallback;
  return i18n.t('common.reloadPage', { defaultValue: fallback });
}

/** Calm full-page recovery when a render or a lazy chunk fails after the one reload. */
function ReloadScreen() {
  const label = reloadLabel();
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center text-ink">
      <div className="flex max-w-xs flex-col items-center gap-5">
        <BrandMark size={56} />
        <p className="text-title font-bold">{label}</p>
        <button
          type="button"
          className="so-focus h-12 rounded-lg bg-care px-5 text-body font-bold text-care-on"
          onClick={() => window.location.reload()}
        >
          {label}
        </button>
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<{ failed: boolean }> {
    // A DOM node that something outside React already took away (a browser extension or translator,
    // a portal torn down with its parent) throws NotFoundError from removeChild. The state is intact:
    // one quiet remount of the tree beats a "Reload the page" screen.
    if (error instanceof DOMException && error.name === 'NotFoundError' && !domRecovered) {
      domRecovered = true;
      return {};
    }
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (error instanceof DOMException && error.name === 'NotFoundError' && !this.state.failed) {
      this.setState((s) => ({ attempt: s.attempt + 1 }));
    }
  }

  render() {
    if (this.state.failed) return <ReloadScreen />;
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

/** The quiet remount after a stray DOM error happens once per page load, so a real loop still reaches the reload screen. */
let domRecovered = false;

applyStoredFontScale();
sweepSavedCopy();
registerServiceWorkerOnLoad();

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}

// Render after the user's locale (and the English fallback) arrive; if loading fails, render anyway with keys
// falling back to English or the key itself rather than a blank page.
i18nReady.then(render, render);
