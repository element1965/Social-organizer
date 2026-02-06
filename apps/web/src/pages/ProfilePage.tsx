import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Users, Wallet, Calendar } from 'lucide-react';
import { HandshakePath } from '../components/HandshakePath';
import { SocialIcon } from '../components/ui/social-icons';

export function ProfilePage() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuth((s) => s.userId);
  const isOwn = paramId === myId;

  // Redirect own profile to settings
  useEffect(() => {
    if (isOwn) navigate('/settings', { replace: true });
  }, [isOwn, navigate]);

  const { data: user, isLoading } = trpc.user.getById.useQuery({ userId: paramId! }, { enabled: !!paramId && !isOwn });
  const { data: stats } = trpc.stats.profile.useQuery({ userId: paramId }, { enabled: !!paramId && !isOwn });
  const { data: pathData } = trpc.connection.findPath.useQuery(
    { targetUserId: paramId! },
    { enabled: !isOwn && !!paramId }
  );
  const { data: contacts } = trpc.user.getContacts.useQuery(
    { userId: paramId },
    { enabled: !!paramId && !isOwn }
  );

  if (isOwn) return null;
  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!user) return <div className="p-4 text-center text-gray-500">{t('common.notFound')}</div>;

  const registrationDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col items-center text-center">
        <Avatar src={user.photoUrl} name={user.name} size="lg" className="mb-3" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
        {user.bio && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{user.bio}</p>}
        {user.phone && <p className="text-sm text-gray-500 mt-1">{user.phone}</p>}
        {registrationDate && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{t('profile.memberSince', { date: registrationDate })}</span>
          </div>
        )}
      </div>

      {pathData?.path && pathData.path.length > 1 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-gray-500 mb-2">{t('profile.connectionPath')}</p>
            <HandshakePath path={pathData.path} onUserClick={(id) => navigate(`/profile/${id}`)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-xs text-gray-500">{t('profile.currentCapability')}</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                ${Math.round(user.remainingBudget ?? 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.stats')}</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><p className="text-2xl font-bold text-blue-600">{stats.connectionsCount}</p><p className="text-xs text-gray-500">{t('profile.connections')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-blue-600">{stats.collectionsCreated}</p><p className="text-xs text-gray-500">{t('profile.collectionsCreated')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-green-600">{stats.obligationsGiven}</p><p className="text-xs text-gray-500">{t('profile.intentionsGiven')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-green-600">{stats.totalAmountPledged}</p><p className="text-xs text-gray-500">{t('profile.totalPledged')}</p></div>
            </div>
            {stats.amountByCurrency && Object.keys(stats.amountByCurrency).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 mb-1">{t('profile.pledgedByCurrency')}</p>
                <div className="flex gap-3">
                  {Object.entries(stats.amountByCurrency as Record<string, number>).map(([cur, amt]) => (
                    <span key={cur} className="text-sm font-medium text-gray-900 dark:text-white">{amt} {cur}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {contacts && contacts.filter((c: { value?: string }) => c.value).length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.contacts')}</h2></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {contacts.filter((c: { value?: string }) => c.value).map((contact: { type: string; value: string; icon?: string; label?: string }) => {
                const url = contact.value.startsWith('http') ? contact.value :
                  contact.type === 'telegram' ? `https://t.me/${contact.value.replace('@', '')}` :
                  contact.type === 'email' ? `mailto:${contact.value}` :
                  contact.type === 'whatsapp' ? `https://wa.me/${contact.value.replace(/\D/g, '')}` :
                  contact.value;
                return (
                  <a
                    key={contact.type}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm transition-colors"
                  >
                    <SocialIcon type={contact.icon || contact.type} className="w-4 h-4" />
                    <span className="text-gray-700 dark:text-gray-300">{contact.label || contact.type}</span>
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
