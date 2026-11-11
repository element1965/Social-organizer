import { useEffect, useState } from 'react';
import { useTheme } from './useTheme';

/** True when html.dark is on (the effective theme, whatever the stored mode: system, Telegram, choice). */
export function useIsDark(): boolean {
  const mode = useTheme((s) => s.mode);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains('dark'));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [mode]);
  return dark;
}
