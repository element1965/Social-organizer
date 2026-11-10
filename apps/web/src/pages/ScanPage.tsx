import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Screen } from '../components/ui2/Screen';
import { IconClose, IconFlash, IconQr } from '../components/add/icons';
import { ResultSheet, type ScanResultPerson } from '../components/add/ResultSheet';
import {
  openNativeScanner,
  openScannerSettings,
  openWebScanner,
  parseScannedText,
  probeCamera,
  type CameraProbe,
  type ScanPhase,
  type ScanSession,
} from '../lib/scanner';
import { refreshNetwork } from '../lib/refreshNetwork';
import { trpc } from '../lib/trpc';

const HOLD_MS = 1600;

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return '';
}

function failureKey(error: unknown): string {
  const message = errorText(error);
  if (message.includes('INVITE_EXPIRED')) return 'add.expired';
  if (/already used/i.test(message)) return 'add.used';
  if (/own invite|connect to yourself/i.test(message)) return 'add.ownCode';
  if (message.includes('INVITER_DELETED')) return 'add.inviterGone';
  if (/not[_\s-]?found/i.test(message)) return 'add.notFound';
  if (message.includes('CONNECTION_LIMIT_SELF')) return 'add.limitSelf';
  if (message.includes('CONNECTION_LIMIT_OTHER')) return 'add.limitOther';
  return 'add.scanError';
}

function useScanConsume() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  const accept = trpc.invite.accept.useMutation();
  const [person, setPerson] = useState<ScanResultPerson | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hold = useRef(false);
  const timer = useRef<number | null>(null);
  const meId = me.data?.id;

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const releaseLater = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      hold.current = false;
    }, HOLD_MS);
  };

  const onCode = (raw: string) => {
    if (hold.current) return;
    hold.current = true;
    const target = parseScannedText(raw);
    if (target.kind === 'unknown') {
      setNotice(t('add.notInvite'));
      releaseLater();
      return;
    }
    if (target.kind === 'sos') {
      navigate(`/sos/${target.id}`);
      return;
    }
    setNotice(t('add.reading'));
    void (async () => {
      try {
        const invite = await utils.invite.getByToken.fetch({ token: target.token });
        if (invite.inviter.id === meId) {
          setNotice(t('add.ownCode'));
          releaseLater();
          return;
        }
        const result = await accept.mutateAsync({ token: target.token });
        const pending = 'pending' in result && result.pending === true;
        const already = 'alreadyConnected' in result && result.alreadyConnected === true;
        let first = false;
        if (!pending && !already) {
          try {
            const circle = await utils.connection.list.fetch();
            first = circle.length <= 1;
          } catch {
            first = false;
          }
        }
        let nickname = invite.inviter.name;
        if (!pending) {
          try {
            const stored = await utils.connection.getNickname.fetch({ targetUserId: result.connectedWith });
            if (stored.nickname) nickname = stored.nickname;
          } catch {
            nickname = invite.inviter.name;
          }
        }
        await refreshNetwork(utils);
        setNotice(null);
        setPerson({
          userId: result.connectedWith,
          name: invite.inviter.name,
          photoUrl: invite.inviter.photoUrl,
          pending,
          already,
          first,
          nickname: pending ? '' : nickname,
        });
      } catch (error) {
        setNotice(t(failureKey(error)));
        releaseLater();
      }
    })();
  };

  const closeResult = () => {
    setPerson(null);
    releaseLater();
  };

  return {
    onCode,
    paused: () => hold.current,
    person,
    closeResult,
    notice,
  };
}

