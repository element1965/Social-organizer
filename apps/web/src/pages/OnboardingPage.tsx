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

  // Skills step — unified (skills + needs in one pass)
  const { data: categories } = trpc.skills.categories.useQuery();
  const saveSkills = trpc.skills.saveSkills.useMutation();
  const saveNeeds = trpc.skills.saveNeeds.useMutation();
  const markSkillsCompleted = trpc.skills.markCompleted.useMutation();
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedNeeds, setSelectedNeeds] = useState<Set<string>>(new Set());
  const [skillNotes, setSkillNotes] = useState<Map<string, string>>(new Map());

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

  const handleToggleSkill = (id: string) => {
    const next = new Set(selectedSkills);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSkills(next);
  };

  const handleToggleNeed = (id: string) => {
    const next = new Set(selectedNeeds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedNeeds(next);
  };

  const handleSkillNoteChange = (categoryId: string, note: string) => {
    setSkillNotes((prev) => new Map(prev).set(categoryId, note));
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
        saveSkills.mutateAsync({ skills: [...selectedSkills].map((id) => ({ categoryId: id, note: skillNotes.get(id) || undefined })) }),
        saveNeeds.mutateAsync({ needs: [...selectedNeeds].map((id) => ({ categoryId: id, note: skillNotes.get(id) || undefined })) }),
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col px-4">
      <div className="flex-1 flex flex-col items-center pt-8 max-w-md mx-auto w-full">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
          {isContactsStep ? (
            <MessageCircle className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          ) : isBudgetStep ? (
            <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          ) : (
            <Wrench className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          {isContactsStep ? t('onboarding.step5.title') : isBudgetStep ? t('onboarding.step6.title') : t('skills.popupTitle')}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed text-center mb-4">
          {isContactsStep ? t('onboarding.step5.text') : isBudgetStep ? t('onboarding.step6.text') : t('skills.popupText')}
        </p>

        {/* Step 1: Contacts */}
        {isContactsStep && (
          <div className="w-full space-y-3">
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
          <div className="w-full space-y-3">
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
              <p className="text-sm text-gray-500 dark:text-gray-300">{'\u2248'} ${preview.result} USD</p>
            )}
            <p className="text-xs text-gray-400">{t('onboarding.budgetNote')}</p>
          </div>
        )}

        {/* Step 3: Skills & Needs — unified single-pass */}
        {isSkillsStep && (
          <div className="w-full flex-1 overflow-y-auto">
            {categories && (
              <SkillSelector
                categories={categories}
                selectedSkills={selectedSkills}
                selectedNeeds={selectedNeeds}
                onToggleSkill={handleToggleSkill}
                onToggleNeed={handleToggleNeed}
                notes={skillNotes}
                onNoteChange={handleSkillNoteChange}
              />
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-md mx-auto pb-6 pt-3">
        <div className="flex justify-center gap-2 mb-4">
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
          <div className="space-y-2">
            <p className="text-xs text-center text-gray-400">
              {t('skills.minHint', { skills: MIN_SKILLS, needs: MIN_NEEDS })}
            </p>
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
