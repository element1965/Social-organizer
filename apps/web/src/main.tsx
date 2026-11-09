import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { BrandMark } from './components/ui2/BrandMark';
import { applyStoredFontScale } from './components/profile/fontScale';
import i18n, { i18nReady } from './lib/i18n';
import './index.css';

/** One automatic reload after a stale lazy chunk. The timestamp blocks a loop. */
const PRELOAD_RELOAD_KEY = 'so.preloadReloadAt';
const PRELOAD_RELOAD_WINDOW_MS = 10_000;

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
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

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <ReloadScreen />;
    return this.props.children;
  }
}

applyStoredFontScale();

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
