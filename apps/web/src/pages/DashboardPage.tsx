import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { PlusCircle, Users, ArrowRight, Heart, UserPlus } from 'lucide-react';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);

  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myCollections } = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myObligations } = trpc.obligation.myList.useQuery(undefined, { refetchInterval: 30000 });
  const { data: connectionCount } = trpc.connection.getCount.useQuery(undefined, { refetchInterval: 60000 });

  return (
    <div className="p-4 space-y-4 relative">
      {/* 3D облака графа на фоне дашборда */}
      <div className="absolute inset-0 -z-10 opacity-30 pointer-events-none" style={{ height: 300 }}>
        <Suspense fallback={null}>
          <LazyCloudBackground particleCount={200} />
        </Suspense>
      </div>

      {/* Гейт: нужна минимум 1 связь */}
      {connectionCount != null && connectionCount.count === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <UserPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('dashboard.addFirstConnection', 'Добавь первую связь')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('dashboard.addFirstConnectionDesc', 'Организатор работает через связи между людьми. Начни с одного человека — того, кому доверяешь.')}</p>
            <Button className="w-full" size="lg" onClick={() => navigate('/network')}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('dashboard.goToNetwork', 'Перейти к сети')}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.title', 'Дашборд')}</h1>
          {me && <p className="text-sm text-gray-500">{me.name}</p>}
        </div>
        <button onClick={() => navigate(`/profile/${userId}`)} className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
          {me?.photoUrl ? <img src={me.photoUrl} className="w-full h-full object-cover" alt="" /> : <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{me?.name?.[0]}</span>}
        </button>
      </div>

      {/* Кнопка «Мне нужна помощь» — SPEC: главный CTA на дашборде */}
      <Button className="w-full" size="lg" variant="default" onClick={() => navigate('/create')}>
        <Heart className="w-5 h-5 mr-2" /> {t('dashboard.needHelp', 'Мне нужна помощь')}
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.myCollections', 'Мои сборы')}</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/create')}><PlusCircle className="w-4 h-4 mr-1" /> {t('dashboard.create', 'Создать')}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {!myCollections ? <div className="flex justify-center py-4"><Spinner /></div> : myCollections.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('dashboard.noCollections', 'Нет активных сборов')}</p>
          ) : (
            <div className="space-y-3">
              {myCollections.map((col) => {
                const hasGoal = col.amount != null && col.amount > 0;
                const current = (col as any).currentAmount ?? 0;
                const pct = hasGoal ? Math.min((current / col.amount!) * 100, 100) : 0;
                return (
                  <button key={col.id} onClick={() => navigate(`/collection/${col.id}`)} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={col.status === 'ACTIVE' ? 'success' : 'warning'}>{col.status}</Badge>
                        <Badge variant={col.type === 'EMERGENCY' ? 'danger' : 'info'}>{col.type === 'EMERGENCY' ? t('collection.emergency') : t('collection.regular')}</Badge>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{hasGoal ? `${current} / ${col.amount} ${col.currency}` : `${current} ${col.currency}`}</span>
                    </div>
                    {hasGoal && <Progress value={current} max={col.amount!} className="mt-1" />}
                    <div className="text-xs text-gray-500 mt-1">{col._count.obligations} {t('dashboard.obligations')}</div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.myObligations', 'Мои обязательства')}</h2></CardHeader>
        <CardContent>
          {!myObligations ? <div className="flex justify-center py-4"><Spinner /></div> : myObligations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('dashboard.noObligations', 'Нет обязательств')}</p>
          ) : (
            <div className="space-y-2">
              {myObligations.map((obl) => (
                <button key={obl.id} onClick={() => navigate(`/collection/${obl.collectionId}`)} className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{obl.collection.creator.name}</p>
                    <p className="text-xs text-gray-500">{obl.amount} {obl.collection.currency}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.myNetwork', 'Моя сеть')}</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/network')}><Users className="w-4 h-4 mr-1" /> {t('dashboard.view', 'Смотреть')}</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-blue-600">{connectionCount?.count ?? 0}</div>
            <div className="text-sm text-gray-500">/ {connectionCount?.max ?? 150} {t('dashboard.connections', 'связей')}</div>
          </div>
          {connectionCount && <Progress value={connectionCount.count} max={connectionCount.max} className="mt-2" />}
        </CardContent>
      </Card>
    </div>
  );
}
