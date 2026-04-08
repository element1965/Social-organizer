import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';

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

    let isNativeCallback = false;
    let linkCode: string | undefined;
    try {
      const stateRaw = new URLSearchParams(window.location.search).get('state') || '';
      const stateObj = JSON.parse(stateRaw);
      isNativeCallback = stateObj.native === '1';
      linkCode = stateObj.lc || undefined;
    } catch {
      // Web flow
    }

    const goError = () => {
      if (isNativeCallback) {
        const fallback = encodeURIComponent('https://www.orginizer.com/login');
        window.location.href = `intent://auth-error#Intent;scheme=socialorganizer;package=com.socialorganizer.app;S.browser_fallback_url=${fallback};end`;
      } else {
        navigate('/login');
      }
    };

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
            const pendingInvite = localStorage.getItem('pendingInviteToken');
            if (pendingInvite) {
              localStorage.removeItem('pendingInviteToken');
              window.location.href = `/invite/${pendingInvite}`;
            } else {
              navigate(data.isNew ? '/onboarding' : '/dashboard');
            }
          }
        },
        onError: goError,
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="text-white text-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4" />
        <p>Signing in with Google...</p>
      </div>
    </div>
  );
}
