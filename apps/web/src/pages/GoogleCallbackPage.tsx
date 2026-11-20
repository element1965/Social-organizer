import { campaignFrom } from '@so/shared';
import { firstTouchCampaign } from '../lib/campaign';
import { WEB_APP_URL } from '../lib/deployment';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { nativeAuthUrl, nativePlatform, type NativePlatform } from '../lib/nativeReturn';
import { afterSignInPath, safeMasked } from '../components/onboarding/flow';
import { ProviderWait } from '../components/onboarding/ProviderWait';

// Handles Google OAuth redirect callback.
// Opened in the system browser after Google auth (SFSafariViewController on iOS, Chrome Custom Tab on Android).
// On native: passes tokens to the Capacitor WebView via the socialorganizer://auth-success deep link
// (an intent:// link on Android, which also closes the Custom Tab).
// On web: saves tokens directly and navigates.
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const called = useRef(false);
  /** The deep link back to the app, offered as a button in case the browser does not follow it by itself. */
  const [appLink, setAppLink] = useState<string | null>(null);

  const mutation = trpc.auth.loginWithGoogle.useMutation({ meta: { notifyOnError: false } });
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
    let platform: NativePlatform = 'android';
    let linkCode: string | undefined;
    let campaign = firstTouchCampaign();
    try {
      const stateRaw = hashParams.get('state') || '';
      const stateObj = JSON.parse(stateRaw);
      isNativeCallback = stateObj.native === '1';
      // p: the app's platform (since 2026-11-19); older states fall back to this browser's device
      if (isNativeCallback) platform = nativePlatform(stateObj.p);
      linkCode = stateObj.lc || undefined;
      if (isNativeCallback) campaign = campaignFrom(stateObj.campaign);
    } catch {
      // Web flow
    }

    /** Back to the app; if the browser stays on this page, a button does the same on a tap. */
    const toApp = (url: string) => {
      window.location.href = url;
      setTimeout(() => setAppLink(url), 1500);
    };

    // reason lets the sign-in screen show the next step (SO-21)
    // "cancelled" (the person closed Google) and the masked e-mail ("m") are new; older app builds treat any
    // unknown reason as "failed" and ignore "m", so the deep link stays backward compatible.
    const goError = (reason: 'failed' | 'account_exists' | 'cancelled' = 'failed', masked?: string | null) => {
      const extra = masked ? `&m=${encodeURIComponent(masked)}` : '';
      if (isNativeCallback) {
        toApp(nativeAuthUrl(platform, 'auth-error', `reason=${reason}${extra}`, `${WEB_APP_URL}/login?error=${reason}${extra}`));
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
      { idToken, linkCode, campaign },
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
            // Android: intent:// closes the Custom Tab (socialorganizer:// would leave it open with a blank page).
            // iOS: socialorganizer://, since Safari cannot open intent://; the app closes the browser itself.
            toApp(nativeAuthUrl(platform, 'auth-success', p.toString(), WEB_APP_URL));
          } else {
            const path = afterSignInPath(data.userId, !!data.isNew);
            login(data.accessToken, data.refreshToken, data.userId);
            navigate(path, { replace: true });
          }
        },
        onError: (err) =>
          err.message === 'ACCOUNT_EXISTS_OTHER_METHOD'
            ? goError('account_exists', safeMasked((err.data as { maskedEmail?: unknown } | undefined)?.maskedEmail))
            : goError('failed'),
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ProviderWait provider="google" appLink={appLink} />;
}
