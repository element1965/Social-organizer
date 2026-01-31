import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Spinner } from '../components/ui/spinner';
import { Avatar } from '../components/ui/avatar';
import { Bell, X, Check, ChevronRight, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

function getNotificationBadge(type: string, t: (key: string) => string): { label: string; variant: 'info' | 'warning' | 'default' | 'danger' | 'success' } {
  switch (type) {
    case 'NEW_COLLECTION': return { label: t('notifications.new'), variant: 'info' };
    case 'RE_NOTIFY': return { label: t('notifications.reNotify'), variant: 'warning' };
    case 'COLLECTION_CLOSED': return { label: t('notifications.closed'), variant: 'default' };
    case 'COLLECTION_BLOCKED': return { label: t('notifications.blocked'), variant: 'danger' };
    case 'SPECIAL_AUTHOR': return { label: t('notifications.specialAuthor'), variant: 'success' };
    case 'SPECIAL_DEVELOPER': return { label: t('notifications.specialDeveloper'), variant: 'success' };
    default: return { label: type, variant: 'default' };
  }
}

function timeRemaining(expiresAt: string | Date): string | null {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage } = trpc.notification.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor, refetchInterval: 30000 },
  );

  const markRead = trpc.notification.markRead.useMutation({ onSuccess: () => utils.notification.list.invalidate() });
  const dismiss = trpc.notification.dismiss.useMutation({ onSuccess: () => utils.notification.list.invalidate() });

  const notifications = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Bell className="w-5 h-5" /> {t('notifications.title')}
      </h1>
      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : notifications.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{t('notifications.empty')}</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const path = (n.handshakePath as string[]) || [];
            const badge = getNotificationBadge(n.type, t);
            const remaining = n.expiresAt ? timeRemaining(n.expiresAt) : null;
            return (
              <Card key={n.id} className={cn(n.status === 'UNREAD' && 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20')}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Avatar src={n.collection?.creator?.photoUrl} name={n.collection?.creator?.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{n.collection?.creator?.name}</p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {n.collection?.amount != null ? `${n.collection.amount} ${n.collection.currency}` : n.collection?.currency}
                      </p>
                      {path.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-0.5 flex-wrap">
                          {t('notifications.via')}{' '}
                          {path.map((name, i) => (
                            <span key={i} className="flex items-center gap-0.5">
                              {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
                              <span className="text-gray-600 dark:text-gray-300">{name}</span>
                            </span>
                          ))}
                          <span className="ml-1 text-gray-400">({path.length} {t('notifications.handshakes')})</span>
                        </p>
                      )}
                      {remaining && (
                        <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {remaining}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => { markRead.mutate({ id: n.id }); navigate(`/collection/${n.collectionId}`); }}>
                          <Check className="w-3 h-3 mr-1" /> {t('notifications.view')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismiss.mutate({ id: n.id })}>
                          <X className="w-3 h-3 mr-1" /> {t('notifications.dismiss')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {hasNextPage && <Button variant="outline" className="w-full" onClick={() => fetchNextPage()}>{t('notifications.loadMore')}</Button>}
        </div>
      )}
    </div>
  );
}
