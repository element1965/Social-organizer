import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '../lib/trpc';
import { buildWebInviteUrl, buildBotInviteUrl } from '../lib/inviteUrl';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Avatar } from '../components/ui/avatar';
import { MIN_CONNECTIONS_TO_CREATE } from '@so/shared';
import { AlertTriangle, Users, ArrowRight, PlusCircle, Wallet, ShieldAlert, UserPlus, Copy, Check, X } from 'lucide-react';

export function CreateCollectionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);
  const [entryWarningDismissed, setEntryWarningDismissed] = useState(false);
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedBot, setCopiedBot] = useState(false);

  const { data: me } = trpc.user.me.useQuery();
  const { data: connectionCount } = trpc.connection.getCount.useQuery();
  const { data: networkStats } = trpc.connection.getNetworkStats.useQuery();
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

  const isSpecial = me?.role === 'AUTHOR' || me?.role === 'DEVELOPER';
  const hasEnoughConnections = isSpecial || (connectionCount?.count ?? 0) >= MIN_CONNECTIONS_TO_CREATE;
  const connectionsNeeded = MIN_CONNECTIONS_TO_CREATE - (connectionCount?.count ?? 0);

  // Not enough connections — block access
  if (connectionCount && !hasEnoughConnections) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">
            {t('create.notEnoughConnectionsTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center leading-relaxed">
            {t('create.notEnoughConnectionsText', { min: MIN_CONNECTIONS_TO_CREATE })}
          </p>
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="text-3xl font-bold text-red-600">{connectionCount.count}</div>
            <div className="text-gray-400">/</div>
            <div className="text-3xl font-bold text-gray-400">{MIN_CONNECTIONS_TO_CREATE}</div>
          </div>
          <p className="text-sm text-center text-gray-500">
            {t('create.connectionsRemaining', { count: connectionsNeeded })}
          </p>
          <div className="space-y-2 pt-2">
            <Button className="w-full" size="lg" onClick={() => setShowInvitePopup(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              {t('create.goToInvite')}
            </Button>
            <Button variant="outline" className="w-full" size="lg" onClick={() => navigate('/dashboard')}>
              {t('create.entryWarningBack')}
            </Button>
          </div>
        </div>

        {/* Invite popup */}
        {showInvitePopup && (() => {
          const inviteToken = me?.referralSlug || userId || '';
          const webUrl = inviteToken ? buildWebInviteUrl(inviteToken) : '';
          const botUrl = inviteToken ? buildBotInviteUrl(inviteToken) : '';
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowInvitePopup(false)}>
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('network.invite')}</h3>
                  <button onClick={() => setShowInvitePopup(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-white rounded-xl">
                    <QRCodeSVG value={webUrl} size={200} level="H" imageSettings={{ src: '/logo-dark.png', width: 48, height: 34, excavate: true }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(webUrl); setCopiedWeb(true); setTimeout(() => setCopiedWeb(false), 2000); }}
                    className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-base shrink-0">🌐</span>
                    <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{webUrl}</p>
                    <div className="shrink-0">
                      {copiedWeb ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
                    </div>
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(botUrl); setCopiedBot(true); setTimeout(() => setCopiedBot(false), 2000); }}
                    className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-base shrink-0">🤖</span>
                    <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{botUrl}</p>
                    <div className="shrink-0">
                      {copiedBot ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // Entry warning popup — shown before the form
  if (!entryWarningDismissed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">
            {t('create.entryWarningTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center leading-relaxed">
            {t('create.entryWarningText')}
          </p>
          <div className="space-y-2 pt-2">
            <Button className="w-full" size="lg" onClick={() => setEntryWarningDismissed(true)}>
              {t('create.entryWarningProceed')}
            </Button>
            <Button variant="outline" className="w-full" size="lg" onClick={() => navigate('/dashboard')}>
              {t('create.entryWarningBack')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('create.title')}</h1>
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setType('EMERGENCY')} className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${type === 'EMERGENCY' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
              {t('create.emergency')}
            </button>
            <button onClick={() => setType('REGULAR')} className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${type === 'REGULAR' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
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
              <div className="flex items-center gap-2 text-sm text-gray-500">
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

          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={create.isPending || (isLargeAmount && !largeAmountConfirmed)}>
            {create.isPending ? t('common.loading') : t('create.submit')}
          </Button>
          {create.error && <p className="text-sm text-red-500 text-center">{create.error.message}</p>}
        </CardContent>
      </Card>

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

      {/* Confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-500 shrink-0" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('create.confirmTitle')}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('create.confirmText')}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('create.confirmPayment')}</p>
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
