import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { InvitePopup } from '../components/InvitePopup';
import { useTheme } from '../hooks/useTheme';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Users, UserPlus, Globe, List, Wallet, Check, X, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle } from 'lucide-react';
const LazyNetworkGraph = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.NetworkGraph })),
);

export function MyNetworkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuth((s) => s.userId);
  const { mode } = useTheme();
  const [view, setView] = useState<'list' | '3d'>('3d');
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const utils = trpc.useUtils();

  const [expandedDepths, setExpandedDepths] = useState<Record<number, boolean>>({});
  // Pending connections
  const { data: pendingIncoming } = trpc.pending.incoming.useQuery(undefined, { refetchInterval: 15000 });
  const acceptPending = trpc.pending.accept.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); utils.connection.getNetworkStats.invalidate(); utils.connection.getCount.invalidate(); },
  });
  const rejectPending = trpc.pending.reject.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); },
  });
  const { data: connectionCount } = trpc.connection.getCount.useQuery();
  const { data: networkStats, isLoading } = trpc.connection.getNetworkStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    enabled: view === '3d',
    refetchInterval: 60000,
  });

  const byDepth = networkStats?.byDepth ?? {};
  const usersByDepth = (networkStats as any)?.usersByDepth ?? {};

  const toggleDepth = (depth: number) => {
    setExpandedDepths((prev) => ({ ...prev, [depth]: !prev[depth] }));
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pr-12">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('network.title')}
          {connectionCount && (
            <span className="text-sm font-normal text-gray-400 ml-1">({connectionCount.count})</span>
          )}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setView(view === 'list' ? '3d' : 'list')}>
            {view === 'list' ? <Globe className="w-4 h-4" /> : <List className="w-4 h-4" />}
          </Button>
          <button
            onClick={() => setShowInvitePopup(true)}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors shadow-lg"
          >
            <UserPlus className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <InvitePopup open={showInvitePopup} onClose={() => setShowInvitePopup(false)} />

      {view === '3d' ? (
        <div className={`rounded-xl overflow-hidden relative ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`} style={{ height: 'calc(100vh - 200px)' }}>
          <p className="absolute top-3 left-0 right-0 text-center text-sm font-semibold text-gray-400 dark:text-gray-500 z-10 pointer-events-none">GoodwillNet</p>
          <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
            {graphData ? (
              <LazyNetworkGraph
                nodes={graphData.nodes.map((n) => ({
                  ...n,
                  isCenter: n.id === myId,
                }))}
                edges={graphData.edges.map((e) => ({ source: e.from, target: e.to }))}
                width={window.innerWidth - 32}
                height={window.innerHeight - 200}
                onNodeClick={(id) => navigate(`/profile/${id}`)}
                darkMode={isDark}
                controlsHint={t('network.controlsHint')}
              />
            ) : (
              <div className="flex justify-center py-12"><Spinner /></div>
            )}
          </Suspense>
        </div>
      ) : (
        <>
          {/* Incoming pending requests */}
          {pendingIncoming && pendingIncoming.length > 0 && (
            <div className="border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden mb-2">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t('pending.incoming')} ({pendingIncoming.length})</span>
                </div>
                <div className="space-y-2">
                  {pendingIncoming.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded bg-white/50 dark:bg-gray-900/50">
                      <Avatar src={p.fromUser.photoUrl} name={p.fromUser.name} size="sm" />
                      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">{p.fromUser.name}</span>
                      <button
                        onClick={() => acceptPending.mutate({ pendingId: p.id })}
                        disabled={acceptPending.isPending}
                        className="p-1.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 hover:bg-green-200"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => rejectPending.mutate({ pendingId: p.id })}
                        disabled={rejectPending.isPending}
                        className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-500 hover:bg-red-200"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : Object.keys(byDepth).length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500">{t('network.empty')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('network.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(byDepth).map(([depth, count]) => {
                const depthNum = Number(depth);
                const isExpanded = expandedDepths[depthNum];
                const depthUsers = usersByDepth[depthNum] || [];
                const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                const color = colors[(depthNum - 1) % colors.length];

                return (
                  <div key={depth} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleDepth(depthNum)}
                      className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: color }}
                          >
                            {depth}
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.handshakeOrdinal', { depth })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-gray-900 dark:text-white">{count as number}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {isExpanded && depthUsers.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                        {depthUsers.map((user: any) => (
                          <button
                            key={user.id}
                            onClick={() => navigate(`/profile/${user.id}`)}
                            className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <Avatar src={user.photoUrl} name={user.name} size="sm" />
                            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left">{user.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Users className="w-3 h-3" />
                                {user.connectionCount ?? 0}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <Wallet className="w-3 h-3" />
                                ${Math.round(user.remainingBudget ?? 0)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
