import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ASK_MIN_DIRECT, ASK_MIN_NETWORK } from '@so/shared';
import { trpc } from '../../lib/trpc';
import { shareLink } from '../../lib/share';
import { cn } from '../../lib/utils';
import { appOrigin } from '../add/links';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
import { Sheet } from '../ui2/Sheet';

/*
 * "Path to a request": the one explanation of why asking is locked and how to open it.
 * Two steps (your circle N of 5, network N of 10), the people who have not brought anyone yet and a
 * "Remind" share. The Circle sheet, the Ask tab, the Add screen, the start card and the grow strip all
 * use this file and the `path.*` keys.
 */

type PathData = {
  /** askAccess answered: until then nothing about the lock is known. */
  ready: boolean;
  allowed: boolean;
  direct: number;
  network: number;
  needDirect: number;
  needNetwork: number;
  lonely: { userId: string; displayName: string; photoUrl: string | null }[];
};

function usePathData(enabled = true): PathData {
  const access = trpc.collection.askAccess.useQuery(undefined, { enabled });
  const connections = trpc.connection.list.useQuery(undefined, { enabled });
  // Alone in the network: the only connection they have is me.
  const lonely = (connections.data ?? [])
    .filter((c) => c.connectionCount <= 1)
    .map((c) => ({ userId: c.userId, displayName: c.displayName || c.name, photoUrl: c.photoUrl }));
  return {
    ready: access.isSuccess,
    allowed: access.data?.allowed === true,
    direct: access.data?.directCount ?? connections.data?.length ?? 0,
    network: access.data?.networkCount ?? 0,
    needDirect: access.data?.needDirect ?? ASK_MIN_DIRECT,
    needNetwork: access.data?.needNetwork ?? ASK_MIN_NETWORK,
    lonely,
  };
}

function pathTitle(t: (key: string) => string, data: PathData): string {
  if (data.allowed) return t('path.titleOpen');
  return data.direct === 0 ? t('path.titleEmpty') : t('path.title');
}

function Progress({ value, goal }: { value: number; goal: number }) {
  const ratio = Math.min(1, goal > 0 ? value / goal : 0);
  return (
    <span className="mt-2 block h-1.5 overflow-hidden rounded-pill bg-line" aria-hidden>
      <span className="block h-full rounded-pill bg-care" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </span>
  );
}

function StepHead({ label, value, goal }: { label: string; value: number; goal: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline justify-between text-body-s font-bold">
      <span>{label}</span>
      <span className={cn('tabular-nums', value >= goal ? 'text-care' : 'text-ink-muted')}>
        {t('path.of', { count: Math.min(value, goal), goal })}
      </span>
    </div>
  );
}

/** The two steps with the "Remind" row. */
function PathSteps({ data }: { data: PathData }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const lonelyNames = data.lonely.slice(0, 3).map((c) => c.displayName);

  const remind = async () => {
    try {
      const outcome = await shareLink({ title: t('common.appName'), text: t('path.remindText'), url: appOrigin() });
      if (outcome === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col">
      <section className="pt-1">
        <StepHead label={t('path.circle')} value={data.direct} goal={data.needDirect} />
        <Progress value={data.direct} goal={data.needDirect} />
        <p className="mt-2 text-label text-ink-muted">{t('path.circleNote')}</p>
      </section>

      <section className="mt-3.5 border-t border-line-soft pt-3.5">
        <StepHead label={t('path.network')} value={data.network} goal={data.needNetwork} />
        <Progress value={data.network} goal={data.needNetwork} />
        {data.lonely.length > 0 ? (
          <>
            <p className="mt-2 text-label text-ink-muted">
              {t('path.lonely', { names: lonelyNames.join(', '), count: data.lonely.length })}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data.lonely.slice(0, 5).map((c) => (
                <span key={c.userId} className="inline-flex max-w-[140px] items-center gap-1.5 rounded-pill bg-care-soft py-0.5 pl-0.5 pr-2.5">
                  <Avatar name={c.displayName} src={c.photoUrl} size={36} className="h-6 w-6 rounded-pill text-micro" />
                  <span className="truncate text-label font-semibold text-ink">{c.displayName.split(/\s+/)[0]}</span>
                </span>
              ))}
              <Button variant="ghost" size="sm" className="ml-auto bg-care-soft text-care" onClick={() => void remind()}>
                {copied ? t('common.copied') : t('path.remind')}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-label text-ink-muted">{t('path.networkNote')}</p>
        )}
      </section>
    </div>
  );
}

/** The sheet: on the Circle (from the grow strip) and on the Ask tab while asking is locked. */
export function PathToRequestSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children?: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const data = usePathData(open);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={pathTitle(t, data)}
      description={t('path.lead')}
      footer={
        <>
          <Button
            onClick={() => {
              onClose();
              navigate('/add');
            }}
          >
            {t('nav.addPerson')}
          </Button>
          <Button variant="text" onClick={onClose}>
            {t('path.later')}
          </Button>
        </>
      }
    >
      <PathSteps data={data} />
      {children}
    </Sheet>
  );
}

/** The same explanation as a card, on the Add screen below the link. Hidden once asking is open. */
export function PathCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const data = usePathData();
  // No flash of "almost there" for people who can already ask, and nothing if the check failed.
  if (!data.ready || data.allowed) return null;
  return (
    <Card className={className}>
      <h2 className="text-body font-extrabold tracking-tight text-ink">{pathTitle(t, data)}</h2>
      <p className="mb-2 mt-1 text-label font-semibold text-ink-muted">{t('path.lead')}</p>
      <PathSteps data={data} />
    </Card>
  );
}

/** "3 of 5" strip on top of the feed while the circle is small. Tap opens the sheet. */
export function GrowStrip({ direct, onOpen }: { direct: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const ratio = Math.min(1, direct / ASK_MIN_DIRECT);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="so-focus mx-1 mb-2.5 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-sm text-label font-bold text-ink-muted"
    >
      <span>{t('path.circle')}</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-line" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-pill bg-care" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span className="tabular-nums">{t('path.of', { count: direct, goal: ASK_MIN_DIRECT })}</span>
    </button>
  );
}
