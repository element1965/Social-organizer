import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_URL } from '../lib/deployment';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { recordLandingEvent, firstTouchCampaign } from '../lib/campaign';
import { Trans, useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { RTL_LANGUAGES } from '@so/i18n/languages';
import { GITHUB_URL, LanguageSelect, useLoginHref } from '../components/site/SiteHeader';
import { usePendingInvite } from '../components/site/DeviceEntry';
import { useDocumentTitle, useLivePeopleCount, useSitePhone } from '../components/site/hooks';
import { REPORT_URL, TEAM_URL } from '../components/site/team';
import { SITE_ORIGIN, storeLinks, useDevice } from '../lib/device';
import { IconGlobe } from '../components/site/icons';
import { initGlide } from '../components/landing/glide';
import { initGrow, type GrowHandle, type GrowOptions } from '../components/landing/grow';
import { initNextNet, type NextNetHandle } from '../components/landing/nextNet';
import type { SceneHandle, SceneOptions } from '../components/landing/scene';
import { storyMoney } from '../components/landing/money';
import { formatIsolatedMoney } from '../components/ui2/format';
import { AppChapter } from '../components/landing/AppChapter';
import '../components/landing/landing.css';

/**
 * Home for a guest: one scroll-told story over a fixed 3D flock of starlings (how a network of people you know
 * works, in eight beats; at the end the flock becomes the graph the app shows), then the growth model, what comes
 * next, the experiment, questions and the app.
 * Ported from the concept prototype (local/media/concept-6, v9; docs/narrative/topics/packaging/landing-concept-flock.md).
 * The page stays in the entry chunk so its words paint at once; Three.js and the scene load with a dynamic import.
 * Signed-in users get the circle instead (App.tsx).
 */

const STUDY_URL = 'https://research.facebook.com/blog/2016/02/three-and-a-half-degrees-of-separation/';
const BOT_URL = TELEGRAM_BOT_URL;
const ICON_CREDITS = 'Gil Barbara logos (CC0)';
/** People with connections in the network on the date in `join.now`. */
const NETWORK_NOW = 287;
const STORES = ['play', 'appstore', 'web', 'telegram'] as const;

function LandingPhoto({ name, hero = false }: { name: 'sky' | 'starlings' | 'wave'; hero?: boolean }) {
  const size = (width: number) => '/landing/' + name + '-' + width + '.webp';
  return <img
    className={hero ? 'poster' : 'bg'}
    src={size(1440)}
    width={1440}
    height={name === 'sky' ? 960 : 810}
    srcSet={[480, 960, 1440, 1920].map((width) => size(width) + ' ' + width + 'w').join(', ')}
    sizes="100vw"
    alt=""
    loading={hero ? 'eager' : 'lazy'}
    decoding="async"
    fetchPriority={hero ? 'high' : undefined}
  />;
}

/**
 * The story's beats on the page. `key` names the words (landing.v2.story.b<key>); `phases` is how many of the
 * scene's nine phases the beat tells: the first one shows the starlings and then the people, so the reader stops
 * once for both. A tall beat gives its animation more scroll.
 */
const BEATS: readonly { key: number; phases: number; tall?: boolean }[] = [
  { key: 1, phases: 2 },
  { key: 3, phases: 1 },
  { key: 4, phases: 1, tall: true },
  { key: 5, phases: 1 },
  { key: 6, phases: 1, tall: true },
  { key: 7, phases: 1 },
  { key: 8, phases: 1 },
  { key: 9, phases: 1 },
];
/** The last beat: the network as the app shows it; it carries the call to action. */
const LAST_BEAT = 9;
/** Question 6 says what data is kept (the people behind the project are named on /press, not on the landing). */
const FAQ = [1, 2, 3, 4, 6] as const;

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Answers open and close with a height animation; the native details element keeps it accessible. */
function toggleFaq(e: ReactMouseEvent<HTMLElement>) {
  const d = e.currentTarget.parentElement;
  const a = d?.querySelector<HTMLElement>('.a');
  if (!(d instanceof HTMLDetailsElement) || !a || reducedMotion() || typeof a.animate !== 'function') return;
  e.preventDefault();
  if (d.open) {
    d.classList.add('closing');
    const an = a.animate([{ height: `${a.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)' });
    an.onfinish = () => {
      d.open = false;
      d.classList.remove('closing');
    };
  } else {
    d.open = true;
    a.animate([{ height: '0px', opacity: 0 }, { height: `${a.offsetHeight}px`, opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'en';
  const rtl = RTL_LANGUAGES.includes(lang);
  const loginHref = useLoginHref();
  const invite = usePendingInvite();
  const phone = useSitePhone();
  const device = useDevice();
  const primary = phone ? ({ android: 'play', ios: 'appstore', desktop: 'web' } as const)[device] : null;
  const links = storeLinks(invite, firstTouchCampaign());
  const { search } = useLocation();
  const viewed = useRef<string | undefined>(undefined);
  const liveCount = useLivePeopleCount();
  useEffect(() => {
    if (viewed.current === search) return;
    viewed.current = search;
    recordLandingEvent('view', search);
  }, [search]);
  const qrValue = `${SITE_ORIGIN}/get${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
  useDocumentTitle(t('landing.v2.meta.title'), t('landing.v2.meta.description'));

  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const nf1 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [lang]);
  const nf2 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang]);
  // the story's sums in dollars: the shortfall at the price level of the reader's country, up to one person
  // reached per dollar, the smallest share and yours
  const money = useMemo(() => storyMoney(lang), [lang]);
  const sums = {
    shortfall: formatIsolatedMoney(money.shortfall),
    reach: nf.format(money.shortfall),
    min: formatIsolatedMoney(money.min),
    mine: formatIsolatedMoney(money.mine),
  };
  /** A story line with the sums filled in. */
  const tm = (key: string) => t(key, sums);
  // Maria's tag is "name · sum"; the graph's labels show the name alone, as the app does
  const mariaTag = tm('landing.v2.story.tags.maria');
  const mariaDot = mariaTag.indexOf('·');
  const mariaName = mariaDot > 0 ? mariaTag.slice(0, mariaDot).trim() : mariaTag;
  const mariaSum = mariaDot > 0 ? mariaTag.slice(mariaDot) : '';

  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const nightRef = useRef<HTMLDivElement>(null);
  const graphBgRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const beatRefs = useRef<(HTMLElement | null)[]>([]);
  const lateRefs = useRef<(HTMLElement | null)[]>([]);
  const tagRefs = useRef<Record<'you' | 'oleg' | 'maria' | 'lena', HTMLSpanElement | null>>({ you: null, oleg: null, maria: null, lena: null });
  const hudRef = useRef<HTMLDivElement>(null);
  const hudReachedRef = useRef<HTMLDivElement>(null);
  const hudReportedRef = useRef<HTMLDivElement>(null);
  const hudPeopleRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const railLinkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const growCvRef = useRef<HTMLCanvasElement>(null);
  const growChartRef = useRef<HTMLCanvasElement>(null);
  const growSliderRef = useRef<HTMLInputElement>(null);
  const growValueRef = useRef<HTMLElement>(null);
  const growPeopleRef = useRef<HTMLElement>(null);
  const growWavesRef = useRef<HTMLElement>(null);
  const growPeopleLabelRef = useRef<HTMLSpanElement>(null);
  const growWavesLabelRef = useRef<HTMLSpanElement>(null);
  const growStateRef = useRef<HTMLElement>(null);
  const growRestartRef = useRef<HTMLButtonElement>(null);
  const nextCvRef = useRef<HTMLCanvasElement>(null);
  const firstFaqRef = useRef<HTMLDetailsElement>(null);

  const sceneHandle = useRef<SceneHandle | null>(null);
  const growHandle = useRef<GrowHandle | null>(null);
  const nextHandle = useRef<NextNetHandle | null>(null);

  // what the imperative parts need from the current language
  const sceneOptions: SceneOptions = {
    rtl,
    format: (n) => nf.format(n),
    label: (key, n) => (key === 'reached' ? t('landing.v2.story.hud.reached', { count: n }) : t('landing.v2.story.hud.people', { count: n })),
    money: { shortfall: money.shortfall, mine: money.mine },
  };
  const growOptions: GrowOptions = {
    rtl,
    formatValue: (v) => nf1.format(v),
    formatInt: (v) => nf.format(v),
    labels: { grows: t('landing.v2.grow.grows'), dies: t('landing.v2.grow.dies'), full: t('landing.v2.grow.full'), axisX: t('landing.v2.grow.axisX'), axisY: t('landing.v2.grow.axisY') },
    count: (key, n) => (key === 'statPeople' ? t('landing.v2.grow.statPeople', { count: n }) : t('landing.v2.grow.statWaves', { count: n })),
  };
  const optionsRef = useRef({ scene: sceneOptions, grow: growOptions, rtl });
  optionsRef.current = { scene: sceneOptions, grow: growOptions, rtl };

  // the page owns the document while it is shown: smooth anchors, a dark overscroll, the section in the address
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('lv-page');
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) {
      const target = document.getElementById(id);
      if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'auto' }));
    }
    if (firstFaqRef.current) firstFaqRef.current.open = true;
    return () => html.classList.remove('lv-page');
  }, []);

  // the header gets a ground once the hero has scrolled away
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Show the photograph and story copy while the dynamic scene is loading. The scene loads once the opening
  // photograph is in and the browser is idle, so the flock can fly in on the opening screen; the story copy
  // beyond the opening screen is observed too, so a fast scroll or a link into a later chapter loads it sooner.
  useEffect(() => {
    const root = rootRef.current;
    let cancelled = false;
    let started = false;
    // opened at a later section: the browser may still be scrolling there, so the scene fades in, no fly-in
    const hash = window.location.hash.slice(1);
    const deepLink = !!hash && hash !== 'top';
    const showAllWords = () => lateRefs.current.forEach((el) => el?.classList.add('on'));
    const loadScene = () => {
      if (started || cancelled) return;
      started = true;
      observer?.disconnect();
      cancelIdle();
      void import('../components/landing/scene')
        .then(({ initScene }) => {
          if (cancelled) return;
          const canvas = sceneRef.current;
          const tags = tagRefs.current;
          if (!root || !canvas || !skyRef.current || !nightRef.current || !graphBgRef.current || !storyRef.current || !hudRef.current) return;
          if (!hudReachedRef.current || !hudReportedRef.current || !hudPeopleRef.current || !railRef.current) return;
          if (!tags.you || !tags.oleg || !tags.maria || !tags.lena) return;
          try {
            sceneHandle.current = initScene(
              {
                root,
                canvas,
                sky: skyRef.current,
                night: nightRef.current,
                graphBg: graphBgRef.current,
                story: storyRef.current,
                beats: beatRefs.current.filter((b): b is HTMLElement => !!b),
                phases: [1, ...BEATS.map((b) => b.phases)],
                lates: lateRefs.current,
                tags: { you: tags.you, oleg: tags.oleg, maria: tags.maria, lena: tags.lena },
                hud: hudRef.current,
                hudReached: hudReachedRef.current,
                hudReported: hudReportedRef.current,
                hudPeople: hudPeopleRef.current,
                rail: railRef.current,
                railLinks: railLinkRefs.current.filter((a): a is HTMLAnchorElement => !!a),
              },
              optionsRef.current.scene,
              { flyIn: !deepLink },
            );
            root.classList.add('scene-ready');
          } catch {
            showAllWords();
          }
        })
        .catch(() => {
          if (!cancelled) showAllWords();
        });
    };
    // whichever comes first: an idle moment once the opening photograph is in (so the scene's chunks never
    // compete with it for the network), at most about a second later; or the story copy coming into view
    let frame = 0;
    let idle = 0;
    let timer = 0;
    let photoWait = 0;
    let armed = false;
    const photo = skyRef.current?.querySelector('img');
    const whenIdle = () => {
      if (armed) return;
      armed = true;
      window.clearTimeout(photoWait);
      frame = requestAnimationFrame(() => {
        if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(loadScene, { timeout: 1200 });
        else timer = window.setTimeout(loadScene, 300);
      });
    };
    function cancelIdle() {
      photo?.removeEventListener('load', whenIdle);
      photo?.removeEventListener('error', whenIdle);
      cancelAnimationFrame(frame);
      if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      window.clearTimeout(photoWait);
    }
    const visiblePart = 0.05;
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.intersectionRatio >= visiblePart)) loadScene();
    }, { threshold: visiblePart });
    if (observer) {
      beatRefs.current.slice(1).forEach((beat) => {
        const copy = beat?.querySelector('.copy');
        if (copy) observer.observe(copy);
      });
    }
    if (!photo || photo.complete) whenIdle();
    else {
      photo.addEventListener('load', whenIdle, { once: true });
      photo.addEventListener('error', whenIdle, { once: true });
      // a stalled photograph must not keep the opening screen without birds: wait for it 2.5 s at most
      photoWait = window.setTimeout(whenIdle, 2500);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelIdle();
      sceneHandle.current?.destroy();
      root?.classList.remove('scene-ready');
      sceneHandle.current = null;
    };
  }, []);

  // scroll finishing, the growth model and the "next" network
  useEffect(() => {
    const main = mainRef.current;
    const root = rootRef.current;
    const beats = beatRefs.current.filter((b): b is HTMLElement => !!b);
    const stopGlide = main && root ? initGlide(beats, main, root) : () => {};
    const els = {
      canvas: growCvRef.current,
      chart: growChartRef.current,
      slider: growSliderRef.current,
      value: growValueRef.current,
      people: growPeopleRef.current,
      waves: growWavesRef.current,
      peopleLabel: growPeopleLabelRef.current,
      wavesLabel: growWavesLabelRef.current,
      state: growStateRef.current,
      restart: growRestartRef.current,
    };
    if (els.canvas && els.chart && els.slider && els.value && els.people && els.waves && els.peopleLabel && els.wavesLabel && els.state && els.restart) {
      growHandle.current = initGrow(
        { canvas: els.canvas, chart: els.chart, slider: els.slider, value: els.value, people: els.people, peopleLabel: els.peopleLabel, waves: els.waves, wavesLabel: els.wavesLabel, state: els.state, restart: els.restart },
        optionsRef.current.grow,
      );
    }
    if (nextCvRef.current) nextHandle.current = initNextNet(nextCvRef.current, { rtl: optionsRef.current.rtl });
    return () => {
      stopGlide();
      growHandle.current?.destroy();
      growHandle.current = null;
      nextHandle.current?.destroy();
      nextHandle.current = null;
    };
  }, []);

  // a new language: numbers, canvas labels and the side of the pictures follow it without a reload
  useEffect(() => {
    sceneHandle.current?.update(optionsRef.current.scene);
    growHandle.current?.update(optionsRef.current.grow);
    nextHandle.current?.update({ rtl: optionsRef.current.rtl });
  }, [lang, rtl, money]);

  // chapter rail: a click scrolls to the moment the beat is fully told (its middle)
  const goBeat = (e: ReactMouseEvent<HTMLAnchorElement>, n: number) => {
    const el = beatRefs.current[n];
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: r.top + window.scrollY - window.innerHeight * 0.5 + r.height * 0.5, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  const [shared, setShared] = useState(false);
  const sharedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(sharedTimer.current), []);
  const share = () => {
    recordLandingEvent('share', search);
    const url = `${window.location.origin}${window.location.pathname}`;
    if (navigator.share) {
      navigator.share({ title: document.title, url }).catch(() => {});
      return;
    }
    const copy = navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard'));
    copy
      .then(() => {
        setShared(true);
        window.clearTimeout(sharedTimer.current);
        sharedTimer.current = window.setTimeout(() => setShared(false), 2400);
      })
      .catch(() => window.prompt('', url));
  };

  const linkStudy = <a href={STUDY_URL} {...ext} />;
  const linkReport = <a href={REPORT_URL} {...ext} />;
  const linkCode = <a href={GITHUB_URL} {...ext} />;

  return (
    <div className="lv" ref={rootRef}>
      <header className="nav" ref={navRef}>
        <div className="wrap">
          <a className="brand" href="#top">
            <img src="/icon-192.png" alt="" width={22} height={22} />
            <span>Social Organizer</span>
          </a>
          <nav aria-label={t('landing.v2.nav.label')}>
            <a href="#how">{t('landing.v2.nav.how')}</a>
            <a href="#grow">{t('landing.v2.nav.grow')}</a>
            <a href="#join">{t('landing.v2.nav.join')}</a>
            <a href="#faq">{t('landing.v2.nav.faq')}</a>
          </nav>
          <div className="tools">
            <LanguageSelect />
            <Link className="signin" to={loginHref} onClick={() => recordLandingEvent('header_signin', search)}>
              {t('landing.v2.nav.signin')}
            </Link>
            <a className="btn care" href="#start" onClick={() => recordLandingEvent('header_start', search)}>
              {t('landing.v2.hero.cta')}
            </a>
          </div>
        </div>
      </header>

      <div className="sky" ref={skyRef} aria-hidden="true"><LandingPhoto name="sky" hero /></div>
      <div className="night" ref={nightRef} aria-hidden="true" />
      <div className="graphbg" ref={graphBgRef} aria-hidden="true" />
      <canvas className="scene" ref={sceneRef} aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />
      <div className="tags" aria-hidden="true">
        <span className="tag t-you below" ref={(el) => void (tagRefs.current.you = el)}>
          {t('landing.v2.story.tags.you')}
        </span>
        <span className="tag t-oleg" ref={(el) => void (tagRefs.current.oleg = el)}>
          {t('landing.v2.story.tags.oleg')}
        </span>
        <span className="tag t-maria sos right" ref={(el) => void (tagRefs.current.maria = el)}>
          {mariaName}
          {mariaSum ? <span className="sum"> {mariaSum}</span> : null}
        </span>
        <span className="tag t-lena care below" ref={(el) => void (tagRefs.current.lena = el)}>
          {t('landing.v2.story.tags.lena')}
        </span>
      </div>
      <div className="hud" ref={hudRef} aria-hidden="true">
        <div className="reached" ref={hudReachedRef}>
          <b />
          <span />
        </div>
        <div className="reported" ref={hudReportedRef}>
          <b />
          <span>{tm('landing.v2.story.hud.reported')}</span>
        </div>
        <div className="people" ref={hudPeopleRef}>
          <b />
          <span />
        </div>
      </div>

      <nav className="rail" ref={railRef} aria-label={t('landing.v2.story.railAria')}>
        {BEATS.map(({ key }, n) => (
          <a key={key} href={key === 1 ? '#network' : '#how'} ref={(el) => void (railLinkRefs.current[n] = el)} onClick={(e) => goBeat(e, n + 1)}>
            <span>{t(`landing.v2.story.rail.${key}`)}</span>
            <i />
          </a>
        ))}
      </nav>

      <main ref={mainRef}>
        <div
          className="story"
          ref={storyRef}
          role="region"
          aria-label={t('landing.v2.story.sceneAria')}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('.beat:not(.hero) a[href="#start"]')) {
              recordLandingEvent('story_start', search);
            }
          }}
        >
          <section className="beat hero" id="top" ref={(el) => void (beatRefs.current[0] = el)}>
            <div className="wrap">
              <div className="copy" data-enter="">
                <h1>{t('landing.v2.hero.title')}</h1>
                <p className="lead">{t('landing.v2.hero.lead')}</p>
                <div className="actions">
                  <a className="btn care" href="#start" onClick={() => recordLandingEvent('hero_start', search)}>
                    {t('landing.v2.hero.cta')}
                  </a>
                  <a className="btn ghost" href="#how" onClick={() => recordLandingEvent('hero_how', search)}>
                    {t('landing.v2.hero.how')}
                  </a>
                </div>
                <p className="facts">
                  <Trans i18nKey="landing.v2.hero.facts" components={{ code: linkCode }} />
                </p>
              </div>
            </div>
          </section>
          {BEATS.map(({ key: b, tall }, n) => (
            <section
              key={b}
              className={tall ? 'beat tall' : 'beat'}
              id={b === 1 ? 'network' : b === 3 ? 'how' : undefined}
              ref={(el) => void (beatRefs.current[n + 1] = el)}
            >
              <div className="wrap">
                <div className="copy">
                  <span className="mono">{t(`landing.v2.story.b${b}.label`)}</span>
                  <p className="say">{tm(`landing.v2.story.b${b}.say`)}</p>
                  {b === 1 ? (
                    // the starlings' beat goes on to people: their words and the 4.57 figure come with the second phase
                    <div className="late" ref={(el) => void (lateRefs.current[n + 1] = el)}>
                      <p className="turn">{t('landing.v2.story.b2.say')}</p>
                      <p className="stat">
                        <b>{nf2.format(4.57)}</b>
                        <span>
                          <Trans i18nKey="landing.v2.story.b2.stat" components={{ study: linkStudy }} />
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="late" ref={(el) => void (lateRefs.current[n + 1] = el)}>
                      {tm(`landing.v2.story.b${b}.late`)}
                    </p>
                  )}
                  {b === LAST_BEAT ? (
                    <div className="actions">
                      <a className="btn care" href="#start">
                        {t('landing.v2.hero.cta')}
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
        </div>

        <AppChapter shortfall={money.shortfall} mine={money.mine} />

        <section className="sec grow" id="grow" aria-labelledby="lv-grow-title">
          <canvas ref={growCvRef} role="img" aria-label={t('landing.v2.grow.canvasAria')} />
          <div className="wrap gtop">
            <div className="copy">
              <h2 id="lv-grow-title">{t('landing.v2.grow.title')}</h2>
              <p className="body">{t('landing.v2.grow.text')}</p>
            </div>
          </div>
          <div className="wrap gpanel">
            <div className="copy">
              <div className="ctrl">
                <label className="q" htmlFor="lv-grow-r">
                  <span>{t('landing.v2.grow.slider')}</span>
                  <b ref={growValueRef} />
                  <span>{t('landing.v2.grow.unit')}</span>
                </label>
                <div className="range">
                  <input ref={growSliderRef} type="range" id="lv-grow-r" min="0.5" max="2.5" step="0.1" defaultValue="1.5" />
                  <div className="ticks" aria-hidden="true">
                    <span className="lo">{nf1.format(0.5)}</span>
                    <span className="thr">
                      <i />
                      <em>{t('landing.v2.grow.threshold')}</em> {nf.format(1)}
                    </span>
                    <span className="hi">{nf1.format(2.5)}</span>
                  </div>
                </div>
                <div className="stats">
                  <div>
                    <b className="n" ref={growPeopleRef} />
                    <span ref={growPeopleLabelRef} />
                  </div>
                  <div>
                    <b ref={growWavesRef} />
                    <span ref={growWavesLabelRef} />
                  </div>
                  <canvas ref={growChartRef} aria-hidden="true" />
                </div>
                <div className="state">
                  <b ref={growStateRef} aria-live="polite" />
                  <button type="button" ref={growRestartRef}>
                    {t('landing.v2.grow.restart')}
                  </button>
                </div>
                <p className="note">{t('landing.v2.grow.note')}</p>
              </div>
              <p className="hint">{t('landing.v2.grow.hint')}</p>
            </div>
          </div>
        </section>

        <section className="sec next screen" id="next" aria-labelledby="lv-next-title">
          <canvas ref={nextCvRef} aria-hidden="true" />
          <div className="wrap">
            <div className="copy">
              <span className="mono">{t('landing.v2.next.label')}</span>
              <h2 id="lv-next-title">{tm('landing.v2.next.title')}</h2>
              <p>{t('landing.v2.next.text')}</p>
              <div className="legend">
                <div>
                  <span className="mono">{t('landing.v2.next.now')}</span>
                  <span className="items">
                    <i>
                      <b className="need" />
                      <em>{t('landing.v2.next.need')}</em>
                    </i>
                    <i>
                      <b className="part" />
                      <em>{t('landing.v2.next.participation')}</em>
                    </i>
                  </span>
                </div>
                <div>
                  <span className="mono">{t('landing.v2.next.later')}</span>
                  <span className="items">
                    <i>
                      <b className="rec" />
                      <em>{t('landing.v2.next.tradesperson')}</em>
                    </i>
                    <i>
                      <b className="joint" />
                      <em>{t('landing.v2.next.project')}</em>
                    </i>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sec join screen" id="join" aria-labelledby="lv-join-title">
          <LandingPhoto name="starlings" />
          <div className="wrap grid">
            <div className="copy">
              <span className="mono">{t('landing.v2.join.label')}</span>
              <h2 id="lv-join-title">{t('landing.v2.join.title')}</h2>
              <p className="lead">{t('landing.v2.join.text')}</p>
              <p className="now">
                <b>{nf.format(liveCount ?? NETWORK_NOW)}</b>
                <span>{liveCount === undefined
                  ? t('landing.v2.join.now')
                  : t('landing.v2.join.nowDate', { date: new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date()) })}</span>
              </p>
              <div className="actions">
                <a className="btn care" href={TEAM_URL} {...ext} onClick={() => recordLandingEvent('team', search)}>
                  {t('landing.v2.join.cta')}
                </a>
                <button className="btn ghost" type="button" onClick={share}>
                  {t('landing.v2.join.share')}
                </button>
              </div>
              <p className="shared" aria-live="polite">
                {shared ? t('landing.v2.join.shared') : ''}
              </p>
              <p className="safe">{t('landing.v2.join.safe', { bot: '@' + TELEGRAM_BOT_USERNAME })}</p>
            </div>
            <ol className="ways">
              <li>
                <b>
                  <Link to="/groups">{t('landing.v2.join.w1Title')}</Link>
                </b>
                <span>{t('landing.v2.join.w1')}</span>
              </li>
              <li>
                <b>{t('landing.v2.join.w2Title')}</b>
                <span>{t('landing.v2.join.w2')}</span>
              </li>
              <li>
                <b>{t('landing.v2.join.w3Title')}</b>
                <span>
                  <Trans i18nKey="landing.v2.join.w3" components={{ report: linkReport, code: linkCode }} />
                </span>
              </li>
            </ol>
          </div>
        </section>

        <section className="sec faq screen" id="faq" aria-labelledby="lv-faq-title">
          <div className="wrap grid">
            <h2 id="lv-faq-title">{t('landing.v2.faq.title')}</h2>
            <div className="qs">
              {FAQ.map((n) => (
                <details key={n} ref={n === 1 ? firstFaqRef : undefined}>
                  <summary onClick={toggleFaq}><span>{t(`landing.v2.faq.q${n}`)}</span></summary>
                  <div className="a">
                    <p>{t(`landing.v2.faq.a${n}`, { bot: '@' + TELEGRAM_BOT_USERNAME })}</p>
                    {n === 6 && <p>{t('legal.policy.campaigns')}</p>}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="sec final screen" id="start" aria-labelledby="lv-start-title">
          <LandingPhoto name="wave" />
          <div className="wrap grid">
            <div className="copy">
              <span className="mono">{t('landing.v2.start.label')}</span>
              <h2 id="lv-start-title">{t('landing.v2.start.title')}</h2>
              <p>{t('landing.v2.start.text')}</p>
              <ol className="steps">
                <li>{t('landing.v2.start.s1')}</li>
                <li>{t('landing.v2.start.s2')}</li>
                <li>{t('landing.v2.start.s3')}</li>
              </ol>
              <div className="stores">
                {(primary ? [primary, ...STORES.filter((id) => id !== primary)] : STORES).map((id) => {
                  const [eyebrow, label] = {
                    play: [t('landing.v2.start.playTop'), t('landing.v2.start.play')],
                    appstore: [t('landing.v2.start.iosTop'), t('landing.v2.start.ios')],
                    web: [t('landing.v2.start.webTop'), t('landing.v2.start.web')],
                    telegram: [t('landing.v2.start.tgTop'), t('landing.v2.start.tg')],
                  }[id];
                  const icon = {
                    play: <img src="/landing/icons/google-play-icon.svg" alt="" width={22} height={24} />,
                    appstore: <img className="inv" src="/landing/icons/apple.svg" alt="" width={20} height={24} />,
                    web: <IconGlobe />,
                    telegram: <img src="/landing/icons/telegram.svg" alt="" width={24} height={24} />,
                  }[id];
                  const content = <>{icon}<span><small>{eyebrow}</small>{label}</span></>;
                  const props = {
                    className: id === primary ? 'badge primary' : 'badge',
                    onClick: () => recordLandingEvent(id, search),
                  };
                  return id === 'web'
                    ? <Link key={id} to={loginHref} {...props}>{content}</Link>
                    : <a key={id} href={links[id]} {...ext} {...props}>{content}</a>;
                })}
              </div>
            </div>
            <div className="qrcard" aria-hidden="true">
              <QRCodeSVG value={qrValue} level="M" marginSize={0} />
              <p>{t('landing.v2.start.qr')}</p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="fl">
            <img src="/icon-192.png" alt="" width={18} height={18} />
            <span>{t('landing.v2.footer.about')}</span>
          </div>
          <nav className="fr" aria-label={t('landing.v2.footer.links')}>
            <Link to="/how">{t('landing.site.how')}</Link>
            <Link to="/groups">{t('landing.site.groups')}</Link>
            <Link to="/press">{t('landing.site.press')}</Link>
            <Link to="/privacy">{t('landing.site.privacy')}</Link>
            <Link to="/terms">{t('landing.site.terms')}</Link>
            <Link to="/delete-account">{t('landing.site.deleteAccount')}</Link>
            <a href={GITHUB_URL} {...ext}>
              GitHub
            </a>
            <a href={BOT_URL} {...ext}>
              Telegram
            </a>
            <Link to={loginHref} onClick={() => recordLandingEvent('footer_signin', search)}>{t('landing.v2.nav.signin')}</Link>
          </nav>
          <p className="credits">{t('landing.v2.footer.credits', { icons: ICON_CREDITS })}</p>
        </div>
      </footer>
    </div>
  );
}
