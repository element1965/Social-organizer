import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { SocialIcon } from './ui/social-icons';
import { Wallet, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateContact } from '@so/shared';

const CONTACT_FIELDS = [
  { type: 'whatsapp', placeholder: '+380...' },
  { type: 'facebook', placeholder: 'facebook.com/...' },
  { type: 'instagram', placeholder: '@username' },
  { type: 'twitter', placeholder: '@username' },
  { type: 'tiktok', placeholder: '@username' },
] as const;

export function RequiredInfoGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: info, isLoading } = trpc.user.checkRequiredInfo.useQuery();
  const utils = trpc.useUtils();

  const needsContacts = info?.needsContacts ?? false;
  const needsBudget = info?.needsBudget ?? false;
  const showGate = !isLoading && (needsContacts || needsBudget);

  // Determine slides
  const slides: ('contacts' | 'budget')[] = [];
  if (needsContacts) slides.push('contacts');
  if (needsBudget) slides.push('budget');

  const [slideIndex, setSlideIndex] = useState(0);

  // Contacts state
  const [contacts, setContacts] = useState<Record<string, string>>({
    whatsapp: '',
    facebook: '',
    instagram: '',
    twitter: '',
    tiktok: '',
  });

  // Budget state
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');

  const { data: currencies } = trpc.currency.list.useQuery();
  const { data: preview } = trpc.currency.toUSD.useQuery(
    { amount: Number(budgetAmount), from: budgetCurrency },
    { enabled: !!budgetAmount && Number(budgetAmount) > 0 && budgetCurrency !== 'USD' }
  );

  const updateContacts = trpc.user.updateContacts.useMutation();
  const setBudget = trpc.user.setMonthlyBudget.useMutation();

  const contactErrors = Object.fromEntries(
    Object.entries(contacts).map(([type, value]) => [type, validateContact(type, value)])
  );
  const filledContactsCount = Object.entries(contacts).filter(([type, v]) => v.trim() && !contactErrors[type]).length;
  const contactsValid = filledContactsCount >= 2;

  const budgetInUSD = budgetCurrency === 'USD' ? Number(budgetAmount) : (preview?.result ?? 0);
  const budgetValid = Number(budgetAmount) > 0 && (budgetCurrency === 'USD' ? Number(budgetAmount) >= 1 : budgetInUSD >= 1);

  const currentSlide = slides[slideIndex];

  const handleContactsNext = async () => {
    const contactsArray = Object.entries(contacts)
      .map(([type, value]) => ({ type, value }));
    await updateContacts.mutateAsync(contactsArray);
    if (slideIndex < slides.length - 1) {
      setSlideIndex(slideIndex + 1);
    } else {
      await utils.user.checkRequiredInfo.invalidate();
    }
  };

  const handleBudgetSave = async () => {
    await setBudget.mutateAsync({
      amount: Number(budgetAmount),
      inputCurrency: budgetCurrency,
    });
    await utils.user.checkRequiredInfo.invalidate();
  };

  if (!showGate) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
          {currentSlide === 'contacts' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <MessageCircle className="w-6 h-6 text-blue-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('requiredInfo.contactsTitle')}</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('requiredInfo.contactsText')}</p>
              <div className="space-y-3">
                {CONTACT_FIELDS.map((field) => (
                  <div key={field.type} className="flex items-center gap-2">
                    <SocialIcon type={field.type} className="w-5 h-5 text-gray-500 dark:text-gray-300 shrink-0" />
                    <Input
                      value={contacts[field.type] || ''}
                      onChange={(e) => setContacts(prev => ({ ...prev, [field.type]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="flex-1"
                      error={contacts[field.type]?.trim() && contactErrors[field.type] ? t(contactErrors[field.type]!) : undefined}
                    />
                  </div>
                ))}
              </div>
              <p className={cn(
                'text-sm font-medium',
                contactsValid ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-300'
              )}>
                {t('requiredInfo.contactsFilled', { count: filledContactsCount })}
              </p>
              <Button
                className="w-full"
                size="lg"
                onClick={handleContactsNext}
                disabled={!contactsValid || updateContacts.isPending}
              >
                {slides.length > 1 && slideIndex < slides.length - 1 ? t('requiredInfo.next') : t('requiredInfo.save')}
              </Button>
            </>
          )}

          {currentSlide === 'budget' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <Wallet className="w-6 h-6 text-blue-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('requiredInfo.budgetTitle')}</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('requiredInfo.budgetText')}</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1"
                  min={1}
                />
                <Select
                  id="gate-budget-currency"
                  value={budgetCurrency}
                  onChange={(e) => setBudgetCurrency(e.target.value)}
                  options={currencies?.map(c => ({ value: c.code, label: `${c.symbol} ${c.code}` })) ?? [{ value: 'USD', label: '$ USD' }]}
                  className="w-28"
                />
              </div>
              {budgetCurrency !== 'USD' && preview && Number(budgetAmount) > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-300">≈ ${preview.result} USD</p>
              )}
              <Button
                className="w-full"
                size="lg"
                onClick={handleBudgetSave}
                disabled={!budgetValid || setBudget.isPending}
              >
                <Wallet className="w-4 h-4 mr-2" /> {t('requiredInfo.save')}
              </Button>
            </>
          )}
      </div>
    </div>
  );
}
