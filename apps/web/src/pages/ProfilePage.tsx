import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { ArrowLeft, UserPlus, Ban, Pencil, X } from 'lucide-react';

export function ProfilePage() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuth((s) => s.userId);
  const isOwn = paramId === myId;
  const utils = trpc.useUtils();

  const { data: user, isLoading } = trpc.user.getById.useQuery({ userId: paramId! }, { enabled: !!paramId });
  const { data: stats } = trpc.stats.profile.useQuery({ userId: paramId }, { enabled: !!paramId });
  const { data: connections } = trpc.connection.list.useQuery(undefined, { enabled: isOwn });
  const addConnection = trpc.connection.add.useMutation();
  const addIgnore = trpc.settings.addIgnore.useMutation();
  const updateUser = trpc.user.update.useMutation({
    onSuccess: () => { utils.user.getById.invalidate({ userId: paramId! }); utils.user.me.invalidate(); setEditing(false); },
  });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhone, setEditPhone] = useState('');

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!user) return <div className="p-4 text-center text-gray-500">{t('common.notFound')}</div>;

  const startEditing = () => {
    setEditName(user.name);
    setEditBio(user.bio || '');
    setEditPhone(user.phone || '');
    setEditing(true);
  };

  const handleSave = () => {
    updateUser.mutate({ name: editName, bio: editBio || null, phone: editPhone || null });
  };

  return (
    <div className="p-4 space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </button>

      <div className="flex flex-col items-center text-center">
        <Avatar src={user.photoUrl} name={user.name} size="lg" className="mb-3" />
        {editing ? (
          <div className="w-full max-w-sm space-y-3">
            <Input id="edit-name" label={t('profile.name')} value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input id="edit-bio" label={t('profile.bio')} value={editBio} onChange={(e) => setEditBio(e.target.value)} />
            <Input id="edit-phone" label={t('profile.phone')} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSave} disabled={updateUser.isPending}>{t('profile.save')}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}><X className="w-4 h-4 mr-1" /> {t('common.cancel')}</Button>
            </div>
            {updateUser.error && <p className="text-sm text-red-500">{updateUser.error.message}</p>}
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
            {user.bio && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{user.bio}</p>}
            {user.phone && <p className="text-sm text-gray-500 mt-1">{user.phone}</p>}
            {isOwn && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={startEditing}>
                <Pencil className="w-3 h-3 mr-1" /> {t('profile.edit')}
              </Button>
            )}
          </>
        )}
      </div>

      {!isOwn && (
        <div className="flex gap-2 justify-center">
          <Button size="sm" onClick={() => addConnection.mutate({ userId: paramId! })} disabled={addConnection.isPending}>
            <UserPlus className="w-4 h-4 mr-1" /> {t('profile.addConnection')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addIgnore.mutate({ userId: paramId! })} disabled={addIgnore.isPending}>
            <Ban className="w-4 h-4 mr-1" /> {t('profile.ignore')}
          </Button>
        </div>
      )}
      {addConnection.error && <p className="text-sm text-red-500 text-center">{addConnection.error.message}</p>}

      {stats && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.stats')}</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><p className="text-2xl font-bold text-blue-600">{stats.connectionsCount}</p><p className="text-xs text-gray-500">{t('profile.connections')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-blue-600">{stats.collectionsCreated}</p><p className="text-xs text-gray-500">{t('profile.collectionsCreated')}</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-green-600">{stats.obligationsGiven}</p><p className="text-xs text-gray-500">{t('profile.obligationsGiven')}</p></div>
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

      {isOwn && connections && (
        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.myConnections')} ({connections.length})</h2></CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">{t('profile.noConnections')}</p>
            ) : (
              <div className="space-y-2">
                {connections.map((conn) => (
                  <button key={conn.id} onClick={() => navigate(`/profile/${conn.userId}`)} className="w-full flex items-center gap-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                    <Avatar src={conn.photoUrl} name={conn.name} size="sm" />
                    <span className="text-sm text-gray-900 dark:text-white">{conn.name}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isOwn && <Button variant="outline" className="w-full" onClick={() => navigate('/settings')}>{t('profile.editSettings')}</Button>}
    </div>
  );
}
