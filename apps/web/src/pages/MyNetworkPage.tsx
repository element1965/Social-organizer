import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Users, Share2, QrCode, Globe, List, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { buildInviteUrl } from '../lib/inviteUrl';
const LazyNetworkGraph = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.NetworkGraph })),
);

export function MyNetworkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useAuth((s) => s.userId);
  const { mode } = useTheme();
  const [showQR, setShowQR] = useState(false);
  const [view, setView] = useState<'list' | '3d'>('list');
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const { data: connections, isLoading } = trpc.connection.list.useQuery(undefined, { refetchInterval: 30000 });
  const { data: connectionCount } = trpc.connection.getCount.useQuery();
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    enabled: view === '3d',
    refetchInterval: 60000,
  });
  const generateInvite = trpc.invite.generate.useMutation();

  const handleShare = async () => {
    const result = await generateInvite.mutateAsync();
    const url = buildInviteUrl(result.token);
    if (navigator.share) { navigator.share({ title: 'Social Organizer', url }); }
    else { navigator.clipboard.writeText(url); }
  };

  const handleQR = async () => {
    if (!generateInvite.data) { await generateInvite.mutateAsync(); }
    setShowQR(!showQR);
  };

  const inviteUrl = generateInvite.data ? buildInviteUrl(generateInvite.data.token) : '';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('network.title')}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setView(view === 'list' ? '3d' : 'list')}>
            {view === 'list' ? <Globe className="w-4 h-4" /> : <List className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare}><Share2 className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={handleQR}><QrCode className="w-4 h-4" /></Button>
        </div>
      </div>

      {connectionCount && (
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-500">{t('network.connections')}</span>
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

      {view === '3d' ? (
        <div className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`} style={{ height: 'calc(100vh - 240px)' }}>
          <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
            {graphData ? (
              <LazyNetworkGraph
                nodes={graphData.nodes.map((n) => ({
                  ...n,
                  isCenter: n.id === myId,
                }))}
                edges={graphData.edges.map((e) => ({ source: e.from, target: e.to }))}
                width={window.innerWidth - 32}
                height={window.innerHeight - 240}
                onNodeClick={(id) => navigate(`/profile/${id}`)}
                darkMode={isDark}
                controlsHint={t('network.controlsHint')}
              />
            ) : (
              <div className="flex justify-center py-12"><Spinner /></div>
            )}
          </Suspense>
        </div>
      ) : (
        <>
          {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : !connections || connections.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500">{t('network.empty')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('network.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {connections.map((conn) => (
                <button key={conn.id} onClick={() => navigate(`/profile/${conn.userId}`)} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Avatar src={conn.photoUrl} name={conn.name} size="md" />
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white text-left">{conn.name}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {conn.connectionCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <Wallet className="w-3 h-3" />
                      ${Math.round(conn.remainingBudget ?? 0)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
