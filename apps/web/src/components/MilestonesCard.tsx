import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from './ui/card';
import { Avatar } from './ui/avatar';

type Kind = 'FIRST_CONNECTION' | 'TEN_CONNECTIONS';

/**
 * Money MVP milestones (SO-44): first handshake and 10 direct confirmed connections.
 * Shows the fact, the date and, while still connected, the person it happened with.
 * A newly reached milestone gets one short confirmation inside the card (no push, no sound);
 * the animation is skipped for people who prefer reduced motion.
 *
 * `variant="progress"` (default, network page) shows only milestones still in progress (plus the one-time
 * confirmation of a fresh one); reached milestones live in the history variant on the settings page.
 * Not shown on the dashboard (SO-44).
 */
export function MilestonesCard({
  variant = 'progress',
}: {
  variant?: 'progress' | 'history';
}) {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const { data } = trpc.milestone.list.useQuery(undefined, { refetchInterval: 30000 });
  const markSeen = trpc.milestone.markSeen.useMutation({
    onSuccess: () => utils.milestone.list.invalidate(),
  });

  if (!data) return null;
  const anyAchieved = data.items.some((m) => m.achievedAt);
  if (data.current === 0 && !anyAchieved) return null; // nothing yet: the dashboard shows the "add first connection" block

  const isHistory = variant === 'history';
  // Progress: only what is still in progress; history: only what is reached
  const visibleItems = data.items.filter((m) => (isHistory ? !!m.achievedAt : !m.achievedAt));

  const title = (kind: Kind) => (kind === 'FIRST_CONNECTION' ? t('milestones.first') : t('milestones.ten'));
  const fmt = (d: string | Date) =>
    new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  // One confirmation at a time, the bigger milestone first
  const fresh = isHistory ? undefined : [...data.items]
    .reverse()
    .find((m) => m.achievedAt && !m.seen);

  if (visibleItems.length === 0 && !fresh) return null;

  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('milestones.title')}</h3>

        {fresh && (
          <div
            role="status"
            className="mb-3 flex items-center gap-3 rounded-xl bg-teal-50 dark:bg-teal-900/30 p-3 motion-safe:animate-milestone-in"
          >
            <span className="w-8 h-8 shrink-0 rounded-full bg-teal-600 text-white flex items-center justify-center">
              <Check className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">{t('milestones.newBadge')}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{title(fresh.kind as Kind)}</p>
            </div>
            <button
              type="button"
              aria-label={t('milestones.dismiss')}
              onClick={() => markSeen.mutate({ kind: fresh.kind as Kind })}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <ul className="space-y-3">
          {visibleItems.map((m) => {
            const done = !!m.achievedAt;
            const progress = Math.min(data.current, m.threshold);
            return (
              <li key={m.kind} className="flex items-center gap-3">
                <span
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    done ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check className="w-4 h-4" /> : m.threshold}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{title(m.kind as Kind)}</p>
                  {done ? (
                    <p className="text-xs text-gray-500 dark:text-gray-300 truncate">
                      {m.person ? `${m.person.name} · ` : ''}
                      {fmt(m.achievedAt!)}
                      {m.threshold > 1 && data.current < m.threshold ? ` · ${t('milestones.nowCount', { count: data.current })}` : ''}
                    </p>
                  ) : m.threshold > 1 ? (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div className="h-full bg-teal-500" style={{ width: `${(progress / m.threshold) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-300">
                        {t('milestones.progress', { count: progress, total: m.threshold })}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-300">{t('milestones.notYet')}</p>
                  )}
                </div>
                {done && m.person && <Avatar src={m.person.photoUrl} name={m.person.name} size="sm" />}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
