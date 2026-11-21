import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { WEB_APP_URL } from '../../../lib/deployment';
import { useIsDark } from '../../../hooks/useIsDark';
import { ShellChrome } from '../../ui2/AppShell';
import { BrandMark } from '../../ui2/BrandMark';
import { Button } from '../../ui2/Button';
import { Screen } from '../../ui2/Screen';
import { shellSection, type ShellSection } from '../../ui2/shell-mode';
import { NetStats } from '../../circle/NetStats';
import { RingChips } from '../../circle/RingChips';
import { EventFeed } from '../../circle/EventFeed';
import { useFarRings } from '../../circle/far-rings';
import { MyParticipationCard, NeedSummaryCard } from '../../collection/NeedCards';
import { ParticipantList, type ParticipantRow } from '../../collection/ParticipantList';
import { relativePast } from '../../collection/text';
import { LinkCardView } from '../../add/LinkCardView';
import { QrCodeView } from '../../add/QrCodeView';
import { formatMoney } from '../../ui2/format';
import type { FeedEvent } from '../../../hooks/useEvents';
import {
  DEMO_CAN_HELP,
  DEMO_EMMA_AMOUNT,
  DEMO_FAR,
  DEMO_OPENED_AGO_MS,
  DEMO_PEOPLE,
  DEMO_RINGS,
  DEMO_SLUG,
  DEMO_TOM_AMOUNT,
} from './demo';
import { PHONE_SCREEN, SCENE_BOX } from './scene-box';
import type { DemoLabel } from './demo';
import labels from './graph-labels.json';

/**
 * The landing's "In the app" chapter: three screens of the app drawn by the app's own components (the Circle with
 * its feed, a Need you take part in, Add with the link and the live QR), with the example of the story and no data
 * access. Only the Circle's 3D graph is a still picture of the real graph (scripts/capture-landing-app-graph.mjs).
 * Loaded on its own when the chapter comes near, so none of it is in the landing's first load.
 * The screens follow the app's theme (html.dark), not the page, which stays dark.
 * The store screenshots (store-shots.tsx, dev only) draw the same screens in their own frames.
 */

export type Cast = { you: string; tom: string; sarah: string; emma: string };
const noop = () => {};
const PHONE_VARS = { '--sa-top': '14px', '--sa-bottom': '0px' } as CSSProperties;

/** The story's names in the page language. */
export function useCast(): Cast {
  const { t } = useTranslation();
  return {
    you: t('landing.v2.story.tags.you'),
    tom: t('landing.v2.story.cast.mediator'),
    sarah: t('landing.v2.story.cast.asker'),
    emma: t('landing.v2.story.cast.supporter'),
  };
}

/**
 * The inside of a screen of the given height: the content above the tab bar and the app's own tab bar. The parent
 * sets the size, the theme colours and the safe-area variables.
 */
export function AppFrame({ section, height, children }: { section: ShellSection | null; height: number; children: ReactNode }) {
  const cast = useCast();
  return (
    <>
      <div className="relative h-full overflow-hidden" data-app-scroll style={{ height: height - PHONE_SCREEN.tabBar }}>
        {children}
      </div>
      <ShellChrome
        contained
        interactive={false}
        mode="tabs"
        section={section}
        ask={{ circle: 1, network: 1 }}
        unread={section === 'circle' ? 1 : 0}
        user={{ name: cast.you, email: null }}
        theme="system"
        onTheme={noop}
      />
    </>
  );
}

/** A phone: the screen at its real size (390 x 844), scaled into the frame by CSS. */
function Phone({ section, children }: { section: ShellSection | null; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="lvapp-phone">
      <div className="lvapp-screen bg-canvas text-ink" style={PHONE_VARS}>
        <AppFrame section={section} height={PHONE_SCREEN.height}>{children}</AppFrame>
      </div>
      <span className="lvapp-badge">{t('landing.v2.app.example')}</span>
    </div>
  );
}

/**
 * The Circle's scene: its size, the feed sheet's height, the still of the graph and where the named people stand
 * (fractions of the scene). By default the phone's, with the landing's pictures.
 */
export type CircleScene = {
  width: number;
  height: number;
  sheet: number;
  src: string;
  labels: Partial<Record<DemoLabel, [number, number]>>;
};

