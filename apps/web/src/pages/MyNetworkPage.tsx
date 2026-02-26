import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Users, Globe, List, Wallet, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, Layers } from 'lucide-react';
const LazyNetworkGraph = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.NetworkGraph })),
);

const LEGEND_COLORS_DARK = ['#3b82f6', '#6366f1', '#06b6d4', '#64748b'];
const LEGEND_COLORS_LIGHT = ['#2563eb', '#4f46e5', '#0891b2', '#475569'];
const LEGEND_LABELS = ['You', '1°', '2°', '3°'];

function timeAgo(date: string | Date | null): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export function MyNetworkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuth((s) => s.userId);
  const { mode } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('view') === 'list' ? 'list' : '3d') as 'list' | '3d';
  const setView = (v: 'list' | '3d') => setSearchParams(v === '3d' ? {} : { view: v }, { replace: true });
  const [showClusters, setShowClusters] = useState(false);
  // Delay graph mount so DOM container is fully laid out before Three.js initializes WebGL
  const [graphReady, setGraphReady] = useState(false);
  useEffect(() => {
    if (view === '3d') {
      setGraphReady(false);
      const timer = setTimeout(() => setGraphReady(true), 80);
      return () => clearTimeout(timer);
    }
    setGraphReady(false);
    return undefined;
  }, [view]);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const utils = trpc.useUtils();

  const [expandedDepth, setExpandedDepth] = useState<number | null>(null);
  // Pending connections
  const { data: pendingIncoming } = trpc.pending.incoming.useQuery(undefined, { refetchInterval: 15000 });
  const acceptPending = trpc.pending.accept.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); utils.connection.getNetworkStats.invalidate(); utils.connection.getCount.invalidate(); },
  });
  const rejectPending = trpc.pending.reject.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); },
  });
  const { data: networkStats, isLoading } = useCachedNetworkStats();
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    enabled: view === '3d',
    refetchInterval: 60000,
  });
  const { data: clusters } = trpc.cluster.list.useQuery(undefined, { refetchInterval: 60000 });

  const byDepth = networkStats?.byDepth ?? {};
  const usersByDepth = (networkStats as any)?.usersByDepth ?? {};

  const toggleDepth = (depth: number) => {
    setExpandedDepth((prev) => (prev === depth ? null : depth));
  };

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <div className="flex items-center justify-between pr-12">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('network.title')}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowClusters((v) => !v)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-lg ${showClusters ? 'bg-purple-500 ring-2 ring-purple-300' : 'bg-purple-600 hover:bg-purple-500'}`}
          >
            <Layers className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => { setShowClusters(false); setView(view === 'list' ? '3d' : 'list'); }}
            className="w-10 h-10 rounded-full bg-gray-600 hover:bg-gray-500 flex items-center justify-center transition-colors shadow-lg"
          >
            {view === 'list' ? <Globe className="w-4 h-4 text-white" /> : <List className="w-4 h-4 text-white" />}
          </button>
        </div>
      </div>

      {showClusters ? (
        (() => {
          const otherClusters = clusters?.filter((cl) => !cl.isMine) ?? [];
          return otherClusters.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-300">{t('cluster.notInNetwork')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {otherClusters.map((cl, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                  onClick={() => navigate(`/profile/${cl.rootUserId}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{cl.rootUserName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-300">{t('cluster.members')}: {cl.memberCount}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">${cl.totalBudget}</p>
                    <p className="text-[10px] text-gray-400">{t('cluster.budget')}</p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ) : view === '3d' ? (
        <>
          <div className={`rounded-xl overflow-hidden relative ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`} style={{ height: 'calc(100vh - 200px)' }}>
            <p className="absolute top-3 left-0 right-0 text-center text-sm font-semibold text-gray-400 dark:text-gray-300 z-10 pointer-events-none">GoodwillNet</p>
            <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
              {graphReady && graphData ? (
                <LazyNetworkGraph
                  nodes={graphData.nodes.map((n) => ({
                    ...n,
                    isCenter: n.id === myId,
                    depth: (n as any).depth ?? (n.id === myId ? 0 : 1),
                    connectionCount: (n as any).connectionCount ?? 0,
                    lastSeen: (n as any).lastSeen ?? null,
                  }))}
                  edges={graphData.edges.map((e) => ({ source: e.from, target: e.to }))}
                  width={window.innerWidth - 32}
                  height={window.innerHeight - 200}
                  onNodeClick={(id) => navigate(`/profile/${id}`)}
                  darkMode={isDark}
                />
              ) : (
                <div className="flex justify-center py-12"><Spinner /></div>
              )}
            </Suspense>
          </div>
          <div className="flex flex-col items-center gap-1 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
            <span>{t('network.controlsHint')}</span>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {(isDark ? LEGEND_COLORS_DARK : LEGEND_COLORS_LIGHT).map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <span className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: c }} />
                  {LEGEND_LABELS[i]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <span className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: '#22c55e' }} />
                Online
              </span>
            </div>
          </div>
        </>
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
              <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-300">{t('network.empty')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('network.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(byDepth).map(([depth, count]) => {
                const depthNum = Number(depth);
                const isExpanded = expandedDepth === depthNum;
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
                          <span className="text-sm text-gray-600 dark:text-gray-300">{t('dashboard.handshakeOrdinal', { depth })}</span>
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
                        {depthUsers.map((user: any) => {
                          const isRecent = user.connectedAt && (Date.now() - new Date(user.connectedAt).getTime()) < 24 * 60 * 60 * 1000;
                          return (
                            <button
                              key={user.id}
                              onClick={() => navigate(`/profile/${user.id}`)}
                              className={`w-full flex items-center gap-2 p-2 ${isRecent ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                            >
                              <Avatar src={user.photoUrl} name={user.name} size="sm" />
                              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left">
                                {user.name}
                                {user.createdAt && <span className="ml-1.5 text-[10px] text-gray-400">{timeAgo(user.createdAt)}</span>}
                              </span>
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
                          );
                        })}
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
