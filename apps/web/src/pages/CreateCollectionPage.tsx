import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';

export function CreateCollectionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [type, setType] = useState<'EMERGENCY' | 'REGULAR'>('EMERGENCY');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [chatLink, setChatLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = trpc.collection.create.useMutation({ onSuccess: (data) => navigate(`/collection/${data.id}`) });

  const validate = () => {
    const e: Record<string, string> = {};
    const num = Number(amount);
    if (!num || num < 10) e.amount = t('create.minAmount', 'Минимум 10');
    try { new URL(chatLink); } catch { e.chatLink = t('create.invalidUrl', 'Невалидный URL'); }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => { if (!validate()) return; create.mutate({ type, amount: Number(amount), currency, chatLink }); };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('create.title', 'Создать сбор')}</h1>
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setType('EMERGENCY')} className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${type === 'EMERGENCY' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
              {t('create.emergency', 'Экстренный')}
            </button>
            <button onClick={() => setType('REGULAR')} className={`p-3 rounded-lg border text-center text-sm font-medium transition-colors ${type === 'REGULAR' ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
              {t('create.regular', 'Регулярный')}
            </button>
          </div>
          <Input id="amount" label={t('create.amount', 'Сумма')} type="number" min={10} placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
          {Number(amount) > 10000 && <p className="text-sm text-yellow-600 dark:text-yellow-400">{t('create.largeAmountWarning', 'Вы потревожите большое количество людей. Убедитесь, что помощь действительно необходима.')}</p>}
          <Select id="currency" label={t('create.currency', 'Валюта')} value={currency} onChange={(e) => setCurrency(e.target.value)} options={[{ value: 'USD', label: '$ USD' }, { value: 'EUR', label: '\u20ac EUR' }]} />
          <Input id="chatLink" label={t('create.chatLink', 'Ссылка на чат')} type="url" placeholder="https://t.me/..." value={chatLink} onChange={(e) => setChatLink(e.target.value)} error={errors.chatLink} />
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? t('common.loading', 'Загрузка...') : t('create.submit', 'Создать сбор')}
          </Button>
          {create.error && <p className="text-sm text-red-500 text-center">{create.error.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
