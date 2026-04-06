import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Browser } from '@capacitor/browser';

// This page handles Google OAuth redirect callback.
// Google redirects here with #id_token=... in the URL hash after auth via Chrome Custom Tab.
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const googleLoginMutation = trpc.auth.loginWithGoogle.useMutation({
    onSuccess: (data) => {
      if (!data?.accessToken) return;
      login(data.accessToken, data.refreshToken, data.userId);
      // Close Chrome Custom Tab if opened via Capacitor Browser
      Browser.close().catch(() => {});
      const pendingInvite = localStorage.getItem('pendingInviteToken');
      if (pendingInvite) {
        localStorage.removeItem('pendingInviteToken');
        window.location.href = `/invite/${pendingInvite}`;
      } else {
        navigate('/onboarding');
      }
    },
    onError: () => {
      navigate('/login');
    },
  });

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const idToken = params.get('id_token');
    const linkCode = sessionStorage.getItem('googleLinkCode') || undefined;
    sessionStorage.removeItem('googleLinkCode');

    if (idToken) {
      googleLoginMutation.mutate({ idToken, ...(linkCode ? { linkCode } : {}) });
    } else {
      navigate('/login');
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
