import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { UserPlus, CheckCircle, LogIn, Clock } from 'lucide-react';
import { Logo } from '../components/Logo';

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

  const { data: invite, isLoading, error } = trpc.invite.getByToken.useQuery(
    { token: token! },
    { enabled: !!token },
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
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="py-8 text-center">
          <Logo size={60} className="text-gray-900 dark:text-teal-400 mx-auto mb-4" />
          <Avatar src={invite.inviter.photoUrl} name={invite.inviter.name} size="lg" className="mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            {t('invite.from', { name: invite.inviter.name })}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-300 mb-6">{t('invite.title')}</p>

          {accept.isSuccess && (accept.data as any)?.alreadyConnected ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-lg font-semibold text-green-600">{t('pending.alreadyConnected')}</p>
              <Button className="w-full mt-2" size="lg" onClick={() => navigate('/network')}>
                {t('network.title')}
              </Button>
            </div>
          ) : accept.isSuccess && (accept.data as any)?.pending ? (
            <div className="flex flex-col items-center gap-3">
              <Clock className="w-12 h-12 text-amber-500" />
              <p className="text-lg font-semibold text-amber-600">{t('pending.requestSent')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-300">{t('pending.requestSentDesc')}</p>
              <Button className="w-full mt-2" size="lg" onClick={() => navigate('/dashboard')}>
                {t('dashboard.title')}
              </Button>
            </div>
          ) : accept.isSuccess ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-lg font-semibold text-green-600">{t('invite.success')}</p>
              <Button className="w-full mt-2" size="lg" onClick={() => navigate('/network')}>
                {t('network.title')}
              </Button>
            </div>
          ) : !isRealUser ? (
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                // Clear demo tokens so trpcClient reinitializes with httpBatchLink after login
                if (isDemo) {
                  localStorage.removeItem('accessToken');
                  localStorage.removeItem('refreshToken');
                  localStorage.removeItem('userId');
                }
                window.location.href = `/login?redirect=/invite/${token}`;
              }}
            >
              <LogIn className="w-4 h-4 mr-2" /> {t('invite.loginToAccept')}
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Spinner />
              <p className="text-sm text-gray-500 dark:text-gray-300">{t('invite.accepting') || 'Accepting...'}</p>
            </div>
          )}
          {accept.error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{accept.error.message}</p>
              {accept.error.data?.code === 'UNAUTHORIZED' ? (
                <Button
                  className="w-full mt-3"
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
                  className="w-full mt-3"
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
