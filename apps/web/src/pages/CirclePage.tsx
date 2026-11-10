import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { hideBackButton, isTelegramWebApp, showBackButton } from '@so/tg-adapter';
import { trpc } from '../lib/trpc';
import { cn } from '../lib/utils';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { MILESTONE_KEYS, useEvents, useNewEvents, type FeedEvent, type MilestoneKind } from '../hooks/useEvents';
import { useBanner } from '../components/ui2/Banner';
import { Button } from '../components/ui2/Button';
import { MainBar } from '../components/ui2/MainBar';
import { Sheet } from '../components/ui2/Sheet';
import { useShellMode } from '../components/ui2/shell-mode';
import { BrandMark } from '../components/ui2/BrandMark';
import { IconBack, IconBell, IconSearch } from '../components/ui2/icons';
import { CircleGraph, type CircleGraphHandle } from '../components/circle/CircleGraph';
import { useCircleStore, type Ring } from '../components/circle/circle-store';
import { AcquaintSheet, type AcquaintRequest } from '../components/circle/AcquaintSheet';
import { EventFeed } from '../components/circle/EventFeed';
import { ReviewFeedRows } from '../components/moderation/ReviewFeedRows';
import { NetStats } from '../components/circle/NetStats';
import { GrowStrip, PathToRequestSheet } from '../components/circle/PathToRequest';
import { PersonCard, type CardPerson } from '../components/circle/PersonCard';
import { RingChips } from '../components/circle/RingChips';
import { useFarRings } from '../components/circle/far-rings';
import { StartCard } from '../components/circle/StartCard';
import { useCircleNetwork } from '../components/circle/network';
import { IconAim, IconFit, IconMinus, IconPlus, IconShrink, IconUp } from '../components/circle/icons';
import { ASK_MIN_DIRECT } from '@so/shared';

type Layer = 'feed' | 'graph' | 'person';

const HINT_KEY = 'so.circle.gestureHint';
const SCENE_BG =
  'bg-scene bg-[radial-gradient(120%_90%_at_50%_38%,rgb(var(--so-scene-2))_0%,rgb(var(--so-scene))_60%)]';

function useBoxHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(Math.round(el.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

/** Circle: the network scene, numbers, ring chips and the event feed (screens.md §1, §16). */
export function CirclePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = useShellMode();
  const phone = mode === 'tabs';
  const banner = useBanner();
  const utils = trpc.useUtils();

  const net = useCircleNetwork();
  const stats = useCachedNetworkStats();
  const caps = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60_000 });
  const me = trpc.user.me.useQuery();
  const { events, loading } = useEvents({ displayName: net.displayName });

  const hiddenRings = useCircleStore((s) => s.hiddenRings);
  const setRingHidden = useCircleStore((s) => s.setRingHidden);
  const setSelected = useCircleStore((s) => s.setSelected);
  const setHighlightPath = useCircleStore((s) => s.setHighlightPath);

  const [params, setParams] = useSearchParams();
  const selectedId = params.get('person');
  // The graph layer exists only on the phone; tablet and desktop always show scene and feed.
  const layer: Layer = selectedId ? 'person' : params.get('graph') && phone ? 'graph' : 'feed';

  const graphRef = useRef<CircleGraphHandle | null>(null);
  const lastNodeTap = useRef(0);
  const [acquaint, setAcquaint] = useState<AcquaintRequest | null>(null);
  const [pathOpen, setPathOpen] = useState(false);
  const [milestone, setMilestone] = useState<MilestoneKind | null>(null);
  const [hint, setHint] = useState(false);

  /* ----- numbers ----- */

  const direct = net.connections.data?.length ?? 0;
  const connectionsReady = net.connections.isSuccess;
  const empty = connectionsReady && direct === 0;
  const byDepth = (stats.data?.byDepth ?? {}) as Record<number, number>;
  const counts: Record<Ring, number> = { 1: byDepth[1] ?? 0, 2: byDepth[2] ?? 0, 3: byDepth[3] ?? 0 };
  // The whole reach of a request, as on the profile (rounded beyond the 3rd ring); older cached stats lack it
  // The headline counts only people of the visible rings (1–3): who the person can see in the graph.
  // The far part is told separately and rounded; older cached stats lack the field
  const networkPeople = (stats.data as { networkPeople?: number } | undefined)?.networkPeople;
  const peopleCount = empty ? 0 : networkPeople ?? counts[1] + counts[2] + counts[3];
  // 4th and 5th rings: only rounded counts, drawn as anonymous dust
  const farRings = useFarRings().dots;
  // Money: the checkable sum of the visible rings; the full reach is only a ceiling next to it
  const canHelp = empty ? 0 : caps.data?.visibleTotal ?? caps.data?.total ?? 0;
  const profileDone = Boolean(me.data?.name?.trim()) && (me.data?.monthlyBudget ?? 0) > 0;

  /* ----- layers and URL (system Back closes the graph and the card) ----- */

  const openLayer = useCallback(
    (next: Layer, personId?: string) => {
      const search = next === 'person' && personId ? `?person=${encodeURIComponent(personId)}` : next === 'graph' ? '?graph=1' : '';
      if (next === 'feed') {
        // Only step back over an entry this page pushed itself; a cold load or a deep link
        // (initial history entry) replaces instead, so Back never leaves the app.
        const pushed = (location.state as { pushed?: boolean } | null)?.pushed && location.key !== 'default';
        if (pushed) navigate(-1);
        else setParams({}, { replace: true });
        return;
      }
      // Stack one entry over the feed; switching between graph and person replaces it.
      const replace = layer !== 'feed';
      const pushed = replace ? Boolean((location.state as { pushed?: boolean } | null)?.pushed) : true;
      navigate({ pathname: '/', search }, { replace, state: { pushed } });
    },
    [layer, location.key, location.state, navigate, setParams],
  );

  const closeCard = useCallback(() => {
    if (phone) openLayer('graph');
    else openLayer('feed');
  }, [openLayer, phone]);

  // Telegram BackButton closes the card, then the graph (phone layers only).
  useEffect(() => {
    if (!isTelegramWebApp() || !phone || layer === 'feed') return;
    const back = () => (layer === 'person' ? closeCard() : openLayer('feed'));
    showBackButton(back);
    return () => hideBackButton(back);
  }, [closeCard, layer, openLayer, phone]);

  // A person outside the loaded graph (deep link, old link) opens the Person screen instead.
  useEffect(() => {
    if (!selectedId || !net.slice.isSuccess || net.people.has(selectedId)) return;
    navigate(`/person/${encodeURIComponent(selectedId)}`, { replace: true });
  }, [selectedId, net.slice.isSuccess, net.people, navigate]);

  // Escape closes the card, then the graph (unless a sheet has the focus and handles it).
  useEffect(() => {
    if (layer === 'feed') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      if (layer === 'person') closeCard();
      else openLayer('feed');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeCard, layer, openLayer]);

  // Gesture hint: once per session, three seconds, the first time the graph opens.
  useEffect(() => {
    if (layer !== 'graph') return;
    try {
      if (sessionStorage.getItem(HINT_KEY)) return;
      sessionStorage.setItem(HINT_KEY, '1');
    } catch {
      /* no storage: show it anyway */
    }
    setHint(true);
    const timer = window.setTimeout(() => setHint(false), 3000);
    return () => window.clearTimeout(timer);
  }, [layer]);

  /* ----- selection, path, saved camera ----- */

  const firstRequest = events.find((e) => e.kind === 'request' && e.personId && net.people.has(e.personId));
  const pathTo = net.pathTo;
  const highlightPath = useMemo(() => {
    if (selectedId) return pathTo(selectedId);
    if (firstRequest?.personId) return pathTo(firstRequest.personId);
    return [];
  }, [selectedId, firstRequest?.personId, pathTo]);

  useEffect(() => {
    setSelected(selectedId);
    setHighlightPath(highlightPath);
  }, [selectedId, highlightPath, setSelected, setHighlightPath]);

  const cardPerson = useMemo<CardPerson | null>(() => {
    if (!selectedId) return null;
    const p = net.people.get(selectedId);
    if (!p) return null;
    const request = events.find((e) => e.kind === 'request' && e.personId === selectedId);
    return {
      id: p.id,
      name: p.name,
      accountName: p.accountName,
      photoUrl: p.photoUrl,
      depth: p.depth,
      via: net.viaNames(p.id),
      collection: request?.collectionId ? { id: request.collectionId, amount: request.amountValue ?? null } : null,
    };
  }, [selectedId, net, events]);

  const onNodeTap = useCallback(
    (id: string) => {
      lastNodeTap.current = Date.now();
      if (id === net.myId) return;
      openLayer('person', id);
    },
    [net.myId, openLayer],
  );

  /* ----- feed actions ----- */

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
      void utils.notification.unreadCount.invalidate();
    },
  });
  const dismiss = trpc.notification.dismiss.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
      void utils.notification.unreadCount.invalidate();
    },
  });
  const markMilestone = trpc.milestone.markSeen.useMutation({
    onSuccess: () => void utils.milestone.list.invalidate(),
  });

  const openEvent = useCallback(
    (event: FeedEvent) => {
      for (const id of event.notificationIds ?? []) markRead.mutate({ id });
      switch (event.kind) {
        case 'incoming':
          if (event.pendingId && event.personId) {
            setAcquaint({ pendingId: event.pendingId, personId: event.personId, name: event.title });
          }
          return;
        case 'milestone':
          if (event.milestone) setMilestone(event.milestone);
          return;
        case 'waiting':
          if (event.personId && !phone && net.people.has(event.personId)) openLayer('person', event.personId);
          else if (event.personId) navigate(`/person/${event.personId}`);
          return;
        case 'blocked':
          return;
        default:
          if (event.collectionId) navigate(`/collection/${event.collectionId}`);
      }
    },
    [markRead, navigate, net.people, openLayer, phone],
  );

  // First handshake: one short congratulation sheet, once (screens.md, "Milestones").
  // It waits while another sheet is open (acquaintance, path to request, contacts…).
  const autoMilestone = useRef(false);
  const firstMilestone = events.some((e) => e.kind === 'milestone' && e.milestone === 'FIRST_CONNECTION');
  const otherSheetOpen = acquaint != null || pathOpen;
  useEffect(() => {
    if (autoMilestone.current || !firstMilestone || otherSheetOpen) return;
    const timer = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      autoMilestone.current = true;
      setMilestone('FIRST_CONNECTION');
    }, 600);
    return () => window.clearTimeout(timer);
  }, [firstMilestone, otherSheetOpen]);

  const closeMilestone = () => {
    if (milestone) markMilestone.mutate({ kind: milestone });
    setMilestone(null);
  };

  // New event while the app is open: banner on top, the row slides into the feed.
  useNewEvents(events, !loading, (fresh) => {
    const top = fresh[0];
    if (!top) return;
    banner.show({ kicker: t('common.appName'), title: top.title, body: top.subtitle, icon: <IconBell className="h-5 w-5" /> });
  });

  /* ----- pieces ----- */

  const graph = empty ? (
    <EmptyScene name={me.data?.name ?? ''} />
  ) : (
    <CircleGraph
      ref={graphRef}
      myId={net.myId}
      people={net.people}
      edges={net.edges}
      highlightPath={highlightPath}
      hiddenRings={hiddenRings}
      onNodeTap={onNodeTap}
      dimmed={layer === 'person' && phone}
      focusId={selectedId}
      focusLift={phone ? 0.16 : 0}
      farRings={farRings}
    />
  );

  const toggleRing = (ring: Ring) => setRingHidden(ring, !hiddenRings.includes(ring));

  const feedBody = empty ? (
    <>
      <ReviewFeedRows />
      {/* The first person who comes by the link is an incoming request: it must show here, above the start steps.
          A sent request ("waiting") is already told by the start card itself. */}
      {events.some((e) => e.kind !== 'waiting') ? (
        <EventFeed
          events={events.filter((e) => e.kind !== 'waiting')}
          loading={loading}
          onOpen={openEvent}
          onDismiss={(event) => {
            for (const id of event.notificationIds ?? []) dismiss.mutate({ id });
          }}
        />
      ) : null}
      <StartCard profileDone={profileDone} direct={direct} waiting={(events.some((e) => e.kind === 'waiting'))} />
    </>
  ) : (
    <>
      <ReviewFeedRows />
      {connectionsReady && direct < ASK_MIN_DIRECT ? <GrowStrip direct={direct} onOpen={() => setPathOpen(true)} /> : null}
      <EventFeed
        events={events}
        loading={loading}
        onOpen={openEvent}
        onDismiss={(event) => {
          for (const id of event.notificationIds ?? []) dismiss.mutate({ id });
        }}
      />
    </>
  );

  const sheets = (
    <>
      <AcquaintSheet request={acquaint} onClose={() => setAcquaint(null)} />
      <PathToRequestSheet open={pathOpen} onClose={() => setPathOpen(false)} />
      <Sheet
        open={milestone != null}
        onClose={closeMilestone}
        title={milestone ? t(MILESTONE_KEYS[milestone].title) : ''}
        description={milestone ? t(MILESTONE_KEYS[milestone].body, { tab: t('nav.ask') }) : undefined}
        footer={<Button onClick={closeMilestone}>{t('circle.milestone.ok')}</Button>}
      />
    </>
  );

  if (!phone) {
    return (
      <DesktopCircle
        sidebar={mode === 'sidebar'}
        graph={graph}
        graphRef={graphRef}
        empty={empty}
        counts={counts}
        hiddenRings={hiddenRings}
        stats={<NetStats variant="card" people={peopleCount} canHelp={canHelp} />}
        newCount={events.filter((e) => e.hot).length}
        feed={feedBody}
        person={cardPerson ? <PersonCard person={cardPerson} variant="column" onClose={closeCard} /> : null}
        sheets={sheets}
      />
    );
  }

  return (
    <PhoneCircle
      layer={layer}
      graph={graph}
      graphRef={graphRef}
      empty={empty}
      counts={counts}
      hiddenRings={hiddenRings}
      onToggleRing={toggleRing}
      stats={<NetStats variant="scene" people={peopleCount} canHelp={canHelp} />}
      feed={feedBody}
      eventsCount={events.length}
      hint={hint}
      person={cardPerson ? <PersonCard person={cardPerson} variant="floating" onClose={closeCard} /> : null}
      onOpenGraph={() => openLayer('graph')}
      onBackToFeed={() => openLayer('feed')}
      onSceneTap={() => {
        // A node tap fires first; an empty-space tap opens the graph or closes the card.
        window.setTimeout(() => {
          if (Date.now() - lastNodeTap.current < 400) return;
          if (layer === 'feed') openLayer('graph');
          else if (layer === 'person') closeCard();
        }, 60);
      }}
      sheets={sheets}
    />
  );
}

