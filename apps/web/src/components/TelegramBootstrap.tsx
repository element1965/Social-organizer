import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getStartParam } from '@so/tg-adapter';
import { useTelegramInit, useTelegramBackButton } from '../hooks/useTelegram';
import { useAuth } from '../hooks/useAuth';
import { ProviderWait } from './onboarding/ProviderWait';
import { TelegramFailed } from './onboarding/TelegramFailed';
import { safeInviteToken } from './onboarding/flow';

/** Collection ids and invite tokens from start params / storage are opaque url-safe strings. */
const isSafeToken = (token: string | null | undefined): token is string => safeInviteToken(token) !== null;

export function TelegramBootstrap({ children }: { children: React.ReactNode }) {
  const { isReady, isTelegram, failed, retry, dismiss } = useTelegramInit();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();
  const startParamHandled = useRef(false);

  useTelegramBackButton();

  // After auth, navigate based on start_param or redirect from public pages
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    // Check start_param or pending invite for deep linking (only once per session)
    if (!startParamHandled.current) {
      startParamHandled.current = true;

      // If already on /invite/:token (opened via bot's web_app button), let InvitePage handle it
      if (location.pathname.startsWith('/invite/')) {
        localStorage.removeItem('pendingInviteToken');
        return;
      }

      // Telegram deep link start_param (only in TG)
      if (isTelegram) {
        const startParam = getStartParam();
        let inviteToken: string | null = null;
        if (startParam?.startsWith('collection_')) {
          const collectionId = startParam.slice('collection_'.length);
          if (isSafeToken(collectionId)) {
            navigate(`/collection/${encodeURIComponent(collectionId)}`, { replace: true });
            return;
          }
        }

        if (startParam?.startsWith('sos_')) {
          const collectionId = startParam.slice('sos_'.length);
          if (isSafeToken(collectionId)) {
            navigate(`/collection/${encodeURIComponent(collectionId)}?sos=true`, { replace: true });
            return;
          }
        }

        if (startParam?.startsWith('invite_')) {
          const t = startParam.slice('invite_'.length);
          if (isSafeToken(t)) inviteToken = t;
        }

        if (!inviteToken) {
          const stored = localStorage.getItem('pendingInviteToken');
          if (isSafeToken(stored)) inviteToken = stored;
        }

        if (inviteToken) {
          localStorage.setItem('pendingInviteToken', inviteToken);
          navigate(`/invite/${encodeURIComponent(inviteToken)}`, { replace: true });
          return;
        }
      } else {
        // Non-TG: check pendingInviteToken from localStorage
        const inviteToken = localStorage.getItem('pendingInviteToken');
        if (inviteToken) {
          localStorage.removeItem('pendingInviteToken');
          if (isSafeToken(inviteToken)) {
            navigate(`/invite/${encodeURIComponent(inviteToken)}`, { replace: true });
            return;
          }
        }
      }
    }

    // Signed-in people leave the public entry pages. "/" is the circle now, so it stays.
    // A pending invite is left for InvitePage; sending them home here used to drop it.
    if (location.pathname === '/welcome' || location.pathname === '/login') {
      const hasPendingInvite = localStorage.getItem('pendingInviteToken');
      if (!hasPendingInvite) {
        navigate('/', { replace: true });
      }
    }
  }, [isTelegram, isReady, isAuthenticated, location.pathname, navigate]);

  // Telegram auto sign-in in progress (auth.html №14): the mark, the spinner, one line
  if (isTelegram && !isReady) return <ProviderWait provider="telegram" bare />;
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
