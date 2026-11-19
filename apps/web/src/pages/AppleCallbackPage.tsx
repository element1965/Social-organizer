import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ProviderWait } from '../components/onboarding/ProviderWait';
import { afterSignInPath, safeInviteToken, setPendingInvite } from '../components/onboarding/flow';

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

    if (!at || !rt || !uid) {
      navigate('/login?error=failed', { replace: true });
      return;
    }

    const pendingInvite = safeInviteToken(params.get('inv'));
    if (pendingInvite) setPendingInvite(pendingInvite);
    const path = afterSignInPath(uid, params.get('isNew') === '1');
    login(at, rt, uid);
    navigate(path, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ProviderWait provider="apple" />;
}
