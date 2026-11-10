import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkConnection } from '../../lib/connectivity';
import { Button } from '../ui2/Button';
import { relativeTime } from '../profile/dates';

/** Calm status line: no connection, what is shown instead, and a way to try again. */
export function OfflineNotice({ syncedAt }: { syncedAt?: string | null }) {
  const { t, i18n } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [, tick] = useState(0);
  // The relative time keeps up while the screen stays open
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const saved = syncedAt && Number.isFinite(Date.parse(syncedAt)) ? syncedAt : null;

  const retry = async () => {
    setChecking(true);
    try {
      // When the server answers, the connection state flips and the screens refetch on their own
      await checkConnection();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div role="status" className="flex items-center gap-3 rounded-lg bg-surface-2 ps-4 pe-1">
      <p className="min-w-0 flex-1 py-2.5 text-body-s font-semibold text-ink">
        {saved ? t('offline.banner', { time: relativeTime(saved, i18n.language) }) : t('offline.bannerNoCopy')}
      </p>
      <Button variant="text" className="min-h-[44px] shrink-0 px-3" loading={checking} onClick={() => void retry()}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

/** Short reason under an action that needs the server (shown next to a disabled button). */
export function OfflineHint({ className, id }: { className?: string; id?: string }) {
  const { t } = useTranslation();
  return <p id={id} className={className ?? 'mt-2 text-label font-semibold text-ink-muted'}>{t('offline.needsConnection')}</p>;
}
