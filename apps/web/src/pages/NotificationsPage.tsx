import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Spinner } from '../components/ui/spinner';
import { Avatar } from '../components/ui/avatar';
import { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  ChevronRight,
  ChevronDown,
  Clock,
  Users,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  XCircle,
  Wallet,
  Handshake,
} from 'lucide-react';
import { cn } from '../lib/utils';

function getNotificationBadge(type: string, t: (key: string) => string): { label: string; variant: 'info' | 'warning' | 'default' | 'danger' | 'success' } {
  switch (type) {
    case 'NEW_COLLECTION': return { label: t('notifications.new'), variant: 'info' };
    case 'RE_NOTIFY': return { label: t('notifications.reNotify'), variant: 'warning' };
    case 'COLLECTION_CLOSED': return { label: t('notifications.closed'), variant: 'default' };
    case 'COLLECTION_BLOCKED': return { label: t('notifications.blocked'), variant: 'danger' };
    case 'OBLIGATION_RECEIVED': return { label: t('notifications.obligationReceived'), variant: 'success' };
    case 'CYCLE_CLOSED': return { label: t('notifications.cycleClosed'), variant: 'default' };
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
  const [pendingIncomingCollapsed, setPendingIncomingCollapsed] = useState(false);
  const [pendingOutgoingCollapsed, setPendingOutgoingCollapsed] = useState(false);

  const { data, isLoading, fetchNextPage, hasNextPage } = trpc.notification.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor, refetchInterval: 30000 },
  );

  const markRead = trpc.notification.markRead.useMutation({ onSuccess: () => utils.notification.list.invalidate() });
  const dismiss = trpc.notification.dismiss.useMutation({ onSuccess: () => { utils.notification.list.invalidate(); utils.notification.unreadCount.invalidate(); } });
  const dismissAll = trpc.notification.dismissAll.useMutation({ onSuccess: () => { utils.notification.list.invalidate(); utils.notification.unreadCount.invalidate(); } });

  // Skill match notifications
  const { data: matchNotifs } = trpc.matches.matchNotifications.useQuery(undefined, { refetchInterval: 30000 });
  const dismissMatch = trpc.matches.dismissMatchNotification.useMutation({
    onSuccess: () => { utils.matches.matchNotifications.invalidate(); utils.matches.unreadMatchCount.invalidate(); },
  });
  const markMatchesRead = trpc.matches.markMatchNotificationsRead.useMutation({
    onSuccess: () => { utils.matches.matchNotifications.invalidate(); utils.matches.unreadMatchCount.invalidate(); },
  });

  // Auto-mark match notifications as read when page opens
  const matchReadFired = useRef(false);
  useEffect(() => {
    const unreadCount = matchNotifs?.filter((m) => m.status === 'UNREAD').length ?? 0;
    if (unreadCount > 0 && !matchReadFired.current) {
      matchReadFired.current = true;
      markMatchesRead.mutate();
    }
  }, [matchNotifs]);

  // Pending connections
  const { data: pendingIncoming } = trpc.pending.incoming.useQuery(undefined, { refetchInterval: 15000 });
  const { data: myPending } = trpc.pending.myPending.useQuery(undefined, { refetchInterval: 30000 });
  const acceptPending = trpc.pending.accept.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); utils.connection.getNetworkStats.invalidate(); },
  });
  const rejectPending = trpc.pending.reject.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); },
  });

  const notifications = data?.pages.flatMap((p) => p.items) ?? [];

  // Filter emergency notifications
  const emergencyNotifications = notifications.filter(
    (n) => n.type === 'NEW_COLLECTION' && n.status === 'UNREAD' && n.collection?.type === 'EMERGENCY' && n.collection?.status === 'ACTIVE'
  );

  // Group notifications by collectionId for stacked display
  type NotifItem = typeof notifications[0];
  type NotifGroup = { collectionId: string; items: NotifItem[] };
  const groupedNotifications: NotifGroup[] = [];
  const seenCollections = new Map<string, number>();
  for (const n of notifications) {
    const cId = n.collectionId;
    if (seenCollections.has(cId)) {
      groupedNotifications[seenCollections.get(cId)!].items.push(n);
    } else {
      seenCollections.set(cId, groupedNotifications.length);
      groupedNotifications.push({ collectionId: cId, items: [n] });
    }
  }

  const handleCardClick = (n: typeof notifications[0]) => {
    markRead.mutate({ id: n.id });
    // Don't navigate to collection if it's blocked — the user can't participate anymore
    if (n.type === 'COLLECTION_BLOCKED') return;
    navigate(`/collection/${n.collectionId}`);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pr-12">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5" /> {t('notifications.title')}
        </h1>
        {notifications.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-gray-400"
            onClick={() => dismissAll.mutate()}
            disabled={dismissAll.isPending}
          >
            {t('notifications.dismissAll')}
          </Button>
        )}
      </div>

      {/* Emergency notifications */}
      {emergencyNotifications.length > 0 && (
        <Card className="border-red-500 dark:border-red-700 bg-red-50 dark:bg-red-950/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-700 dark:text-red-400">
                {t('dashboard.emergencyAlerts')} ({emergencyNotifications.length})
              </span>
            </div>
            <div className="space-y-2">
              {emergencyNotifications.slice(0, 3).map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => navigate(`/collection/${notif.collectionId}`)}
                  className="w-full text-left p-2 rounded bg-white/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-900"
                >
                  <div className="flex items-center gap-2">
                    <Avatar src={notif.collection?.creator?.photoUrl} name={notif.collection?.creator?.name || '?'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {notif.collection?.creator?.name}
                        </p>
                        <span className="flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
                          <Users className="w-3 h-3" />
                          {(notif.collection?.creator as any)?.connectionCount ?? 0}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 shrink-0">
                          <Wallet className="w-3 h-3" />
                          ${Math.round((notif.collection?.creator as any)?.remainingBudget ?? 0)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-300">
                        {notif.collection?.amount} {notif.collection?.currency}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skill match notifications — above collection notifications */}
      {matchNotifs && matchNotifs.length > 0 && (
        <Card className="border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Handshake className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-purple-700 dark:text-purple-400 flex-1">
                {t('matches.title')} ({matchNotifs.length})
              </span>
              <button
                onClick={() => navigate('/matches')}
                className="text-xs text-purple-500 hover:text-purple-700"
              >
                {t('common.done')} →
              </button>
            </div>
            <div className="space-y-1.5">
              {matchNotifs.map((mn) => (
                <div key={mn.id} className="flex items-center gap-2 p-2 rounded bg-white/50 dark:bg-gray-900/50">
                  <button
                    onClick={() => navigate(`/profile/${mn.matchUser.id}`)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <Avatar src={mn.matchUser.photoUrl} name={mn.matchUser.name} size="sm" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{mn.matchUser.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t(`skills.${mn.category.key}`, mn.category.key)}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => dismissMatch.mutate({ id: mn.id })}
                    className="p-1 rounded text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collection notifications — grouped by collectionId with stacked overlap */}
      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : groupedNotifications.length === 0 && (!pendingIncoming || pendingIncoming.length === 0) && (!myPending || myPending.length === 0) && (!matchNotifs || matchNotifs.length === 0) ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">{t('notifications.empty')}</div>
      ) : groupedNotifications.length > 0 ? (
        <div className="space-y-2">
          {groupedNotifications.map((group) => {
            const renderCard = (n: NotifItem, idx: number, isStacked: boolean) => {
              const resolvedPath = (n as any).handshakePathResolved as Array<{ id: string; name: string }> | undefined;
              const badge = getNotificationBadge(n.type, t);
              const remaining = n.expiresAt ? timeRemaining(n.expiresAt) : null;
              return (
                <Card
                  key={n.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 relative',
                    n.status === 'UNREAD' && 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20',
                    isStacked && idx > 0 && 'bg-white dark:bg-gray-900',
                  )}
                  style={isStacked && idx > 0 ? { marginTop: -6, marginLeft: idx * 4, marginRight: idx * 4 } : undefined}
                  onClick={() => handleCardClick(n)}
                >
                  <CardContent className="p-3 relative">
                    <button
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-300 transition-colors"
                      onClick={(e) => { e.stopPropagation(); dismiss.mutate({ id: n.id }); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-2 mb-1.5 pr-6">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {remaining && (
                        <span className="text-xs text-orange-500 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {remaining}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 pr-6">
                      <Avatar src={n.collection?.creator?.photoUrl} name={n.collection?.creator?.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{n.collection?.creator?.name}</span>
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <Users className="w-3 h-3" />
                            {(n.collection?.creator as any)?.connectionCount ?? 0}
                          </span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {n.collection?.amount != null ? `${n.collection.amount} ${n.collection.currency}` : n.collection?.currency}
                          </span>
                        </div>
                        {resolvedPath && resolvedPath.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-0.5 flex-wrap">
                            {t('notifications.via')}{' '}
                            {resolvedPath.map((user, i) => (
                              <span key={user.id} className="flex items-center gap-0.5">
                                {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/profile/${user.id}`); }}
                                  className="text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                                >
                                  {user.name}
                                </button>
                              </span>
                            ))}
                            <span className="ml-1">({resolvedPath.length})</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            };

            const isStacked = group.items.length > 1;

            return (
              <div key={group.collectionId}>
                {group.items.map((n, idx) => renderCard(n, idx, isStacked))}
              </div>
            );
          })}
          {hasNextPage && <Button variant="outline" className="w-full" onClick={() => fetchNextPage()}>{t('notifications.loadMore')}</Button>}
        </div>
      ) : null}

      {/* Incoming pending connections — collapsible, below collection notifications */}
      {pendingIncoming && pendingIncoming.length > 0 && (
        <Card className="border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3">
            <button
              onClick={() => setPendingIncomingCollapsed(!pendingIncomingCollapsed)}
              className="flex items-center gap-2 w-full"
            >
              {pendingIncomingCollapsed ? <ChevronRight className="w-5 h-5 text-amber-600" /> : <ChevronDown className="w-5 h-5 text-amber-600" />}
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-700 dark:text-amber-400 flex-1 text-left">
                {t('pending.incoming')} ({pendingIncoming.length})
              </span>
            </button>
            {!pendingIncomingCollapsed && (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-2 mb-2">{t('pending.meetInPerson')}</p>
                <div className="space-y-2">
                  {pendingIncoming.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded bg-white/50 dark:bg-gray-900/50">
                      <button
                        onClick={() => navigate(`/profile/${p.fromUser.id}`)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <Avatar src={p.fromUser.photoUrl} name={p.fromUser.name} size="sm" />
                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate text-left">{p.fromUser.name}</span>
                      </button>
                      <button
                        onClick={() => acceptPending.mutate({ pendingId: p.id })}
                        disabled={acceptPending.isPending}
                        className="p-1.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 hover:bg-green-200 dark:hover:bg-green-800"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => rejectPending.mutate({ pendingId: p.id })}
                        disabled={rejectPending.isPending}
                        className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-500 hover:bg-red-200 dark:hover:bg-red-800"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* My outgoing pending — collapsible */}
      {myPending && myPending.length > 0 && (
        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="py-3">
            <button
              onClick={() => setPendingOutgoingCollapsed(!pendingOutgoingCollapsed)}
              className="flex items-center gap-2 w-full"
            >
              {pendingOutgoingCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-300 flex-1 text-left">{t('pending.waitingApproval')} ({myPending.length})</span>
            </button>
            {!pendingOutgoingCollapsed && (
              <div className="space-y-1 mt-2">
                {myPending.map((p) => (
                  <button key={p.id} className="flex items-center gap-2 w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg p-1 -m-1 transition-colors" onClick={() => navigate(`/profile/${p.toUser.id}`)}>
                    <Avatar src={p.toUser.photoUrl} name={p.toUser.name} size="xs" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{p.toUser.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
