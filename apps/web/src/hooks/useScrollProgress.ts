import { useState, useEffect, useRef } from 'react';

export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);
  const rafId = useRef(0);

  useEffect(() => {
    const update = () => {
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const maxScroll = docHeight - winHeight;
      if (maxScroll <= 0) {
        setProgress(0);
        return;
      }
      const raw = window.scrollY / maxScroll;
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return progress;
}
