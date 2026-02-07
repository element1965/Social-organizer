import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '../lib/trpc';
import { buildInviteUrl, buildWebInviteUrl, buildBotInviteUrl } from '../lib/inviteUrl';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Avatar } from '../components/ui/avatar';
import { SemiDonutChart, Tabs } from '../components/ui/charts';
import {
  PlusCircle,
  Users,
  ArrowRight,
  UserPlus,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Network,
  HandHeart,
  Wallet,
  Copy,
  Check,
  X,
} from 'lucide-react';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

type TabId = 'network' | 'stats' | 'activity';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);

  const [activeTab, setActiveTab] = useState<TabId>('network');
  const [expandedDepths, setExpandedDepths] = useState<Record<number, boolean>>({});
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myCollections } = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myObligations } = trpc.obligation.myList.useQuery(undefined, { refetchInterval: 30000 });
  const { data: networkStats } = trpc.connection.getNetworkStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: notifications } = trpc.notification.list.useQuery({ limit: 10 }, { refetchInterval: 30000 });
  const { data: helpStats } = trpc.stats.help.useQuery(undefined, { refetchInterval: 60000 });
  const { data: helpByPeriod } = trpc.stats.helpGivenByPeriod.useQuery(undefined, { refetchInterval: 60000 });
  const { data: networkCapabilities } = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60000 });
  const { data: platformGrowth } = trpc.stats.platformGrowth.useQuery(undefined, { refetchInterval: 15000 });
  const permanentInviteUrl = userId ? buildInviteUrl(userId) : '';
  const webInviteUrl = userId ? buildWebInviteUrl(userId) : '';
  const botInviteUrl = userId ? buildBotInviteUrl(userId) : '';
  const [copiedWeb, setCopiedWeb] = useState(false);

  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};
  const usersByDepth = (networkStats as any)?.usersByDepth ?? {};

  // Filter emergency notifications (unread, only for active collections)
  const emergencyNotifications = notifications?.items?.filter(
    (n) => n.type === 'NEW_COLLECTION' && n.status === 'UNREAD' && n.collection?.type === 'EMERGENCY' && n.collection?.status === 'ACTIVE'
  ) ?? [];

  const toggleDepth = (depth: number) => {
    setExpandedDepths((prev) => ({ ...prev, [depth]: !prev[depth] }));
  };

  const tabs = [
    { id: 'network' as const, label: t('dashboard.tabNetwork'), icon: <Network className="w-4 h-4" /> },
    { id: 'stats' as const, label: t('dashboard.tabStats'), icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'activity' as const, label: t('dashboard.tabActivity'), icon: <HandHeart className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 space-y-4 relative">
      {/* 3D cloud background */}
      <div className="absolute inset-0 -z-10 opacity-30 pointer-events-none" style={{ height: 300 }}>
        <Suspense fallback={null}>
          <LazyCloudBackground particleCount={200} />
        </Suspense>
      </div>

      {/* Header with profile */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-gray-800 shadow-lg">
            {me?.photoUrl ? (
              <img src={me.photoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-lg font-bold text-white">{me?.name?.[0]}</span>
            )}
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{me?.name}</p>
            <p className="text-xs text-gray-500">{t('settings.title')}</p>
          </div>
        </button>
        <button
          onClick={() => { setCopied(false); setShowInvitePopup(true); }}
          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors shadow-lg"
        >
          <UserPlus className="w-5 h-5 text-white" />
        </button>
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
                      <p className="text-xs text-gray-500">
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

      {/* Gate: need at least 1 connection */}
      {Object.values(byDepth).reduce((a, b) => a + (b as number), 0) === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <UserPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.addFirstConnection')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('dashboard.addFirstConnectionDesc')}
            </p>
            <Button className="w-full" size="lg" onClick={() => navigate('/network')}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('dashboard.goToNetwork')}
            </Button>
          </CardContent>
        </Card>
      )}

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
                <QRCodeSVG value={webInviteUrl} size={200} level="H" imageSettings={{ src: '/logo.png', width: 48, height: 34, excavate: true }} />
              </div>
            </div>
            <div className="space-y-2">
              {/* Web link (landing page) */}
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
              {/* Bot link (Telegram) */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(botInviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-base shrink-0">🤖</span>
                <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{botInviteUrl}</p>
                <div className="shrink-0">
                  {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={(id) => setActiveTab(id as TabId)} />

      {/* === TAB: NETWORK === */}
      {activeTab === 'network' && (
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* Total network summary with growth */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-gray-500">{t('dashboard.totalNetwork')}</p>
                  <p className="text-4xl font-bold text-gray-900 dark:text-white">{totalReachable}</p>
                </div>
                {/* Sparkline chart */}
                {platformGrowth && platformGrowth.length > 1 && (() => {
                  const values = platformGrowth.map(p => p.count);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min || 1;
                  const w = 120;
                  const h = 40;
                  const pad = 2;
                  const points = values.map((v, i) => {
                    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
                    const y = h - pad - ((v - min) / range) * (h - pad * 2);
                    return `${x},${y}`;
                  });
                  const fillPoints = [`${pad},${h - pad}`, ...points, `${w - pad},${h - pad}`];
                  return (
                    <svg width={w} height={h} className="shrink-0">
                      <defs>
                        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      <polygon points={fillPoints.join(' ')} fill="url(#sparkFill)" />
                      <polyline
                        points={points.join(' ')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })()}
              </div>
              {/* Day counter since registration (Kyiv timezone) */}
              {me?.createdAt && (() => {
                const kyivNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
                const kyivReg = new Date(new Date(me.createdAt).toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
                const today = new Date(kyivNow.getFullYear(), kyivNow.getMonth(), kyivNow.getDate());
                const regDay = new Date(kyivReg.getFullYear(), kyivReg.getMonth(), kyivReg.getDate());
                const dayCount = Math.floor((today.getTime() - regDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
                return (
                  <div className="flex items-center gap-1 pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs font-medium text-green-600">
                      {t('dashboard.dayCount', { count: dayCount })}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Capabilities: Network + My */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-gradient-to-b from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl">
                <div className="flex items-center gap-1.5 mb-2">
                  <Network className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-gray-500">{t('dashboard.currentCapabilities')}</span>
                </div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  ${networkCapabilities?.total ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('dashboard.capabilitiesContributors', { count: networkCapabilities?.contributors ?? 0 })}
                </p>
              </div>
              <div className="p-4 bg-gradient-to-b from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl">
                <div className="flex items-center gap-1.5 mb-2">
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-gray-500">{t('dashboard.yourContribution')}</span>
                </div>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                  {me?.remainingBudget != null && me.monthlyBudget != null
                    ? `$${Math.round(me.remainingBudget)} / $${Math.round(me.monthlyBudget)}`
                    : '$0'}
                </p>
                <button
                  onClick={() => navigate('/settings')}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  {t('dashboard.editBudget')}
                </button>
              </div>
            </div>

            {/* Budget depleted hint */}
            {me?.monthlyBudget != null && me.remainingBudget != null && me.remainingBudget <= 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
                  {t('dashboard.budgetDepletedHint')}
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
                  {t('dashboard.updateBudget')}
                </Button>
              </div>
            )}

            {/* Handshakes by depth - compact mobile layout */}
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
                      {/* First line: depth badge + count + chevron */}
                      <div className="flex items-center justify-between mb-2">
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

          </CardContent>
        </Card>
      )}

      {/* === TAB: STATS === */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Section 1: Personal Statistics */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('dashboard.personalStats')}
              </h3>
            </div>

            {/* Help given/received */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {t('dashboard.helpStats')}
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center">
                    <SemiDonutChart
                      value={helpStats?.given?.count ?? 0}
                      max={20}
                      size={120}
                      color="#10b981"
                      label={String(helpStats?.given?.count ?? 0)}
                      sublabel={t('dashboard.helpGiven')}
                    />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-2">
                      {helpStats?.given?.totalAmount ?? 0} USD
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <SemiDonutChart
                      value={helpStats?.received?.count ?? 0}
                      max={20}
                      size={120}
                      color="#3b82f6"
                      label={String(helpStats?.received?.count ?? 0)}
                      sublabel={t('dashboard.helpReceived')}
                    />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-2">
                      {helpStats?.received?.totalAmount ?? 0} USD
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Section 2: Network Statistics */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('dashboard.networkStats')}
              </h3>
            </div>

            {/* Help given by period */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <HandHeart className="w-5 h-5 text-green-600" />
                  {t('dashboard.helpGivenByPeriod')}
                </h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* All time */}
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.periodAllTime')}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">
                        {helpByPeriod?.allTime?.count ?? 0} {t('dashboard.times')}
                      </span>
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        ${helpByPeriod?.allTime?.amount ?? 0}
                      </span>
                    </div>
                  </div>
                  {/* Monthly breakdown */}
                  {(helpByPeriod as any)?.months?.map((m: { month: string; count: number; amount: number }) => {
                    const [year, mo] = m.month.split('-');
                    const monthName = new Date(Number(year), Number(mo) - 1).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long' });
                    return (
                      <div key={m.month} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{monthName}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">
                            {m.count} {t('dashboard.times')}
                          </span>
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                            ${m.amount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* === TAB: ACTIVITY === */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* My collections */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {t('dashboard.myCollections')}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('/create')}>
                  <PlusCircle className="w-4 h-4 mr-1" /> {t('dashboard.create')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!myCollections ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : myCollections.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {t('dashboard.noCollections')}
                </p>
              ) : (
                <div className="space-y-3">
                  {myCollections.map((col) => {
                    const hasGoal = col.amount != null && col.amount > 0;
                    const current = (col as any).currentAmount ?? 0;
                    return (
                      <button
                        key={col.id}
                        onClick={() => navigate(`/collection/${col.id}`)}
                        className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={col.status === 'ACTIVE' ? 'success' : 'warning'}>{col.status}</Badge>
                            <Badge variant={col.type === 'EMERGENCY' ? 'danger' : 'info'}>
                              {col.type === 'EMERGENCY' ? t('collection.emergency') : t('collection.regular')}
                            </Badge>
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {hasGoal ? `${current} / ${col.amount} ${col.currency}` : `${current} ${col.currency}`}
                          </span>
                        </div>
                        {hasGoal && <Progress value={current} max={col.amount!} className="mt-1" />}
                        <div className="text-xs text-gray-500 mt-1">
                          {col._count.obligations} {t('dashboard.intentions')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* My intentions */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {t('dashboard.myIntentions')}
              </h2>
            </CardHeader>
            <CardContent>
              {!myObligations ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : myObligations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {t('dashboard.noIntentions')}
                </p>
              ) : (
                <div className="space-y-2">
                  {myObligations.map((obl) => (
                    <div key={obl.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={() => navigate(`/profile/${obl.collection.creatorId}`)} className="hover:opacity-80">
                          <Avatar src={obl.collection.creator.photoUrl} name={obl.collection.creator.name} size="sm" />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/profile/${obl.collection.creatorId}`)}
                              className="text-sm font-medium text-gray-900 dark:text-white hover:underline"
                            >
                              {obl.collection.creator.name}
                            </button>
                            <span className="flex items-center gap-0.5 text-xs text-gray-400">
                              <Users className="w-3 h-3" />
                              {(obl.collection.creator as any).connectionCount ?? 0}
                            </span>
                            <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                              <Wallet className="w-3 h-3" />
                              ${Math.round((obl.collection.creator as any).remainingBudget ?? 0)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{obl.amount} {obl.collection.currency}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/collection/${obl.collectionId}`)}>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
