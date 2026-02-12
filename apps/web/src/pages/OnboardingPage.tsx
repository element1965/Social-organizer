import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { SocialIcon } from '../components/ui/social-icons';
import { Users, Zap, Eye, UserPlus, MessageCircle, Wallet } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateContact } from '@so/shared';

interface Step {
  icon: typeof Users;
  titleKey: string;
  textKey: string;
}

const steps: Step[] = [
  { icon: Users, titleKey: 'onboarding.step1.title', textKey: 'onboarding.step1.text' },
  { icon: Zap, titleKey: 'onboarding.step2.title', textKey: 'onboarding.step2.text' },
  { icon: Eye, titleKey: 'onboarding.step3.title', textKey: 'onboarding.step3.text' },
  { icon: UserPlus, titleKey: 'onboarding.step4.title', textKey: 'onboarding.step4.text' },
  { icon: MessageCircle, titleKey: 'onboarding.step5.title', textKey: 'onboarding.step5.text' },
  { icon: Wallet, titleKey: 'onboarding.step6.title', textKey: 'onboarding.step6.text' },
];

const CONTACT_FIELDS = [
  { type: 'whatsapp', placeholder: '+380...' },
  { type: 'facebook', placeholder: 'facebook.com/...' },
  { type: 'instagram', placeholder: '@username' },
  { type: 'twitter', placeholder: '@username' },
  { type: 'tiktok', placeholder: '@username' },
] as const;

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = steps[step]!;
  const Icon = current.icon;

  // Contacts state (step 5)
  const [contacts, setContacts] = useState<Record<string, string>>({
    whatsapp: '',
    facebook: '',
    instagram: '',
    twitter: '',
    tiktok: '',
  });

  // Budget state (step 6)
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');

  const { data: currencies } = trpc.currency.list.useQuery();
  const { data: preview } = trpc.currency.toUSD.useQuery(
    { amount: Number(budgetAmount), from: budgetCurrency },
    { enabled: !!budgetAmount && Number(budgetAmount) > 0 && budgetCurrency !== 'USD' }
  );

  const completeOnboarding = trpc.user.completeOnboarding.useMutation();
  const setBudget = trpc.user.setMonthlyBudget.useMutation();
  const updateContacts = trpc.user.updateContacts.useMutation();
  const utils = trpc.useUtils();

  const contactErrors = Object.fromEntries(
    Object.entries(contacts).map(([type, value]) => [type, validateContact(type, value)])
  );
  const filledContactsCount = Object.entries(contacts).filter(([type, v]) => v.trim() && !contactErrors[type]).length;
  const contactsValid = filledContactsCount >= 2;

  const budgetInUSD = budgetCurrency === 'USD' ? Number(budgetAmount) : (preview?.result ?? 0);
  const budgetValid = Number(budgetAmount) > 0 && (budgetCurrency === 'USD' ? Number(budgetAmount) >= 1 : budgetInUSD >= 1);

  const isContactsStep = step === 4;
  const isBudgetStep = step === 5;

  const handleContactsNext = async () => {
    const contactsArray = Object.entries(contacts)
      .map(([type, value]) => ({ type, value }));
    await updateContacts.mutateAsync(contactsArray);
    setStep(step + 1);
  };

  const handleFinish = async () => {
    if (budgetAmount && Number(budgetAmount) > 0) {
      await setBudget.mutateAsync({
        amount: Number(budgetAmount),
        inputCurrency: budgetCurrency,
      });
    }
    await completeOnboarding.mutateAsync();
    await utils.user.me.refetch();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
          <Icon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {t(current.titleKey)}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          {t(current.textKey)}
        </p>

        {/* Step 5: Contacts */}
        {isContactsStep && (
          <div className="w-full max-w-xs space-y-3 mt-6">
            {CONTACT_FIELDS.map((field) => (
              <div key={field.type} className="flex items-center gap-2">
                <SocialIcon type={field.type} className="w-5 h-5 text-gray-500 shrink-0" />
                <Input
                  value={contacts[field.type] || ''}
                  onChange={(e) => setContacts(prev => ({ ...prev, [field.type]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="flex-1"
                  error={contacts[field.type]?.trim() && contactErrors[field.type] ? t(contactErrors[field.type]!) : undefined}
                />
              </div>
            ))}
            <p className={cn(
              'text-sm font-medium',
              contactsValid ? 'text-green-600 dark:text-green-400' : 'text-gray-500'
            )}>
              {t('onboarding.contactsFilled', { count: filledContactsCount })}
            </p>
          </div>
        )}

        {/* Step 6: Budget input */}
        {isBudgetStep && (
          <div className="w-full max-w-xs space-y-3 mt-6">
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
                id="budget-currency"
                value={budgetCurrency}
                onChange={(e) => setBudgetCurrency(e.target.value)}
                options={currencies?.map(c => ({ value: c.code, label: `${c.symbol} ${c.code}` })) ?? [{ value: 'USD', label: '$ USD' }]}
                className="w-28"
              />
            </div>
            {budgetCurrency !== 'USD' && preview && Number(budgetAmount) > 0 && (
              <p className="text-sm text-gray-500">≈ ${preview.result} USD</p>
            )}
            <p className="text-xs text-gray-400">{t('onboarding.budgetNote')}</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm pb-8">
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={cn('w-2 h-2 rounded-full', i === step ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700')} />
          ))}
        </div>

        {isContactsStep ? (
          /* Step 5: Contacts next */
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleContactsNext}
              disabled={!contactsValid || updateContacts.isPending}
            >
              {t('onboarding.next')}
            </Button>
            {!contactsValid && (
              <p className="text-sm text-gray-500 text-center">{t('onboarding.contactsRequired')}</p>
            )}
          </div>
        ) : isBudgetStep ? (
          /* Step 6: Budget save */
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleFinish}
              disabled={!budgetValid || setBudget.isPending || completeOnboarding.isPending}
            >
              <Wallet className="w-4 h-4 mr-2" /> {t('onboarding.saveBudget')}
            </Button>
          </div>
        ) : (
          /* Steps 1-4: Next */
          <Button className="w-full" size="lg" onClick={() => setStep(step + 1)}>
            {t('onboarding.next')}
          </Button>
        )}
      </div>
    </div>
  );
}
