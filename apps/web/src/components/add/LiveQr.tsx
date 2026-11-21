import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { trpc } from '../../lib/trpc';
import { IconScan } from './icons';
import { QrCodeView } from './QrCodeView';
import { liveInviteUrl } from './links';

const TTL_MS = 60_000;
const MIN_GAP_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

interface Pass {
  id: string;
  token: string;
  expiresAt: number;
}

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(Math.min(ms, TTL_MS) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fills the height its parent gives it (a `fill` Screen), buttons at the bottom. `children` go under the buttons,
 * so an extra action never pushes the screen past the viewport.
 */
export function LiveQr({ claimedIds, onIssued, onScan, onDone, children }: {
  claimedIds: ReadonlySet<string>;
  onIssued: (id: string) => void;
  onScan: () => void;
  onDone: () => void;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const generate = trpc.invite.generate.useMutation({ meta: { notifyOnError: false } });
  const generateRef = useRef(generate.mutateAsync);
  generateRef.current = generate.mutateAsync;
  const issuedRef = useRef(onIssued);
  issuedRef.current = onIssued;
  const [pass, setPass] = useState<Pass | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const refreshRef = useRef<((ids: ReadonlySet<string>) => void) | null>(null);

  useEffect(() => {
    let stopped = false;
    let pending = false;
    let current: Pass | null = null;
    let failures = 0;
    let nextAttemptAt = 0;
    let epoch = 0;
    let wantFresh = false;
    let waitTimer = 0;
    let interval = 0;

    const hidden = () => document.visibilityState === 'hidden';
    const visible = () => document.visibilityState === 'visible';

    const clearWait = () => {
      if (waitTimer) window.clearTimeout(waitTimer);
      waitTimer = 0;
    };

    const clearTick = () => {
      if (interval) window.clearInterval(interval);
      interval = 0;
    };

    const schedule = () => {
      clearWait();
      waitTimer = window.setTimeout(() => {
        waitTimer = 0;
        void issue();
      }, Math.max(0, nextAttemptAt - Date.now()));
    };

    const armTick = () => {
      clearTick();
      interval = window.setInterval(() => {
        if (!current || !visible()) return;
        const time = Date.now();
        setNow(time);
        if (time >= current.expiresAt) {
          current = null;
          setPass(null);
          void issue();
        }
      }, 250);
    };

    const issue = async (afterConnection = false) => {
      if (stopped || pending || hidden()) return;
      if (!afterConnection && Date.now() < nextAttemptAt) {
        schedule();
        return;
      }
      clearWait();
      pending = true;
      const ticket = epoch;
      const startedAt = Date.now();
      nextAttemptAt = startedAt + MIN_GAP_MS;
      try {
        const res = await generateRef.current({ ttl: 60 });
        if (stopped || ticket !== epoch || hidden()) return;
        // Start from the request to account for round-trip time without comparing different clocks.
        const expiresAt = startedAt + TTL_MS;
        const arrivedAt = Date.now();
        failures = 0;
        setFailed(false);
        if (arrivedAt >= expiresAt) {
          wantFresh = true;
          return;
        }
        current = { id: res.id, token: res.token, expiresAt };
        issuedRef.current(res.id);
        setPass(current);
        setNow(arrivedAt);
      } catch {
        if (stopped || ticket !== epoch || hidden()) return;
        failures += 1;
        current = null;
        setPass(null);
        setFailed(true);
        nextAttemptAt = Date.now() + Math.min(MAX_BACKOFF_MS, MIN_GAP_MS * 2 ** (failures - 1));
        schedule();
      } finally {
        pending = false;
        if (!stopped && wantFresh && visible()) {
          wantFresh = false;
          void issue();
        }
      }
    };

    const onVisibility = () => {
      if (hidden()) {
        epoch += 1;
        wantFresh = false;
        clearWait();
        clearTick();
        current = null;
        setPass(null);
        return;
      }
      if (!visible()) return;
      armTick();
      setNow(Date.now());
      if (pending) wantFresh = true;
      else void issue();
    };

    retryRef.current = () => void issue();
    refreshRef.current = (ids) => {
      if (!current || !ids.has(current.id)) return;
      current = null;
      setPass(null);
      void issue(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (visible()) {
      armTick();
      void issue();
    }
    return () => {
      stopped = true;
      epoch += 1;
      clearWait();
      clearTick();
      retryRef.current = null;
      refreshRef.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    refreshRef.current?.(claimedIds);
  }, [claimedIds]);

  const remaining = pass ? Math.max(0, pass.expiresAt - now) : TTL_MS;
  const fraction = Math.min(1, remaining / TTL_MS);
  const url = pass ? liveInviteUrl(pass.token) : '';

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <QrCodeView
        url={url}
        fraction={fraction}
        timeLabel={pass ? formatLeft(remaining) : null}
        failed={failed}
        retrying={generate.isPending}
        onRetry={() => retryRef.current?.()}
      />
      <p className="mt-2 text-label font-bold tabular-nums text-ink-muted" role="status">
        {t('add.connectedHere', { connections: new Intl.NumberFormat(i18n.language).format(claimedIds.size) })}
      </p>
      <div className="mt-auto w-full pt-8">
        <Button className="w-full" variant="secondary" icon={<IconScan />} onClick={onScan}>
          {t('add.scanOther')}
        </Button>
        <Button className="mt-2 w-full" variant="ghost" onClick={onDone}>
          {t('common.done')}
        </Button>
        {children}
      </div>
    </div>
  );
}
