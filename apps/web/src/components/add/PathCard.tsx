import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui2/Avatar';
import { Card } from '../ui2/Card';
import { appOrigin } from './links';
import { shareLink } from '../../lib/share';

interface AlonePerson {
  name: string;
  photoUrl?: string | null;
}

interface PathCardProps {
  direct: number;
  network: number;
  needDirect: number;
  needNetwork: number;
  alone: AlonePerson | null;
}

function givenName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5 text-label font-bold text-ink-muted">
      <span className="w-24 shrink-0 whitespace-nowrap text-ink">{label}</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
        <span className="absolute inset-y-0 left-0 rounded-pill bg-care" style={{ width: `${percent(value, total)}%` }} />
      </span>
      <span className="shrink-0 tabular-nums">{t('add.of', { count: value, total })}</span>
    </div>
  );
}

/** The same two steps as the "path to a request" sheet, shown where the person can act. */
export function PathCard({ direct, network, needDirect, needNetwork, alone }: PathCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const name = alone ? givenName(alone.name) : '';

  const remind = async () => {
    if (!alone) return;
    try {
      const outcome = await shareLink({
        title: t('common.appName'),
        text: t('add.remindText', { name }),
        url: appOrigin(),
      });
      if (outcome === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="mt-4">
      <Bar label={t('add.circle')} value={direct} total={needDirect} />
      <div className="mt-2.5">
        <Bar label={t('add.network')} value={network} total={needNetwork} />
      </div>
      {alone ? (
        <div className="mt-3 flex items-center gap-2.5 border-t border-line-soft pt-3">
          <Avatar name={alone.name} src={alone.photoUrl} size={36} className="h-8 w-8 rounded-[10px] bg-canvas text-[13px] text-ink" />
          <p className="min-w-0 flex-1 text-label font-semibold leading-snug text-ink-muted">
            <b className="font-extrabold text-ink">{name}</b> {t('add.nudgeRest')}
          </p>
          <button
            type="button"
            onClick={() => void remind()}
            className="so-focus grid h-8 shrink-0 place-items-center rounded-md bg-care-soft px-3 text-label font-bold text-care"
          >
            {copied ? t('common.copied') : t('add.remind')}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
