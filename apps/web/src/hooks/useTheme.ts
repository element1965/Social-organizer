import { create } from 'zustand';
import { isTelegramWebApp, getTGColorScheme } from '@so/tg-adapter';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') {
    // In Telegram, "system" means follow Telegram's colorScheme
    const isDark = isTelegramWebApp()
      ? getTGColorScheme() === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
  } else {
    root.classList.toggle('dark', mode === 'dark');
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
