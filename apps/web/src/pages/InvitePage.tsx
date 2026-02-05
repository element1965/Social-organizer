import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { UserPlus, CheckCircle, LogIn } from 'lucide-react';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);

  const { data: invite, isLoading, error } = trpc.invite.getByToken.useQuery(
    { token: token! },
    { enabled: !!token },
  );
  const accept = trpc.invite.accept.useMutation();

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">{t('common.notFound')}</p>
            <Button className="mt-4" onClick={() => navigate('/login')}>{t('common.back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.usedById) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">{t('invite.alreadyUsed')}</p>
            <Button className="mt-4" onClick={() => navigate('/')}>{t('common.back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="py-8 text-center">
          <Avatar src={invite.inviter.photoUrl} name={invite.inviter.name} size="lg" className="mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            {t('invite.from', { name: invite.inviter.name })}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t('invite.title')}</p>

          {accept.isSuccess ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-lg font-semibold text-green-600">{t('invite.success')}</p>
              <Button className="w-full mt-2" size="lg" onClick={() => navigate('/network')}>
                {t('network.title')}
              </Button>
            </div>
          ) : !isAuthenticated ? (
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate(`/login?redirect=/invite/${token}`)}
            >
              <LogIn className="w-4 h-4 mr-2" /> {t('invite.loginToAccept')}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                size="lg"
                onClick={() => accept.mutate({ token: token! })}
                disabled={accept.isPending}
              >
                {accept.isPending ? (
                  <Spinner />
                ) : (
                  <><UserPlus className="w-4 h-4 mr-2" /> {t('invite.accept')}</>
                )}
              </Button>
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={() => navigate('/')}
              >
                {t('invite.decline')}
              </Button>
            </div>
          )}
          {accept.error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{accept.error.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
