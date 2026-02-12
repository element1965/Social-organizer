import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Wallet, Calendar, Pencil, Check, X, UserPlus, UserMinus } from 'lucide-react';
import { HandshakePath } from '../components/HandshakePath';
import { SocialIcon } from '../components/ui/social-icons';
import { buildContactUrl } from '@so/shared';

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
  const { data: nicknameData } = trpc.connection.getNickname.useQuery(
    { targetUserId: paramId! },
    { enabled: !!paramId && !isOwn }
  );
  const utils = trpc.useUtils();
  const setNicknameMut = trpc.connection.setNickname.useMutation({
    onSuccess: () => {
      utils.connection.getNickname.invalidate({ targetUserId: paramId! });
      utils.connection.list.invalidate();
    },
  });

  const isIndirect = !isOwn && !!paramId && pathData?.path && pathData.path.length >= 3 && nicknameData?.isConnected === false;
  const { data: directStatus } = trpc.pending.directStatus.useQuery(
    { targetUserId: paramId! },
    { enabled: !!isIndirect }
  );
  const sendDirectMut = trpc.pending.sendDirectRequest.useMutation({
    onSuccess: () => utils.pending.directStatus.invalidate({ targetUserId: paramId! }),
  });
  const revokeMut = trpc.connection.revoke.useMutation({
    onSuccess: () => {
      utils.connection.getNickname.invalidate({ targetUserId: paramId! });
      utils.connection.findPath.invalidate({ targetUserId: paramId! });
      utils.connection.getNetworkStats.invalidate();
      utils.connection.getCount.invalidate();
      utils.pending.incoming.invalidate();
    },
  });

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');

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
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
          {nicknameData?.isConnected && !editingNickname && (
            <button
              onClick={() => { setNicknameInput(nicknameData.nickname || ''); setEditingNickname(true); }}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        {editingNickname && (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              autoFocus
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setNicknameMut.mutate({ targetUserId: paramId!, nickname: nicknameInput }); setEditingNickname(false); }
                if (e.key === 'Escape') setEditingNickname(false);
              }}
              placeholder={t('profile.nicknamePlaceholder')}
              className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
            <button onClick={() => { setNicknameMut.mutate({ targetUserId: paramId!, nickname: nicknameInput }); setEditingNickname(false); }} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <Check className="w-4 h-4 text-green-500" />
            </button>
            <button onClick={() => setEditingNickname(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
        {!editingNickname && nicknameData?.nickname && (
          <p className="text-xs text-gray-400 mt-0.5">{nicknameData.nickname}</p>
        )}
        {user.bio && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{user.bio}</p>}
        {user.phone && <p className="text-sm text-gray-500 mt-1">{user.phone}</p>}
        {registrationDate && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{t('profile.memberSince', { date: registrationDate })}</span>
          </div>
        )}
        {(() => {
          if (!user.lastSeen) return null;
          const lastSeenDate = new Date(user.lastSeen);
          const diffMs = Date.now() - lastSeenDate.getTime();
          const isOnline = diffMs < 5 * 60 * 1000;
          if (isOnline) {
            return (
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-green-600 dark:text-green-400">{t('profile.online')}</span>
              </div>
            );
          }
          const diffSec = Math.floor(diffMs / 1000);
          const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
          let relativeTime: string;
          if (diffSec < 3600) relativeTime = rtf.format(-Math.floor(diffSec / 60), 'minute');
          else if (diffSec < 86400) relativeTime = rtf.format(-Math.floor(diffSec / 3600), 'hour');
          else relativeTime = rtf.format(-Math.floor(diffSec / 86400), 'day');
          return (
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-gray-400">{t('profile.lastSeen', { time: relativeTime })}</span>
            </div>
          );
        })()}
      </div>

      {contacts && contacts.filter((c: { value?: string }) => c.value).length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.contacts')}</h2></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {contacts.filter((c: { value?: string }) => c.value).map((contact: { type: string; value: string; icon?: string; label?: string }) => {
                const url = buildContactUrl(contact.type, contact.value);
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

      {pathData?.path && pathData.path.length > 1 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-gray-500 mb-2">{t('profile.connectionPath')}</p>
            <HandshakePath path={pathData.path} onUserClick={(id) => navigate(`/profile/${id}`)} />
          </CardContent>
        </Card>
      )}

      {isIndirect && directStatus && (
        <Card>
          <CardContent className="py-3">
            {directStatus.status === 'none' ? (
              <button
                onClick={() => sendDirectMut.mutate({ targetUserId: paramId! })}
                disabled={sendDirectMut.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors"
              >
                <UserPlus className="w-4.5 h-4.5" />
                {t('profile.addDirect')}
              </button>
            ) : directStatus.status === 'pending' ? (
              <p className="text-center text-sm text-gray-500">{t('profile.directRequestSent')}</p>
            ) : null}
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

      {nicknameData?.isConnected && (
        <button
          onClick={() => {
            if (window.confirm(t('profile.revokeConfirm'))) {
              revokeMut.mutate({ targetUserId: paramId! });
            }
          }}
          disabled={revokeMut.isPending}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <UserMinus className="w-3.5 h-3.5" />
          {t('profile.revokeHandshake')}
        </button>
      )}
    </div>
  );
}
