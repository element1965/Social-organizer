import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const isDemo = localStorage.getItem('accessToken') === 'demo-token';
  const isRealUser = isAuthenticated && !isDemo;
  const autoAcceptTriggered = useRef(false);

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
    return <LandingPage inviteToken={token} />;
  }

  const { data: invite, isLoading, error } = trpc.invite.getByToken.useQuery(
    { token: token! },
    { enabled: !!token && !meError },
  );
  const accept = trpc.invite.accept.useMutation({
    onSuccess: () => {
      localStorage.removeItem('pendingInviteToken');
    },
    onError: (err) => {
      // If token is invalid/expired, clear auth state so user sees login button
      if (err.data?.code === 'UNAUTHORIZED') {
        logout();
      }
    },
  });

  // Auto-accept invite when authenticated user lands on this page
  useEffect(() => {
    if (
      isRealUser &&
      invite &&
      !invite.usedById &&
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
  }, [isRealUser, invite, accept.isPending, accept.isSuccess, accept.error, token]);

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-300">{t('common.notFound')}</p>
            <Button className="mt-4" onClick={() => navigate('/login')}>{t('common.back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.usedById && !accept.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-300">{t('invite.alreadyUsed')}</p>
            <Button className="mt-4" onClick={() => navigate('/dashboard')}>{t('common.back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-6" style={{ minHeight: '100vh', minHeight: '100dvh', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <Card className="w-full max-w-sm">
        <CardContent className="py-5 text-center">
          <Logo size={48} className="text-gray-900 dark:text-teal-400 mx-auto mb-3" />
          <Avatar src={invite.inviter.photoUrl} name={invite.inviter.name} size="lg" className="mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            {t('invite.from', {
              name: invite.inviter.name,
              count: (invite as any).networkCount ?? 0,
              amount: (invite as any).totalIntentions ?? 0,
            })}
          </h2>

          {accept.isSuccess && (accept.data as any)?.alreadyConnected ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-base font-semibold text-green-600">{t('pending.alreadyConnected')}</p>
              <Button className="w-full mt-1" size="lg" onClick={() => navigate('/network')}>
                {t('network.title')}
              </Button>
            </div>
          ) : accept.isSuccess && (accept.data as any)?.pending ? (
            <div className="flex flex-col items-center gap-2">
              <Clock className="w-10 h-10 text-amber-500" />
              <p className="text-base font-semibold text-amber-600">{t('pending.requestSent')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-300">{t('pending.requestSentDesc', { name: invite.inviter.name })}</p>
              <Button className="w-full mt-1" size="lg" onClick={() => navigate('/dashboard')}>
                {t('dashboard.title')}
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
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{accept.error.message}</p>
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
