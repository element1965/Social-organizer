import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { SocialIcon } from '../components/ui/social-icons';
import { MessageCircle, Wallet, CheckCircle, Wrench } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateContact, MIN_SKILLS, MIN_NEEDS } from '@so/shared';
import { SkillSelector } from '../components/SkillSelector';

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
  const [step, setStep] = useState(0); // 0 = contacts, 1 = budget, 2 = skills

  // Fetch user data to get TG username
  const { data: me } = trpc.user.me.useQuery();
  const { data: existingContacts } = trpc.user.getContacts.useQuery({});

  // Find telegram contact from existing contacts
  const tgContact = existingContacts?.find(c => c.type === 'telegram');
  const hasTelegram = !!tgContact?.value;

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

  const completeOnboarding = trpc.user.completeOnboarding.useMutation();
  const setBudget = trpc.user.setMonthlyBudget.useMutation();
  const updateContacts = trpc.user.updateContacts.useMutation();
  const utils = trpc.useUtils();

  // Skills step
  const { data: categories } = trpc.skills.categories.useQuery();
  const saveSkills = trpc.skills.saveSkills.useMutation();
  const saveNeeds = trpc.skills.saveNeeds.useMutation();
  const markSkillsCompleted = trpc.skills.markCompleted.useMutation();
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedNeeds, setSelectedNeeds] = useState<Set<string>>(new Set());
  const [skillTab, setSkillTab] = useState<'skills' | 'needs'>('skills');

  const contactErrors = Object.fromEntries(
    Object.entries(contacts).map(([type, value]) => [type, validateContact(type, value)])
  );
  const filledContactsCount = Object.entries(contacts).filter(([type, v]) => v.trim() && !contactErrors[type]).length;
  // TG counts as one contact, user needs 1 more (total 2 minimum)
  const totalContacts = filledContactsCount + (hasTelegram ? 1 : 0);
  const contactsValid = totalContacts >= 2;

  const budgetInUSD = budgetCurrency === 'USD' ? Number(budgetAmount) : (preview?.result ?? 0);
  const budgetValid = Number(budgetAmount) > 0 && (budgetCurrency === 'USD' ? Number(budgetAmount) >= 1 : budgetInUSD >= 1);

  const isContactsStep = step === 0;
  const isBudgetStep = step === 1;
  const isSkillsStep = step === 2;

  const handleSkillToggle = (id: string) => {
    const set = skillTab === 'skills' ? selectedSkills : selectedNeeds;
    const setter = skillTab === 'skills' ? setSelectedSkills : setSelectedNeeds;
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const skillsValid = selectedSkills.size >= MIN_SKILLS && selectedNeeds.size >= MIN_NEEDS;

  const handleContactsNext = async () => {
    const contactsArray = Object.entries(contacts)
      .map(([type, value]) => ({ type, value }));
    await updateContacts.mutateAsync(contactsArray);
    setStep(1);
  };

  const handleFinish = async () => {
    if (budgetValid) {
      await setBudget.mutateAsync({
        amount: Number(budgetAmount),
        inputCurrency: budgetCurrency,
      });
    }
    setStep(2);
  };

  const handleSkipBudget = async () => {
    setStep(2);
  };

  const handleSkillsFinish = async () => {
    if (skillsValid) {
      await Promise.all([
        saveSkills.mutateAsync({ skills: [...selectedSkills].map((id) => ({ categoryId: id })) }),
        saveNeeds.mutateAsync({ needs: [...selectedNeeds].map((id) => ({ categoryId: id })) }),
      ]);
    }
    await markSkillsCompleted.mutateAsync();
    await completeOnboarding.mutateAsync();
    await utils.user.me.refetch();
    navigate('/dashboard');
  };

  const handleSkipSkills = async () => {
    await markSkillsCompleted.mutateAsync();
    await completeOnboarding.mutateAsync();
    await utils.user.me.refetch();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
          {isContactsStep ? (
            <MessageCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          ) : isBudgetStep ? (
            <Wallet className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          ) : (
            <Wrench className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {isContactsStep ? t('onboarding.step5.title') : isBudgetStep ? t('onboarding.step6.title') : t('skills.popupTitle')}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
          {isContactsStep ? t('onboarding.step5.text') : isBudgetStep ? t('onboarding.step6.text') : t('skills.popupText')}
        </p>

        {/* Step 1: Contacts */}
        {isContactsStep && (
          <div className="w-full max-w-xs space-y-3 mt-6">
            {/* Telegram pre-filled (read-only) */}
            {hasTelegram && (
              <div className="flex items-center gap-2">
                <SocialIcon type="telegram" className="w-5 h-5 text-gray-500 dark:text-gray-300 shrink-0" />
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                  <span className="text-sm text-green-700 dark:text-green-300 truncate">{tgContact.value}</span>
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                </div>
              </div>
            )}
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
            <p className={cn(
              'text-sm font-medium',
              contactsValid ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-300'
            )}>
              {t('onboarding.contactsFilled', { count: totalContacts })}
            </p>
          </div>
        )}

        {/* Step 2: Budget input */}
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
              <p className="text-sm text-gray-500 dark:text-gray-300">≈ ${preview.result} USD</p>
            )}
            <p className="text-xs text-gray-400">{t('onboarding.budgetNote')}</p>
          </div>
        )}

        {/* Step 3: Skills & Needs */}
        {isSkillsStep && (
          <div className="w-full max-w-xs space-y-3 mt-6">
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setSkillTab('skills')}
                className={cn('flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  skillTab === 'skills' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 ring-1 ring-blue-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300')}
              >
                {t('skills.tabSkills')} ({selectedSkills.size})
              </button>
              <button
                onClick={() => setSkillTab('needs')}
                className={cn('flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  skillTab === 'needs' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 ring-1 ring-blue-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300')}
              >
                {t('skills.tabNeeds')} ({selectedNeeds.size})
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {categories && (
                <SkillSelector
                  categories={categories}
                  selected={skillTab === 'skills' ? selectedSkills : selectedNeeds}
                  onToggle={handleSkillToggle}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm pb-8">
        <div className="flex justify-center gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('w-2 h-2 rounded-full', i === step ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700')} />
          ))}
        </div>

        {isContactsStep ? (
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
              <p className="text-sm text-gray-500 dark:text-gray-300 text-center">{t('onboarding.contactsRequired')}</p>
            )}
          </div>
        ) : isBudgetStep ? (
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleFinish}
              disabled={!budgetValid || setBudget.isPending}
            >
              <Wallet className="w-4 h-4 mr-2" /> {t('onboarding.saveBudget')}
            </Button>
            <Button
              className="w-full"
              size="lg"
              variant="ghost"
              onClick={handleSkipBudget}
            >
              {t('onboarding.skipForNow')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSkillsFinish}
              disabled={!skillsValid || saveSkills.isPending || completeOnboarding.isPending}
            >
              {t('common.save')}
            </Button>
            <Button
              className="w-full"
              size="lg"
              variant="ghost"
              onClick={handleSkipSkills}
              disabled={completeOnboarding.isPending}
            >
              {t('skills.skip')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
