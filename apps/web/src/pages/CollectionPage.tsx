import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { ExternalLink, Users, ArrowRight, Pencil, Check, X } from 'lucide-react';
import { HandshakePath } from '../components/HandshakePath';
import { useNicknames } from '../hooks/useNicknames';

export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);
  const resolve = useNicknames();
  const utils = trpc.useUtils();

  const { data: me } = trpc.user.me.useQuery();
  const { data: collection, isLoading } = trpc.collection.getById.useQuery({ id: id! }, { enabled: !!id, refetchInterval: 30000 });
  const { data: currencies } = trpc.currency.list.useQuery();
  const { data: pathToCreator } = trpc.connection.findPath.useQuery(
    { targetUserId: collection?.creatorId! },
    { enabled: !!collection && collection.creatorId !== userId }
  );
  const createObligation = trpc.obligation.create.useMutation({ onSuccess: () => utils.collection.getById.invalidate({ id: id! }) });
  const closeCollection = trpc.collection.close.useMutation({ onSuccess: () => utils.collection.getById.invalidate({ id: id! }) });
  const updateAmount = trpc.obligation.updateAmount.useMutation({ onSuccess: () => utils.collection.getById.invalidate({ id: id! }) });

  const [amount, setAmount] = useState('1');
  const [inputCurrency, setInputCurrency] = useState('USD');
  const [error, setError] = useState('');

  // Edit amount state
  const [editingOblId, setEditingOblId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editError, setEditError] = useState('');

  // Set initial currency from user preference
  useEffect(() => {
    if (me?.preferredCurrency) {
      setInputCurrency(me.preferredCurrency);
    }
  }, [me?.preferredCurrency]);

  // Preview conversion to USD
  const { data: preview } = trpc.currency.toUSD.useQuery(
    { amount: Number(amount), from: inputCurrency },
    { enabled: !!amount && Number(amount) > 0 && inputCurrency !== 'USD' }
  );

  // Preview conversion for edit form
  const { data: editPreview } = trpc.currency.toUSD.useQuery(
    { amount: Number(editAmount), from: editCurrency },
    { enabled: !!editingOblId && !!editAmount && Number(editAmount) > 0 && editCurrency !== 'USD' }
  );

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!collection) return <div className="p-4 text-center text-gray-500 dark:text-gray-300">{t('common.notFound')}</div>;

  const isOwner = collection.creatorId === userId;
  const hasObligation = collection.obligations.some((o) => o.userId === userId);
  const hasGoal = collection.amount != null && collection.amount > 0;
  const percentage = hasGoal ? (collection.currentAmount / collection.amount!) * 100 : 0;
  const statusVariant = collection.status === 'ACTIVE' ? 'success' : collection.status === 'BLOCKED' ? 'warning' : collection.status === 'CLOSED' ? 'default' : 'danger';

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return t('collection.active');
      case 'BLOCKED': return t('collection.blocked');
      case 'CLOSED': return t('collection.closed');
      case 'CANCELLED': return t('collection.cancelled');
      default: return status;
    }
  };

  const handleSubmitObligation = () => {
    const num = Number(amount);
    if (!num || num < 1) { setError(t('collection.minAmount')); return; }
    setError('');
    createObligation.mutate({ collectionId: collection.id, amount: num, inputCurrency });
    setAmount('');
  };

  // Build currency options for select
  const currencyOptions = currencies?.map((c) => ({
    value: c.code,
    label: `${c.symbol} ${c.code}`,
  })) ?? [{ value: 'USD', label: '$ USD' }];

  // Check if collection has original currency info (for owner display)
  const collectionData = collection as typeof collection & { originalAmount?: number; originalCurrency?: string };
  const showOriginal = isOwner && collectionData.originalCurrency && collectionData.originalCurrency !== 'USD';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={collection.creator.photoUrl} name={resolve(collection.creatorId, collection.creator.name)} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/profile/${collection.creatorId}`)} className="text-lg font-bold text-gray-900 dark:text-white hover:underline">{resolve(collection.creatorId, collection.creator.name)}</button>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Users className="w-3 h-3" />
              {(collection.creator as any).connectionCount ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={statusVariant}>{getStatusLabel(collection.status)}</Badge>
            <Badge variant="info">{collection.type === 'EMERGENCY' ? t('collection.emergency') : t('collection.regular')}</Badge>
          </div>
        </div>
      </div>

      {pathToCreator?.path && pathToCreator.path.length > 1 && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-300 mb-2">{t('collection.connectionToCreator')}</p>
          <HandshakePath path={pathToCreator.path} onUserClick={(uid) => navigate(`/profile/${uid}`)} resolveName={resolve} />
        </div>
      )}

      <Card>
        <CardContent className="py-4">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-300">{t('collection.collected')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">${Math.round(collection.currentAmount)} USD</p>
            </div>
            {hasGoal && (
              <div className="text-right">
                <p className="text-sm text-gray-500 dark:text-gray-300">{t('collection.goal')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">${collection.amount} USD</p>
                {showOriginal && (
                  <p className="text-xs text-gray-400">
                    ({collectionData.originalAmount} {collectionData.originalCurrency})
                  </p>
                )}
              </div>
            )}
          </div>
          {hasGoal && <><Progress value={collection.currentAmount} max={collection.amount!} /><p className="text-xs text-gray-500 dark:text-gray-300 mt-1 text-right">{percentage.toFixed(0)}%</p></>}
        </CardContent>
      </Card>

      {(hasObligation || isOwner) && collection.chatLink && (
        <a href={collection.chatLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-blue-600 dark:text-blue-400 text-sm hover:underline">
          <ExternalLink className="w-4 h-4" /> {t('collection.openChat')}
        </a>
      )}

      {!isOwner && !hasObligation && collection.status === 'ACTIVE' && (
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900 dark:text-white">{t('collection.expressIntention')}</h3></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input type="number" min={1} placeholder={t('collection.amountPlaceholder')} hint={t('hints.intentionAmount')} value={amount} onChange={(e) => setAmount(e.target.value)} error={error} />
                </div>
                <div className="w-28">
                  <Select
                    id="obligation-currency"
                    className="h-[38px]"
                    value={inputCurrency}
                    onChange={(e) => setInputCurrency(e.target.value)}
                    options={currencyOptions}
                  />
                </div>
                <Button onClick={handleSubmitObligation} disabled={createObligation.isPending}>{t('collection.submit')}</Button>
              </div>
              {/* USD conversion preview */}
              {inputCurrency !== 'USD' && Number(amount) > 0 && preview?.result != null && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                  <ArrowRight className="w-4 h-4" />
                  <span>≈ ${preview.result} USD</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (collection.status === 'ACTIVE' || collection.status === 'BLOCKED') && (
        <Button variant="outline" className="w-full" onClick={() => closeCollection.mutate({ id: collection.id })}>{t('collection.close')}</Button>
      )}

      <Card>
        <CardHeader><h3 className="font-semibold text-gray-900 dark:text-white">{t('collection.participants')} ({collection.obligations.length})</h3></CardHeader>
        <CardContent>
          {collection.obligations.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300 text-center py-2">{t('collection.noParticipants')}</p>
          ) : (
            <div className="space-y-2">
              {collection.obligations.map((obl) => {
                const oblData = obl as typeof obl & { originalAmount?: number; originalCurrency?: string };
                const showOblOriginal = isOwner && oblData.originalCurrency && oblData.originalCurrency !== 'USD';
                const isMyObl = obl.userId === userId;
                const canEdit = isMyObl && (collection.status === 'ACTIVE' || collection.status === 'BLOCKED');
                const isEditing = editingOblId === obl.id;

                const startEdit = () => {
                  setEditingOblId(obl.id);
                  setEditAmount(String(oblData.originalAmount ?? obl.amount));
                  setEditCurrency(oblData.originalCurrency ?? 'USD');
                  setEditError('');
                };

                const cancelEdit = () => {
                  setEditingOblId(null);
                  setEditError('');
                };

                const saveEdit = () => {
                  const num = Number(editAmount);
                  if (!num || num < 1) { setEditError(t('collection.minAmount')); return; }
                  setEditError('');
                  updateAmount.mutate(
                    { obligationId: obl.id, amount: num, inputCurrency: editCurrency },
                    { onSuccess: () => setEditingOblId(null) }
                  );
                };

                return (
                  <div key={obl.id} className="py-1">
                    <div className="flex items-center justify-between">
                      <button onClick={() => navigate(`/profile/${obl.userId}`)} className="flex items-center gap-2 hover:underline">
                        <Avatar src={obl.user.photoUrl} name={resolve(obl.userId, obl.user.name)} size="sm" />
                        <span className="text-sm text-gray-900 dark:text-white">{resolve(obl.userId, obl.user.name)}</span>
                        <span className="flex items-center gap-0.5 text-xs text-gray-400">
                          <Users className="w-3 h-3" />
                          {(obl.user as any).connectionCount ?? 0}
                        </span>
                      </button>
                      {!isEditing && (
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">${Math.round(obl.amount)} USD</span>
                            {showOblOriginal && (
                              <p className="text-xs text-gray-400">
                                ({oblData.originalAmount} {oblData.originalCurrency})
                              </p>
                            )}
                          </div>
                          {canEdit && (
                            <button onClick={startEdit} className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-300" title={t('collection.editAmount')}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <div className="mt-2 space-y-2 pl-8">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Input type="number" min={1} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} error={editError} />
                          </div>
                          <div className="w-28">
                            <Select
                              id="edit-currency"
                              className="h-[38px]"
                              value={editCurrency}
                              onChange={(e) => setEditCurrency(e.target.value)}
                              options={currencyOptions}
                            />
                          </div>
                          <button onClick={saveEdit} disabled={updateAmount.isPending} className="p-2 text-green-600 hover:text-green-700 disabled:opacity-50" title={t('collection.saveAmount')}>
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300" title={t('collection.cancelEdit')}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {editCurrency !== 'USD' && Number(editAmount) > 0 && editPreview?.result != null && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                            <ArrowRight className="w-4 h-4" />
                            <span>≈ ${editPreview.result} USD</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
