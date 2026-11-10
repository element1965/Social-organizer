import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Start-up loader. The markup and CSS live in index.html (classes `so-boot-*`) so the very same
 * picture shows before the bundle arrives and while the first route loads: no jump between them.
 * Orbiting dots on two rings around the brand mark, like a small network of handshakes.
 */

const SLOW_AFTER_MS = 8000;
const FADE_MS = 320;

/** Phase (ms) of the HTML loader's animations, read once before React replaces it. */
let bootPhaseMs = 0;

/** Call before the first render: remembers where the inline loader's animation is. */
export function captureBootPhase() {
  try {
    const ring = document.querySelector('.so-boot .so-boot-r1');
    const time = ring?.getAnimations()[0]?.currentTime;
    if (typeof time === 'number') bootPhaseMs = time;
  } catch {
    /* no Web Animations API: the phase restarts, which is harmless */
  }
}

const vars = (values: Record<string, string | number>) => values as unknown as CSSProperties;

const RINGS = (
  <>
    <span className="so-boot-ring so-boot-r1">
      <b style={vars({ '--a': '0deg', '--d': '9px' })} />
      <b style={vars({ '--a': '120deg', '--d': '6px', '--o': 0.6, '--p': '-1s' })} />
      <b style={vars({ '--a': '235deg', '--d': '7px', '--o': 0.8, '--p': '-2s' })} />
    </span>
    <span className="so-boot-ring so-boot-r2">
      <b style={vars({ '--a': '60deg', '--d': '6px', '--o': 0.7, '--p': '-0.5s' })} />
      <b style={vars({ '--a': '200deg', '--d': '8px', '--p': '-1.5s' })} />
    </span>
    <span className="so-boot-mark">
      <i />
    </span>
  </>
);

/** Full-screen loader for the initial route chunks and the signed-in bootstrap. Fades out when it unmounts. */
export function AppLoader() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The page has been loading since navigation start, not since this component mounted
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), Math.max(0, SLOW_AFTER_MS - performance.now()));
    return () => clearTimeout(id);
  }, []);

  // Leave a copy that fades away over the screen that replaces this one, so the hand-over is not a cut
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const copy = node.cloneNode(true) as HTMLElement;
    const shownAt = performance.now();
    return () => {
      copy.querySelector('.so-boot-note')?.remove();
      copy.classList.add('so-boot-out');
      copy.setAttribute('aria-hidden', 'true');
      copy.style.setProperty('--boot-delay', `-${Math.round(bootPhaseMs + performance.now() - shownAt)}ms`);
      document.body.appendChild(copy);
      setTimeout(() => copy.remove(), FADE_MS + 50);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="so-boot"
      role="status"
      aria-label={t('common.loading')}
      style={vars({ '--boot-delay': `-${Math.round(bootPhaseMs)}ms` })}
    >
      <div className="so-boot-stage" aria-hidden>
        {RINGS}
      </div>
      {slow ? <p className="so-boot-note">{t('common.stillLoading')}</p> : null}
    </div>
  );
}
