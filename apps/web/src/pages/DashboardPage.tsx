import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '../lib/trpc';
import { buildInviteUrl, buildWebInviteUrl, buildBotInviteUrl } from '../lib/inviteUrl';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import {
  Users,
  ArrowRight,
  UserPlus,
  AlertTriangle,
  TrendingUp,
  Network,
  HandHeart,
  Wallet,
  Copy,
  Check,
  X,
  HelpCircle,
  Pencil,
  Clock,
  CheckCircle,
  XCircle,
  Layers,
} from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { SocialIcon } from '../components/ui/social-icons';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);

  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [showTgChatPopup, setShowTgChatPopup] = useState(false);

  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: networkStats, isLoading: networkLoading } = trpc.connection.getNetworkStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: notifications } = trpc.notification.list.useQuery({ limit: 10 }, { refetchInterval: 30000 });
  const { data: helpStats } = trpc.stats.help.useQuery(undefined, { refetchInterval: 60000 });
  const { data: helpByPeriod } = trpc.stats.helpGivenByPeriod.useQuery(undefined, { refetchInterval: 60000 });
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isAdmin = adminData?.isAdmin ?? false;
  const { data: networkCapabilities } = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60000 });
  const { data: platformGrowth } = trpc.stats.platformGrowth.useQuery(undefined, { refetchInterval: 15000 });
  const inviteToken = me?.referralSlug || userId || '';
  const permanentInviteUrl = inviteToken ? buildInviteUrl(inviteToken) : '';
  const webInviteUrl = inviteToken ? buildWebInviteUrl(inviteToken) : '';
  const botInviteUrl = inviteToken ? buildBotInviteUrl(inviteToken) : '';
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedBot, setCopiedBot] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugValue, setSlugValue] = useState('');
  const [slugError, setSlugError] = useState('');
  const updateSlug = trpc.user.updateReferralSlug.useMutation({
    onSuccess: () => { utils.user.me.invalidate(); setEditingSlug(false); setSlugError(''); },
    onError: (err) => setSlugError(err.message),
  });
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudgetValue, setNewBudgetValue] = useState('');
  const setBudgetMutation = trpc.user.setMonthlyBudget.useMutation({
    onSuccess: () => { utils.user.me.invalidate(); setEditingBudget(false); setNewBudgetValue(''); },
  });

  // Pending connections
  const { data: pendingIncoming } = trpc.pending.incoming.useQuery(undefined, { refetchInterval: 15000 });
  const { data: myPending } = trpc.pending.myPending.useQuery(undefined, { refetchInterval: 30000 });
  const { data: clusters } = trpc.cluster.list.useQuery(undefined, { enabled: isAdmin, refetchInterval: 60000 });
  const acceptPending = trpc.pending.accept.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); utils.connection.getNetworkStats.invalidate(); },
  });
  const rejectPending = trpc.pending.reject.useMutation({
    onSuccess: () => { utils.pending.incoming.invalidate(); utils.pending.incomingCount.invalidate(); },
  });

  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};
  // Filter emergency notifications (unread, only for active collections)
  const emergencyNotifications = notifications?.items?.filter(
    (n) => n.type === 'NEW_COLLECTION' && n.status === 'UNREAD' && n.collection?.type === 'EMERGENCY' && n.collection?.status === 'ACTIVE'
  ) ?? [];


  return (
    <div className="p-4 pt-2 space-y-4 relative">
      {/* 3D cloud background */}
      <div className="absolute inset-0 -z-10 opacity-30 pointer-events-none" style={{ height: 300 }}>
        <Suspense fallback={null}>
          <LazyCloudBackground particleCount={200} />
        </Suspense>
      </div>

      {/* Header with profile */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-gray-800 shadow-lg">
            {me?.photoUrl ? (
              <img src={me.photoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-lg font-bold text-white">{me?.name?.[0]}</span>
            )}
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{me?.name}</p>
            <p className="text-xs text-gray-500">{t('settings.title')}</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTgChatPopup(true)}
            className="w-10 h-10 rounded-full bg-[#26A5E4] hover:bg-[#1d8cc4] flex items-center justify-center transition-colors shadow-lg"
            title={t('dashboard.communityChat')}
          >
            <SocialIcon type="telegram" className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => { setCopiedWeb(false); setShowInvitePopup(true); }}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors shadow-lg"
          >
            <UserPlus className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Emergency notifications */}
      {emergencyNotifications.length > 0 && (
        <Card className="border-red-500 dark:border-red-700 bg-red-50 dark:bg-red-950/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-700 dark:text-red-400">
                {t('dashboard.emergencyAlerts')} ({emergencyNotifications.length})
              </span>
            </div>
            <div className="space-y-2">
              {emergencyNotifications.slice(0, 3).map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => navigate(`/collection/${notif.collectionId}`)}
                  className="w-full text-left p-2 rounded bg-white/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-900"
                >
                  <div className="flex items-center gap-2">
                    <Avatar src={notif.collection?.creator?.photoUrl} name={notif.collection?.creator?.name || '?'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {notif.collection?.creator?.name}
                        </p>
                        <span className="flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
                          <Users className="w-3 h-3" />
                          {(notif.collection?.creator as any)?.connectionCount ?? 0}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 shrink-0">
                          <Wallet className="w-3 h-3" />
                          ${Math.round((notif.collection?.creator as any)?.remainingBudget ?? 0)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {notif.collection?.amount} {notif.collection?.currency}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Incoming pending connections */}
      {pendingIncoming && pendingIncoming.length > 0 && (
        <Card className="border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                {t('pending.incoming')} ({pendingIncoming.length})
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">{t('pending.meetInPerson')}</p>
            <div className="space-y-2">
              {pendingIncoming.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded bg-white/50 dark:bg-gray-900/50">
                  <Avatar src={p.fromUser.photoUrl} name={p.fromUser.name} size="sm" />
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">{p.fromUser.name}</span>
                  <button
                    onClick={() => acceptPending.mutate({ pendingId: p.id })}
                    disabled={acceptPending.isPending}
                    className="p-1.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 hover:bg-green-200 dark:hover:bg-green-800"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => rejectPending.mutate({ pendingId: p.id })}
                    disabled={rejectPending.isPending}
                    className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-500 hover:bg-red-200 dark:hover:bg-red-800"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My outgoing pending */}
      {myPending && myPending.length > 0 && (
        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">{t('pending.waitingApproval')}</span>
            </div>
            <div className="space-y-1">
              {myPending.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Avatar src={p.toUser.photoUrl} name={p.toUser.name} size="xs" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{p.toUser.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gate: need at least 1 connection (only show after data loaded) */}
      {!networkLoading && networkStats && Object.values(byDepth).reduce((a, b) => a + (b as number), 0) === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <UserPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.addFirstConnection')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('dashboard.addFirstConnectionDesc')}
            </p>
            <Button className="w-full" size="lg" onClick={() => navigate('/network')}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('dashboard.goToNetwork')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* TG community chat popup */}
      {showTgChatPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTgChatPopup(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#26A5E4] flex items-center justify-center">
                  <SocialIcon type="telegram" className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.communityChat')}</h3>
              </div>
              <button onClick={() => setShowTgChatPopup(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('dashboard.communityChatDesc')}</p>
            <a
              href="https://t.me/+729vJwVZ5ltlMWRk"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 bg-[#26A5E4] hover:bg-[#1d8cc4] text-white rounded-xl font-medium text-sm text-center transition-colors"
              onClick={() => setShowTgChatPopup(false)}
            >
              {t('dashboard.communityChatOpen')}
            </a>
          </div>
        </div>
      )}

      {/* Invite popup */}
      {showInvitePopup && permanentInviteUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowInvitePopup(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('network.invite')}</h3>
              <button onClick={() => setShowInvitePopup(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-xl">
                <QRCodeSVG value={webInviteUrl} size={200} level="H" imageSettings={{ src: '/logo-dark.png', width: 48, height: 34, excavate: true }} />
              </div>
            </div>
            <div className="space-y-2">
              {/* Web link */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">{t('invite.webLinkDesc')}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(webInviteUrl);
                    setCopiedWeb(true);
                    setTimeout(() => setCopiedWeb(false), 2000);
                  }}
                  className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-base shrink-0">🌐</span>
                  <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{webInviteUrl}</p>
                  <div className="shrink-0">
                    {copiedWeb ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
                  </div>
                </button>
              </div>
              {/* Bot link */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">{t('invite.botLinkDesc')}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(botInviteUrl);
                    setCopiedBot(true);
                    setTimeout(() => setCopiedBot(false), 2000);
                  }}
                  className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-base shrink-0">🤖</span>
                  <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{botInviteUrl}</p>
                  <div className="shrink-0">
                    {copiedBot ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Editable slug — moved to bottom */}
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-500">{t('invite.yourCode')}</span>
                {!editingSlug && (
                  <button onClick={() => { setSlugValue(me?.referralSlug || ''); setSlugError(''); setEditingSlug(true); }} className="text-gray-400 hover:text-gray-500">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {editingSlug ? (
                <div>
                  <div className="flex gap-2">
                    <input
                      value={slugValue}
                      onChange={(e) => { setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')); setSlugError(''); }}
                      placeholder={t('invite.slugPlaceholder')}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                      maxLength={30}
                      autoFocus
                    />
                    <button
                      onClick={() => { if (slugValue.length >= 3) updateSlug.mutate({ slug: slugValue }); else setSlugError(t('invite.slugMin')); }}
                      disabled={updateSlug.isPending}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingSlug(false)} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{t('invite.slugHint')}</p>
                  {slugError && <p className="text-[10px] text-red-500 mt-1">{slugError}</p>}
                </div>
              ) : (
                <p className="text-sm font-mono text-blue-600 dark:text-blue-400">{me?.referralSlug || userId}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">{t('invite.slugDesc')}</p>
            </div>
          </div>
        </div>
      )}

      <Card>
          <CardContent className="py-4 space-y-4">
            {/* Total network summary with growth */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-gray-500">{t('dashboard.totalNetwork')}</p>
                  <p className="text-4xl font-bold text-gray-900 dark:text-white">{totalReachable}</p>
                </div>
                {/* Sparkline chart */}
                {platformGrowth && platformGrowth.points?.length > 1 && (() => {
                  const values = platformGrowth.points.map((p: { count: number }) => p.count);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min || 1;
                  const w = 120;
                  const h = 40;
                  const pad = 2;
                  const points = values.map((v, i) => {
                    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
                    const y = h - pad - ((v - min) / range) * (h - pad * 2);
                    return `${x},${y}`;
                  });
                  const fillPoints = [`${pad},${h - pad}`, ...points, `${w - pad},${h - pad}`];
                  return (
                    <svg width={w} height={h} className="shrink-0">
                      <defs>
                        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      <polygon points={fillPoints.join(' ')} fill="url(#sparkFill)" />
                      <polyline
                        points={points.join(' ')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })()}
              </div>
              {/* Day counter since registration (Kyiv timezone) */}
              {me?.createdAt && (() => {
                const kyivNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
                const kyivReg = new Date(new Date(me.createdAt).toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
                const today = new Date(kyivNow.getFullYear(), kyivNow.getMonth(), kyivNow.getDate());
                const regDay = new Date(kyivReg.getFullYear(), kyivReg.getMonth(), kyivReg.getDate());
                const dayCount = Math.floor((today.getTime() - regDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
                return (
                  <div className="flex items-center gap-1 pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs font-medium text-green-600">
                      {t('dashboard.dayCount', { count: dayCount })}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Capabilities: Network + My */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-gradient-to-b from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl">
                <div className="flex items-center gap-1.5 mb-2">
                  <Network className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-gray-500">{t('dashboard.currentCapabilities')}</span>
                  <Tooltip content={t('dashboard.networkCapabilitiesHint')} side="bottom">
                    <button type="button" className="text-gray-400 hover:text-gray-500"><HelpCircle className="w-3.5 h-3.5" /></button>
                  </Tooltip>
                </div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  ${networkCapabilities?.total ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('dashboard.capabilitiesContributors', { count: networkCapabilities?.contributors ?? 0 })}
                </p>
              </div>
              <div className="p-4 bg-gradient-to-b from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl">
                <div className="flex items-center gap-1.5 mb-2">
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-gray-500">{t('dashboard.yourContribution')}</span>
                  <Tooltip content={t('dashboard.myCapabilitiesHint')} side="bottom">
                    <button type="button" className="text-gray-400 hover:text-gray-500"><HelpCircle className="w-3.5 h-3.5" /></button>
                  </Tooltip>
                </div>
                {editingBudget ? (
                  <div className="relative mt-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <input
                      type="number"
                      value={newBudgetValue}
                      onChange={(e) => setNewBudgetValue(e.target.value)}
                      placeholder={me?.monthlyBudget != null ? String(Math.round(me.monthlyBudget)) : '0'}
                      className="w-full pl-5 pr-8 py-1.5 text-sm font-bold rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 focus:outline-none focus:border-blue-500"
                      autoFocus
                      min={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newBudgetValue && Number(newBudgetValue) >= 0) {
                          setBudgetMutation.mutate({ amount: Number(newBudgetValue), inputCurrency: 'USD' });
                        }
                        if (e.key === 'Escape') setEditingBudget(false);
                      }}
                    />
                    {newBudgetValue && Number(newBudgetValue) >= 0 && (
                      <button
                        onClick={() => setBudgetMutation.mutate({ amount: Number(newBudgetValue), inputCurrency: 'USD' })}
                        disabled={setBudgetMutation.isPending}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 hover:text-green-400"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                      {me?.remainingBudget != null && me.monthlyBudget != null
                        ? `$${Math.round(me.remainingBudget)} / $${Math.round(me.monthlyBudget)}`
                        : '$0'}
                    </p>
                    <button
                      onClick={() => { setNewBudgetValue(''); setEditingBudget(true); }}
                      className="text-gray-400 hover:text-gray-300 mt-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Budget depleted hint */}
            {me?.monthlyBudget != null && me.remainingBudget != null && me.remainingBudget <= 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
                  {t('dashboard.budgetDepletedHint')}
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
                  {t('dashboard.updateBudget')}
                </Button>
              </div>
            )}

            {/* Help statistics — compact */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left: Help given by period */}
              <div className="p-3 bg-gradient-to-b from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-xl flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                  <HandHeart className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-[10px] text-gray-500">{t('dashboard.helpGivenByPeriod')}</span>
                </div>
                <p className="text-xl font-bold text-orange-700 dark:text-orange-400 leading-tight">
                  {helpByPeriod?.allTime?.count ?? 0}
                  <span className="text-[10px] font-normal text-gray-400 ml-1">{t('dashboard.times')}</span>
                </p>
                <p className="text-xs font-semibold text-orange-600/70 dark:text-orange-400/70">
                  ${helpByPeriod?.allTime?.amount ?? 0}
                </p>
                {(() => {
                  const months = ((helpByPeriod as any)?.months ?? []).slice(-5);
                  if (months.length === 0) return null;
                  const maxAmt = Math.max(...months.map((m: any) => m.amount), 1);
                  return (
                    <div className="flex items-end gap-1 mt-1.5 h-5">
                      {months.map((m: any, i: number) => (
                        <div key={i} className="flex-1">
                          <div
                            className="w-full rounded-sm bg-orange-300 dark:bg-orange-600/60"
                            style={{ height: `${Math.max((m.amount / maxAmt) * 100, 12)}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Right: Support statistics — dual semi-donut */}
              <div className="p-3 bg-gradient-to-b from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-xl flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="w-3.5 h-3.5 text-violet-600" />
                  <span className="text-[10px] text-gray-500">{t('dashboard.helpStats')}</span>
                </div>
                {(() => {
                  const given = helpStats?.given?.count ?? 0;
                  const received = helpStats?.received?.count ?? 0;
                  const givenAmt = helpStats?.given?.totalAmount ?? 0;
                  const receivedAmt = helpStats?.received?.totalAmount ?? 0;
                  const total = given + received || 1;
                  const sz = 72;
                  const sw = 7;
                  const r = (sz - sw) / 2;
                  const circ = Math.PI * r;
                  const givenLen = (given / total) * circ;
                  const receivedLen = (received / total) * circ;
                  const arcPath = `M ${sw / 2} ${sz / 2} A ${r} ${r} 0 0 1 ${sz - sw / 2} ${sz / 2}`;
                  return (
                    <div className="flex flex-col items-center flex-1 justify-center">
                      <svg width={sz} height={sz / 2 + sw} className="overflow-visible">
                        <path d={arcPath} fill="none" stroke="#e5e7eb" strokeWidth={sw} className="dark:stroke-gray-700" />
                        {given > 0 && (
                          <path d={arcPath} fill="none" stroke="#10b981" strokeWidth={sw}
                            strokeDasharray={`${givenLen} ${circ}`} />
                        )}
                        {received > 0 && (
                          <path d={arcPath} fill="none" stroke="#3b82f6" strokeWidth={sw}
                            strokeDasharray={`${receivedLen} ${circ}`}
                            strokeDashoffset={`${-givenLen}`} />
                        )}
                      </svg>
                      <div className="flex justify-around w-full -mt-1">
                        <div className="text-center">
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{given}</p>
                          <p className="text-[10px] text-gray-400">${givenAmt}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-base font-bold text-blue-600 dark:text-blue-400">{received}</p>
                          <p className="text-[10px] text-gray-400">${receivedAmt}</p>
                        </div>
                      </div>
                      <div className="flex justify-around w-full">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[10px] text-gray-400">{t('dashboard.helpGiven')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-[10px] text-gray-400">{t('dashboard.helpReceived')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Invite trusted person */}
            <button
              onClick={() => { setCopiedWeb(false); setShowInvitePopup(true); }}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:from-blue-500 hover:to-indigo-500 transition-all shadow-md"
            >
              <UserPlus className="w-4 h-4" />
              {t('dashboard.inviteTrusted')}
            </button>

          </CardContent>
        </Card>

      {/* Clusters (admin only) */}
      {isAdmin && clusters && clusters.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-600" />
                <h2 className="font-semibold text-gray-900 dark:text-white">{t('cluster.title')}</h2>
              </div>
              <span className="text-sm text-gray-500">
                {clusters.reduce((sum, cl) => sum + cl.memberCount, 0)} {t('dashboard.people')}
              </span>
            </div>
            <div className="space-y-2">
              {clusters.map((cl, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => navigate(`/profile/${cl.rootUserId}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{cl.rootUserName}</p>
                    <p className="text-xs text-gray-500">{t('cluster.members')}: {cl.memberCount}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">${cl.totalBudget}</p>
                    <p className="text-[10px] text-gray-400">{t('cluster.budget')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