/* ---------- phone: layers over one scene ---------- */

type PhoneProps = {
  layer: Layer;
  graph: React.ReactNode;
  graphRef: React.RefObject<CircleGraphHandle | null>;
  empty: boolean;
  counts: Record<Ring, number>;
  hiddenRings: Ring[];
  onToggleRing: (ring: Ring) => void;
  stats: React.ReactNode;
  feed: React.ReactNode;
  eventsCount: number;
  hint: boolean;
  person: React.ReactNode;
  onOpenGraph: () => void;
  onBackToFeed: () => void;
  onSceneTap: () => void;
  sheets: React.ReactNode;
};

function PhoneCircle({
  layer,
  graph,
  graphRef,
  empty,
  counts,
  hiddenRings,
  onToggleRing,
  stats,
  feed,
  eventsCount,
  hint,
  person,
  onOpenGraph,
  onBackToFeed,
  onSceneTap,
  sheets,
}: PhoneProps) {
  const { t } = useTranslation();
  const [rootRef, height] = useBoxHeight<HTMLDivElement>();
  const sheetH = Math.max(280, Math.round(height * 0.42));
  // Expanded feed: the sheet covers the scene, for reading a long feed. Not kept in the URL.
  const fullH = Math.max(sheetH, height - 8);
  const feedLayer = layer === 'feed';
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!feedLayer) setExpanded(false);
  }, [feedLayer]);

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(0);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current == null) return;
    setDrag(event.clientY - dragStart.current);
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current == null) return;
    const dy = event.clientY - dragStart.current;
    dragStart.current = null;
    setDrag(null);
    if (Math.abs(dy) < 6) {
      setExpanded((value) => !value); // a tap on the handle toggles
    } else if (expanded) {
      if (dy > 60) setExpanded(false);
    } else if (dy < -60) {
      setExpanded(true);
    } else if (dy > 80) {
      onOpenGraph();
    }
  };

  // The collapsed "Events" pill can be pulled up like a sheet handle: the feed rises with the finger and opens past
  // a short pull; a tap still opens it through onClick.
  const [pull, setPull] = useState<number | null>(null);
  const pullStart = useRef<number | null>(null);
  const pulledAt = useRef(0);
  const onPillDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    pullStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPillMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pullStart.current == null) return;
    const dy = Math.min(0, event.clientY - pullStart.current);
    if (pull != null || dy < -6) setPull(Math.max(-(sheetH + 16), dy));
  };
  const onPillUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pullStart.current == null) return;
    const dy = event.clientY - pullStart.current;
    pullStart.current = null;
    setPull(null);
    if (dy < -6) {
      pulledAt.current = Date.now(); // the click that follows a pull is not a second tap
      if (dy < -40) onBackToFeed();
    }
  };

  // Sheet height and offset while dragging: up grows it (to full), down shrinks it when expanded,
  // or slides the normal sheet away toward the graph
  const d = drag ?? 0;
  const baseH = expanded ? fullH : sheetH;
  const liveH = drag == null ? baseH : Math.min(fullH, Math.max(sheetH, baseH - d));
  const slide = drag != null && !expanded && d > 0 ? d : 0;

  const ease = 'transition-[transform,opacity,bottom,height] duration-screen ease-so motion-reduce:transition-none';

  return (
    <div
      ref={rootRef}
      className={cn('relative overflow-hidden', SCENE_BG)}
      style={{ height: 'calc(100dvh - var(--sa-top) - 84px - var(--sa-bottom))' }}
    >
      {/* Scene: shrinks to the space above the feed, grows to full height in the graph layer. */}
      <div
        className={cn('absolute inset-x-0 top-0', ease)}
        style={{ bottom: feedLayer ? sheetH - 24 : 0 }}
        onPointerDown={(event) => {
          down.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          const start = down.current;
          down.current = null;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
          onSceneTap();
        }}
      >
        {graph}
      </div>

      {/* Header: brand and numbers; fades out when the graph opens. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-scene/90 via-scene/55 to-transparent px-5 pb-8 pt-2',
          ease,
          feedLayer ? 'opacity-100' : '-translate-y-4 opacity-0',
        )}
      >
        <div className="mb-2.5 flex items-center gap-2 text-body-s font-extrabold tracking-tight text-node-1">
          <BrandMark size={26} />
          {t('common.appName')}
        </div>
        <div className={feedLayer ? 'pointer-events-auto' : undefined}>{stats}</div>
      </div>

      {/* Back to the feed (graph and person layers). */}
      <button
        type="button"
        onClick={onBackToFeed}
        className={cn(
          'so-focus absolute left-4 top-2 z-20 inline-flex h-9 items-center gap-1 rounded-md border border-node-1/15 bg-scene-2/80 pl-2 pr-3 text-caption font-bold text-node-1 backdrop-blur-md',
          ease,
          feedLayer ? 'pointer-events-none -translate-y-2.5 opacity-0' : 'opacity-100',
        )}
        inert={feedLayer}
      >
        <IconBack className="h-[18px] w-[18px]" />
        {t('nav.circle')}
      </button>
      <p
        className={cn(
          'pointer-events-none absolute inset-x-0 top-14 z-10 text-center text-micro font-semibold text-node-2',
          ease,
          hint && layer === 'graph' ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden={!hint}
      >
        {t('circle.gestureHint')}
      </p>

      {/* Ring chips: links to People over the feed, ring filters in the graph layer. */}
      {empty ? null : (
        <RingChips
          counts={counts}
          mode={feedLayer ? 'link' : 'filter'}
          hiddenRings={hiddenRings}
          onToggle={onToggleRing}
          onSelf={() => graphRef.current?.focusOnMe()}
          className={cn(
            'absolute inset-x-4 z-20',
            ease,
            (layer === 'person' || (feedLayer && expanded)) && 'pointer-events-none translate-y-16 opacity-0',
          )}
          style={{ bottom: feedLayer ? sheetH + 12 : 76 }}
        />
      )}

      {/* Feed sheet. */}
      <section
        aria-label={t('circle.feed.title')}
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[30px] bg-canvas shadow-sheet',
          drag == null && pull == null && ease,
        )}
        style={{
          height: liveH,
          transform: feedLayer
            ? slide
              ? `translateY(${slide}px)`
              : undefined
            : `translateY(${sheetH + 16 + (pull ?? 0)}px)`,
        }}
        inert={!feedLayer}
      >
        <div
          className="grid h-[26px] shrink-0 cursor-grab touch-none place-items-center"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(null);
          }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'circle.feedCollapse' : 'circle.feedExpand')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setExpanded((value) => !value);
          }}
        >
          <span className="h-[5px] w-10 rounded-pill bg-line-strong" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{feed}</div>
      </section>

      {/* Collapsed feed (graph layer). */}
      <button
        type="button"
        onClick={() => {
          if (Date.now() - pulledAt.current < 400) return;
          onBackToFeed();
        }}
        onPointerDown={onPillDown}
        onPointerMove={onPillMove}
        onPointerUp={onPillUp}
        onPointerCancel={() => {
          pullStart.current = null;
          setPull(null);
        }}
        className={cn(
          'so-focus absolute bottom-4 left-1/2 z-20 inline-flex h-11 -translate-x-1/2 touch-none items-center gap-2 whitespace-nowrap rounded-lg bg-surface pl-3.5 pr-4 text-caption font-bold text-ink shadow-sheet',
          pull == null && ease,
          layer === 'graph' ? 'opacity-100' : 'pointer-events-none translate-y-20 opacity-0',
        )}
        style={pull != null ? { transform: `translate(-50%, ${pull}px)`, opacity: Math.max(0, 1 + pull / 120) } : undefined}
        inert={layer !== 'graph'}
      >
        <i className="grid h-[22px] min-w-[22px] place-items-center rounded-[7px] bg-care px-1 text-micro font-bold not-italic text-care-on">
          {eventsCount}
        </i>
        {empty ? t('circle.startPill') : t('circle.eventsPill')}
        <IconUp className="h-4 w-4 text-ink-subtle" />
      </button>

      {/* Person card (person layer). */}
      {layer === 'person' && person ? <div className="absolute inset-x-4 bottom-4 z-30">{person}</div> : null}

      {sheets}
    </div>
  );
}

