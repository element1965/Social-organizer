import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ASK_MIN_DIRECT, ASK_MIN_NETWORK } from '@so/shared';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';

type Props = {
  open: boolean;
  onClose: () => void;
};

function Progress({ value, goal }: { value: number; goal: number }) {
  const ratio = Math.min(1, goal > 0 ? value / goal : 0);
  return (
    <span className="mt-2 block h-1.5 overflow-hidden rounded-pill bg-line" aria-hidden>
      <span className="block h-full rounded-pill bg-care" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </span>
  );
}

/** Text share with a clipboard fallback. Returns true when something happened. */
async function shareText(text: string): Promise<'shared' | 'copied' | 'none'> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return 'none';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'none';
  }
}

/**
 * Two steps to the first request: "Your circle N of 5" and "Network N of 10", with the direct
 * connections who have not brought anyone yet and a "Remind" share. Used on the Circle and by WP4.
 */
export function PathToRequestSheet({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const access = trpc.collection.askAccess.useQuery(undefined, { enabled: open });
  const connections = trpc.connection.list.useQuery(undefined, { enabled: open });
  const [copied, setCopied] = useState(false);

  const direct = access.data?.directCount ?? connections.data?.length ?? 0;
  const network = access.data?.networkCount ?? 0;
  const needDirect = access.data?.needDirect ?? ASK_MIN_DIRECT;
  const needNetwork = access.data?.needNetwork ?? ASK_MIN_NETWORK;
  // Alone in the network: the only connection they have is me.
  const lonely = (connections.data ?? []).filter((c) => c.connectionCount <= 1);
  const lonelyNames = lonely.slice(0, 3).map((c) => c.displayName);

  const remind = async () => {
    const result = await shareText(t('circle.path.nudgeText', { url: window.location.origin }));
    if (result === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const title = access.data?.allowed
    ? t('circle.path.titleOpen')
    : direct === 0
      ? t('circle.path.titleEmpty')
      : t('circle.path.title');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={t('circle.path.lead')}
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
            {t('circle.path.later')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col">
        <section className="pt-1">
          <div className="flex items-baseline justify-between text-body-s font-bold">
            <span>{t('circle.path.circle')}</span>
            <span className={cn('tabular-nums', direct >= needDirect ? 'text-care' : 'text-ink-muted')}>
              {t('circle.path.of', { count: direct, goal: needDirect })}
            </span>
          </div>
          <Progress value={direct} goal={needDirect} />
          <p className="mt-2 text-label text-ink-muted">{t('circle.path.circleNote')}</p>
        </section>

        <section className="mt-3.5 border-t border-line-soft pt-3.5">
          <div className="flex items-baseline justify-between text-body-s font-bold">
            <span>{t('circle.path.network')}</span>
            <span className={cn('tabular-nums', network >= needNetwork ? 'text-care' : 'text-ink-muted')}>
              {t('circle.path.of', { count: network, goal: needNetwork })}
            </span>
          </div>
          <Progress value={network} goal={needNetwork} />
          {lonely.length > 0 ? (
            <>
              <p className="mt-2 text-label text-ink-muted">
                {t('circle.path.lonely', { names: lonelyNames.join(', '), count: lonely.length })}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {lonely.slice(0, 5).map((c) => (
                  <Avatar key={c.userId} name={c.displayName} src={c.photoUrl} size={36} className="h-7 w-7 rounded-sm text-micro" />
                ))}
                <Button variant="ghost" size="sm" className="ml-auto bg-care-soft text-care" onClick={remind}>
                  {copied ? t('common.copied') : t('circle.path.nudge')}
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-label text-ink-muted">{t('circle.path.networkNote')}</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}
