import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { InviteBlock } from '../components/InviteBlock';
import { PeriodPicker, PeriodChip } from '../components/PeriodPicker';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  UserPlus,
  TrendingUp,
  Wallet,
  Check,
  X,
  HelpCircle,
  Pencil,
  Globe,
  Sparkles,
} from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { SocialIcon } from '../components/ui/social-icons';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showTgChatPopup, setShowTgChatPopup] = useState(false);

  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: networkStats, isLoading: networkLoading } = trpc.connection.getNetworkStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: networkCapabilities } = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60000 });

  // Period pickers state (default: today)
  const [networkDays, setNetworkDays] = useState(1);
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [capDays, setCapDays] = useState(1);
  const [showCapPicker, setShowCapPicker] = useState(false);

  const { data: networkByPeriod } = trpc.stats.byPeriod.useQuery(
    { days: networkDays },
    { enabled: networkDays > 0, refetchInterval: 60000 },
  );
  const { data: capByPeriod } = trpc.stats.byPeriod.useQuery(
    { days: capDays },
    { enabled: capDays > 0, refetchInterval: 60000 },
  );

  // Budget editing
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudgetValue, setNewBudgetValue] = useState('');
  const setBudgetMutation = trpc.user.setMonthlyBudget.useMutation({
    onSuccess: () => { utils.user.me.invalidate(); setEditingBudget(false); setNewBudgetValue(''); },
  });

  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};

  useEffect(() => {
    if (location.hash === '#invite') {
      setTimeout(() => document.getElementById('invite')?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, []);

  // Period data helpers
  const networkNewConn = networkDays === 0
    ? null
    : networkByPeriod?.newPeople ?? null;

  const capPeriodTotal = capDays === 0
    ? null
    : capByPeriod?.newBudget ?? null;

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

      {/* Gate: need at least 1 connection (only show after data loaded) */}
      {!networkLoading && networkStats && Object.values(byDepth).reduce((a, b) => a + (b as number), 0) === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <UserPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.addFirstConnection')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300 mb-4">
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

      {/* Card 1: "Вся сеть" — Whole network */}
      <Card>
        <CardContent className="py-4">
          {/* Day count centered above */}
          {me?.createdAt && (() => {
            const kyivNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
            const kyivReg = new Date(new Date(me.createdAt).toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
            const today = new Date(kyivNow.getFullYear(), kyivNow.getMonth(), kyivNow.getDate());
            const regDay = new Date(kyivReg.getFullYear(), kyivReg.getMonth(), kyivReg.getDate());
            const dayCount = Math.floor((today.getTime() - regDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
            return (
              <div className="flex items-center justify-center gap-1 mb-2">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-xs font-medium text-green-600">{t('dashboard.dayCount', { count: dayCount })}</span>
              </div>
            );
          })()}
          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-gray-500 dark:text-gray-300">{t('dashboard.wholeNetwork')}</span>
              <div className="ml-auto">
                <PeriodChip days={networkDays} onClick={() => setShowNetworkPicker(true)} />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {totalReachable} <span className="text-sm font-normal text-gray-500 dark:text-gray-300">{t('dashboard.people')}</span>
              </p>
              {networkNewConn != null && (
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {t('dashboard.newConnections', { count: networkNewConn })}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: "Возможности сети" — Network capabilities */}
      <Card>
        <CardContent className="py-4">
          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-4 h-4 text-green-600" />
              <span className="text-xs text-gray-500 dark:text-gray-300">{t('dashboard.networkCapabilitiesTitle')}</span>
              <div className="ml-auto">
                <PeriodChip days={capDays} onClick={() => setShowCapPicker(true)} />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                ${networkCapabilities?.total ?? 0}
                {networkCapabilities?.contributors != null && networkCapabilities.contributors > 0 && (
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-300"> {t('dashboard.capabilitiesContributors', { count: networkCapabilities.contributors })}</span>
                )}
              </p>
              {capPeriodTotal != null && (
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  +${capPeriodTotal}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Invite (flip card) */}
      <InviteBlock id="invite" />

      {/* Card 4: "Мои возможности" — My capabilities / budget */}
      <Card>
        <CardContent className="py-4">
          <div className="p-4 bg-gradient-to-b from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-gray-500 dark:text-gray-300">{t('dashboard.yourContribution')}</span>
              <Tooltip content={t('dashboard.myCapabilitiesHint')} side="bottom">
                <button type="button" className="text-gray-400 hover:text-gray-500 dark:text-gray-300"><HelpCircle className="w-3.5 h-3.5" /></button>
              </Tooltip>
            </div>
            {editingBudget ? (
              <div className="relative mt-1 max-w-xs mx-auto">
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
              <div className="flex items-center justify-center gap-2">
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                  {me?.remainingBudget != null && me.monthlyBudget != null
                    ? `$${Math.round(me.remainingBudget)} / $${Math.round(me.monthlyBudget)}`
                    : '$0'}
                </p>
                <button
                  onClick={() => { setNewBudgetValue(''); setEditingBudget(true); }}
                  className="text-gray-400 hover:text-gray-300"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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

      {/* Period pickers (full-screen overlays) */}
      <PeriodPicker
        open={showNetworkPicker}
        onClose={() => setShowNetworkPicker(false)}
        value={networkDays}
        onChange={setNetworkDays}
      />
      <PeriodPicker
        open={showCapPicker}
        onClose={() => setShowCapPicker(false)}
        value={capDays}
        onChange={setCapDays}
      />
    </div>
  );
}
