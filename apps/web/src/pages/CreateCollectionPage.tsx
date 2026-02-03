import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { AlertTriangle, Users } from 'lucide-react';

export function CreateCollectionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: networkStats } = trpc.connection.getNetworkStats.useQuery();

  const [type, setType] = useState<'EMERGENCY' | 'REGULAR'>('EMERGENCY');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [chatLink, setChatLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [largeAmountConfirmed, setLargeAmountConfirmed] = useState(false);

  const create = trpc.collection.create.useMutation({ onSuccess: (data) => navigate(`/collection/${data.id}`) });

  const isLargeAmount = Number(amount) > 10000;

  const validate = () => {
    const e: Record<string, string> = {};
    const num = Number(amount);
    if (!num || num < 10) e.amount = t('create.minAmount');
    try { new URL(chatLink); } catch { e.chatLink = t('create.invalidUrl'); }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => { if (!validate()) return; create.mutate({ type, amount: Number(amount), currency, chatLink }); };

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
          <Input id="amount" label={t('create.amount')} hint={t('hints.collectionAmount')} type="number" min={10} placeholder="1000" value={amount} onChange={(e) => { setAmount(e.target.value); setLargeAmountConfirmed(false); }} error={errors.amount} />
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
          <Select id="currency" label={t('create.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)} options={[{ value: 'USD', label: '$ USD' }, { value: 'EUR', label: '\u20ac EUR' }]} />
          <Input id="chatLink" label={t('create.chatLink')} hint={t('hints.collectionChatLink')} type="url" placeholder="https://t.me/..." value={chatLink} onChange={(e) => setChatLink(e.target.value)} error={errors.chatLink} />
          {networkStats && networkStats.totalReachable > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t('create.networkReach', { count: networkStats.totalReachable })}
              </p>
            </div>
          )}
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={create.isPending || (isLargeAmount && !largeAmountConfirmed)}>
            {create.isPending ? t('common.loading') : t('create.submit')}
          </Button>
          {create.error && <p className="text-sm text-red-500 text-center">{create.error.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
