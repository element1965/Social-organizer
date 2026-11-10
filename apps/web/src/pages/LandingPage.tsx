import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useDevice } from '../lib/device';
import { ChainFigure, HuiFigure, NetFigure, type ChainStep } from '../components/figures';
import { DeviceEntry } from '../components/site/DeviceEntry';
import { HeroScene } from '../components/site/HeroScene';
import { Reveal, usePlayOnEnter, useSitePhone } from '../components/site/hooks';
import { IconFree, IconShield, IconWallet } from '../components/site/icons';
import { SitePage } from '../components/site/SitePage';
import { StoreButtons } from '../components/site/StoreButtons';
import { useFigureLabels, useMoney } from '../components/site/figureLabels';

const B = { b: <b /> };
const PUBLIC_STATS_KEY = 'so_publicStats';

/** Real size of the network for the hero pill; the last known value is shown at once and refreshed. */
function usePublicUsers(): number | null {
  const [cached] = useState<number | null>(() => {
    try {
      const v = Number(JSON.parse(localStorage.getItem(PUBLIC_STATS_KEY) || 'null')?.users);
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const q = trpc.stats.public.useQuery(undefined, { staleTime: 10 * 60 * 1000, retry: false });
  useEffect(() => {
    if (q.data?.users) {
      try {
        localStorage.setItem(PUBLIC_STATS_KEY, JSON.stringify({ users: q.data.users }));
      } catch {
        /* private mode */
      }
    }
  }, [q.data?.users]);
  return q.data?.users ?? cached;
}

/**
 * "How it works" as one figure that follows the reader: the text blocks scroll past a sticky NetFigure, and the block
 * the reader has reached sets its step.
 */
function StepStory({ labels }: { labels: ReturnType<typeof useFigureLabels>['net'] }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    // The current step is the last block whose top has passed 55% of the screen. Measured on scroll (one rAF), so a
    // fast fling that jumps over a block still lands on the right step.
    let raf = 0;
    const pick = () => {
      raf = 0;
      const line = window.innerHeight * 0.55;
      let k = 0;
      refs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top < line) k = i;
      });
      setStep(k as 0 | 1 | 2);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return (
    <div className="site-story">
      <div className="fig" aria-hidden="true">
        <div className="pic">
          <NetFigure step={step} labels={labels} />
        </div>
        <div className="bars">
          {([0, 1, 2] as const).map((k) => (
            <i key={k} className={k <= step ? 'on' : undefined} />
          ))}
        </div>
      </div>
      <ol className="texts">
        {([0, 1, 2] as const).map((k) => (
          <li key={k}>
            <div
              ref={(el) => {
                refs.current[k] = el;
              }}
              className={k === step ? 'beat on' : 'beat'}
            >
              <span className="n">{k + 1}</span>
              <h3>{t(`landing.steps.s${k + 1}Title`)}</h3>
              <p>
                <Trans i18nKey={`landing.steps.s${k + 1}Text`} components={B} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Home for a guest (screens.md §17, site.html №1 / №6). Signed-in users get the circle instead (App.tsx).
 * `inviteToken` comes from the invite page for guests who opened a link: store buttons then carry it.
 */
export function LandingPage({ inviteToken }: { inviteToken?: string } = {}) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const device = useDevice();
  const phone = useSitePhone();
  const labels = useFigureLabels();
  const money = useMoney();
  const users = usePublicUsers();

  // Keep the invite so the Telegram bot, stores and sign-in can pick it up later.
  const inviteParam = params.get('invite');
  useEffect(() => {
    const token = inviteToken || inviteParam;
    if (token) {
      try {
        localStorage.setItem('pendingInviteToken', token);
      } catch {
        /* private mode */
      }
    }
  }, [inviteToken, inviteParam]);

  // Hui table: the month the chips and the figure show; replays when it scrolls into view.
  const [month, setMonth] = useState(2);
  const [huiPlay, setHuiPlay] = useState(0);
  const huiRef = usePlayOnEnter<number>(() => setHuiPlay((n) => n + 1), [1], 0);

  const [chainStep, setChainStep] = useState<ChainStep>(0);
  const chainRef = usePlayOnEnter<ChainStep>(setChainStep, [0, 1, 2], 1000);

  const months = labels.hui.months ?? [];
  const homeNames = t('landing.hui.names', { returnObjects: true }) as unknown as string[];
  const nf = new Intl.NumberFormat(i18n.language || 'en');

  return (
    <SitePage title={t('landing.meta.title')} description={t('landing.meta.description')}>
      <section className="site-hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">{t('landing.hero.title')}</h1>
          <p className="lead">
            <Trans i18nKey="landing.hero.lead" components={B} />
          </p>
          <DeviceEntry device={device} invite={inviteToken} />
          {users ? (
            <p className="site-proof">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {t('landing.hero.statPeople', { count: users, n: nf.format(users) })}
            </p>
          ) : null}
          <div className="site-facts">
            <span className="site-pill">{t('landing.hero.factOpen')}</span>
            <span className="site-pill">{t('landing.hero.factNonprofit')}</span>
            <span className="site-pill">{t('landing.hero.factNoMoney')}</span>
          </div>
        </div>
        <div className="site-hero-scene">
          <HeroScene
            ariaLabel={t('landing.hero.sceneAria')}
            labels={{
              you: t('landing.hero.sceneYou'),
              ask: t('landing.hero.sceneAsk', { amount: money(300) }),
              done: t('landing.hero.sceneDone', { amount: money(300) }),
              coin: '15',
            }}
          >
            <div className="tag">
              <span>{t('landing.hero.statDepth')}</span>
            </div>
          </HeroScene>
        </div>
      </section>

      <section className="site-sec" id="how" aria-labelledby="steps-title">
        <Reveal>
          <h2 id="steps-title">{t('landing.steps.title')}</h2>
          <p className="lead">{t('landing.steps.lead')}</p>
        </Reveal>
        <StepStory labels={labels.net} />
      </section>

      <section className="site-sec" aria-labelledby="hui-title">
        <div className="site-two">
          <Reveal>
            <h2 id="hui-title">{t('landing.hui.title')}</h2>
            <p className="lead">
              <Trans i18nKey="landing.hui.lead" components={B} />
            </p>
            <p className="site-say">{t('landing.hui.say')}</p>
            <div className="site-chips" role="group" aria-label={t('landing.hui.monthsAria')}>
              {months.map((m, i) => (
                <button key={m} type="button" aria-pressed={i === month} onClick={() => setMonth(i)}>
                  {m}
                </button>
              ))}
            </div>
          </Reveal>
          <div ref={huiRef}>
            <HuiFigure
              month={month}
              onMonthChange={setMonth}
              playKey={huiPlay}
              size={phone ? 320 : 440}
              labels={{ ...labels.hui, names: homeNames }}
            />
          </div>
        </div>
      </section>

      <section className="site-sec" aria-labelledby="chain-title">
        <div className="site-two">
          <Reveal>
            <h2 id="chain-title">{t('landing.chain.title')}</h2>
            <p className="lead">
              <Trans i18nKey="landing.chain.lead" components={B} />
            </p>
          </Reveal>
          <div ref={chainRef} className="site-fig chain">
            <ChainFigure step={chainStep} labels={labels.chain} onSelect={setChainStep} />
          </div>
        </div>
      </section>

      <section className="site-sec" aria-labelledby="nots-title">
        <Reveal>
          <h2 id="nots-title">{t('landing.nots.title')}</h2>
        </Reveal>
        <Reveal group className="site-nots">
          <div className="site-not">
            <i aria-hidden="true">
              <IconWallet />
            </i>
            <h3>{t('landing.nots.moneyTitle')}</h3>
            <p>{t('landing.nots.moneyText')}</p>
          </div>
          <div className="site-not">
            <i aria-hidden="true">
              <IconFree />
            </i>
            <h3>{t('landing.nots.feeTitle')}</h3>
            <p>{t('landing.nots.feeText')}</p>
          </div>
          <div className="site-not">
            <i aria-hidden="true">
              <IconShield />
            </i>
            <h3>{t('landing.nots.choiceTitle')}</h3>
            <p>{t('landing.nots.choiceText')}</p>
          </div>
        </Reveal>
      </section>

      <section className="site-sec" id="start" aria-labelledby="start-title">
        <Reveal>
          <h2 id="start-title">{t('landing.start.title')}</h2>
          <p className="lead">
            <Trans i18nKey="landing.start.lead" components={B} />
          </p>
          <StoreButtons device={device} invite={inviteToken} />
        </Reveal>
      </section>
    </SitePage>
  );
}
