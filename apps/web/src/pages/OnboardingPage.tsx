import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Users, Zap, Eye, UserPlus, Share2 } from 'lucide-react';
import { cn } from '../lib/utils';

const steps = [
  { icon: Users, titleKey: 'onboarding.step1.title', textKey: 'onboarding.step1.text' },
  { icon: Zap, titleKey: 'onboarding.step2.title', textKey: 'onboarding.step2.text' },
  { icon: Eye, titleKey: 'onboarding.step3.title', textKey: 'onboarding.step3.text' },
  { icon: UserPlus, titleKey: 'onboarding.step4.title', textKey: 'onboarding.step4.text' },
];

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = steps[step]!;
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  const generateInvite = trpc.invite.generate.useMutation();
  const completeOnboarding = trpc.user.completeOnboarding.useMutation();
  const utils = trpc.useUtils();
  const [inviteLink, setInviteLink] = useState('');

  const handleInvite = async () => {
    const result = await generateInvite.mutateAsync();
    const link = `${window.location.origin}/invite/${result.token}`;
    setInviteLink(link);
    if (navigator.share) {
      navigator.share({ title: 'Social Organizer', url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link).catch(() => {});
    }
  };

  const handleStart = async () => {
    await completeOnboarding.mutateAsync();
    // Refetch user data so ProtectedRoute sees updated onboardingCompleted
    await utils.user.me.refetch();
    navigate('/');
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
      </div>
      <div className="w-full max-w-sm pb-8">
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={cn('w-2 h-2 rounded-full', i === step ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700')} />
          ))}
        </div>

        {isLast ? (
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={handleInvite} disabled={generateInvite.isPending}>
              <Share2 className="w-4 h-4 mr-2" /> {t('onboarding.invite')}
            </Button>
            {inviteLink && (
              <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
                <p className="text-xs text-green-700 dark:text-green-400 break-all">{inviteLink}</p>
              </div>
            )}
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleStart}
              disabled={completeOnboarding.isPending}
            >
              {t('onboarding.start')}
            </Button>
          </div>
        ) : (
          <Button className="w-full" size="lg" onClick={() => setStep(step + 1)}>
            {t('onboarding.next')}
          </Button>
        )}
      </div>
    </div>
  );
}
