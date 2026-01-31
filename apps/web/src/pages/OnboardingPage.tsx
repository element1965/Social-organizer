import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Users, Zap, Eye, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';

const steps = [
  { icon: Users, titleKey: 'onboarding.step1.title', textKey: 'onboarding.step1.text', titleFallback: 'У тебя есть люди, которым не всё равно', textFallback: 'Это социальный организатор. Он не переводит деньги и не собирает взносы. Он помогает людям быстро скоординироваться, если кому-то нужна поддержка.' },
  { icon: Zap, titleKey: 'onboarding.step2.title', textKey: 'onboarding.step2.text', titleFallback: 'Один сигнал — и нужные люди узнают', textFallback: 'Если кому-то нужна помощь — система уведомит тех, кто может откликнуться. Уведомление приходит один раз. Никакого спама и давления.' },
  { icon: Eye, titleKey: 'onboarding.step3.title', textKey: 'onboarding.step3.text', titleFallback: 'Всё на виду', textFallback: 'Каждое действие сохраняется. Доверие строится на прозрачности, а не на контроле.' },
  { icon: UserPlus, titleKey: 'onboarding.step4.title', textKey: 'onboarding.step4.text', titleFallback: 'Добавь первого человека', textFallback: 'Организатор работает через связи между людьми. Начни с одного человека — того, кому доверяешь.' },
];

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = steps[step]!;
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-6">
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
          <Icon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {t(current.titleKey, current.titleFallback)}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          {t(current.textKey, current.textFallback)}
        </p>
      </div>
      <div className="w-full max-w-sm pb-8">
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={cn('w-2 h-2 rounded-full', i === step ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700')} />
          ))}
        </div>
        <Button className="w-full" size="lg" onClick={() => isLast ? navigate('/') : setStep(step + 1)}>
          {isLast ? t('onboarding.start', 'Начать') : t('onboarding.next', 'Далее')}
        </Button>
        {!isLast && (
          <button onClick={() => navigate('/')} className="w-full mt-2 text-sm text-gray-500 dark:text-gray-400 hover:underline">
            {t('onboarding.skip', 'Пропустить')}
          </button>
        )}
      </div>
    </div>
  );
}
