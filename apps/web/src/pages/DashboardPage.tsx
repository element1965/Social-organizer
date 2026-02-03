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
} from 'lucide-react';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);

  const [showFirstCircle, setShowFirstCircle] = useState(false);
  const [showNetworkBreakdown, setShowNetworkBreakdown] = useState(false);

  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myCollections } = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myObligations } = trpc.obligation.myList.useQuery(undefined, { refetchInterval: 30000 });
  const { data: connections } = trpc.connection.list.useQuery(undefined, { refetchInterval: 60000 });
  const { data: networkStats } = trpc.connection.getNetworkStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: notifications } = trpc.notification.list.useQuery({ limit: 10 }, { refetchInterval: 30000 });

  const firstCircleCount = connections?.length ?? 0;
  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};
  const growth = networkStats?.growth ?? { day: 0, week: 0, month: 0 };

  // Filter emergency notifications (unread)
  const emergencyNotifications = notifications?.items?.filter(
    (n) => n.type === 'NEW_COLLECTION' && !n.readAt && n.collection?.type === 'EMERGENCY'
  ) ?? [];

  return (
    <div className="p-4 space-y-4 relative">
      {/* 3D облака графа на фоне дашборда */}
      <div className="absolute inset-0 -z-10 opacity-30 pointer-events-none" style={{ height: 300 }}>
        <Suspense fallback={null}>
          <LazyCloudBackground particleCount={200} />
        </Suspense>
      </div>

      {/* Хедер с профилем */}
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

      {/* Экстренные уведомления */}
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

      {/* Гейт: нужна минимум 1 связь */}
      {firstCircleCount === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <UserPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.addFirstConnection', 'Добавь первую связь')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('dashboard.addFirstConnectionDesc', 'Организатор работает через связи между людьми. Начни с одного человека — того, кому доверяешь.')}
            </p>
            <Button className="w-full" size="lg" onClick={() => navigate('/network')}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('dashboard.goToNetwork', 'Перейти к сети')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Кнопка «Мне нужна поддержка» */}
      <Button className="w-full" size="lg" variant="default" onClick={() => navigate('/create')}>
        <Heart className="w-5 h-5 mr-2" /> {t('dashboard.needHelp', 'Мне нужна поддержка')}
      </Button>

      {/* === МОЯ СЕТЬ === */}
      <Card>
        <CardContent className="py-4">
          {/* Первый круг (прямые связи) */}
          <button
            onClick={() => setShowFirstCircle(!showFirstCircle)}
            className="w-full flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded -mx-2 px-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-500">{t('dashboard.firstCircle', 'Первый круг')}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{firstCircleCount}</p>
              </div>
            </div>
            {showFirstCircle ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {/* Раскрывающийся список первого круга */}
          {showFirstCircle && connections && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1 max-h-64 overflow-y-auto">
              {connections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => navigate(`/profile/${conn.userId}`)}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Avatar src={conn.photoUrl} name={conn.name} size="sm" />
                  <span className="text-sm text-gray-900 dark:text-white">{conn.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 my-3" />

          {/* Вся сеть */}
          <button
            onClick={() => setShowNetworkBreakdown(!showNetworkBreakdown)}
            className="w-full flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded -mx-2 px-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-500">{t('dashboard.totalNetwork', 'Вся сеть')}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{totalReachable}</p>
              </div>
            </div>
            {showNetworkBreakdown ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {/* Разбивка по степеням связи */}
          {showNetworkBreakdown && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {Object.entries(byDepth).map(([depth, count]) => (
                <div key={depth} className="flex items-center justify-between px-2">
                  <span className="text-sm text-gray-500">
                    {depth}-е рукопожатие
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{count as number}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 my-3" />

          {/* Динамика роста */}
          <div className="flex items-center gap-3 py-2">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.networkGrowth', 'Рост сети')}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-xs">
                  <span className="font-medium text-green-600">+{growth.day}</span>
                  <span className="text-gray-400 ml-1">{t('dashboard.day', '24ч')}</span>
                </span>
                <span className="text-xs">
                  <span className="font-medium text-green-600">+{growth.week}</span>
                  <span className="text-gray-400 ml-1">{t('dashboard.week', 'нед')}</span>
                </span>
                <span className="text-xs">
                  <span className="font-medium text-green-600">+{growth.month}</span>
                  <span className="text-gray-400 ml-1">{t('dashboard.month', 'мес')}</span>
                </span>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate('/network')}>
            <Users className="w-4 h-4 mr-2" /> {t('dashboard.viewNetwork', 'Открыть сеть')}
          </Button>
        </CardContent>
      </Card>

      {/* Мои сборы */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.myCollections', 'Мои сигналы')}</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/create')}>
              <PlusCircle className="w-4 h-4 mr-1" /> {t('dashboard.create', 'Создать')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!myCollections ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : myCollections.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('dashboard.noCollections', 'Нет активных сигналов')}</p>
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

      {/* Мои намерения */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.myIntentions', 'Мои намерения')}</h2>
        </CardHeader>
        <CardContent>
          {!myObligations ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : myObligations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('dashboard.noIntentions', 'Нет намерений')}</p>
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
  );
}
