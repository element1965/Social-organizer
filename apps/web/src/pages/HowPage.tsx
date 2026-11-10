import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { heroCta, useDevice } from '../lib/device';
import { ChainFigure, HuiFigure, JoinFigure, OrbitFigure, type ChainStep, type JoinStep, type OrbitDepth } from '../components/figures';
import { useStoreLinks } from '../components/site/DeviceEntry';
import { Reveal, usePlayOnEnter, useSitePhone } from '../components/site/hooks';
import { useLoginHref } from '../components/site/SiteHeader';
import { SitePage } from '../components/site/SitePage';
import { useFigureLabels, useMoney } from '../components/site/figureLabels';

const B = { b: <b /> };
/** People per ring when everyone knows six (the example on the page). */
const RING_SIZES = [6, 36, 216] as const;
const SHARE = 15;

/**
 * "How it works" (`/how`, screens.md §17): the two signals, then four interactives, one markup for 1280 and 390.
 * The hui table comes last, as a historical example of mutual assistance and not as the model of the product.
 * Each figure plays its sequence when half of it is on screen and again on every return; sections fade in once.
 * Under prefers-reduced-motion figures show their final state.
 */
export function HowPage() {
  const { t } = useTranslation();
  const device = useDevice();
  const phone = useSitePhone();
  const labels = useFigureLabels();
  const money = useMoney();
  const links = useStoreLinks();
  const loginHref = useLoginHref();
  const arr = (key: string) => t(key, { returnObjects: true }) as unknown as string[];

  /* 4. hui table (historical example, shown last) */
  const [month, setMonth] = useState(0);
  const [huiPlay, setHuiPlay] = useState(0);
  const huiRef = usePlayOnEnter<number>(() => setHuiPlay((n) => n + 1), [1], 0);
  const months = labels.hui.months ?? [];
  const tableSays = arr('how.table.says');

  /* 1. handshake rings */
  const [depth, setDepth] = useState<OrbitDepth>(0);
  const orbitRef = usePlayOnEnter<OrbitDepth>(setDepth, [0, 1, 2], 900);
  const rings = arr('how.orbit.rings');
  const orbitSays = arr('how.orbit.says');
  const reach = RING_SIZES.slice(0, depth + 1).reduce((a, n) => a + n, 0) * SHARE;

  /* 2. path through acquaintances */
  const [chain, setChain] = useState<ChainStep>(0);
  const chainRef = usePlayOnEnter<ChainStep>(setChain, [0, 1, 2], 1000);
  const chainSays = arr('how.chain.says');

  /* 3. a new person */
  const [join, setJoin] = useState<JoinStep>(0);
  const joinRef = usePlayOnEnter<JoinStep>(setJoin, [0, 1], 1400);
  const joinSays = arr('how.join.says');

  // "Start": the device's own way in (Google Play, App Store, or the browser on a computer).
  const primary = heroCta(device).primary;
  const startHref = primary.id === 'play' ? links.play : primary.id === 'appstore' ? links.appstore : null;

  return (
    <SitePage title={t('how.meta.title')} description={t('how.meta.description')} active="how" className="site-how">
      <Reveal as="section" className="site-hero1" aria-labelledby="how-title">
        <h1 id="how-title">{t('how.hero.title')}</h1>
        <p className="lead">
          <Trans i18nKey="how.hero.lead" components={B} />
        </p>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="orbit-title">
        <div className="copy">
          <h2 id="orbit-title">{t('how.orbit.title')}</h2>
          <p className="lead">
            <Trans i18nKey="how.orbit.lead" components={B} />
          </p>
          <div className="site-chips" role="group" aria-label={t('how.orbit.ringsAria')}>
            {rings.map((r, k) => (
              <button key={r} type="button" aria-pressed={k === depth} onClick={() => setDepth(k as OrbitDepth)}>
                {r}
              </button>
            ))}
          </div>
          <p className="site-say" aria-live="polite">
            <Trans defaults={orbitSays[depth] ?? ''} components={B} />
          </p>
          <div className="site-sum">
            <b>{money(reach)}</b>
            <span>{t('how.orbit.sumNote', { share: money(SHARE) })}</span>
          </div>
        </div>
        <div ref={orbitRef} className="site-fig orbit">
          <OrbitFigure depth={depth} labels={labels.orbit} />
        </div>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="chain-title">
        <div className="copy">
          <h2 id="chain-title">{t('how.chain.title')}</h2>
          <p className="lead">{t('how.chain.lead')}</p>
          <p className="site-say" aria-live="polite">
            <Trans defaults={chainSays[chain] ?? ''} components={B} />
          </p>
        </div>
        <div ref={chainRef} className="site-fig chain">
          <ChainFigure step={chain} labels={labels.chain} onSelect={setChain} />
        </div>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="join-title">
        <div className="copy">
          <h2 id="join-title">{t('how.join.title')}</h2>
          <p className="lead">{t('how.join.lead')}</p>
          <p className="site-say" aria-live="polite">
            <Trans defaults={joinSays[join] ?? ''} components={B} />
          </p>
        </div>
        <div ref={joinRef} className="site-fig chain">
          <JoinFigure step={join} labels={labels.join} onSelect={setJoin} />
        </div>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="table-title">
        <div className="copy">
          <h2 id="table-title">{t('how.table.title')}</h2>
          <p className="lead">{t('how.table.lead')}</p>
          <p className="site-note">{t('how.table.note')}</p>
          <div className="site-chips" role="group" aria-label={t('how.table.monthsAria')}>
            {months.map((m, i) => (
              <button key={m} type="button" aria-pressed={i === month} onClick={() => setMonth(i)}>
                {m}
              </button>
            ))}
          </div>
          <p className="site-say" aria-live="polite">
            <Trans defaults={tableSays[month] ?? ''} components={B} />
          </p>
        </div>
        <div ref={huiRef}>
          <HuiFigure month={month} onMonthChange={setMonth} playKey={huiPlay} size={phone ? 320 : 440} labels={labels.hui} />
        </div>
      </Reveal>

      <Reveal as="section" className="site-endcta" aria-labelledby="cta-title">
        <h2 id="cta-title">{t('how.cta.title')}</h2>
        {startHref ? (
          <a className="site-btn primary" href={startHref} target="_blank" rel="noopener noreferrer">
            {t('how.cta.start')}
          </a>
        ) : (
          <Link className="site-btn primary" to={loginHref}>
            {t('how.cta.start')}
          </Link>
        )}
        <Link className="site-btn secondary" to={loginHref}>
          {t('how.cta.web')}
        </Link>
      </Reveal>
    </SitePage>
  );
}
