import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { RTL_LANGUAGES } from '@so/i18n/languages';
import { GITHUB_URL, LanguageSelect, useLoginHref } from '../components/site/SiteHeader';
import { usePendingInvite, useStoreLinks } from '../components/site/DeviceEntry';
import { useDocumentTitle } from '../components/site/hooks';
import { SITE_ORIGIN } from '../lib/device';
import { initGlide } from '../components/landing/glide';
import { initGrow, type GrowHandle, type GrowOptions } from '../components/landing/grow';
import { initNextNet, type NextNetHandle } from '../components/landing/nextNet';
import type { SceneHandle, SceneOptions } from '../components/landing/scene';
import '../components/landing/landing.css';

/**
 * Home for a guest: one scroll-told story over a fixed 3D flock of starlings (how a network of people you know
 * works, in eight beats), then the growth model, what comes next, the experiment, questions and the app.
 * Ported from the concept prototype (local/media/concept-6, v9; docs/narrative/topics/packaging/landing-concept-flock.md).
 * The page stays in the entry chunk so its words paint at once; Three.js and the scene load with a dynamic import.
 * Signed-in users get the circle instead (App.tsx).
 */

const STUDY_URL = 'https://research.facebook.com/blog/2016/02/three-and-a-half-degrees-of-separation/';
const REPORT_URL = 'https://zenodo.org/records/21629935';
const BOT_URL = 'https://t.me/socialorganizer_bot';
const TEAM_URL = `${BOT_URL}?start=team`;
const ICON_CREDITS = 'Gil Barbara logos (CC0), Lucide (ISC)';
/** People with connections in the network on the date in `join.now`. */
const NETWORK_NOW = 287;

const BEATS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TALL = new Set([4, 6]);
const FAQ = [1, 2, 3, 4] as const;

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

