import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppShot } from './app/AppScreens';
import './app/app-chapter.css';

/** The phones are the app's own components: they load on their own when the chapter comes near. */
const AppPhone = lazy(() => import('./app/AppScreens').then((m) => ({ default: m.AppPhone })));

const SHOTS: { key: AppShot; title: string }[] = [
  { key: 'circle', title: 'nav.circle' },
  { key: 'need', title: 'collection.title' },
  { key: 'add', title: 'nav.add' },
];

/**
 * "In the app" after the story: three real screens (the Circle, a Need, Add) in phone frames, with one line each.
 * The words are here, in the landing's first load; the phones come in a chunk of their own (app/AppScreens).
 */
export function AppChapter({ shortfall, mine }: { shortfall: number; mine: number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      setSeen(true);
      return;
    }
    // a screen ahead: the chunk is there by the time the phones scroll in
    const load = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        load.disconnect();
      }
    }, { rootMargin: '100% 0px' });
    const show = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        show.disconnect();
      }
    }, { threshold: 0.2 });
    load.observe(el);
    show.observe(el);
    return () => {
      load.disconnect();
      show.disconnect();
    };
  }, []);

  return (
    <section className="sec lvapp" id="app" ref={ref} aria-labelledby="lv-app-title">
      <div className="wrap">
        <div className="lvapp-head">
          <span className="mono">{t('landing.v2.story.b9.label')}</span>
          <h2 id="lv-app-title">{t('landing.v2.app.title')}</h2>
        </div>
      </div>
      {/* On a phone the row scrolls sideways: it takes focus so the arrow keys can move it too */}
      <div className={seen ? 'lvapp-row on' : 'lvapp-row'} role="group" aria-labelledby="lv-app-title" tabIndex={0}>
        {SHOTS.map((shot, i) => (
          <figure key={shot.key} className={`lvapp-shot lvapp-${shot.key}`} style={{ '--i': i } as CSSProperties}>
            {/* An illustration: the caption says what it shows, so nothing inside is read out or focused */}
            <div className="lvapp-stage" aria-hidden="true" inert>
              {near ? (
                <Suspense fallback={<div className="lvapp-phone lvapp-empty" />}>
                  <AppPhone shot={shot.key} shortfall={shortfall} mine={mine} />
                </Suspense>
              ) : (
                <div className="lvapp-phone lvapp-empty" />
              )}
            </div>
            <figcaption>
              <span className="mono">{t(shot.title)}</span>
              <p>{t(`landing.v2.app.${shot.key}`)}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="wrap lvapp-foot">
        <a className="btn care" href="#start">
          {t('landing.v2.hero.cta')}
        </a>
      </div>
    </section>
  );
}
