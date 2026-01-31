import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Users, Share2, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export function MyNetworkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showQR, setShowQR] = useState(false);

  const { data: connections, isLoading } = trpc.connection.list.useQuery(undefined, { refetchInterval: 30000 });
  const { data: connectionCount } = trpc.connection.getCount.useQuery();
  const generateInvite = trpc.invite.generate.useMutation();

  const handleShare = async () => {
    const result = await generateInvite.mutateAsync();
    const url = `${window.location.origin}/invite/${result.token}`;
    if (navigator.share) { navigator.share({ title: 'Social Organizer', url }); }
    else { navigator.clipboard.writeText(url); }
  };

  const handleQR = async () => {
    if (!generateInvite.data) { await generateInvite.mutateAsync(); }
    setShowQR(!showQR);
  };

  const inviteUrl = generateInvite.data ? `${window.location.origin}/invite/${generateInvite.data.token}` : '';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('network.title', 'Моя сеть')}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}><Share2 className="w-4 h-4 mr-1" /> {t('network.invite', 'Пригласить')}</Button>
          <Button variant="outline" size="sm" onClick={handleQR}><QrCode className="w-4 h-4" /></Button>
        </div>
      </div>

      {connectionCount && (
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-500">{t('network.connections', 'Связей')}</span>
            <span className="font-medium text-gray-900 dark:text-white">{connectionCount.count} / {connectionCount.max}</span>
          </div>
          <Progress value={connectionCount.count} max={connectionCount.max} />
        </div>
      )}

      {showQR && inviteUrl && (
        <Card><CardContent className="flex flex-col items-center py-4">
          <QRCodeSVG value={inviteUrl} size={200} className="rounded-lg" />
          <p className="text-xs text-gray-500 mt-2 break-all text-center">{inviteUrl}</p>
        </CardContent></Card>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : !connections || connections.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-500">{t('network.empty', 'Нет связей')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('network.emptyHint', 'Пригласите первого человека')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {connections.map((conn) => (
            <button key={conn.id} onClick={() => navigate(`/profile/${conn.userId}`)} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Avatar src={conn.photoUrl} name={conn.name} size="md" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{conn.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
