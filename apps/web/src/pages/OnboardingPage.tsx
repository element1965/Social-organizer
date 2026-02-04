import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Users, Zap, Eye, UserPlus, Wallet, Share2, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

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
  { icon: Wallet, titleKey: 'onboarding.step5.title', textKey: 'onboarding.step5.text' },
];

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = steps[step]!;
  const Icon = current.icon;

  // Budget state (step 5)
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');

  // Invite state (step 4)
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteAccepted, setInviteAccepted] = useState(false);

  const { data: currencies } = trpc.currency.list.useQuery();
  const { data: preview } = trpc.currency.toUSD.useQuery(
    { amount: Number(budgetAmount), from: budgetCurrency },
    { enabled: !!budgetAmount && Number(budgetAmount) > 0 && budgetCurrency !== 'USD' }
  );

  const generateInvite = trpc.invite.generate.useMutation();
  const completeOnboarding = trpc.user.completeOnboarding.useMutation();
  const setBudget = trpc.user.setMonthlyBudget.useMutation();
  const utils = trpc.useUtils();

  // Polling: check invite acceptance every 3 seconds
  const { data: inviteData } = trpc.invite.getByToken.useQuery(
    { token: inviteToken! },
    {
      enabled: !!inviteToken && !inviteAccepted,
      refetchInterval: 3000,
    }
  );

  // Watch for invite acceptance
  useEffect(() => {
    if (inviteData && inviteData.usedById) {
      setInviteAccepted(true);
    }
  }, [inviteData]);

  const handleInvite = async () => {
    const result = await generateInvite.mutateAsync();
    const link = `${window.location.origin}/invite/${result.token}`;
    setInviteToken(result.token);
    setInviteLink(link);
    setInviteAccepted(false);
    if (navigator.share) {
      navigator.share({ title: 'Social Organizer', url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link).catch(() => {});
    }
  };

  const handleSendAnother = async () => {
    setInviteToken(null);
    setInviteLink('');
    setInviteAccepted(false);
    await handleInvite();
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
    navigate('/');
  };

  const isStep4 = step === 3;
  const isStep5 = step === 4;

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

        {/* Step 4: Invite section */}
        {isStep4 && (
          <div className="w-full max-w-xs space-y-4 mt-6">
            {!inviteLink ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleInvite}
                disabled={generateInvite.isPending}
              >
                <Share2 className="w-4 h-4 mr-2" /> {t('onboarding.invite')}
              </Button>
            ) : inviteAccepted ? (
              <>
                <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg text-center space-y-2">
                  <CheckCircle className="w-10 h-10 text-green-600 mx-auto" />
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                    {t('onboarding.connectionEstablished')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleSendAnother}
                  disabled={generateInvite.isPending}
                >
                  <Share2 className="w-4 h-4 mr-2" /> {t('onboarding.sendAnother')}
                </Button>
              </>
            ) : (
              <>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-center space-y-2">
                  <p className="text-xs text-blue-700 dark:text-blue-400 break-all">{inviteLink}</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{t('onboarding.waitingForAccept')}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleSendAnother}
                  disabled={generateInvite.isPending}
                >
                  <Share2 className="w-4 h-4 mr-2" /> {t('onboarding.sendAnother')}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 5: Budget input */}
        {isStep5 && (
          <div className="w-full max-w-xs space-y-3 mt-6">
            <div className="flex gap-2">
              <Input
                type="number"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="0"
                className="flex-1"
                min={0}
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

        {isStep5 ? (
          /* Step 5: final buttons */
          <div className="space-y-3">
            {budgetAmount && Number(budgetAmount) > 0 ? (
              <Button
                className="w-full"
                size="lg"
                onClick={handleFinish}
                disabled={setBudget.isPending || completeOnboarding.isPending}
              >
                <Wallet className="w-4 h-4 mr-2" /> {t('onboarding.saveBudget')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleFinish}
              disabled={completeOnboarding.isPending}
            >
              {budgetAmount && Number(budgetAmount) > 0 ? t('onboarding.skipAndStart') : t('onboarding.skipAndStart')}
            </Button>
          </div>
        ) : isStep4 ? (
          /* Step 4: Next (enabled when accepted) + Skip */
          <div className="space-y-3">
            {inviteAccepted && (
              <Button className="w-full" size="lg" onClick={() => setStep(step + 1)}>
                {t('onboarding.next')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-gray-400"
              onClick={() => setStep(step + 1)}
            >
              {t('onboarding.skip')}
            </Button>
          </div>
        ) : (
          /* Steps 1-3: Next */
          <Button className="w-full" size="lg" onClick={() => setStep(step + 1)}>
            {t('onboarding.next')}
          </Button>
        )}
      </div>
    </div>
  );
}
