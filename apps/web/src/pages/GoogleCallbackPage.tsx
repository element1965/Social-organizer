import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Capacitor } from '@capacitor/core';

// Handles Google OAuth redirect callback.
// When opened in Chrome Custom Tab (native), passes tokens back to Capacitor WebView
// via deep link: socialorganizer://auth-success?at=...&rt=...&uid=...&isNew=1
// When opened in web browser, saves tokens directly.
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);

  const googleLoginMutation = trpc.auth.loginWithGoogle.useMutation({
    onSuccess: (data) => {
      if (!data?.accessToken) return;

      if (Capacitor.isNativePlatform()) {
        // Running inside Chrome Custom Tab — pass tokens to the Capacitor WebView via deep link
        const params = new URLSearchParams({
          at: data.accessToken,
          rt: data.refreshToken,
          uid: data.userId,
          isNew: data.isNew ? '1' : '0',
        });
        window.location.href = `socialorganizer://auth-success?${params.toString()}`;
      } else {
        // Web browser — save tokens directly
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
    onError: () => {
      if (Capacitor.isNativePlatform()) {
        window.location.href = 'socialorganizer://auth-error';
      } else {
        navigate('/login');
      }
    },
  });

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const idToken = params.get('id_token');
    // linkCode was passed via OAuth state param
    const linkCode = new URLSearchParams(window.location.search).get('state') || undefined;

    if (idToken) {
      googleLoginMutation.mutate({ idToken, ...(linkCode ? { linkCode } : {}) });
    } else {
      if (Capacitor.isNativePlatform()) {
        window.location.href = 'socialorganizer://auth-error';
      } else {
        navigate('/login');
      }
    }
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
