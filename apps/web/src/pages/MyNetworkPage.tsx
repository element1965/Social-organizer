import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '../lib/trpc';
import { buildInviteUrl, buildWebInviteUrl } from '../lib/inviteUrl';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Users, UserPlus, Globe, List, Wallet, Copy, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
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

  const permanentInviteUrl = myId ? buildInviteUrl(myId) : '';
  const webInviteUrl = myId ? buildWebInviteUrl(myId) : '';
  const [copiedWeb, setCopiedWeb] = useState(false);

  const [expandedDepths, setExpandedDepths] = useState<Record<number, boolean>>({});
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
      <div className="flex items-center justify-between">
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
            onClick={() => { setCopiedWeb(false); setShowInvitePopup(true); }}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors shadow-lg"
          >
            <UserPlus className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Invite popup */}
      {showInvitePopup && permanentInviteUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowInvitePopup(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('network.invite')}</h3>
              <button onClick={() => setShowInvitePopup(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-xl">
                <QRCodeSVG value={webInviteUrl} size={200} level="H" imageSettings={{ src: '/logo-dark.png', width: 48, height: 34, excavate: true }} />
              </div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webInviteUrl);
                  setCopiedWeb(true);
                  setTimeout(() => setCopiedWeb(false), 2000);
                }}
                className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-base shrink-0">🌐</span>
                <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{webInviteUrl}</p>
                <div className="shrink-0">
                  {copiedWeb ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {view === '3d' ? (
        <div className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`} style={{ height: 'calc(100vh - 200px)' }}>
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
                        {depthUsers.slice(0, 20).map((user: any) => (
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
                        {depthUsers.length > 20 && (
                          <p className="text-xs text-gray-400 text-center py-2">
                            +{depthUsers.length - 20} {t('dashboard.more')}
                          </p>
                        )}
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
