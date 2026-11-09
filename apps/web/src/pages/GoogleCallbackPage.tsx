import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { takePendingSosPath } from '../lib/inviteUrl';
import { afterSignInPath, readPendingInvite } from '../components/onboarding/flow';
import { ProviderWait } from '../components/onboarding/ProviderWait';

// Handles Google OAuth redirect callback.
// Opened in Chrome Custom Tab after Google auth.
// On native: passes tokens to Capacitor WebView via socialorganizer://auth-success deep link.
// On web: saves tokens directly and navigates.
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const called = useRef(false);

  const mutation = trpc.auth.loginWithGoogle.useMutation();
  // Keep a stable ref so useEffect closure always has the latest mutate fn
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace('#', '?'));
    const idToken = hashParams.get('id_token');

    // With response_type=id_token (implicit flow), Google returns ALL params in the
    // fragment (#), including state — NOT in the query string.
    let isNativeCallback = false;
    let linkCode: string | undefined;
    try {
      const stateRaw = hashParams.get('state') || '';
      const stateObj = JSON.parse(stateRaw);
      isNativeCallback = stateObj.native === '1';
      linkCode = stateObj.lc || undefined;
    } catch {
      // Web flow
    }

    // reason lets the sign-in screen show the next step (SO-21)
    // "cancelled" (the person closed Google) and the masked e-mail ("m") are new; older app builds treat any
    // unknown reason as "failed" and ignore "m", so the deep link stays backward compatible.
    const goError = (reason: 'failed' | 'account_exists' | 'cancelled' = 'failed', masked?: string | null) => {
      const extra = masked ? `&m=${encodeURIComponent(masked)}` : '';
      if (isNativeCallback) {
        const fallback = encodeURIComponent(`https://www.orginizer.com/login?error=${reason}${extra}`);
        window.location.href = `intent://auth-error?reason=${reason}${extra}#Intent;scheme=socialorganizer;package=com.socialorganizer.app;S.browser_fallback_url=${fallback};end`;
      } else {
        navigate(`/login?error=${reason}${extra}`, { replace: true });
      }
    };

    // Google returns #error=access_denied when the person cancels the consent screen
    const oauthError = hashParams.get('error');
    if (oauthError === 'access_denied') {
      goError('cancelled');
      return;
    }
    if (!idToken) {
      goError();
      return;
    }

    mutateRef.current(
      { idToken, ...(linkCode ? { linkCode } : {}) },
      {
        onSuccess(data) {
          if (!data?.accessToken) { goError(); return; }
          if (isNativeCallback) {
            const p = new URLSearchParams({
              at: data.accessToken,
              rt: data.refreshToken,
              uid: data.userId,
              isNew: data.isNew ? '1' : '0',
            });
            const params = p.toString();
            // Use Android intent:// scheme — this closes the Custom Tab automatically
            // (unlike socialorganizer:// which leaves it open with a blank page)
            const fallback = encodeURIComponent('https://www.orginizer.com');
            window.location.href = `intent://auth-success?${params}#Intent;scheme=socialorganizer;package=com.socialorganizer.app;S.browser_fallback_url=${fallback};end`;
          } else {
            login(data.accessToken, data.refreshToken, data.userId);
            // The pending invite stays until InvitePage accepts it (that is how it knows to auto-accept).
            // A new account goes through the intro (onboarding/flow.ts); an SOS link waits behind it.
            const pendingInvite = readPendingInvite();
            const target = takePendingSosPath() || (pendingInvite ? `/invite/${pendingInvite}` : null);
            const path = afterSignInPath(!!data.isNew, target);
            if (path === '/') navigate('/', { replace: true });
            else window.location.href = path;
          }
        },
        onError: (err) =>
          err.message === 'ACCOUNT_EXISTS_OTHER_METHOD'
            ? goError('account_exists', (err.data as { maskedEmail?: string } | undefined)?.maskedEmail)
            : goError('failed'),
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ProviderWait provider="google" />;
}