function StatusScreen({
  kind,
  onRetry,
}: {
  kind: 'missing' | 'unsupported' | 'denied' | 'error';
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nativeDenied = kind === 'denied' && Capacitor.isNativePlatform();
  const title =
    kind === 'denied' ? t('add.deniedTitle') : kind === 'error' ? t('add.cameraErrorTitle') : t('add.noCameraTitle');
  const body =
    kind === 'denied'
      ? t('add.denied')
      : kind === 'unsupported'
        ? t('add.unsupported')
        : kind === 'error'
          ? t('add.cameraError')
          : t('add.noCamera');

  return (
    <Screen title={t('nav.scan')} back={{ label: t('nav.add'), to: '/add' }} width="column">
      <Card className="mt-4" title={title} subtitle={body}>
        <div className="flex flex-col gap-2.5">
          {nativeDenied ? (
            <Button className="w-full" onClick={() => void openScannerSettings().catch(() => undefined)}>
              {t('add.openSettings')}
            </Button>
          ) : null}
          {onRetry ? (
            <Button className="w-full" variant={nativeDenied ? 'secondary' : 'primary'} onClick={onRetry}>
              {t('add.tryAgain')}
            </Button>
          ) : null}
          <Button className="w-full" variant="secondary" icon={<IconQr />} onClick={() => navigate('/add/qr')}>
            {t('add.showMine')}
          </Button>
        </div>
      </Card>
    </Screen>
  );
}

function ScannerChrome({
  native,
  videoRef,
  torch,
  notice,
  onClose,
  onTorch,
  onShowMine,
}: {
  native: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  torch: boolean;
  notice: string | null;
  onClose: () => void;
  onTorch: () => void;
  onShowMine: () => void;
}) {
  const { t } = useTranslation();
  const [lit, setLit] = useState(false);

  return (
    <div className={native ? 'fixed inset-0 z-40 bg-transparent' : 'fixed inset-0 z-40 bg-scene'}>
      <style>
        {`@keyframes add-scan-line { from { top: 12%; } to { top: 88%; } }
          @media (prefers-reduced-motion: reduce) {
            .add-scan-line { animation: none !important; top: 50% !important; }
          }`}
      </style>
      {native || !videoRef ? null : (
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
      )}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[calc(12px+var(--sa-top))]">
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="so-focus grid h-10 w-10 place-items-center rounded-md bg-node-1/15 text-node-1"
        >
          <IconClose className="h-5 w-5" />
        </button>
        {torch ? (
          <button
            type="button"
            aria-label={t('add.torch')}
            aria-pressed={lit}
            onClick={() => {
              setLit((value) => !value);
              onTorch();
            }}
            className="so-focus grid h-10 w-10 place-items-center rounded-md bg-node-1/15 text-node-1"
          >
            <IconFlash className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-10 w-10" />
        )}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[46%] h-[252px] w-[252px] -translate-x-1/2 -translate-y-1/2">
        <i className="absolute left-0 top-0 h-10 w-10 rounded-tl-[18px] border-l-[3px] border-t-[3px] border-care" />
        <i className="absolute right-0 top-0 h-10 w-10 rounded-tr-[18px] border-r-[3px] border-t-[3px] border-care" />
        <i className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[18px] border-b-[3px] border-l-[3px] border-care" />
        <i className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[18px] border-b-[3px] border-r-[3px] border-care" />
        <span className="add-scan-line absolute left-3.5 right-3.5 h-0.5 bg-care opacity-70" style={{ animation: 'add-scan-line 2.4s ease-in-out infinite alternate' }} />
      </div>
      <p className="absolute inset-x-5 top-[70%] text-center text-body-s font-semibold text-node-1">
        {t('add.aim')}
        <small className="mt-1.5 block text-label font-semibold text-node-2">{notice || t('add.aimHint')}</small>
      </p>
      <div className="absolute inset-x-4 bottom-[calc(16px+var(--sa-bottom))]">
        <Button
          className="w-full border-node-1/20 bg-node-1/10 text-node-1 hover:bg-node-1/15"
          variant="secondary"
          icon={<IconQr />}
          onClick={onShowMine}
        >
          {t('add.showMine')}
        </Button>
      </div>
    </div>
  );
}

function WebScanner({
  onCode,
  paused,
  notice,
  onBlocked,
}: {
  onCode: (value: string) => void;
  paused: () => boolean;
  notice: string | null;
  onBlocked: (phase: ScanPhase) => void;
}) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  onCodeRef.current = onCode;
  pausedRef.current = paused;
  const sessionRef = useRef<ScanSession | null>(null);
  const [phase, setPhase] = useState<ScanPhase | 'booting'>('booting');
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let session: ScanSession | null = null;
    let controller: AbortController | null = null;

    const stopSession = () => {
      controller?.abort();
      controller = null;
      session?.stop();
      session = null;
      sessionRef.current = null;
    };

    const start = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      stopSession();
      const next = new AbortController();
      controller = next;
      void openWebScanner({
        video,
        onCode: (value) => onCodeRef.current(value),
        paused: () => pausedRef.current(),
        signal: next.signal,
        isCancelled: () => disposed || next.signal.aborted,
      }).then((opened) => {
        if (disposed || next.signal.aborted) {
          opened.stop();
          return;
        }
        session = opened;
        sessionRef.current = opened;
        setTorch(opened.torch);
        setPhase(opened.phase);
        if (opened.phase !== 'live') onBlocked(opened.phase);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopSession();
        return;
      }
      if (document.visibilityState === 'visible') start();
    };

    const onPageHide = () => {
      stopSession();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    if (document.visibilityState !== 'hidden') start();

    return () => {
      disposed = true;
      stopSession();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [onBlocked]);

  if (phase !== 'booting' && phase !== 'live') return null;

  return (
    <ScannerChrome
      native={false}
      videoRef={videoRef}
      torch={torch}
      notice={notice}
      onClose={() => navigate('/add')}
      onTorch={() => void sessionRef.current?.toggleTorch().catch(() => undefined)}
      onShowMine={() => navigate('/add/qr')}
    />
  );
}

function NativeOrWeb({
  onCode,
  paused,
  notice,
  onBlocked,
}: {
  onCode: (value: string) => void;
  paused: () => boolean;
  notice: string | null;
  onBlocked: (phase: ScanPhase) => void;
}) {
  const navigate = useNavigate();
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  const blockedRef = useRef(onBlocked);
  onCodeRef.current = onCode;
  pausedRef.current = paused;
  blockedRef.current = onBlocked;
  const sessionRef = useRef<ScanSession | null>(null);
  const [mode, setMode] = useState<'booting' | 'native' | 'web'>('booting');
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void openNativeScanner({
      video: null,
      onCode: (value) => onCodeRef.current(value),
      paused: () => pausedRef.current(),
    }).then((session) => {
      if (cancelled) {
        session?.stop();
        return;
      }
      if (!session) {
        setMode('web');
        return;
      }
      if (session.phase !== 'live') {
        session.stop();
        blockedRef.current(session.phase);
        return;
      }
      sessionRef.current = session;
      setTorch(session.torch);
      setMode('native');
    });
    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  if (mode === 'web') {
    return <WebScanner onCode={onCode} paused={paused} notice={notice} onBlocked={onBlocked} />;
  }

  if (mode !== 'native') return null;

  return (
    <ScannerChrome
      native
      torch={torch}
      notice={notice}
      onClose={() => navigate('/add')}
      onTorch={() => void sessionRef.current?.toggleTorch().catch(() => undefined)}
      onShowMine={() => navigate('/add/qr')}
    />
  );
}

export function ScanPage() {
  const { t } = useTranslation();
  const consume = useScanConsume();
  const [probe, setProbe] = useState<'checking' | CameraProbe>('checking');
  const [attempt, setAttempt] = useState(0);
  const [blocked, setBlocked] = useState<ScanPhase | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeCamera().then((result) => {
      if (!cancelled) setProbe(result);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (probe === 'checking') {
    return (
      <Screen title={t('nav.scan')} back={{ label: t('nav.add'), to: '/add' }} width="column">
        <p className="mt-6 text-label font-semibold text-ink-muted">{t('common.loading')}</p>
      </Screen>
    );
  }

  if (probe === 'missing' || probe === 'unsupported') {
    return <StatusScreen kind={probe} />;
  }

  if (blocked && blocked !== 'live') {
    const retry = blocked === 'denied' || blocked === 'error';
    return (
      <StatusScreen
        kind={blocked}
        onRetry={retry ? () => { setBlocked(null); setAttempt((value) => value + 1); } : undefined}
      />
    );
  }

  return (
    <>
      <NativeOrWeb
        key={attempt}
        onCode={consume.onCode}
        paused={consume.paused}
        notice={consume.notice}
        onBlocked={setBlocked}
      />
      <ResultSheet person={consume.person} onClose={consume.closeResult} />
    </>
  );
}
