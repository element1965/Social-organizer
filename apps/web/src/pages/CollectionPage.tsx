import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { ExternalLink } from 'lucide-react';

export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();

  const { data: collection, isLoading } = trpc.collection.getById.useQuery({ id: id! }, { enabled: !!id, refetchInterval: 30000 });
  const createObligation = trpc.obligation.create.useMutation({ onSuccess: () => utils.collection.getById.invalidate({ id: id! }) });
  const closeCollection = trpc.collection.close.useMutation({ onSuccess: () => utils.collection.getById.invalidate({ id: id! }) });

  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!collection) return <div className="p-4 text-center text-gray-500">{t('common.notFound', 'Не найдено')}</div>;

  const isOwner = collection.creatorId === userId;
  const hasObligation = collection.obligations.some((o) => o.userId === userId);
  const hasGoal = collection.amount != null && collection.amount > 0;
  const percentage = hasGoal ? (collection.currentAmount / collection.amount!) * 100 : 0;
  const statusVariant = collection.status === 'ACTIVE' ? 'success' : collection.status === 'BLOCKED' ? 'warning' : collection.status === 'CLOSED' ? 'default' : 'danger';

  const handleSubmitObligation = () => {
    const num = Number(amount);
    if (!num || num < 10) { setError(t('collection.minAmount', 'Минимум 10')); return; }
    setError('');
    createObligation.mutate({ collectionId: collection.id, amount: num });
    setAmount('');
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={collection.creator.photoUrl} name={collection.creator.name} size="lg" />
        <div>
          <button onClick={() => navigate(`/profile/${collection.creatorId}`)} className="text-lg font-bold text-gray-900 dark:text-white hover:underline">{collection.creator.name}</button>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={statusVariant}>{collection.status}</Badge>
            <Badge variant="info">{collection.type === 'EMERGENCY' ? t('collection.emergency', 'Экстренный') : t('collection.regular', 'Регулярный')}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex justify-between items-end mb-2">
            <div><p className="text-sm text-gray-500">{t('collection.collected', 'Собрано')}</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{collection.currentAmount.toFixed(2)} {collection.currency}</p></div>
            {hasGoal && <div className="text-right"><p className="text-sm text-gray-500">{t('collection.goal', 'Цель')}</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{collection.amount} {collection.currency}</p></div>}
          </div>
          {hasGoal && <><Progress value={collection.currentAmount} max={collection.amount!} /><p className="text-xs text-gray-500 mt-1 text-right">{percentage.toFixed(0)}%</p></>}
        </CardContent>
      </Card>

      {(hasObligation || isOwner) && collection.chatLink && (
        <a href={collection.chatLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-blue-600 dark:text-blue-400 text-sm hover:underline">
          <ExternalLink className="w-4 h-4" /> {t('collection.openChat', 'Открыть чат')}
        </a>
      )}

      {!isOwner && !hasObligation && collection.status === 'ACTIVE' && (
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900 dark:text-white">{t('collection.takeObligation', 'Взять обязательство')}</h3></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input type="number" min={10} placeholder={t('collection.amountPlaceholder', 'Сумма (мин. 10)')} value={amount} onChange={(e) => setAmount(e.target.value)} error={error} />
              <Button onClick={handleSubmitObligation} disabled={createObligation.isPending}>{t('collection.submit', 'Помочь')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (collection.status === 'ACTIVE' || collection.status === 'BLOCKED') && (
        <Button variant="outline" className="w-full" onClick={() => closeCollection.mutate({ id: collection.id })}>{t('collection.close', 'Закрыть сбор')}</Button>
      )}

      <Card>
        <CardHeader><h3 className="font-semibold text-gray-900 dark:text-white">{t('collection.participants', 'Участники')} ({collection.obligations.length})</h3></CardHeader>
        <CardContent>
          {collection.obligations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">{t('collection.noParticipants', 'Пока никто не вписался')}</p>
          ) : (
            <div className="space-y-2">
              {collection.obligations.map((obl) => (
                <div key={obl.id} className="flex items-center justify-between py-1">
                  <button onClick={() => navigate(`/profile/${obl.userId}`)} className="flex items-center gap-2 hover:underline">
                    <Avatar src={obl.user.photoUrl} name={obl.user.name} size="sm" />
                    <span className="text-sm text-gray-900 dark:text-white">{obl.user.name}</span>
                  </button>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{obl.amount} {collection.currency}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
