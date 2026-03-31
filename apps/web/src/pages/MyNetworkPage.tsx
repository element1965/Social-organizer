import { useState, useCallback, lazy, Suspense, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useNicknames } from '../hooks/useNicknames';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Users, Globe, List, Wallet, ChevronDown, ChevronUp, Layers, TrendingUp } from 'lucide-react';
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
  const resolve = useNicknames();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('view') === '3d' ? '3d' : 'list') as 'list' | '3d';
  const setView = (v: 'list' | '3d') => setSearchParams(v === 'list' ? {} : { view: v }, { replace: true });
  const [showClusters, setShowClusters] = useState(false);
  // Navigate from graph node click — deferred so Three.js finishes its render frame first
  const navigateToProfile = useCallback((id: string) => {
    setTimeout(() => navigate(`/profile/${id}`), 0);
  }, [navigate]);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isAdmin = adminData?.isAdmin ?? false;

  const [expandedDepth, setExpandedDepth] = useState<number | null>(null);
  const { data: networkStats, isLoading } = useCachedNetworkStats();
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    enabled: view === '3d',
    refetchInterval: 60000,
  });
  const { data: clusters } = trpc.cluster.list.useQuery(undefined, { refetchInterval: 60000 });

  const byDepth = networkStats?.byDepth ?? {};
  const usersByDepth = (networkStats as any)?.usersByDepth ?? {};

  const { data: growthWeek } = trpc.stats.byPeriod.useQuery({ days: 7 }, { refetchInterval: 120000 });
  const { data: growthMonth } = trpc.stats.byPeriod.useQuery({ days: 30 }, { refetchInterval: 120000 });

  // Build growth chart from connectedAt timestamps of all network users
  const growthPoints = useMemo(() => {
    const allUsers: Array<{ connectedAt?: string | null }> = Object.values(usersByDepth).flat() as any[];
    if (allUsers.length === 0) return [];
    const now = Date.now();
    const dayMs = 86400000;
    const POINTS = 8;
    const RANGE = 30 * dayMs;
    const step = RANGE / POINTS;
    const counts: number[] = Array(POINTS).fill(0);
    for (const u of allUsers) {
      if (!u.connectedAt) continue;
      const age = now - new Date(u.connectedAt).getTime();
      if (age > RANGE) continue;
      const idx = Math.min(POINTS - 1, Math.floor((RANGE - age) / step));
      counts[idx]++;
    }
    // cumulative
    const cum: number[] = [];
    let acc = 0;
    // base = users older than 30 days
    const base = allUsers.filter((u) => !u.connectedAt || now - new Date(u.connectedAt).getTime() > RANGE).length;
    for (const c of counts) { acc += c; cum.push(base + acc); }
    return cum;
  }, [usersByDepth]);

  const toggleDepth = (depth: number) => {
    setExpandedDepth((prev) => {
      if (prev === depth) return null;
      // Scroll to the header after React re-renders
      setTimeout(() => {
        document.getElementById(`depth-header-${depth}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return depth;
    });
  };

  return (
    <div className="px-4 pt-3 pb-4 space-y-4">
      <div className="flex items-center justify-between pr-12">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('network.title')}
        </h1>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowClusters((v) => !v)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-lg ${showClusters ? 'bg-purple-500 ring-2 ring-purple-300' : 'bg-purple-600 hover:bg-purple-500'}`}
            >
              <Layers className="w-4 h-4 text-white" />
            </button>
          )}
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
          const totalClusters = clusters?.length ?? 0;
          return otherClusters.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-300">{t('cluster.notInNetwork')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">{t('cluster.total')}</span>
                <span className="text-xl font-bold text-purple-700 dark:text-purple-300">{totalClusters}</span>
              </div>
              {otherClusters.map((cl, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                  onClick={() => navigate(`/profile/${cl.rootUserId}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{resolve(cl.rootUserId, cl.rootUserName)}</p>
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
            <p className="absolute top-3 left-0 right-0 text-center text-sm font-semibold text-gray-400 dark:text-gray-300 z-10 pointer-events-none">GoodWill Net</p>
            <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
              {graphData ? (
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
                  onNodeClick={navigateToProfile}
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
          {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : Object.keys(byDepth).length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-300">{t('network.empty')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('network.emptyHint')}</p>
            </div>
          ) : (
            <div>
              {Object.entries(byDepth).flatMap(([depth, count], idx) => {
                const depthNum = Number(depth);
                const isExpanded = expandedDepth === depthNum;
                const depthUsers = usersByDepth[depthNum] || [];
                const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                const color = colors[(depthNum - 1) % colors.length];

                // Collapsed items before/after expanded
                if (expandedDepth !== null && !isExpanded) {
                  if (depthNum < expandedDepth) {
                    if (depthNum !== expandedDepth - 1) return [];
                    return [(
                      <div
                        key={depth}
                        className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 ${idx > 0 ? 'mt-2' : ''}`}
                        style={{ position: 'sticky', top: 0, zIndex: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                      >
                        <button onClick={() => toggleDepth(depthNum)} className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>{depth}</div>
                              <span className="text-sm text-gray-600 dark:text-gray-300">{t('dashboard.handshakeOrdinal', { depth })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-bold text-gray-900 dark:text-white">{count as number}</span>
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            </div>
                          </div>
                        </button>
                      </div>
                    )];
                  }
                  if (depthNum > expandedDepth) {
                    if (depthNum !== expandedDepth + 1) return [];
                    return [(
                      <div
                        key={depth}
                        className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 mt-2`}
                        style={{ position: 'sticky', bottom: 0, zIndex: 10, boxShadow: '0 -4px 12px rgba(0,0,0,0.15)' }}
                      >
                        <button onClick={() => toggleDepth(depthNum)} className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>{depth}</div>
                              <span className="text-sm text-gray-600 dark:text-gray-300">{t('dashboard.handshakeOrdinal', { depth })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-bold text-gray-900 dark:text-white">{count as number}</span>
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            </div>
                          </div>
                        </button>
                      </div>
                    )];
                  }
                }

                // Expanded item — header and list as separate siblings for proper sticky
                if (isExpanded) {
                  const hasPrev = expandedDepth !== null && idx > 0;
                  const stickyTop = hasPrev ? 50 : 0;
                  const elements: React.ReactNode[] = [
                    <div
                      key={`${depth}-header`}
                      id={`depth-header-${depth}`}
                      className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 ${idx > 0 ? 'mt-2' : ''}`}
                      style={{ position: 'sticky', top: stickyTop, zIndex: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                    >
                      <button onClick={() => toggleDepth(depthNum)} className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>{depth}</div>
                            <span className="text-sm text-gray-600 dark:text-gray-300">{t('dashboard.handshakeOrdinal', { depth })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-gray-900 dark:text-white">{count as number}</span>
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </button>
                    </div>,
                  ];
                  if (depthUsers.length > 0) {
                    elements.push(
                      <div key={`${depth}-list`} className="border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg overflow-hidden bg-white dark:bg-gray-900">
                        {depthUsers.map((user: any) => {
                          const isRecent = user.connectedAt && (Date.now() - new Date(user.connectedAt).getTime()) < 24 * 60 * 60 * 1000;
                          return (
                            <button
                              key={user.id}
                              onClick={() => navigate(`/profile/${user.id}`)}
                              className={`w-full flex items-center gap-2 p-2 ${isRecent ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                            >
                              <Avatar src={user.photoUrl} name={resolve(user.id, user.name)} size="sm" />
                              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left">
                                {resolve(user.id, user.name)}
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
                    );
                  }
                  return elements;
                }

                // No expanded — normal collapsed item
                return [(
                  <div
                    key={depth}
                    className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 ${idx > 0 ? 'mt-2' : ''}`}
                  >
                    <button onClick={() => toggleDepth(depthNum)} className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>{depth}</div>
                          <span className="text-sm text-gray-600 dark:text-gray-300">{t('dashboard.handshakeOrdinal', { depth })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-gray-900 dark:text-white">{count as number}</span>
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </button>
                  </div>
                )];
              })}
            </div>
          )}

          {/* Network growth stats + chart */}
          {Object.keys(byDepth).length > 0 && (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Рост сети</span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 py-2 px-1">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {Object.values(byDepth).reduce((a, b) => a + (b as number), 0)}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Всего</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 py-2 px-1">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    +{growthWeek?.newPeople ?? 0}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">За 7 дней</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 py-2 px-1">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    +{growthMonth?.newPeople ?? 0}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">За 30 дней</p>
                </div>
              </div>

              {/* Growth chart */}
              {growthPoints.length > 1 && (() => {
                const max = Math.max(...growthPoints, 1);
                const W = 280;
                const H = 80;
                const pts = growthPoints.map((v, i) => {
                  const x = (i / (growthPoints.length - 1)) * W;
                  const y = H - (v / max) * (H - 8) - 4;
                  return `${x},${y}`;
                }).join(' ');
                const area = `0,${H} ` + pts + ` ${W},${H}`;
                return (
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Участники за последние 30 дней</p>
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
                      <defs>
                        <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <polygon points={area} fill="url(#netGrad)" />
                      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      {growthPoints.map((v, i) => {
                        const x = (i / (growthPoints.length - 1)) * W;
                        const y = H - (v / max) * (H - 8) - 4;
                        return <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6" />;
                      })}
                    </svg>
                    <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                      <span>30 дн. назад</span>
                      <span>Сейчас</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
