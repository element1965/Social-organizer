import { Component, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { checkConnection, isOffline, onRecovery, useOffline } from '../../lib/connectivity';
import { Button } from '../ui2/Button';
import { Screen } from '../ui2/Screen';
import { SavedPeople } from './SavedPeople';
import { SavedPerson } from './SavedPerson';

/**
 * The saved copy replaces a screen only when there is no connection AND the screen has no live data of its own.
 * A page that was loaded online keeps showing what it has (a blip must never swap the screen under someone typing).
 */
function useLiveNetwork(): boolean {
  const slice = trpc.connection.graphSlice.useQuery(undefined, { enabled: false });
  return slice.data !== undefined;
}

export function HomeGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const offline = useOffline();
  const live = useLiveNetwork();
  if (offline && !live) return <SavedPeople title={t('nav.circle')} />;
  return <>{children}</>;
}

export function PeopleGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const offline = useOffline();
  const live = useLiveNetwork();
  if (offline && !live) return <SavedPeople title={t('nav.people')} />;
  return <>{children}</>;
}

export function PersonGate({ children }: { children: ReactNode }) {
  const { id = '' } = useParams();
  const offline = useOffline();
  const user = trpc.user.getById.useQuery({ userId: id }, { enabled: false });
  if (offline && user.data === undefined) return <SavedPerson id={id} />;
  return <>{children}</>;
}

/**
 * Shown when a screen's code is not on the device and there is no connection to fetch it. "Show saved people"
 * opens the saved list right here: it lives in the entry bundle, so it always renders. (Navigating to the Circle
 * instead did nothing when the Circle's own code was the missing piece, or when the person was already on it.)
 */
function OfflineUnavailable() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  if (saved) return <SavedPeople title={t('nav.circle')} />;
  return (
    <Screen title={t('offline.unavailableTitle')} width="column">
      <p className="mt-6 text-center text-body font-semibold text-ink-muted">{t('offline.unavailableBody')}</p>
      <div className="mt-6 flex flex-col gap-3">
        <Button onClick={() => setSaved(true)}>{t('offline.showSaved')}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            void checkConnection().then((ok) => {
              if (ok) window.location.reload();
            });
          }}
        >
          {t('common.retry')}
        </Button>
      </div>
    </Screen>
  );
}

/** Errors a lazy screen throws when its code cannot be fetched (names differ between browsers and bundlers). */
function isChunkLoadError(error: unknown): boolean {
  const text = `${(error as { name?: string } | null)?.name ?? ''} ${(error as { message?: string } | null)?.message ?? ''}`;
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(text);
}

/** Screens whose offline stand-in is the saved people list itself: no need to ask first. */
function isPeopleScreen(pathname: string): boolean {
  return pathname === '/' || pathname === '/people' || pathname.startsWith('/people/');
}

type BoundaryState = { error: unknown; checked: boolean };

class Boundary extends Component<{ children: ReactNode; pathname: string }, BoundaryState> {
  state: BoundaryState = { error: null, checked: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, checked: false };
  }

  render() {
    const { error, checked } = this.state;
    if (!error) return this.props.children;
    if (isChunkLoadError(error)) {
      if (isOffline()) return <OfflineFallback people={isPeopleScreen(this.props.pathname)} />;
      // Nothing has failed yet, so the app may not know the connection is gone: ask the server once.
      // No answer means offline (rendered above on the next pass); an answer means a real missing file.
      if (!checked) return <ConnectionCheck onDone={() => this.setState({ checked: true })} />;
    }
    // Anything else goes to the app-level recovery screen
    throw error;
  }
}

function ConnectionCheck({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    let alive = true;
    void checkConnection().then(() => {
      if (alive) onDone();
    });
    return () => {
      alive = false;
    };
  }, [onDone]);
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-care" aria-hidden />
    </div>
  );
}

/**
 * The offline stand-in for a screen whose code is missing. A failed lazy import stays failed for the page's
 * life, so when the connection comes back the page reloads to fetch the screen for real.
 */
function OfflineFallback({ people }: { people: boolean }) {
  const { t } = useTranslation();
  useEffect(() => onRecovery(() => window.location.reload()), []);
  return people ? <SavedPeople title={t('nav.circle')} /> : <OfflineUnavailable />;
}

/**
 * A lazy screen whose chunk cannot load while offline gets the saved people (Circle, People) or a calm
 * explanation instead of the reload screen.
 */
export function OfflineRouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <Boundary key={pathname} pathname={pathname}>
      {children}
    </Boundary>
  );
}
