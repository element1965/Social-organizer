import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '../components/errors/ErrorState';
import { BrandLine, OnboardingFrame } from '../components/onboarding/OnboardingFrame';
import { InfoGlyph, StateTile } from '../components/onboarding/states';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/ui2/AppShell';
import { Button } from '../components/ui2/Button';
import { Screen } from '../components/ui2/Screen';
import { useAuth } from '../hooks/useAuth';

/**
 * An address the app does not know. Signed in: the shell stays (tabs or sidebar) and one button leads to the
 * Circle. A guest gets the public frame with one button to the home page. Old addresses keep their own
 * redirects in App.tsx; the server still answers the app page for any path.
 */
export function NotFoundPage() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return (
      <ProtectedRoute>
        <AppShell>
          <SignedInNotFound />
        </AppShell>
      </ProtectedRoute>
    );
  }
  return <GuestNotFound />;
}

function SignedInNotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Screen width="column">
      <ErrorState
        glyph={<InfoGlyph />}
        title={t('errors.pageGoneTitle')}
        body={t('errors.pageGoneBody')}
        action={
          <Button className="w-full" onClick={() => navigate('/', { replace: true })}>
            {t('invite.toCircle')}
          </Button>
        }
      />
    </Screen>
  );
}

function GuestNotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <OnboardingFrame
      top={<BrandLine />}
      centre
      foot={
        <Button className="w-full" onClick={() => navigate('/', { replace: true })}>
          {t('login.deletedHome')}
        </Button>
      }
    >
      <div className="mt-16">
        <StateTile>
          <InfoGlyph />
        </StateTile>
      </div>
      <h1 className="mt-6 text-h2 font-bold [text-wrap:balance]">{t('errors.pageGoneTitle')}</h1>
      <p className="mt-2.5 max-w-[32ch] text-body-s text-ink-muted">{t('errors.pageGoneBody')}</p>
    </OnboardingFrame>
  );
}
