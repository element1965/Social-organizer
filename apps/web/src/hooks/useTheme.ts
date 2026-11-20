import { create } from 'zustand';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
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
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  if (Capacitor.isNativePlatform() && !isTelegramWebApp()) {
    SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    if (Capacitor.isPluginAvailable('StatusBar')) {
      // Edge-to-edge Android uses the CSS canvas behind the bar instead.
      const canvas = getComputedStyle(root).getPropertyValue('--so-canvas').trim();
      if (canvas) {
        const hex = canvas.split(/\s+/).map((channel) => Number(channel).toString(16).padStart(2, '0')).join('');
        StatusBar.setBackgroundColor({ color: `#${hex}` }).catch(() => {});
      }
    }
  }
}

export function paintTelegramTheme() {
  paint(getTGColorScheme() === 'dark');
}

function applyTheme(mode: ThemeMode) {
  stopSystemListener?.();
  stopSystemListener = null;

  // Inside the Mini App the stored choice is ignored. Telegram colorScheme is the only source.
  if (isTelegramWebApp()) {
    paintTelegramTheme();
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
    if (isTelegramWebApp()) return;
    localStorage.setItem('theme', mode);
    applyTheme(mode);
    set({ mode });
  },
}));
