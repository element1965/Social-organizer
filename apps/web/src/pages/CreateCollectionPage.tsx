import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { InvitePopup } from '../components/InvitePopup';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Avatar } from '../components/ui/avatar';
import { MIN_CONNECTIONS_TO_CREATE } from '@so/shared';
import { AlertTriangle, Users, ArrowRight, PlusCircle, Wallet, ShieldAlert, UserPlus, X, HandHeart } from 'lucide-react';
import { useNicknames } from '../hooks/useNicknames';

export function CreateCollectionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resolve = useNicknames();
  const [showEntryWarning, setShowEntryWarning] = useState(false);
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [showNotEnough, setShowNotEnough] = useState(false);

  const { data: me } = trpc.user.me.useQuery();
  const { data: helpStats } = trpc.stats.help.useQuery(undefined, { refetchInterval: 60000 });
  const { data: connectionCount } = trpc.connection.getCount.useQuery();
  const { data: networkStats } = useCachedNetworkStats();
  const { data: myCollections } = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 30000 });
  const { data: myObligations } = trpc.obligation.myList.useQuery(undefined, { refetchInterval: 30000 });
  const { data: currencies } = trpc.currency.list.useQuery();
  const { data: detectedCurrency } = trpc.currency.detectCurrency.useQuery();

  const [type, setType] = useState<'EMERGENCY' | 'REGULAR'>('EMERGENCY');
  const [amount, setAmount] = useState('');
  const [inputCurrency, setInputCurrency] = useState('USD');
  const [chatLink, setChatLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [largeAmountConfirmed, setLargeAmountConfirmed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Set initial currency from user preference or detected
  useEffect(() => {
    if (me?.preferredCurrency) {
      setInputCurrency(me.preferredCurrency);
    } else if (detectedCurrency?.currency) {
      setInputCurrency(detectedCurrency.currency);
    }
  }, [me?.preferredCurrency, detectedCurrency?.currency]);

  const create = trpc.collection.create.useMutation({ onSuccess: (data) => navigate(`/collection/${data.id}`) });

  // Preview conversion to USD
  const { data: preview } = trpc.currency.toUSD.useQuery(
    { amount: Number(amount), from: inputCurrency },
    { enabled: !!amount && Number(amount) > 0 && inputCurrency !== 'USD' }
  );

  const amountInUSD = inputCurrency === 'USD' ? Number(amount) : (preview?.result ?? 0);
  const isLargeAmount = amountInUSD > 10000;

  const validate = () => {
    const e: Record<string, string> = {};
    const num = Number(amount);
    if (!num || num < 10) e.amount = t('create.minAmount');
    try { new URL(chatLink); } catch { e.chatLink = t('create.invalidUrl'); }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (connectionCount && !hasEnoughConnections) {
      setShowNotEnough(true);
      return;
    }
    setShowEntryWarning(true);
  };

  const handleEntryWarningProceed = () => {
    setShowEntryWarning(false);
    setConfirmChecked(false);
    setShowConfirmModal(true);
  };

  const handleConfirmedSubmit = () => {
    setShowConfirmModal(false);
    create.mutate({ type, amount: Number(amount), inputCurrency, chatLink });
  };

  // Build currency options for select
  const currencyOptions = currencies?.map((c) => ({
    value: c.code,
    label: `${c.symbol} ${c.code}`,
  })) ?? [{ value: 'USD', label: '$ USD' }];

  const { data: matchHints } = trpc.skills.matchHints.useQuery();
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isSpecial = me?.role === 'AUTHOR' || me?.role === 'DEVELOPER' || adminData?.isAdmin;
  const hasEnoughConnections = isSpecial || (connectionCount?.count ?? 0) >= MIN_CONNECTIONS_TO_CREATE;
  const connectionsNeeded = MIN_CONNECTIONS_TO_CREATE - (connectionCount?.count ?? 0);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('create.title')}</h1>
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setType('EMERGENCY')} className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${type === 'EMERGENCY' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {t('create.emergency')}
            </button>
            <button onClick={() => setType('REGULAR')} className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${type === 'REGULAR' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {t('create.regular')}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="amount"
                  label={t('create.amount')}
                  hint={t('hints.collectionAmount')}
                  type="number"
                  min={10}
                  placeholder="1000"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setLargeAmountConfirmed(false); }}
                  error={errors.amount}
                />
              </div>
              <div className="w-32">
                <Select
                  id="currency"
                  label={t('create.currency')}
                  value={inputCurrency}
                  onChange={(e) => setInputCurrency(e.target.value)}
                  options={currencyOptions}
                />
              </div>
            </div>

            {/* USD conversion preview */}
            {inputCurrency !== 'USD' && Number(amount) > 0 && preview?.result != null && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                <ArrowRight className="w-4 h-4" />
                <span>≈ ${preview.result} USD</span>
              </div>
            )}
          </div>

          {isLargeAmount && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">{t('create.largeAmountWarning')}</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={largeAmountConfirmed}
                      onChange={(e) => setLargeAmountConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-yellow-400 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">{t('create.largeAmountConfirm')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <Input id="chatLink" label={t('create.chatLink')} hint={t('hints.collectionChatLink')} type="url" placeholder="https://t.me/..." value={chatLink} onChange={(e) => setChatLink(e.target.value)} error={errors.chatLink} />

          {networkStats && amountInUSD >= 10 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t('create.networkReach', { count: Math.min(amountInUSD, networkStats.totalReachable) })}
              </p>
            </div>
          )}

          {matchHints && matchHints.length > 0 && (
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg space-y-1">
              {matchHints.map((hint: { categoryId: string; key: string; friendsCount: number }) => (
                <div key={hint.categoryId} className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                  <HandHeart className="w-4 h-4 shrink-0" />
                  <span>{t('skills.friendsCanHelp', { count: hint.friendsCount, skill: t(`skills.${hint.key}`) })}</span>
                </div>
              ))}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={create.isPending || (isLargeAmount && !largeAmountConfirmed)}>
            {create.isPending ? t('common.loading') : t('create.submit')}
          </Button>
          {create.error && <p className="text-sm text-red-500 text-center">{create.error.message}</p>}
        </CardContent>
      </Card>

      {/* Help stats semi-donut */}
      {helpStats && (() => {
        const givenAmt = helpStats.given?.totalAmount ?? 0;
        const receivedAmt = helpStats.received?.totalAmount ?? 0;
        const total = givenAmt + receivedAmt;
        const circumference = Math.PI * 80;
        const givenLen = total > 0 ? (givenAmt / total) * circumference : 0;
        const receivedLen = total > 0 ? (receivedAmt / total) * circumference : 0;
        return (
          <Card className="mt-4">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-2 mb-3">
                <HandHeart className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.helpStats')}</h2>
              </div>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center min-w-[70px]">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">${givenAmt}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-300">{t('dashboard.helpGiven')}</p>
                </div>
                <div className="relative">
                  <svg viewBox="0 0 200 110" className="w-28 h-auto">
                    <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
                    {givenLen > 0 && (
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#22c55e" strokeWidth="16" strokeLinecap="round"
                        strokeDasharray={`${givenLen} ${circumference}`} />
                    )}
                    {receivedLen > 0 && (
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#3b82f6" strokeWidth="16"
                        strokeDasharray={`0 ${givenLen} ${receivedLen} ${circumference}`} />
                    )}
                    <text x="100" y="90" textAnchor="middle" fontSize="22" fontWeight="bold" fill="currentColor">${total}</text>
                  </svg>
                </div>
                <div className="text-center min-w-[70px]">
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">${receivedAmt}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-300">{t('dashboard.helpReceived')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* My collections */}
      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t('dashboard.myCollections')}
          </h2>
        </CardHeader>
        <CardContent>
          {!myCollections ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : myCollections.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300 text-center py-4">
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
                    <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
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
      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t('dashboard.myIntentions')}
          </h2>
        </CardHeader>
        <CardContent>
          {!myObligations ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : myObligations.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300 text-center py-4">
              {t('dashboard.noIntentions')}
            </p>
          ) : (
            <div className="space-y-2">
              {myObligations.map((obl) => (
                <div key={obl.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => navigate(`/profile/${obl.collection.creatorId}`)} className="hover:opacity-80">
                      <Avatar src={obl.collection.creator.photoUrl} name={resolve(obl.collection.creatorId, obl.collection.creator.name)} size="sm" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/profile/${obl.collection.creatorId}`)}
                          className="text-sm font-medium text-gray-900 dark:text-white hover:underline"
                        >
                          {resolve(obl.collection.creatorId, obl.collection.creator.name)}
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
                      <p className="text-xs text-gray-500 dark:text-gray-300">{obl.amount} {obl.collection.currency}</p>
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

      {/* Not enough connections modal — shown on submit */}
      {showNotEnough && connectionCount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <UserPlus className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">
              {t('create.notEnoughConnectionsTitle')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center leading-relaxed">
              {t('create.notEnoughConnectionsText', { min: MIN_CONNECTIONS_TO_CREATE })}
            </p>
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="text-3xl font-bold text-red-600">{connectionCount.count}</div>
              <div className="text-gray-400">/</div>
              <div className="text-3xl font-bold text-gray-400">{MIN_CONNECTIONS_TO_CREATE}</div>
            </div>
            <p className="text-sm text-center text-gray-500 dark:text-gray-300">
              {t('create.connectionsRemaining', { count: connectionsNeeded })}
            </p>
            <div className="space-y-2 pt-2">
              <Button className="w-full" size="lg" onClick={() => { setShowNotEnough(false); setShowInvitePopup(true); }}>
                <UserPlus className="w-4 h-4 mr-2" />
                {t('create.goToInvite')}
              </Button>
              <Button variant="outline" className="w-full" size="lg" onClick={() => setShowNotEnough(false)}>
                {t('create.entryWarningBack')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <InvitePopup open={showInvitePopup} onClose={() => setShowInvitePopup(false)} />

      {/* Entry warning modal — shown on submit before confirmation */}
      {showEntryWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-amber-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">
              {t('create.entryWarningTitle')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center leading-relaxed">
              {t('create.entryWarningText')}
            </p>
            <div className="space-y-2 pt-2">
              <Button className="w-full" size="lg" onClick={handleEntryWarningProceed}>
                {t('create.entryWarningProceed')}
              </Button>
              <Button variant="outline" className="w-full" size="lg" onClick={() => setShowEntryWarning(false)}>
                {t('create.entryWarningBack')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-500 shrink-0" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('create.confirmTitle')}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('create.confirmText')}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('create.confirmPayment')}</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('create.confirmCheckbox')}</span>
            </label>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleConfirmedSubmit}
                disabled={!confirmChecked}
              >
                {t('create.confirmButton')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmModal(false)}
              >
                {t('create.cancelButton')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
