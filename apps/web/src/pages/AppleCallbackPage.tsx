import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Web finish page for Sign in with Apple.
// The backend (/api/auth/apple/callback) verifies the Apple id_token, creates the
// session, then 302-redirects here with tokens in the URL fragment (#at=&rt=&uid=&isNew=).
// Native apps never hit this page — they receive the tokens via the
// socialorganizer://auth-success deep link instead.
export function AppleCallbackPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.hash.replace('#', ''));
    const at = params.get('at');
    const rt = params.get('rt');
    const uid = params.get('uid');
    const isNew = params.get('isNew') === '1';

    if (!at || !rt || !uid) {
      navigate('/login');
      return;
    }

    login(at, rt, uid);
    const pendingInvite = localStorage.getItem('pendingInviteToken');
    if (pendingInvite) {
      localStorage.removeItem('pendingInviteToken');
      window.location.href = `/invite/${pendingInvite}`;
    } else {
      navigate(isNew ? '/onboarding' : '/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="text-white text-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4" />
        <p>Signing in with Apple...</p>
      </div>
    </div>
  );
}
