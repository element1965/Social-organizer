import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getStartParam } from '@so/tg-adapter';
import { useTelegramInit, useTelegramBackButton } from '../hooks/useTelegram';
import { useAuth } from '../hooks/useAuth';
import { ProviderWait } from './onboarding/ProviderWait';
import { TelegramFailed } from './onboarding/TelegramFailed';
import { afterSignInPath, safeInviteToken, setPendingInvite, telegramStartPath } from './onboarding/flow';

export function TelegramBootstrap({ children }: { children: React.ReactNode }) {
  const { isReady, isTelegram, failed, retry, dismiss } = useTelegramInit();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuth((s) => s.userId);
  const [routed, setRouted] = useState(false);

  useTelegramBackButton();

  useEffect(() => {
    if (!isTelegram || !isReady || !isAuthenticated || !userId || routed) return;

    const { pathname, search, hash } = location;
    const current = pathname + search + hash;
    const params = new URLSearchParams(search);
    const linkInvite = pathname === '/' ? safeInviteToken(params.get('invite')) : null;
    const startPath = telegramStartPath(getStartParam()) ?? (linkInvite ? `/invite/${linkInvite}` : null);
    const isEntry = pathname === '/' || pathname === '/login' || pathname === '/welcome';
    const redirect = pathname.startsWith('/invite/') || pathname.startsWith('/collection/')
      ? current
      : startPath ?? (isEntry ? params.get('redirect') : current);
    if (startPath && redirect === startPath && startPath.startsWith('/invite/')) {
      setPendingInvite(startPath.slice('/invite/'.length));
    }
    const path = afterSignInPath(userId, false, redirect);
    if (path !== current) navigate(path, { replace: true });
    setRouted(true);
  }, [isTelegram, isReady, isAuthenticated, userId, routed, location, navigate]);

  // Leave /login if it was opened with a session. Successful web and native sign-ins
  // already own their navigation, so this effect runs on route entry only.
  useEffect(() => {
    if (!isTelegram && location.pathname === '/login' && useAuth.getState().isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isTelegram, location.key, location.pathname, navigate]);

  if (isTelegram && (!isReady || (isAuthenticated && !routed))) {
    return <ProviderWait provider="telegram" bare />;
  }
  // It did not work and there is no session (№15): say so instead of silently landing on the sign-in screen
  if (isTelegram && failed && !isAuthenticated) {
    return (
      <TelegramFailed
        onRetry={retry}
        onEmail={() => {
          dismiss();
          navigate('/login?step=email');
        }}
      />
    );
  }

  return <>{children}</>;
}