/** The Circle with the feed open, as on a phone (CirclePage, PhoneCircle). */
export function CircleScreen({ cast, shortfall, scene: custom }: { cast: Cast; shortfall: number; scene?: CircleScene }) {
  const { t } = useTranslation();
  const dark = useIsDark();
  const scene: CircleScene = custom ?? {
    width: SCENE_BOX.width,
    height: SCENE_BOX.height,
    sheet: PHONE_SCREEN.sheet,
    src: `/landing/app/circle-graph-${dark ? 'dark' : 'light'}.webp`,
    labels: labels as CircleScene['labels'],
  };
  const far = useFarRings({ count: DEMO_FAR, approx: true, few: false });
  const events: FeedEvent[] = useMemo(
    () => [
      {
        id: 'need',
        kind: 'request',
        at: 2,
        title: cast.sarah,
        subtitle: t('circle.feed.requestVia', { name: cast.tom, kind: t('circle.feed.once') }),
        amount: formatMoney(shortfall),
        amountValue: shortfall,
        hot: true,
      },
      { id: 'tom', kind: 'accepted', at: 1, title: cast.tom, subtitle: t('circle.feed.accepted'), hot: false },
    ],
    [cast, shortfall, t],
  );
  const at = (id: 'you' | 'tom' | 'sarah'): CSSProperties => ({
    left: `${(scene.labels[id]?.[0] ?? 0.5) * 100}%`,
    top: `${(scene.labels[id]?.[1] ?? 0.5) * scene.height}px`,
  });
  return (
    <div className="scene-follows-theme absolute inset-0 overflow-hidden bg-scene bg-[radial-gradient(120%_90%_at_50%_38%,rgb(var(--so-scene-2))_0%,rgb(var(--so-scene))_60%)]">
      <div className="absolute inset-x-0 top-0" style={{ height: scene.height }}>
        <img
          className="absolute inset-0 h-full w-full"
          src={scene.src}
          alt=""
          width={scene.width}
          height={scene.height}
          decoding="async"
        />
        {/* The graph's names, as the app draws them under each person (the picture carries none) */}
        <span className="lvapp-name lvapp-me" style={at('you')}>{cast.you}</span>
        <span className="lvapp-name" style={at('tom')}>{cast.tom}</span>
        <span className="lvapp-name lvapp-asker" style={at('sarah')}>{cast.sarah}</span>
      </div>
      <div className="circle-header-scrim absolute inset-x-0 top-0 z-10 px-5 pb-8 pt-[calc(0.5rem+var(--sa-top))]">
        <div className="mb-2.5 flex items-center gap-2 text-body-s font-extrabold tracking-tight text-node-1">
          <BrandMark size={26} />
          {t('common.appName')}
        </div>
        <NetStats variant="scene" people={DEMO_PEOPLE} canHelp={DEMO_CAN_HELP} />
      </div>
      <RingChips
        counts={DEMO_RINGS}
        farLabel={far.label}
        hiddenRings={[]}
        className="absolute inset-x-4 z-20"
        style={{ bottom: scene.sheet + 12 }}
      />
      <section
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[30px] bg-canvas shadow-sheet"
        style={{ height: scene.sheet }}
      >
        <div className="grid h-[26px] shrink-0 place-items-center">
          <span className="h-[5px] w-10 rounded-pill bg-line-strong" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
          <EventFeed myId="you" events={events} waitingCount={1} onOpen={noop} onDismiss={noop} />
        </div>
      </section>
    </div>
  );
}

/** Sarah's Need as you see it after you took part (CollectionPage). */
export function NeedScreen({ cast, shortfall, mine }: { cast: Cast; shortfall: number; mine: number }) {
  const { t, i18n } = useTranslation();
  const opened = useMemo(() => new Date(Date.now() - DEMO_OPENED_AGO_MS), []);
  const people: ParticipantRow[] = [
    { id: 'you', userId: 'you', name: t('common.you'), photoUrl: null, amount: mine, paid: false, subtitle: t('collection.youLower'), mine: true, joinedViaLink: false },
    { id: 'tom', userId: 'tom', name: cast.tom, photoUrl: null, amount: DEMO_TOM_AMOUNT, paid: false, subtitle: t('collection.firstHandshake'), mine: false, joinedViaLink: false },
    { id: 'emma', userId: 'emma', name: cast.emma, photoUrl: null, amount: DEMO_EMMA_AMOUNT, paid: false, subtitle: t('collection.inNetwork'), mine: false, joinedViaLink: false },
  ];
  return (
    <Screen
      shell="tabs"
      width="column"
      back={{ label: t('nav.circle'), to: '/' }}
      action={<Button variant="textDanger">{t('collection.decline')}</Button>}
      className="pt-[var(--sa-top)]"
    >
      <NeedSummaryCard
        pathNames={[t('common.you'), cast.tom, cast.sarah]}
        creatorName={cast.sarah}
        subtitle={`${t('collection.oneTime')} · ${t('collection.opened', { when: relativePast(opened, i18n.language) })}`}
        meter={{ mine, others: DEMO_TOM_AMOUNT + DEMO_EMMA_AMOUNT, goal: shortfall, showMine: true }}
        stages={[t('collection.stageAmount'), t('collection.stageChat'), t('collection.stageClosed')]}
        stageDone={2}
        note={t('collection.closesNote', { name: cast.sarah })}
      />
      <MyParticipationCard amount={mine} onChange={noop} onOpenChat={noop} />
      <ParticipantList people={people} showPaid={false} />
    </Screen>
  );
}

/** Add: your link (AddPage, LinkCard). The live QR stands beside the phone. */
export function AddScreen({ cast }: { cast: Cast }) {
  const { t } = useTranslation();
  return (
    <Screen shell="tabs" width="column" className="pt-[var(--sa-top)]">
      <h1 className="pt-6 text-h1 font-extrabold text-ink">{t('nav.add')}</h1>
      <LinkCardView slug={DEMO_SLUG} shareText={t('add.shareText', { name: cast.you })} urlFor={() => WEB_APP_URL} />
    </Screen>
  );
}

export type AppShot = 'circle' | 'need' | 'add';

/** One phone of the chapter; the page draws the figure and its caption around it. */
export function AppPhone({ shot, shortfall, mine }: { shot: AppShot; shortfall: number; mine: number }) {
  const cast = useCast();
  if (shot === 'circle') {
    return <Phone section="circle"><CircleScreen cast={cast} shortfall={shortfall} /></Phone>;
  }
  if (shot === 'need') {
    return <Phone section={shellSection('/collection/example')}><NeedScreen cast={cast} shortfall={shortfall} mine={mine} /></Phone>;
  }
  return (
    <>
      <Phone section="add"><AddScreen cast={cast} /></Phone>
      {/* The live QR (QrPage) as a card over the phone: a real code that opens the app's download page */}
      <div className="lvapp-qr bg-surface text-ink shadow-sheet">
        <div className="lvapp-qr-in flex flex-col items-center text-center">
          <QrCodeView url={`${WEB_APP_URL}/get`} fraction={0.75} timeLabel="0:45" />
        </div>
      </div>
    </>
  );
}
