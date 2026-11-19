import { useEffect, useState, type ReactNode } from 'react';

/** Mount the live region empty so assistive technology can register it before the first update. */
export function LiveNotice({ children, urgent = false }: { children: ReactNode; urgent?: boolean }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 150);
    return () => window.clearTimeout(timer);
  }, []);

  // The roles supply live-region politeness. Repeating it with aria-live can announce alerts twice.
  return <div className="sr-only" role={urgent ? 'alert' : 'status'} aria-atomic="true">{ready ? children : null}</div>;
}
