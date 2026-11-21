/**
 * Dev-only page that draws the store screenshots and the Google Play feature graphic from the app's own screens,
 * with the landing's example (Sarah has lost her job and is $300 short of the rent; you report $5) and no server.
 * It is not part of the app build: Vite serves it in dev from apps/web/dev/store-shots.html, and
 * scripts/capture-store-shots.mjs photographs it at the stores' pixel sizes.
 *
 *   ?device=play|iphone|ipad|feature  &shot=circle|need|join|ask|add  &lang=en|ru
 *
 * The screens are the landing's (AppScreens.tsx) plus the real Need tab (AskPage), which reads fixed answers from
 * a local tRPC link instead of the API. The HTML page sets a Capacitor custom platform, so the shell is the one the
 * native app shows: the phone tab bar at every width, iPad included.
 */
import { StrictMode, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import type { AppRouter } from '../../../../../api/src/routers/index';
import i18n, { i18nReady } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { useAuth } from '../../../hooks/useAuth';
import { AskPage } from '../../../pages/AskPage';
import { Logo } from '../../Logo';
import { QrCodeView } from '../../add/QrCodeView';
import { shellSection, type ShellSection } from '../../ui2/shell-mode';
import { WEB_APP_URL } from '../../../lib/deployment';
import { AddScreen, AppFrame, CircleScreen, NeedScreen, useCast, type CircleScene } from './AppScreens';
import { DEMO_CAN_HELP, DEMO_FAR, DEMO_PEOPLE, DEMO_RINGS } from './demo';
import { PHONE_SCREEN, SCENE_BOX } from './scene-box';
import labels from './graph-labels.json';
import '../../../index.css';
import './store-shots.css';

/** The example's sums, the same in every language of the listing (a neutral middle for a global store). */
const SHORTFALL = 300;
const MINE = 5;

type Device = 'play' | 'iphone' | 'ipad' | 'feature';
type Shot = 'circle' | 'need' | 'join' | 'ask' | 'add';
type Lang = 'en' | 'ru';

/**
 * The canvas in CSS px; the capture multiplies by its device pixel ratio (scripts/capture-store-shots.mjs keeps the
 * same table): Play 1080 x 1920, iPhone 6.7"/6.9" 1290 x 2796, iPad 12.9"/13" 2048 x 2732, feature graphic 1024 x 500.
 */
const CANVAS: Record<Device, { width: number; height: number }> = {
  play: { width: 540, height: 960 },
  iphone: { width: 430, height: 932 },
  ipad: { width: 1024, height: 1366 },
  feature: { width: 1024, height: 500 },
};

/** The app screen inside the frame, in CSS px: a 390 x 844 phone, or a 12.9" iPad in portrait. */
const TABLET = { width: 1024, height: 1366, saTop: 24 } as const;
const TABLET_SHEET = Math.round((TABLET.height - PHONE_SCREEN.tabBar) * 0.42);
/** The Circle's scene on the iPad: the same rule as the phone's (PhoneCircle), the scene runs 24 px under the sheet. */
export const TABLET_SCENE_BOX = { width: TABLET.width, height: TABLET.height - PHONE_SCREEN.tabBar - TABLET_SHEET + 24 };

/**
 * Captions: written for the stores in each language (so-story; checked with stop-slop), not taken from the app.
 * A two-sentence caption puts each sentence on its own line.
 */
const CAPTIONS: Record<Lang, Record<Shot, { title: string; sub?: string }> & { feature: string }> = {
  en: {
    circle: { title: "It's a smaller world than you think." },
    need: { title: 'Sarah lost her job.\nYou hear about it through Tom' },
    join: { title: 'You decide whether to take part, and how much', sub: 'Nothing is paid in the app. You agree in your own chat.' },
    ask: { title: 'Tomorrow it could be you.\nPeople you know hear first' },
    add: { title: 'It starts with people you know in person' },
    feature: "It's a smaller world than you think.",
  },
  ru: {
    circle: { title: 'Мир теснее, чем кажется.' },
    need: { title: 'Мария потеряла работу.\nВы узнаёте об этом через Олега' },
    join: { title: 'Участвовать ли и с какой суммой, решаете вы', sub: 'Через приложение деньги не идут. Договариваетесь в своём чате.' },
    ask: { title: 'Завтра на её месте можете оказаться вы.\nПервыми узнают ваши знакомые' },
    add: { title: 'Всё начинается с тех, кого вы знаете лично' },
    feature: 'Мир теснее, чем кажется.',
  },
};

const SECTION: Record<Shot, ShellSection | null> = {
  circle: 'circle',
  need: shellSection('/collection/example'),
  join: shellSection('/collection/example'),
  ask: shellSection('/ask'),
  add: 'add',
};

/** Graph stills the capture script hands over (fresh, at the canvas's pixel density); without them, the landing's. */
type Still = { src: string; labels: CircleScene['labels'] };
declare global {
  interface Window {
    __STORE_GRAPHS__?: { phone?: Still; tablet?: Still };
    __storeShotReady?: boolean;
  }
}

// --- Fixed answers for the Need tab (AskPage): the person may ask, and their network is the example's ----------

const FIXTURES: Record<string, unknown> = {
  'collection.askAccess': { allowed: true, directCount: DEMO_RINGS[1] },
  'stats.networkFigure': {
    people: DEMO_PEOPLE,
    canHelp: DEMO_CAN_HELP,
    rings: { 1: DEMO_RINGS[1], 2: DEMO_RINGS[2], 3: DEMO_RINGS[3] },
    far: { count: DEMO_FAR, approx: true, few: false },
  },
  'collection.myActive': [],
};

/** Answers the fixed queries at once; any other request stays pending (its screen keeps its loading look). */
const fixtureLink: TRPCLink<AppRouter> = () => ({ op }) =>
  ({
    subscribe(observer: { next?: (v: unknown) => void; complete?: () => void }) {
      if (op.path in FIXTURES) {
        observer.next?.({ result: { type: 'data', data: FIXTURES[op.path] } });
        observer.complete?.();
      }
      return { unsubscribe() {} };
    },
    pipe(...operators: Array<(source: unknown) => unknown>) {
      return operators.reduce<unknown>((source, operator) => operator(source), this);
    },
  }) as unknown as ReturnType<ReturnType<TRPCLink<AppRouter>>>;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const trpcClient = trpc.createClient({ links: [fixtureLink] });

/** Types into a React input as a person would (the native setter, then an input event). */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The Need tab with the example filled in: $300, once, a chat link. Resolves when both fields hold their values. */
function useFilledAsk(root: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [done, setDone] = useState(!active);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const amount = root.current?.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
      const chat = root.current?.querySelector<HTMLInputElement>('input[inputmode="url"]');
      if (!amount || !chat) return;
      if (amount.value !== String(SHORTFALL)) typeInto(amount, String(SHORTFALL));
      if (!chat.value) typeInto(chat, 'https://chat.whatsapp.com/Kx7Rr2mLp9Q');
      if (amount.value === String(SHORTFALL) && chat.value) {
        window.clearInterval(timer);
        setDone(true);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [active, root]);
  return done;
}

// --- The screens -------------------------------------------------------------------------------------------------

function ScreenContent({ shot, tablet }: { shot: Shot; tablet: boolean }) {
  const cast = useCast();
  if (shot === 'circle') {
    const still = window.__STORE_GRAPHS__?.[tablet ? 'tablet' : 'phone'];
    const box = tablet ? TABLET_SCENE_BOX : SCENE_BOX;
    const scene: CircleScene = {
      width: box.width,
      height: box.height,
      sheet: tablet ? TABLET_SHEET : PHONE_SCREEN.sheet,
      src: still?.src ?? '/landing/app/circle-graph-light.webp',
      labels: still?.labels ?? (labels as CircleScene['labels']),
    };
    return <CircleScreen cast={cast} shortfall={SHORTFALL} scene={scene} />;
  }
  if (shot === 'need' || shot === 'join') return <NeedScreen cast={cast} shortfall={SHORTFALL} mine={MINE} />;
  if (shot === 'ask') return <AskPage />;
  return <AddScreen cast={cast} />;
}

/** The app's screen at its real size, scaled by k into a dark frame, with the "Example" tag on its corner. */
function Frame({ shot, tablet, k, children }: { shot: Shot; tablet: boolean; k: number; children?: ReactNode }) {
  const screen = tablet ? TABLET : { ...PHONE_SCREEN, saTop: 14 };
  const bezel = tablet ? 14 : 10;
  const radius = tablet ? 40 : 52;
  return (
    <div
      className="ss-frame"
      style={{
        width: screen.width * k + 2 * bezel,
        height: screen.height * k + 2 * bezel,
        borderRadius: radius * k + bezel,
        padding: bezel,
      }}
    >
      <div
        className="ss-screen bg-canvas text-ink"
        style={{
          width: screen.width,
          height: screen.height,
          borderRadius: radius,
          transform: `scale(${k})`,
          ['--sa-top' as string]: `${screen.saTop}px`,
          ['--sa-bottom' as string]: '0px',
        } as CSSProperties}
      >
        <AppFrame section={SECTION[shot]} height={screen.height}>
          <ScreenContent shot={shot} tablet={tablet} />
        </AppFrame>
      </div>
      {children}
    </div>
  );
}

function ExampleTag() {
  return <span className="ss-tag">{i18n.t('landing.v2.app.example')}</span>;
}

/** The live QR card (QrPage) over the Add screen, as on the landing: a real code that opens the download page. */
function QrCard({ k }: { k: number }) {
  return (
    <div className="ss-qr bg-surface text-ink shadow-sheet" style={{ width: 300 * k, height: 452 * k }}>
      <div className="flex w-[300px] flex-col items-center px-5 pb-5 pt-3 text-center" style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
        <QrCodeView url={`${WEB_APP_URL}/get`} fraction={0.75} timeLabel="0:45" />
      </div>
    </div>
  );
}

/** A screenshot: the caption on the care colour, the screen in its frame below, scaled to the space left. */
function StoreShot({ device, shot, lang }: { device: Exclude<Device, 'feature'>; shot: Shot; lang: Lang }) {
  const tablet = device === 'ipad';
  const canvas = CANVAS[device];
  const caption = CAPTIONS[lang][shot];
  const stage = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const filled = useFilledAsk(stage, shot === 'ask');

  useLayoutEffect(() => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const screen = tablet ? TABLET : PHONE_SCREEN;
    const bezel = tablet ? 14 : 10;
    // As large as the space allows with only the tab bar running off the bottom edge; if that is too wide for the
    // canvas, the whole screen smaller instead (never a tab bar cut in half)
    const cut = (box.height - bezel) / (screen.height - PHONE_SCREEN.tabBar - 16);
    const widest = (canvas.width * 0.92 - 2 * bezel) / screen.width;
    setK(cut <= widest ? cut : Math.min(widest, (box.height - 2 * bezel - 24) / screen.height));
  }, [canvas.width, device, tablet]);

  useEffect(() => {
    if (!(k > 0 && filled)) return;
    // "join": the same Need further down, where your participation and the participants are
    if (shot === 'join') {
      const scroller = stage.current?.querySelector<HTMLElement>('[data-app-scroll]');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
    markReady();
  }, [k, filled, shot]);

  return (
    <div className={`ss-canvas ss-${device}`} style={{ width: canvas.width, height: canvas.height }} lang={lang}>
      <header className="ss-head">
        <Logo size={tablet ? 76 : device === 'play' ? 46 : 40} className="ss-mark" />
        <h1 className="ss-title">
          {/* one block per sentence, each balanced on its own */}
          {caption.title.split('\n').map((line) => <span key={line} className="ss-line-of">{line}</span>)}
        </h1>
        {caption.sub ? <p className="ss-sub">{caption.sub}</p> : null}
      </header>
      <div ref={stage} className="ss-stage">
        {k > 0 ? (
          <Frame shot={shot} tablet={tablet} k={k}>
            <ExampleTag />
            {shot === 'add' ? <QrCard k={k * (tablet ? 1.2 : 0.8)} /> : null}
          </Frame>
        ) : null}
      </div>
    </div>
  );
}

/** Google Play's feature graphic: the mark, the name and the first caption, with the Circle on a phone at the right. */
function FeatureGraphic({ lang }: { lang: Lang }) {
  const canvas = CANVAS.feature;
  useEffect(() => markReady(), []);
  return (
    <div className="ss-canvas ss-feature" style={{ width: canvas.width, height: canvas.height }} lang={lang}>
      <div className="ss-feature-text">
        <Logo size={92} className="ss-mark" />
        <p className="ss-name">Social Organizer</p>
        <p className="ss-line">{CAPTIONS[lang].feature}</p>
      </div>
      <div className="ss-feature-phone">
        <Frame shot="circle" tablet={false} k={0.66} />
      </div>
    </div>
  );
}

/** Tells the capture script the page has settled: fonts, the graph still and the logo mask are in. */
function markReady() {
  const images = [...document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; })));
  const mask = new Promise((r) => {
    const img = new Image();
    img.onload = img.onerror = r;
    img.src = '/logo.png';
  });
  void Promise.all([document.fonts.ready, mask, ...images]).then(() => {
    // two frames for the last layout and paint
    requestAnimationFrame(() => requestAnimationFrame(() => (window.__storeShotReady = true)));
  });
}

function App({ device, shot, lang }: { device: Device; shot: Shot; lang: Lang }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[shot === 'ask' ? '/ask' : '/']}>
          {device === 'feature' ? <FeatureGraphic lang={lang} /> : <StoreShot device={device} shot={shot} lang={lang} />}
        </MemoryRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const query = new URLSearchParams(location.search);
const pick = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
  const value = query.get(key) as T | null;
  return value && values.includes(value) ? value : fallback;
};
const device = pick<Device>('device', ['play', 'iphone', 'ipad', 'feature'], 'play');
const shot = pick<Shot>('shot', ['circle', 'need', 'join', 'ask', 'add'], 'circle');
const lang = pick<Lang>('lang', ['en', 'ru'], 'en');

// The example person is signed in only inside this page's memory: the Need tab's queries are keyed by account.
useAuth.setState({ userId: 'example', isAuthenticated: true });
document.documentElement.classList.remove('dark');

void i18nReady
  .then(() => i18n.changeLanguage(lang))
  .then(() => {
    const root = document.getElementById('root');
    if (root) createRoot(root).render(<StrictMode><App device={device} shot={shot} lang={lang} /></StrictMode>);
  });
