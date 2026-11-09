import { lazy, Suspense, useState, useEffect } from 'react';
import { AcquaintanceCard } from '../components/AcquaintanceCard';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { VideoGuide } from '../components/VideoGuide';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  UserPlus,
  TrendingUp,
  X,
  HelpCircle,
  Share2,
} from 'lucide-react';
import { SocialIcon } from '../components/ui/social-icons';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showTgChatPopup, setShowTgChatPopup] = useState(false);

  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: networkStats, isLoading: networkLoading } = useCachedNetworkStats();
  const { data: networkCapabilities } = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60000 });
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const { data: intro } = trpc.pending.introStatus.useQuery(undefined, { refetchInterval: 15000 });
  const introState = intro?.state;


  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};

  useEffect(() => {
    if (location.hash === '#invite') navigate('/add');
  }, [location.hash, navigate]);

  return (
    <div className="px-4 pt-2 pb-4 flex flex-col gap-4 relative">
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
            <p className="text-xs text-gray-500 dark:text-gray-300">{t('settings.title')}</p>
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
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-help-menu'))}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors shadow-lg"
          >
            <HelpCircle className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* First acquaintance: who invited me and the exact request state */}
      <AcquaintanceCard onInvite={() => navigate('/add')} />

      {/* Gate: need at least 1 connection — personal link / QR when there is no invite in progress */}
      {!networkLoading && networkStats && (introState === 'none' || introState === undefined)
        && Object.values(byDepth).reduce((a, b) => a + (b as number), 0) === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <UserPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('dashboard.addFirstConnection')}
            </h2>
            <Button className="w-full" size="lg" onClick={() => navigate('/add')}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('create.goToInvite')}
            </Button>
            <VideoGuide video="app-start" label="title" className="mt-4" />
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
                <X className="w-5 h-5 text-gray-500 dark:text-gray-300" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{t('dashboard.communityChatDesc')}</p>
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

      {/* Day count badge — admin only */}
      {adminData?.isAdmin && me?.createdAt && (() => {
        const kyivNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
        const kyivReg = new Date(new Date(me.createdAt).toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
        const today = new Date(kyivNow.getFullYear(), kyivNow.getMonth(), kyivNow.getDate());
        const regDay = new Date(kyivReg.getFullYear(), kyivReg.getMonth(), kyivReg.getDate());
        const dayCount = Math.floor((today.getTime() - regDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        return (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-600">{t('dashboard.dayCount', { count: dayCount })}</span>
            </span>
          </div>
        );
      })()}

      {/* Cards row: Network + Potential side by side */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className="bg-gradient-to-b from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all"
          onClick={() => navigate('/network?view=list')}
        >
          <CardContent className="py-4 text-center">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.wholeNetwork')}</span>
            <p className="font-bold text-gray-900 dark:text-white mt-1" style={{ fontSize: 'clamp(1.5rem, 8vw, 2.25rem)' }}>
              {totalReachable?.toLocaleString()}
            </p>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{t('dashboard.networkSubtitle')}</span>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-b from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
          <CardContent className="py-4 text-center">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.networkCapabilitiesTitle')}</span>
            <p className="font-bold text-green-600 dark:text-green-400 mt-1" style={{ fontSize: 'clamp(1.5rem, 8vw, 2.25rem)' }}>
              ${(networkCapabilities?.total ?? 0).toLocaleString()}
            </p>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{t('dashboard.potentialSubtitle')}</span>
          </CardContent>
        </Card>
      </div>

      {/* My Network (left) | QR code (right) — same height */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        <div className="flex flex-col gap-2">
          <Card className="flex-1 bg-gradient-to-b from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <CardContent className="h-full flex flex-col items-center justify-center py-3 gap-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400">
                {t('dashboard.myNetwork')}
              </span>
              <p className={`font-bold leading-none ${(byDepth[1] ?? 0) >= 30 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'}`} style={{ fontSize: 'clamp(2rem, 10vw, 3rem)' }}>
                {byDepth[1] ?? 0}
              </p>
            </CardContent>
          </Card>
          <button
            onClick={() => navigate('/add')}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm"
          >
            <Share2 className="w-4 h-4" />
            {t('dashboard.inviteTrusted')}
          </button>
        </div>
      </div>


    </div>
  );
}
