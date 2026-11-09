import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../ui2/Button';
import { trpc } from '../../lib/trpc';
import { IconScan } from './icons';
import { liveInviteUrl } from './links';

const TTL_MS = 60_000;
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

export function LiveQr({ onScan, onDone }: { onScan: () => void; onDone: () => void }) {
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

    const issue = async () => {
      if (pending) return;
      pending = true;
      try {
        const res = await generateRef.current({ ttl: 60 });
        if (stopped) return;
        const expiresAt = res.expiresAt ? new Date(res.expiresAt).getTime() : Date.now() + TTL_MS;
        current = { token: res.token, expiresAt };
        setPass(current);
        setFailed(false);
      } catch {
        if (!stopped) setFailed(true);
      } finally {
        pending = false;
      }
    };

    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (current && time >= current.expiresAt) {
        current = null;
        void issue();
      }
    };

    void issue();
    const interval = window.setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [retry]);

  const remaining = pass ? Math.max(0, pass.expiresAt - now) : TTL_MS;
  const fraction = Math.min(1, remaining / TTL_MS);
  const url = pass ? liveInviteUrl(pass.token) : '';

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center text-center">
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
        <div className="grid h-[200px] w-[200px] place-items-center overflow-hidden rounded-xl bg-surface shadow-float" role="img" aria-label={t('add.myQr')}>
          {url ? <QRCodeSVG value={url} size={164} level="M" /> : null}
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
      </div>
    </div>
  );
}
