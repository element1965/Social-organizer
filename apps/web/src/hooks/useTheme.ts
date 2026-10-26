import { create } from 'zustand';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isTelegramWebApp, getTGColorScheme } from '@so/tg-adapter';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  // In Telegram, "system" means follow Telegram's colorScheme
  const isDark = mode === 'system'
    ? (isTelegramWebApp()
      ? getTGColorScheme() === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches)
    : mode === 'dark';
  root.classList.toggle('dark', isDark);

  // Native app: status bar icons must contrast with the app background, not the phone theme
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }
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
