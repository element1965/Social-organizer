import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { isTelegramWebApp } from '@so/tg-adapter';

export type ShellMode = 'tabs' | 'rail' | 'sidebar';

/** Telegram Mini App and the native wrapper always use the phone shell. */
export function isForcedPhoneShell(): boolean {
  return isTelegramWebApp() || Capacitor.isNativePlatform();
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(query) as MediaQueryList & {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    const onChange = () => setMatches(media.matches);
    onChange();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener?.(onChange);
    return () => media.removeListener?.(onChange);
  }, [query]);

  return matches;
}

/** Tab bar under 768, rail from 768, sidebar from 1024. Phone shells stay on tabs. */
export function useShellMode(): ShellMode {
  const sidebar = useMediaQuery('(min-width: 1024px)');
  const rail = useMediaQuery('(min-width: 768px)');
  if (isForcedPhoneShell()) return 'tabs';
  if (sidebar) return 'sidebar';
  if (rail) return 'rail';
  return 'tabs';
}

const TAB_ROOTS = new Set(['/', '/ask', '/add', '/me']);

/** Push screens hide the tab bar. Tab roots and the desktop nav stay put. */
export function isPushPath(pathname: string): boolean {
  if (TAB_ROOTS.has(pathname)) return false;
  return (
    pathname.startsWith('/people') ||
    pathname.startsWith('/person') ||
    pathname.startsWith('/collection') ||
    pathname.startsWith('/me/') ||
    pathname.startsWith('/add/') ||
    pathname.startsWith('/support') ||
    pathname.startsWith('/matches') ||
    pathname.startsWith('/skills') ||
    pathname.startsWith('/needs')
  );
}

export type ShellSection = 'circle' | 'people' | 'ask' | 'add' | 'profile';

export function shellSection(pathname: string): ShellSection | null {
  if (pathname === '/' || pathname.startsWith('/collection')) return 'circle';
  if (pathname.startsWith('/people') || pathname.startsWith('/person')) return 'people';
  if (pathname === '/ask') return 'ask';
  if (pathname === '/add' || pathname.startsWith('/add/')) return 'add';
  if (pathname === '/me' || pathname.startsWith('/me/')) return 'profile';
  return null;
}
