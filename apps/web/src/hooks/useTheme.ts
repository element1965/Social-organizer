import { create } from 'zustand';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isTelegramWebApp, getTGColorScheme } from '@so/tg-adapter';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

type MediaWithLegacy = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

let stopSystemListener: (() => void) | null = null;

function watchColorScheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)') as MediaWithLegacy;
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  media.addListener?.(onChange);
  return () => media.removeListener?.(onChange);
}

function paint(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }
}

function applyTheme(mode: ThemeMode) {
  stopSystemListener?.();
  stopSystemListener = null;

  // Inside the Mini App the stored choice is ignored. Telegram colorScheme is the only source.
  if (isTelegramWebApp()) {
    paint(getTGColorScheme() === 'dark');
    return;
  }

  if (mode === 'system') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    paint(media.matches);
    stopSystemListener = watchColorScheme(() => paint(media.matches));
    return;
  }

  paint(mode === 'dark');
}

const stored = (localStorage.getItem('theme') as ThemeMode) || 'system';
applyTheme(stored);

export const useTheme = create<ThemeState>((set) => ({
  mode: stored,
  setMode: (mode) => {
    localStorage.setItem('theme', mode);
    applyTheme(mode);
    set({ mode });
  },
}));