function GlobeIcon() {
  // Lucide "globe" (ISC)
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20M2 12h20" />
    </svg>
  );
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'en';
  const rtl = RTL_LANGUAGES.includes(lang);
  const loginHref = useLoginHref();
  const invite = usePendingInvite();
  const links = useStoreLinks(invite);
  const qrValue = `${SITE_ORIGIN}/get${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
  useDocumentTitle(t('landing.v2.meta.title'), t('landing.v2.meta.description'));

  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const nf1 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [lang]);
  const nf2 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang]);

  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const nightRef = useRef<HTMLDivElement>(null);
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
  const growStateRef = useRef<HTMLElement>(null);
  const growRestartRef = useRef<HTMLButtonElement>(null);
  const nextCvRef = useRef<HTMLCanvasElement>(null);
  const firstFaqRef = useRef<HTMLDetailsElement>(null);

  const sceneHandle = useRef<SceneHandle | null>(null);
  const growHandle = useRef<GrowHandle | null>(null);
  const nextHandle = useRef<NextNetHandle | null>(null);

  // what the imperative parts need from the current language
  const sceneOptions: SceneOptions = { rtl, format: (n) => nf.format(n) };
  const growOptions: GrowOptions = {
    rtl,
    formatValue: (v) => nf1.format(v),
    formatInt: (v) => nf.format(v),
    labels: { grows: t('landing.v2.grow.grows'), dies: t('landing.v2.grow.dies'), full: t('landing.v2.grow.full'), axisX: t('landing.v2.grow.axisX'), axisY: t('landing.v2.grow.axisY') },
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

  // the sky photograph replaces its flat colour once it has loaded
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (skyRef.current) skyRef.current.style.backgroundImage = 'url(/landing/sky.jpg)';
    };
    img.src = '/landing/sky.jpg';
    return () => {
      img.onload = null;
    };
  }, []);

  // the 3D story: Three.js arrives in its own chunk; without WebGL the words are shown whole
  useEffect(() => {
    let cancelled = false;
    const showAllWords = () => lateRefs.current.forEach((el) => el?.classList.add('on'));
    import('../components/landing/scene')
      .then(({ initScene }) => {
        if (cancelled) return;
        const root = rootRef.current;
        const canvas = sceneRef.current;
        const tags = tagRefs.current;
        if (!root || !canvas || !skyRef.current || !nightRef.current || !storyRef.current || !hudRef.current) return;
        if (!hudReachedRef.current || !hudReportedRef.current || !hudPeopleRef.current || !railRef.current) return;
        if (!tags.you || !tags.oleg || !tags.maria || !tags.lena) return;
        try {
          sceneHandle.current = initScene(
            {
              root,
              canvas,
              sky: skyRef.current,
              night: nightRef.current,
              story: storyRef.current,
              beats: beatRefs.current.filter((b): b is HTMLElement => !!b),
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
          );
        } catch {
          showAllWords();
        }
      })
      .catch(() => {
        if (!cancelled) showAllWords();
      });
    return () => {
      cancelled = true;
      sceneHandle.current?.destroy();
      sceneHandle.current = null;
    };
  }, []);

  // scroll finishing, the growth model and the "next" network
  useEffect(() => {
    const main = mainRef.current;
    const beats = beatRefs.current.filter((b): b is HTMLElement => !!b);
    const stopGlide = main ? initGlide(beats, main) : () => {};
    const els = {
      canvas: growCvRef.current,
      chart: growChartRef.current,
      slider: growSliderRef.current,
      value: growValueRef.current,
      people: growPeopleRef.current,
      waves: growWavesRef.current,
      state: growStateRef.current,
      restart: growRestartRef.current,
    };
    if (els.canvas && els.chart && els.slider && els.value && els.people && els.waves && els.state && els.restart) {
      growHandle.current = initGrow({ canvas: els.canvas, chart: els.chart, slider: els.slider, value: els.value, people: els.people, waves: els.waves, state: els.state, restart: els.restart }, optionsRef.current.grow);
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
  }, [lang, rtl]);

  // chapter rail: a click scrolls to the moment the beat is fully told (its middle)
  const goBeat = (e: ReactMouseEvent<HTMLAnchorElement>, b: number) => {
    const el = beatRefs.current[b];
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: r.top + window.scrollY - window.innerHeight * 0.5 + r.height * 0.5, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  const [shared, setShared] = useState(false);
  const sharedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(sharedTimer.current), []);
  const share = () => {
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
            <img src="/logo.png" alt="" width={31} height={22} />
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
            <Link className="signin" to={loginHref}>
              {t('landing.v2.nav.signin')}
            </Link>
            <a className="btn care" href="#start">
              {t('landing.v2.hero.cta')}
            </a>
          </div>
        </div>
      </header>

      <div className="sky" ref={skyRef} aria-hidden="true" />
      <div className="night" ref={nightRef} aria-hidden="true" />
      <canvas className="scene" ref={sceneRef} aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />
      <div className="tags" aria-hidden="true">
        <span className="tag below" ref={(el) => void (tagRefs.current.you = el)}>
          {t('landing.v2.story.tags.you')}
        </span>
        <span className="tag" ref={(el) => void (tagRefs.current.oleg = el)}>
          {t('landing.v2.story.tags.oleg')}
        </span>
        <span className="tag sos right" ref={(el) => void (tagRefs.current.maria = el)}>
          {t('landing.v2.story.tags.maria')}
        </span>
        <span className="tag care below" ref={(el) => void (tagRefs.current.lena = el)}>
          {t('landing.v2.story.tags.lena')}
        </span>
      </div>
      <div className="hud" ref={hudRef} aria-hidden="true">
        <div className="reached" ref={hudReachedRef}>
          <b />
          <span>{t('landing.v2.story.hud.reached')}</span>
        </div>
        <div className="reported" ref={hudReportedRef}>
          <b />
          <span>{t('landing.v2.story.hud.reported')}</span>
        </div>
        <div className="people" ref={hudPeopleRef}>
          <b />
          <span>{t('landing.v2.story.hud.people')}</span>
        </div>
      </div>

      <nav className="rail" ref={railRef} aria-label={t('landing.v2.story.railAria')}>
        {BEATS.map((b, n) => (
          <a key={b} href={b <= 2 ? '#network' : '#how'} ref={(el) => void (railLinkRefs.current[n] = el)} onClick={(e) => goBeat(e, b)}>
            <span>{t(`landing.v2.story.rail.${b}`)}</span>
            <i />
          </a>
        ))}
      </nav>

      <main ref={mainRef}>
        <div className="story" ref={storyRef} role="region" aria-label={t('landing.v2.story.sceneAria')}>
          <section className="beat hero" id="top" ref={(el) => void (beatRefs.current[0] = el)}>
            <div className="wrap">
              <div className="copy" data-enter="">
                <h1>{t('landing.v2.hero.title')}</h1>
                <p className="lead">{t('landing.v2.hero.lead')}</p>
                <div className="actions">
                  <a className="btn care" href="#start">
                    {t('landing.v2.hero.cta')}
                  </a>
                  <a className="btn ghost" href="#how">
                    {t('landing.v2.hero.how')}
                  </a>
                </div>
                <p className="facts">{t('landing.v2.hero.facts')}</p>
              </div>
            </div>
          </section>
          {BEATS.map((b) => (
            <section
              key={b}
              className={TALL.has(b) ? 'beat tall' : 'beat'}
              id={b === 1 ? 'network' : b === 3 ? 'how' : undefined}
              ref={(el) => void (beatRefs.current[b] = el)}
            >
              <div className="wrap">
                <div className="copy">
                  <span className="mono">{t(`landing.v2.story.b${b}.label`)}</span>
                  <p className="say">{t(`landing.v2.story.b${b}.say`)}</p>
                  {b === 2 ? (
                    <div className="late" ref={(el) => void (lateRefs.current[b] = el)}>
                      <p className="stat">
                        <b>{nf2.format(4.57)}</b>
                        <span>
                          <Trans i18nKey="landing.v2.story.b2.stat" components={{ study: linkStudy }} />
                        </span>
                      </p>
                    </div>
                  ) : b === 1 ? null : (
                    <p className="late" ref={(el) => void (lateRefs.current[b] = el)}>
                      {t(`landing.v2.story.b${b}.late`)}
                    </p>
                  )}
                  {b === 8 ? (
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
                    <span>{t('landing.v2.grow.statPeople')}</span>
                  </div>
                  <div>
                    <b ref={growWavesRef} />
                    <span>{t('landing.v2.grow.statWaves')}</span>
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
              <h2 id="lv-next-title">{t('landing.v2.next.title')}</h2>
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
          <img className="bg" src="/landing/starlings.jpg" alt="" loading="lazy" decoding="async" />
          <div className="wrap grid">
            <div className="copy">
              <span className="mono">{t('landing.v2.join.label')}</span>
              <h2 id="lv-join-title">{t('landing.v2.join.title')}</h2>
              <p className="lead">{t('landing.v2.join.text')}</p>
              <p className="now">
                <b>{nf.format(NETWORK_NOW)}</b>
                <span>{t('landing.v2.join.now')}</span>
              </p>
              <div className="actions">
                <a className="btn care" href={TEAM_URL} {...ext}>
                  {t('landing.v2.join.cta')}
                </a>
                <button className="btn ghost" type="button" onClick={share}>
                  {t('landing.v2.join.share')}
                </button>
              </div>
              <p className="shared" aria-live="polite">
                {shared ? t('landing.v2.join.shared') : ''}
              </p>
              <p className="safe">{t('landing.v2.join.safe')}</p>
            </div>
            <ol className="ways">
              <li>
                <b>{t('landing.v2.join.w1Title')}</b>
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
            <div>
              {FAQ.map((n) => (
                <details key={n} ref={n === 1 ? firstFaqRef : undefined}>
                  <summary onClick={toggleFaq}>{t(`landing.v2.faq.q${n}`)}</summary>
                  <div className="a">
                    <p>{t(`landing.v2.faq.a${n}`)}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="sec final screen" id="start" aria-labelledby="lv-start-title">
          <img className="bg" src="/landing/wave.jpg" alt="" loading="lazy" decoding="async" />
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
                <a className="badge" href={links.play} {...ext}>
                  <img src="/landing/icons/google-play-icon.svg" alt="" width={22} height={24} />
                  <span>
                    <small>{t('landing.v2.start.playTop')}</small>
                    {t('landing.v2.start.play')}
                  </span>
                </a>
                <a className="badge" href={links.appstore} {...ext}>
                  <img className="inv" src="/landing/icons/apple.svg" alt="" width={20} height={24} />
                  <span>
                    <small>{t('landing.v2.start.iosTop')}</small>
                    {t('landing.v2.start.ios')}
                  </span>
                </a>
                <Link className="badge" to={loginHref}>
                  <GlobeIcon />
                  <span>
                    <small>{t('landing.v2.start.webTop')}</small>
                    {t('landing.v2.start.web')}
                  </span>
                </Link>
                <a className="badge" href={links.telegram} {...ext}>
                  <img src="/landing/icons/telegram.svg" alt="" width={24} height={24} />
                  <span>
                    <small>{t('landing.v2.start.tgTop')}</small>
                    {t('landing.v2.start.tg')}
                  </span>
                </a>
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
            <img src="/logo.png" alt="" width={25} height={18} />
            <span>{t('landing.v2.footer.about')}</span>
          </div>
          <nav className="fr" aria-label={t('landing.v2.footer.links')}>
            <a href={GITHUB_URL} {...ext}>
              GitHub
            </a>
            <a href={BOT_URL} {...ext}>
              Telegram
            </a>
            <Link to={loginHref}>{t('landing.v2.nav.signin')}</Link>
          </nav>
          <p className="credits">{t('landing.v2.footer.credits', { icons: ICON_CREDITS })}</p>
        </div>
      </footer>
    </div>
  );
}
