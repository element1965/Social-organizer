import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NetFigure } from '../components/figures';
import { BrandLine, StepText } from '../components/onboarding/OnboardingFrame';
import { SignInFlow } from '../components/onboarding/SignInFlow';
import { useNetLabels } from '../components/onboarding/figureLabels';

/**
 * Sign-in for new and existing people (screens.md §13, onboarding.html №2–4): one screen, buttons by device,
 * e-mail last. The server decides whether the account is new; no password is needed
 * (the legacy password form opens only via /login?mode=password).
 */
export function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const redirect = params.get('redirect');
  const returnedError = params.get('error');
  const labels = useNetLabels();

  // If the user was in demo mode, clear tokens and reload so the tRPC client uses the real HTTP link
  useEffect(() => {
    if (localStorage.getItem('accessToken') === 'demo-token') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userId');
      window.location.reload();
    }
  }, []);

  const initialError =
    returnedError === 'account_exists' ? t('signin.errAccountExists') : returnedError ? t('signin.errFailed') : undefined;

  return (
    <SignInFlow
      top={<BrandLine />}
      redirect={redirect}
      initialError={initialError}
      hero={
        <>
          <div className="mt-4 flex h-[240px] items-center justify-center">
            <NetFigure step={0} labels={labels} className="h-full w-auto" />
          </div>
          <StepText title={t('login.title')}>{t('login.text')}</StepText>
        </>
      }
    />
  );
}
