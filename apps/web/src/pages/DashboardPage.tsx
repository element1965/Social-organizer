import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Avatar } from '../components/ui/avatar';
import { DonutChart, SemiDonutChart, BarChart, StatCard, Tabs, ProgressBarWithMarker } from '../components/ui/charts';
import {
  PlusCircle,
  Users,
  ArrowRight,
  Heart,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Bell,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Network,
  HandHeart,
} from 'lucide-react';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

type TabId = 'network' | 'stats' | 'activity';

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);

  const [activeTab, setActiveTab] = useState<TabId>('network');
  const [expandedDepths, setExpandedDepths] = useState<Record<number, boolean>>({});

  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myCollections } = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myObligations } = trpc.obligation.myList.useQuery(undefined, { refetchInterval: 30000 });
  const { data: networkStats } = trpc.connection.getNetworkStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: notifications } = trpc.notification.list.useQuery({ limit: 10 }, { refetchInterval: 30000 });
  const { data: helpStats } = trpc.stats.help.useQuery(undefined, { refetchInterval: 60000 });

  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};
  const usersByDepth = (networkStats as any)?.usersByDepth ?? {};
  const growth = networkStats?.growth ?? { day: 0, week: 0, month: 0, year: 0 };

  // Filter emergency notifications (unread)
  const emergencyNotifications = notifications?.items?.filter(
    (n) => n.type === 'NEW_COLLECTION' && !n.readAt && n.collection?.type === 'EMERGENCY'
  ) ?? [];

  const toggleDepth = (depth: number) => {
    setExpandedDepths((prev) => ({ ...prev, [depth]: !prev[depth] }));
  };

  const tabs = [
    { id: 'network' as const, label: t('dashboard.tabNetwork', 'Сеть'), icon: <Network className="w-4 h-4" /> },
    { id: 'stats' as const, label: t('dashboard.tabStats', 'Статистика'), icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'activity' as const, label: t('dashboard.tabActivity', 'Активность'), icon: <HandHeart className="w-4 h-4" /> },
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
          onClick={() => navigate(`/profile/${userId}`)}
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
            <p className="text-xs text-gray-500">{t('dashboard.viewProfile', 'Открыть профиль')}</p>
          </div>
        </button>
        <button
          onClick={() => navigate('/notifications')}
          className="relative w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          {emergencyNotifications.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
              {emergencyNotifications.length}
            </span>
          )}
        </button>
      </div>

      {/* Emergency notifications */}
      {emergencyNotifications.length > 0 && (
        <Card className="border-red-500 dark:border-red-700 bg-red-50 dark:bg-red-950/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-700 dark:text-red-400">
                {t('dashboard.emergencyAlerts', 'Экстренные сигналы')} ({emergencyNotifications.length})
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
                    <Avatar src={notif.sender?.photoUrl} name={notif.sender?.name || '?'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {notif.sender?.name}
                      </p>
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
              {t('dashboard.addFirstConnection', 'Добавь первую связь')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('dashboard.addFirstConnectionDesc', 'Органайзер работает через связи между людьми. Начни с одного человека — того, кому доверяешь.')}
            </p>
            <Button className="w-full" size="lg" onClick={() => navigate('/network')}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('dashboard.goToNetwork', 'Перейти к сети')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main CTA */}
      <Button className="w-full" size="lg" variant="default" onClick={() => navigate('/create')}>
        <Heart className="w-5 h-5 mr-2" /> {t('dashboard.needHelp', 'Мне нужна поддержка')}
      </Button>

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
                  <p className="text-sm text-gray-500">{t('dashboard.totalNetwork', 'Вся сеть')}</p>
                  <p className="text-4xl font-bold text-gray-900 dark:text-white">{totalReachable}</p>
                </div>
                <DonutChart
                  value={totalReachable}
                  max={500}
                  size={80}
                  strokeWidth={8}
                  color="#8b5cf6"
                  marker={Math.floor(500 / 3)}
                  label={`${Math.round((totalReachable / 500) * 100)}%`}
                />
              </div>
              {/* Network growth inline */}
              <div className="flex items-center gap-1 pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-xs text-gray-500">{t('dashboard.networkGrowth', 'Рост')}:</span>
                <span className="text-xs font-medium text-green-600">+{growth.day} 24ч</span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="text-xs font-medium text-green-600">+{growth.week} нед</span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="text-xs font-medium text-green-600">+{growth.month} мес</span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="text-xs font-medium text-green-600">+{(growth as any).year || 0} год</span>
              </div>
            </div>

            {/* Handshakes by depth - compact mobile layout */}
            <div className="space-y-2">
              {Object.entries(byDepth).map(([depth, count]) => {
                const depthNum = Number(depth);
                const isExpanded = expandedDepths[depthNum];
                const depthUsers = usersByDepth[depthNum] || [];
                const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                const color = colors[(depthNum - 1) % colors.length];
                // Max possible connections: 150^depth (Dunbar number exponential)
                const maxForDepth = Math.pow(150, depthNum);
                const markerForDepth = Math.floor(maxForDepth / 3);

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
                          <span className="text-sm text-gray-600 dark:text-gray-400">{depth}-е рукопожатие</span>
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
                      {/* Second line: progress bar with marker at 1/3 */}
                      <ProgressBarWithMarker
                        value={count as number}
                        max={maxForDepth}
                        color={color}
                        marker={markerForDepth}
                        className="dark:bg-gray-700"
                      />
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
                            {user.connectionCount != null && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Users className="w-3 h-3" />
                                {user.connectionCount}
                              </span>
                            )}
                          </button>
                        ))}
                        {depthUsers.length > 20 && (
                          <p className="text-xs text-gray-400 text-center py-2">
                            +{depthUsers.length - 20} ещё
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/network')}>
              <Users className="w-4 h-4 mr-2" /> {t('dashboard.viewNetwork', 'Открыть сеть')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* === TAB: STATS === */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {/* Help given/received */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {t('dashboard.helpStats', 'Статистика поддержки')}
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
                    sublabel={t('dashboard.helpGiven', 'Помог')}
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
                    sublabel={t('dashboard.helpReceived', 'Помогли мне')}
                  />
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-2">
                    {helpStats?.received?.totalAmount ?? 0} USD
                  </p>
                </div>
              </div>

              {/* Bar chart by currency */}
              {helpStats?.given?.byCurrency && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">{t('dashboard.byCurrency', 'По валютам')}</p>
                  <BarChart
                    data={Object.entries(helpStats.given.byCurrency as Record<string, number>).map(([currency, amount]) => ({
                      label: currency,
                      value: amount,
                      color: currency === 'USD' ? '#3b82f6' : '#10b981',
                    }))}
                    height={80}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t('dashboard.activeIntentions', 'Активных намерений')}
              value={helpStats?.activeIntentions ?? 0}
              icon={<Heart className="w-5 h-5" />}
            />
            <StatCard
              label={t('dashboard.completedCollections', 'Закрыто сборов')}
              value={helpStats?.completedCollections ?? 0}
              icon={<Users className="w-5 h-5" />}
            />
            <StatCard
              label={t('dashboard.networkReach', 'Охват сети')}
              value={helpStats?.networkReach ?? 0}
              sublabel={t('dashboard.people', 'человек')}
              trend={{ value: growth.month, isPositive: true }}
            />
            <StatCard
              label={t('dashboard.totalGiven', 'Всего отдал')}
              value={`${helpStats?.given?.totalAmount ?? 0}`}
              sublabel="USD"
            />
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
                  {t('dashboard.myCollections', 'Мои сигналы')}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('/create')}>
                  <PlusCircle className="w-4 h-4 mr-1" /> {t('dashboard.create', 'Создать')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!myCollections ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : myCollections.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {t('dashboard.noCollections', 'Нет активных сигналов')}
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
                          {col._count.obligations} {t('dashboard.intentions', 'намерений')}
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
                {t('dashboard.myIntentions', 'Мои намерения')}
              </h2>
            </CardHeader>
            <CardContent>
              {!myObligations ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : myObligations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {t('dashboard.noIntentions', 'Нет намерений')}
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
                          <button
                            onClick={() => navigate(`/profile/${obl.collection.creatorId}`)}
                            className="text-sm font-medium text-gray-900 dark:text-white hover:underline"
                          >
                            {obl.collection.creator.name}
                          </button>
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
