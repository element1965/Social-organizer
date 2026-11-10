import { Component, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { checkConnection, isOffline, useOffline } from '../../lib/connectivity';
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

/** Shown when a screen's code is not on the device and there is no connection to fetch it. */
function OfflineUnavailable() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Screen title={t('offline.unavailableTitle')} width="column">
      <p className="mt-6 text-center text-body font-semibold text-ink-muted">{t('offline.unavailableBody')}</p>
      <div className="mt-6 flex flex-col gap-3">
        <Button onClick={() => navigate('/')}>{t('offline.showSaved')}</Button>
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

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (isOffline() && isChunkLoadError(this.state.error)) return <OfflineUnavailable />;
      // Anything else goes to the app-level recovery screen
      throw this.state.error;
    }
    return this.props.children;
  }
}

/** A lazy screen whose chunk cannot load while offline gets a calm explanation instead of the reload screen. */
export function OfflineRouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
