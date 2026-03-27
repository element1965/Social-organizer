import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Users, Wallet, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

const PRESET_AMOUNTS = [10, 30, 50, 100];

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const setBudget = trpc.user.setMonthlyBudget.useMutation();
  const completeOnboarding = trpc.user.completeOnboarding.useMutation();
  const utils = trpc.useUtils();

  const amount = showCustom ? Number(custom) : selected;
  const amountValid = amount !== null && amount > 0;

  const handleFinish = async () => {
    // Save budget as best-effort (don't block on failure)
    if (amountValid) {
      setBudget.mutate({ amount: amount!, inputCurrency: 'USD' });
    }
    try {
      await completeOnboarding.mutateAsync();
    } catch {
      // proceed even on error
    }
    // Optimistically update cache so ProtectedRoute doesn't redirect back
    utils.user.me.setData(undefined, (old) => (old ? { ...old, onboardingCompleted: true } : old));
    navigate('/dashboard');
  };

  const isPending = completeOnboarding.isPending;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-between px-4 py-8">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm">

        {/* Step 0 — Entry */}
        {step === 0 && (
          <div className="w-full flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-teal-500/15 flex items-center justify-center mb-8">
              <Users className="w-10 h-10 text-teal-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              {t('onboarding.entryTitle')}
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              {t('onboarding.entryText')}
            </p>
          </div>
        )}

        {/* Step 1 — Pledge */}
        {step === 1 && (
          <div className="w-full flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-blue-500/15 flex items-center justify-center mb-8">
              <Wallet className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-8">
              {t('onboarding.pledgeTitle')}
            </h1>

            {/* Amount chips */}
            <div className="flex flex-wrap gap-3 justify-center mb-4">
              {PRESET_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => { setSelected(a); setShowCustom(false); setCustom(''); }}
                  className={cn(
                    'px-6 py-3 rounded-xl text-lg font-semibold transition-all border-2',
                    selected === a && !showCustom
                      ? 'bg-teal-500 border-teal-500 text-white'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:border-teal-500/50 hover:text-white',
                  )}
                >
                  ${a}
                </button>
              ))}
              <button
                onClick={() => { setShowCustom(true); setSelected(null); }}
                className={cn(
                  'px-6 py-3 rounded-xl text-lg font-semibold transition-all border-2',
                  showCustom
                    ? 'bg-teal-500 border-teal-500 text-white'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:border-teal-500/50 hover:text-white',
                )}
              >
                {t('onboarding.customAmount')}
              </button>
            </div>

            {showCustom && (
              <div className="w-full mb-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                  <input
                    type="number"
                    min={1}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            )}

            <p className="text-gray-500 text-sm leading-relaxed mt-2">
              {t('onboarding.pledgeNote')}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="w-full max-w-sm pb-safe">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-6 bg-teal-400' : 'w-1.5 bg-gray-700',
              )}
            />
          ))}
        </div>

        {step === 0 ? (
          <button
            onClick={() => setStep(1)}
            className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-2xl text-lg transition-colors"
          >
            {t('onboarding.continue')}
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={isPending}
            className="w-full py-4 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold rounded-2xl text-lg transition-colors flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="w-5 h-5 animate-spin" />}
            {t('onboarding.continue')}
          </button>
        )}
      </div>
    </div>
  );
}