/** Empty network: my mark and name with a dashed orbit where the first people will stand. */
function EmptyScene({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center" aria-hidden>
      <div className="relative grid h-56 w-56 place-items-center rounded-full border border-dashed border-node-2/35">
        <div className="flex flex-col items-center gap-2">
          <BrandMark size={48} className="shadow-[0_0_40px_rgb(var(--so-care-scene)/0.35)]" />
          <span className="text-body-s font-extrabold text-node-1">{name}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- tablet and desktop: scene + feed column ---------- */

type DesktopProps = {
  sidebar: boolean;
  graph: React.ReactNode;
  graphRef: React.RefObject<CircleGraphHandle | null>;
  empty: boolean;
  counts: Record<Ring, number>;
  hiddenRings: Ring[];
  stats: React.ReactNode;
  newCount: number;
  feed: React.ReactNode;
  person: React.ReactNode;
  sheets: React.ReactNode;
};

function DesktopCircle({ sidebar, graph, graphRef, empty, counts, hiddenRings, stats, newCount, feed, person, sheets }: DesktopProps) {
  const { t } = useTranslation();
  const ctl =
    'so-focus grid h-10 w-10 place-items-center rounded-md border border-node-1/15 bg-scene-2/80 text-node-1 backdrop-blur-md hover:bg-scene-3';
  // Expanded: the scene takes the whole width and the feed column steps aside (the desktop "open the graph").
  const [wide, setWide] = useState(false);
  const toggleWide = () => {
    setWide((value) => !value);
    // Refit once the canvas has its new size.
    window.setTimeout(() => graphRef.current?.fit(), 320);
  };
  useEffect(() => {
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') toggleWide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // toggleWide only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide]);
  // A person card needs the column: opening one leaves the expanded scene.
  useEffect(() => {
    if (person) setWide(false);
  }, [person]);

  return (
    <div className="flex h-[calc(100dvh-var(--sa-top)-var(--sa-bottom))] flex-col">
      <MainBar
        title={t('nav.circle')}
        action={
          <Link
            to="/people"
            aria-label={t('circle.searchPeople')}
            className="so-focus grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-ink hover:bg-surface-2"
          >
            <IconSearch className="h-5 w-5" />
          </Link>
        }
      />
      <div className={cn('flex min-h-0 flex-1 gap-4 pb-4', sidebar ? 'px-7' : 'px-4')}>
        <div className={cn('relative min-w-0 flex-1 overflow-hidden rounded-xl', SCENE_BG)}>
          {graph}
          {empty ? null : (
            <>
              <RingChips counts={counts} mode="link" hiddenRings={hiddenRings} className="absolute left-4 top-4 z-10" />
              <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
                <button type="button" className={ctl} aria-label={t('circle.zoomIn')} onClick={() => graphRef.current?.zoomIn()}>
                  <IconPlus className="h-5 w-5" />
                </button>
                <button type="button" className={ctl} aria-label={t('circle.zoomOut')} onClick={() => graphRef.current?.zoomOut()}>
                  <IconMinus className="h-5 w-5" />
                </button>
                <button type="button" className={ctl} aria-label={t('circle.toSelf')} title={t('circle.toSelf')} onClick={() => graphRef.current?.focusOnMe()}>
                  <IconAim className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className={ctl}
                  aria-pressed={wide}
                  aria-label={wide ? t('circle.feedExpand') : t('circle.openGraph')}
                  title={wide ? t('circle.feedExpand') : t('circle.openGraph')}
                  onClick={toggleWide}
                >
                  {wide ? <IconShrink className="h-5 w-5" /> : <IconFit className="h-5 w-5" />}
                </button>
              </div>
              <Legend />
            </>
          )}
        </div>
        <aside
          className={cn('flex min-h-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden', sidebar ? 'w-[400px] min-[1440px]:w-[440px]' : 'w-[280px]', wide && 'hidden')}
          inert={wide}
        >
          {person ?? (
            <>
              {stats}
              <div className="mx-1 mb-2 mt-5 flex items-baseline justify-between text-label font-bold text-ink-muted">
                <span>{t('circle.feed.title')}</span>
                {newCount > 0 ? <span>{t('circle.feed.newCount', { count: newCount })}</span> : null}
              </div>
              {feed}
            </>
          )}
        </aside>
      </div>
      {sheets}
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items: Array<{ label: string; dot: string }> = [
    { label: t('common.you'), dot: 'bg-care-bright' },
    { label: t('circle.rings.short1'), dot: 'bg-node-1' },
    { label: t('circle.rings.short2'), dot: 'bg-node-2' },
    { label: t('circle.rings.short3'), dot: 'bg-node-3' },
  ];
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex gap-2" aria-hidden>
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-node-1/15 bg-scene-2/80 px-2.5 text-micro font-bold text-node-2 backdrop-blur-md"
        >
          <i className={cn('h-2 w-2 rounded-full', item.dot)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
