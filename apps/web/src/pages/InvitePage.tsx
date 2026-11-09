import { useEffect, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { CheckCircle, LogIn, Clock } from 'lucide-react';
import { Logo } from '../components/Logo';
import { LandingPage } from './LandingPage';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const isDemo = localStorage.getItem('accessToken') === 'demo-token';
  const isRealUser = isAuthenticated && !isDemo;

  // Save invite token to localStorage so it survives auth redirects and tab switches
  useEffect(() => {
    if (!isRealUser && token) {
      localStorage.setItem('pendingInviteToken', token);
    }
  }, [isRealUser, token]);

  // Verify token is still valid by making a lightweight query
  const { isError: meError } = trpc.user.me.useQuery(undefined, {
    enabled: isRealUser,
    retry: 1,
  });

  // Stale token — clear auth and show landing
  if (isRealUser && meError) {
    logout();
  }

  // Not authenticated — show landing page with invite token preserved
  if (!isRealUser || meError) {
    // Inside the installed app the landing only offers store/Telegram buttons, so a new
    // user could not sign up and the invite was never accepted. Go straight to sign-up;
    // LoginPage brings the user back here (pendingInviteToken) to accept the invite.
    if (Capacitor.isNativePlatform() && token) {
      localStorage.setItem('pendingInviteToken', token);
      return <Navigate to={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`} replace />;
    }
    return <LandingPage inviteToken={token} />;
  }

  return <InviteAcceptView token={token!} />;
}

/** Signed-in part: all hooks live here, so the auth gate above never changes the hook order. */
function InviteAcceptView({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const autoAcceptTriggered = useRef(false);
  const { data: me } = trpc.user.me.useQuery();

  const { data: invite, isLoading, isFetched, error } = trpc.invite.getByToken.useQuery(
    { token: token! },
    { enabled: !!token },
  );
  const accept = trpc.invite.accept.useMutation({
    onSuccess: () => {
      localStorage.removeItem('pendingInviteToken');
    },
    onError: (err) => {
      // If token is invalid/expired, clear auth state so user sees login button.
      // Other failures are terminal for this link: drop it so home does not reopen the invite.
      if (err.data?.code === 'UNAUTHORIZED') {
        logout();
        return;
      }
      localStorage.removeItem('pendingInviteToken');
    },
  });

  const notFound = isFetched && (!!error || !invite);
  const alreadyUsed =
    !isLoading && !!invite && !!me && !!invite.usedById && invite.usedById !== me.id && !accept.isSuccess;

  // A dead invite must not send ShellGate back here after Back → / → home.
  useEffect(() => {
    if (notFound || alreadyUsed) localStorage.removeItem('pendingInviteToken');
  }, [notFound, alreadyUsed]);

  const leave = () => {
    localStorage.removeItem('pendingInviteToken');
    navigate('/');
  };

  // Auto-accept invite when authenticated user lands on this page
  useEffect(() => {
    if (
      invite &&
      me &&
      (!invite.usedById || invite.usedById === me.id) &&
      !accept.isPending &&
      !accept.isSuccess &&
      !accept.error &&
      !autoAcceptTriggered.current &&
      token
    ) {
      autoAcceptTriggered.current = true;
      localStorage.removeItem('pendingInviteToken');
      accept.mutate({ token });
    }
  }, [invite, me, accept.isPending, accept.isSuccess, accept.error, token]);

  // While the request waits, check every few seconds so the screen switches to
  // "You know each other" as soon as the inviter confirms (no need to leave this page)
  const isWaiting = accept.isSuccess && !!(accept.data as any)?.pending;
  const { data: intro } = trpc.pending.introStatus.useQuery(undefined, { enabled: isWaiting, refetchInterval: 5000 });
  const confirmedNow = isWaiting && intro?.state === 'connected' && intro.person?.id === invite?.inviter.id;
  const openNetwork = () => {
    // The dashboard card would repeat the same "You know each other" message — mark it as seen
    if (me && invite) {
      try { localStorage.setItem(`acquaintanceSeen:${me.id}:${invite.inviter.id}`, '1'); } catch { /* storage blocked */ }
    }
    navigate('/network');
  };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (error || !invite) {
    const inviterGone = error?.message === 'INVITER_DELETED';
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-300">{inviterGone ? t('acquaintance.inviteGone') : t('common.notFound')}</p>
            <Button className="mt-4" onClick={leave}>
              {inviterGone ? t('acquaintance.inviteSomeone') : t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.usedById && me && invite.usedById !== me.id && !accept.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-300">{t('invite.alreadyUsed')}</p>
            <Button className="mt-4" onClick={leave}>{t('common.back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-6" style={{ minHeight: '100dvh', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <Card className="w-full max-w-sm">
        <CardContent className="py-5 text-center">
          <Logo size={48} className="text-gray-900 dark:text-teal-400 mx-auto mb-3" />
          <Avatar src={invite.inviter.photoUrl} name={invite.inviter.name} size="lg" className="mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            {(() => {
              // An intention is at least 1 $, so a smaller total is not shown at all.
              const total = Math.round((invite as any).totalIntentions ?? 0);
              const vars = { name: invite.inviter.name, count: (invite as any).networkCount ?? 0 };
              return total >= 1 ? t('invite.from', { ...vars, amount: total }) : t('invite.fromNoAmount', vars);
            })()}
          </h2>

          {(accept.isSuccess && (accept.data as any)?.alreadyConnected) || confirmedNow ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-base font-semibold text-green-600">{t('acquaintance.connectedTitle', { name: invite.inviter.name })}</p>
              <p className="text-xs text-gray-500 dark:text-gray-300">{t('acquaintance.connectedText')}</p>
              <Button className="w-full mt-1" size="lg" onClick={openNetwork}>
                {t('acquaintance.openNetwork')}
              </Button>
            </div>
          ) : accept.isSuccess && (accept.data as any)?.pending ? (
            <div className="flex flex-col items-center gap-2">
              <Clock className="w-10 h-10 text-amber-500" />
              <p className="text-base font-semibold text-amber-600">{t('acquaintance.waitingBadge')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-300">{t('acquaintance.waitingText', { name: invite.inviter.name })}</p>
              <Button className="w-full mt-1" size="lg" onClick={() => navigate('/dashboard')}>
                {t('acquaintance.continue')}
              </Button>
            </div>
          ) : accept.isSuccess ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-base font-semibold text-green-600">{t('invite.success')}</p>
              <Button className="w-full mt-1" size="lg" onClick={() => navigate('/network')}>
                {t('network.title')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Spinner />
              <p className="text-sm text-gray-500 dark:text-gray-300">{t('invite.accepting') || 'Accepting...'}</p>
            </div>
          )}
          {accept.error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                {accept.error.message === 'INVITER_DELETED' ? t('acquaintance.inviteGone')
                  : accept.error.message === 'CONNECTION_LIMIT_SELF' ? t('pending.errLimitSelf')
                  : accept.error.message === 'CONNECTION_LIMIT_OTHER' ? t('pending.errLimitOther')
                  : accept.error.message}
              </p>
              {accept.error.data?.code === 'UNAUTHORIZED' ? (
                <Button
                  className="w-full mt-2"
                  size="lg"
                  onClick={() => {
                    if (token) localStorage.setItem('pendingInviteToken', token);
                    window.location.href = `/login?redirect=/invite/${token}`;
                  }}
                >
                  <LogIn className="w-4 h-4 mr-2" /> {t('invite.loginToAccept')}
                </Button>
              ) : (
                <Button
                  className="w-full mt-2"
                  size="lg"
                  onClick={() => {
                    autoAcceptTriggered.current = false;
                    accept.reset();
                  }}
                >
                  {t('common.retry') || 'Retry'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
