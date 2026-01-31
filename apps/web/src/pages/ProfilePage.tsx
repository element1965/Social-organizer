import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { ArrowLeft, UserPlus, Ban } from 'lucide-react';

export function ProfilePage() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuth((s) => s.userId);
  const isOwn = paramId === myId;

  const { data: user, isLoading } = trpc.user.getById.useQuery({ userId: paramId! }, { enabled: !!paramId });
  const { data: stats } = trpc.stats.profile.useQuery({ userId: paramId }, { enabled: !!paramId });
  const addConnection = trpc.connection.add.useMutation();
  const addIgnore = trpc.settings.addIgnore.useMutation();

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!user) return <div className="p-4 text-center text-gray-500">{t('common.notFound', 'Не найдено')}</div>;

  return (
    <div className="p-4 space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <ArrowLeft className="w-4 h-4" /> {t('common.back', 'Назад')}
      </button>
      <div className="flex flex-col items-center text-center">
        <Avatar src={user.photoUrl} name={user.name} size="lg" className="mb-3" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
        {user.bio && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{user.bio}</p>}
        {user.phone && <p className="text-sm text-gray-500 mt-1">{user.phone}</p>}
      </div>
      {!isOwn && (
        <div className="flex gap-2 justify-center">
          <Button size="sm" onClick={() => addConnection.mutate({ userId: paramId! })} disabled={addConnection.isPending}>
            <UserPlus className="w-4 h-4 mr-1" /> {t('profile.addConnection', 'Добавить в связи')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addIgnore.mutate({ userId: paramId! })} disabled={addIgnore.isPending}>
            <Ban className="w-4 h-4 mr-1" /> {t('profile.ignore', 'Игнор')}
          </Button>
        </div>
      )}
      {addConnection.error && <p className="text-sm text-red-500 text-center">{addConnection.error.message}</p>}
      {stats && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.stats', 'Статистика')}</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><p className="text-2xl font-bold text-blue-600">{stats.connectionsCount}</p><p className="text-xs text-gray-500">{t('profile.connections', 'Связей')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-blue-600">{stats.collectionsCreated}</p><p className="text-xs text-gray-500">{t('profile.collectionsCreated', 'Сборов')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-green-600">{stats.obligationsGiven}</p><p className="text-xs text-gray-500">{t('profile.obligationsGiven', 'Раз помог')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-green-600">{stats.totalAmountPledged}</p><p className="text-xs text-gray-500">{t('profile.totalPledged', 'Всего обязался')}</p></div>
            </div>
          </CardContent>
        </Card>
      )}
      {isOwn && <Button variant="outline" className="w-full" onClick={() => navigate('/settings')}>{t('profile.editSettings', 'Настройки')}</Button>}
    </div>
  );
}
