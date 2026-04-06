import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';

// Handles Google OAuth redirect callback.
// When opened in Chrome Custom Tab (native), passes tokens back to Capacitor WebView
// via deep link: socialorganizer://auth-success?at=...&rt=...&uid=...&isNew=1
// When opened in web browser, saves tokens directly.
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);

  useEffect(() => {
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace('#', '?'));
    const idToken = hashParams.get('id_token');

    // Parse state param: { native: '1', lc: 'linkCode' } — set by native app
    let isNativeCallback = false;
    let linkCode: string | undefined;
    try {
      const stateRaw = new URLSearchParams(window.location.search).get('state') || '';
      const stateObj = JSON.parse(stateRaw);
      isNativeCallback = stateObj.native === '1';
      linkCode = stateObj.lc || undefined;
    } catch {
      // Web flow — state is not JSON
      linkCode = new URLSearchParams(window.location.search).get('state') || undefined;
    }

    if (!idToken) {
      window.location.href = isNativeCallback ? 'socialorganizer://auth-error' : '/login';
      return;
    }

    const handleSuccess = (data: { accessToken: string; refreshToken: string; userId: string; isNew: boolean }) => {
      if (isNativeCallback) {
        // Chrome Custom Tab — pass tokens to Capacitor WebView via deep link
        const p = new URLSearchParams({ at: data.accessToken, rt: data.refreshToken, uid: data.userId, isNew: data.isNew ? '1' : '0' });
        window.location.href = `socialorganizer://auth-success?${p.toString()}`;
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
    };

    const handleError = () => {
      window.location.href = isNativeCallback ? 'socialorganizer://auth-error' : '/login';
    };

    googleLoginMutation.mutate(
      { idToken, ...(linkCode ? { linkCode } : {}) },
      { onSuccess: handleSuccess, onError: handleError },
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
