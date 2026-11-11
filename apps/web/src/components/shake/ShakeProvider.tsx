import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { useAuth } from '../../hooks/useAuth';
import { useShakeDetector } from '../../hooks/useShakeDetector';
import { isScannerActive } from '../../lib/scanner';
import { refreshNetwork } from '../../lib/refreshNetwork';
import { announceJoin } from '../circle/joining';
import { trpc } from '../../lib/trpc';

const SEARCH_POLL_MS = 500;
const WAIT_POLL_MS = 1000;
const GEO_TIMEOUT_MS = 1500;

interface Person {
  id: string;
  name: string;
  photoUrl?: string | null;
}

interface Matched {
  state: 'matched';
  pairId: string;
  person: Person;
  alreadyConnected: boolean;
  iAccepted: boolean;
  otherAccepted: boolean;
  pairState: 'waiting' | 'connected' | 'declined' | 'expired' | 'failed';
  error?: string;
}

type View =
  | { kind: 'searching' }
  | { kind: 'none' }
  | { kind: 'crowded' }
  | { kind: 'error'; message: string }
  | { kind: 'matched'; match: Matched };

async function haptic(kind: 'impact' | 'success') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (kind === 'impact') await Haptics.impact({ style: ImpactStyle.Medium });
    else await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* no haptics on this device */
  }
}

/** Geo only when the permission is already granted: a shake must never raise a prompt. */
async function quietGeo(): Promise<{ lat: number; lng: number; accuracy: number } | undefined> {
  try {
    if (!navigator.permissions?.query || !navigator.geolocation) return undefined;
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state !== 'granted') return undefined;
    return await new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(undefined), GEO_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        () => {
          window.clearTimeout(timer);
          resolve(undefined);
        },
        { timeout: GEO_TIMEOUT_MS, maximumAge: 10_000 },
      );
    });
  } catch {
    return undefined;
  }
}

function typingNow(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function givenName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Mounted once for signed-in users: listens for a shake on every screen and runs the pairing sheet. */
export function ShakeProvider() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  return isAuthenticated ? <ShakeFlow /> : null;
}

function ShakeFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const register = trpc.shake.register.useMutation();
  const respond = trpc.shake.respond.useMutation();
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const registerRef = useRef(register.mutateAsync);
  registerRef.current = register.mutateAsync;
  const celebrated = useRef(false);

  const errorText = useCallback(
    (error: unknown): string => {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
      if (message.includes('CONNECTION_LIMIT_SELF')) return t('add.limitSelf');
      if (message.includes('CONNECTION_LIMIT_OTHER')) return t('add.limitOther');
      if (/too many|TOO_MANY/i.test(message)) return t('shake.tooMany');
      return t('shake.failed');
    },
    [t],
  );

  const refreshAfterConnect = useCallback(() => {
    void refreshNetwork(utils);
  }, [utils]);

  const apply = useCallback(
    (match: Matched) => {
      setView({ kind: 'matched', match });
      if (match.pairState === 'connected' && !celebrated.current) {
        celebrated.current = true;
        void haptic('success');
        if (!match.alreadyConnected) {
          void announceJoin(utils, { id: match.person.id, name: match.person.name, photoUrl: match.person.photoUrl ?? null });
        }
        refreshAfterConnect();
      }
    },
    [refreshAfterConnect, utils],
  );

  const poll = useCallback(
    async (ticket: string, id: number) => {
      while (run.current === id) {
        let status;
        try {
          status = await utils.client.shake.status.query({ ticket });
        } catch {
          if (run.current !== id) return;
          setView({ kind: 'error', message: t('shake.failed') });
          return;
        }
        if (run.current !== id) return;
        if (status.state === 'none') return setView({ kind: 'none' });
        if (status.state === 'crowded') return setView({ kind: 'crowded' });
        if (status.state === 'matched') {
          apply(status as Matched);
          if (status.alreadyConnected || status.pairState !== 'waiting') return;
          await new Promise((r) => window.setTimeout(r, WAIT_POLL_MS));
        } else {
          await new Promise((r) => window.setTimeout(r, SEARCH_POLL_MS));
        }
      }
    },
    [apply, t, utils],
  );

  const start = useCallback(async () => {
    run.current += 1;
    const id = run.current;
    celebrated.current = false;
    setView({ kind: 'searching' });
    void haptic('impact');
    try {
      const geo = await quietGeo();
      if (run.current !== id) return;
      const { ticket } = await registerRef.current(geo ? { geo } : {});
      if (run.current !== id) return;
      await poll(ticket, id);
    } catch (error) {
      if (run.current !== id) return;
      setView({ kind: 'error', message: errorText(error) });
    }
  }, [errorText, poll]);

  const answer = useCallback(
    async (pairId: string, accept: boolean) => {
      setBusy(true);
      try {
        const result = await respond.mutateAsync({ pairId, accept });
        if (result) apply(result as Matched);
      } catch (error) {
        run.current += 1;
        setView({ kind: 'error', message: errorText(error) });
      } finally {
        setBusy(false);
      }
    },
    [apply, errorText, respond],
  );

  const close = useCallback(() => {
    const current = viewRef.current;
    run.current += 1;
    if (
      current?.kind === 'matched' &&
      current.match.pairState === 'waiting' &&
      !current.match.alreadyConnected
    ) {
      void respond.mutateAsync({ pairId: current.match.pairId, accept: false }).catch(() => undefined);
    }
    setView(null);
  }, [respond]);

  // Stop polling if the whole provider goes away (sign-out).
  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  useShakeDetector(() => {
    if (viewRef.current) return;
    if (isScannerActive() || pathRef.current === '/add/scan') return;
    if (typingNow()) return;
    void start();
  });

  const match = view?.kind === 'matched' ? view.match : null;
  const person = match?.person;
  const name = person ? givenName(person.name) : '';

  let title = t('shake.title');
  let body: string | undefined;
  let content: ReactNode = null;
  let footer: ReactNode = null;
  const closeBtn = (variant: 'primary' | 'secondary' = 'secondary') => (
    <Button variant={variant} onClick={close}>
      {t('shake.close')}
    </Button>
  );
  const qrButtons = (
    <>
      <Button
        onClick={() => {
          close();
          navigate('/add/qr');
        }}
      >
        {t('shake.openQr')}
      </Button>
      {closeBtn()}
    </>
  );

  if (view?.kind === 'searching') {
    title = t('shake.searching');
    body = t('shake.searchingHint');
    content = (
      <div className="flex justify-center py-5" aria-hidden>
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-care-soft" />
          <span className="relative h-8 w-8 rounded-full bg-care" />
        </span>
      </div>
    );
    footer = closeBtn();
  } else if (view?.kind === 'none') {
    title = t('shake.none');
    footer = qrButtons;
  } else if (view?.kind === 'crowded') {
    title = t('shake.crowded');
    footer = qrButtons;
  } else if (view?.kind === 'error') {
    title = view.message;
    footer = closeBtn('primary');
  } else if (match && person) {
    const avatar = (
      <div className="flex items-center gap-3">
        <Avatar name={person.name} src={person.photoUrl} size={48} />
        <span className="text-body font-bold text-ink">{person.name}</span>
      </div>
    );
    if (match.alreadyConnected) {
      title = t('shake.alreadyConnected');
      content = avatar;
      footer = closeBtn('primary');
    } else if (match.pairState === 'connected') {
      title = t('shake.connected');
      body = t('shake.connectedBody', { name });
      content = avatar;
      footer = (
        <>
          <Button
            onClick={() => {
              close();
              navigate(`/person/${person.id}`);
            }}
          >
            {t('shake.openProfile')}
          </Button>
          {closeBtn()}
        </>
      );
    } else if (match.pairState === 'declined') {
      title = t('shake.declined');
      footer = closeBtn('primary');
    } else if (match.pairState === 'expired') {
      title = t('shake.expired');
      footer = closeBtn('primary');
    } else if (match.pairState === 'failed') {
      title = match.error ? errorText({ message: match.error }) : t('shake.failed');
      footer = closeBtn('primary');
    } else if (match.iAccepted) {
      title = t('shake.waiting', { name });
      content = avatar;
      footer = closeBtn();
    } else {
      body = t('shake.matchBody');
      content = avatar;
      footer = (
        <>
          <Button loading={busy} disabled={busy} onClick={() => void answer(match.pairId, true)}>
            {t('shake.confirm')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void answer(match.pairId, false)}>
            {t('shake.notThem')}
          </Button>
        </>
      );
    }
  }

  return (
    <Sheet open={view != null} onClose={close} title={title} description={body} footer={footer}>
      {content}
    </Sheet>
  );
}
