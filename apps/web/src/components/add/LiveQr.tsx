import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { QR_LOGO_LEVEL, qrLogo } from '../../lib/qrLogo';
import { Button } from '../ui2/Button';
import { trpc } from '../../lib/trpc';
import { IconScan } from './icons';
import { liveInviteUrl } from './links';

const TTL_MS = 60_000;
const MIN_GAP_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;
const RING = 2 * Math.PI * 126;

interface Pass {
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
export function LiveQr({ onScan, onDone, children }: { onScan: () => void; onDone: () => void; children?: ReactNode }) {
  const { t } = useTranslation();
  const generate = trpc.invite.generate.useMutation();
  const generateRef = useRef(generate.mutateAsync);
  generateRef.current = generate.mutateAsync;
  const [pass, setPass] = useState<Pass | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let stopped = false;
    let pending = false;
    let current: Pass | null = null;
    let failures = 0;
    let lastIssued = 0;
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

    // The countdown is the client clock from the moment the pass arrives.
    // The server expiresAt is not compared with Date.now(): a skewed clock would refresh immediately.
    const nextDelay = () => {
      const since = lastIssued > 0 ? Date.now() - lastIssued : MIN_GAP_MS;
      const floor = lastIssued > 0 ? Math.max(0, MIN_GAP_MS - since) : 0;
      const backoff = failures > 0 ? Math.min(MAX_BACKOFF_MS, MIN_GAP_MS * 2 ** (failures - 1)) : 0;
      return Math.max(floor, backoff);
    };

    const schedule = (delay: number) => {
      clearWait();
      waitTimer = window.setTimeout(() => {
        waitTimer = 0;
        void issue();
      }, delay);
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

    const issue = async () => {
      if (stopped || pending || hidden()) return;
      const delay = nextDelay();
      if (delay > 0) {
        schedule(delay);
        return;
      }
      pending = true;
      const ticket = epoch;
      lastIssued = Date.now();
      try {
        const res = await generateRef.current({ ttl: 60 });
        if (stopped || ticket !== epoch || hidden()) return;
        const issuedAt = Date.now();
        current = { token: res.token, expiresAt: issuedAt + TTL_MS };
        failures = 0;
        setPass(current);
        setNow(issuedAt);
        setFailed(false);
      } catch {
        if (stopped || ticket !== epoch || hidden()) return;
        failures += 1;
        current = null;
        setPass(null);
        setFailed(true);
        schedule(nextDelay());
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
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [retry]);

  const remaining = pass ? Math.max(0, pass.expiresAt - now) : TTL_MS;
  const fraction = Math.min(1, remaining / TTL_MS);
  const url = pass ? liveInviteUrl(pass.token) : '';

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <div className="relative mt-4 grid h-[260px] w-[260px] max-w-full place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 260 260" aria-hidden>
          <circle cx="130" cy="130" r="126" className="fill-none stroke-line-strong" strokeWidth="3" />
          <circle
            cx="130"
            cy="130"
            r="126"
            className="fill-none stroke-care"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - fraction)}
          />
        </svg>
        {/* Always black on white with a 4-module quiet zone, whatever the theme: phone cameras and Google Lens
            do not find a code that touches a dark background, only our own scanner forgives that. */}
        <div className="grid h-[200px] w-[200px] place-items-center overflow-hidden rounded-xl bg-white shadow-float" role="img" aria-label={t('add.myQr')}>
          {url ? (
            <QRCodeSVG
              value={url}
              size={196}
              marginSize={4}
              level={QR_LOGO_LEVEL}
              imageSettings={qrLogo(196)}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          ) : null}
        </div>
      </div>
      <p className="mt-3.5 text-h2 font-extrabold tabular-nums text-ink" aria-live="polite">
        {pass ? formatLeft(remaining) : '1:00'}
      </p>
      <p className="mt-1.5 max-w-[30ch] text-caption font-semibold text-ink-muted">{t('add.qrHint')}</p>
      {failed ? (
        <button type="button" className="so-focus mt-3 text-label font-bold text-sos" onClick={() => setRetry((value) => value + 1)}>
          {t('add.qrError')}
        </button>
      ) : null}
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
