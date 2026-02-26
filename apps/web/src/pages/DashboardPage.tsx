import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
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
  Wrench,
  Handshake,
  ChevronRight,
  MessageSquarePlus,
} from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { SocialIcon } from '../components/ui/social-icons';
import { SKILL_GROUPS, SKILL_GROUP_ICONS } from '@so/shared';
import type { SkillGroup } from '@so/shared';

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
  const { data: networkStats, isLoading: networkLoading } = useCachedNetworkStats();
  const { data: networkCapabilities } = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60000 });
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const { data: skillsAdminStats } = trpc.skills.adminStats.useQuery(undefined, {
    enabled: !!adminData?.isAdmin,
  });
  const { data: matchHelpMe } = trpc.matches.whoCanHelpMe.useQuery();
  const { data: matchHelpThem } = trpc.matches.whoNeedsMyHelp.useQuery();
  const { data: matchChains } = trpc.matches.myChains.useQuery();
  const { data: suggestions } = trpc.skills.listSuggestions.useQuery(undefined, {
    enabled: !!adminData?.isAdmin,
  });
  const approveMut = trpc.skills.approveSuggestion.useMutation({ onSuccess: () => utils.skills.listSuggestions.invalidate() });
  const rejectMut = trpc.skills.rejectSuggestion.useMutation({ onSuccess: () => utils.skills.listSuggestions.invalidate() });
  const updateSuggMut = trpc.skills.updateSuggestion.useMutation({ onSuccess: () => utils.skills.listSuggestions.invalidate() });
  const [editingSuggId, setEditingSuggId] = useState<string | null>(null);
  const [editingSuggText, setEditingSuggText] = useState('');
  const [editingSuggGroup, setEditingSuggGroup] = useState('');

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
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-base font-semibold text-green-600">{t('dashboard.dayCount', { count: dayCount })}</span>
              </div>
            );
          })()}
          <div
            className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all"
            onClick={() => navigate('/network?view=list')}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.wholeNetwork')}</span>
              <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                <PeriodChip days={networkDays} onClick={() => setShowNetworkPicker(true)} />
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 overflow-hidden">
              <p className="text-3xl font-bold text-gray-900 dark:text-white truncate shrink min-w-0">
                {totalReachable?.toLocaleString()} <span className="text-sm font-normal text-gray-500 dark:text-gray-300">{t('dashboard.people')}</span>
              </p>
              {networkNewConn != null && (
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
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
              <Sparkles className="w-5 h-5 text-green-600" />
              <span className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.networkCapabilitiesTitle')}</span>
              <div className="ml-auto">
                <PeriodChip days={capDays} onClick={() => setShowCapPicker(true)} />
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 overflow-hidden">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 truncate shrink min-w-0">
                ${(networkCapabilities?.total ?? 0).toLocaleString()}
              </p>
              {capPeriodTotal != null && (
                <span className="text-lg font-bold text-green-600 dark:text-green-400 whitespace-nowrap shrink-0">
                  +${capPeriodTotal.toLocaleString()}
                </span>
              )}
            </div>
            {networkCapabilities?.contributors != null && networkCapabilities.contributors > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-300">{t('dashboard.capabilitiesContributors', { count: networkCapabilities.contributors })}</p>
            )}
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

      {/* Admin: Skills pilot metrics */}
      {/* Skill Matches card */}
      {((matchHelpMe && matchHelpMe.length > 0) || (matchHelpThem && matchHelpThem.length > 0)) && (
        <Card>
          <CardContent className="py-4">
            <button
              onClick={() => navigate('/matches')}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Handshake className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('matches.title')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {matchHelpMe && matchHelpMe.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 font-medium">
                    {new Set(matchHelpMe.map(h => h.userId)).size} {t('matches.whoCanHelpMe').toLowerCase()}
                  </span>
                )}
                {matchHelpThem && matchHelpThem.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 font-medium">
                    {new Set(matchHelpThem.map(h => h.userId)).size} {t('matches.whoNeedsMyHelp').toLowerCase()}
                  </span>
                )}
                {matchChains && matchChains.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 font-medium">
                    {matchChains.length} {t('matches.chains').toLowerCase()}
                  </span>
                )}
              </div>
            </button>
          </CardContent>
        </Card>
      )}

      {adminData?.isAdmin && skillsAdminStats && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Wrench className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('skills.adminTitle')}</span>
            </div>

            {/* Row 1: Fill rate, Match density, Users */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{skillsAdminStats.fillRate}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('skills.fillRate')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{skillsAdminStats.matchDensity}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('skills.matchDensity')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                  {skillsAdminStats.usersWithSkills}/{skillsAdminStats.usersWithNeeds}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('skills.withSkills')}/{t('skills.withNeeds')}</p>
              </div>
            </div>

            {/* Row 2: Averages, Geo, Pairs */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{skillsAdminStats.avgSkillsPerUser}</p>
                <p className="text-[10px] text-gray-400">{t('skills.avgSkills')}</p>
              </div>
              <div className="text-center p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{skillsAdminStats.avgNeedsPerUser}</p>
                <p className="text-[10px] text-gray-400">{t('skills.avgNeeds')}</p>
              </div>
              <div className="text-center p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{skillsAdminStats.geoRate}%</p>
                <p className="text-[10px] text-gray-400">{t('skills.geoFilled')}</p>
              </div>
              <div className="text-center p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm font-bold text-purple-600">{skillsAdminStats.uniqueMatchPairs}</p>
                <p className="text-[10px] text-gray-400">{t('skills.matchPairs')}</p>
              </div>
            </div>

            {/* Row 3: Chains */}
            {(skillsAdminStats.chainsTotal > 0 || skillsAdminStats.notifsTotal > 0) && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-sm font-bold text-purple-600">{skillsAdminStats.chainsTotal}</p>
                  <p className="text-[10px] text-gray-400">{t('skills.chainsCount')}</p>
                </div>
                <div className="text-center p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-sm font-bold text-purple-600">{skillsAdminStats.chainsWithChat}</p>
                  <p className="text-[10px] text-gray-400">{t('skills.withChat')}</p>
                </div>
                <div className="text-center p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-sm font-bold text-purple-600">{skillsAdminStats.chainParticipants}</p>
                  <p className="text-[10px] text-gray-400">{t('skills.inChains')}</p>
                </div>
                <div className="text-center p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-sm font-bold text-amber-600">{skillsAdminStats.notifsTotal}</p>
                  <p className="text-[10px] text-gray-400">{t('skills.notifs')}</p>
                </div>
              </div>
            )}

            {/* Row 4: Suggestions + Categories count */}
            <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
              <span>{skillsAdminStats.totalCategories} {t('skills.categoriesCount')}</span>
              <span>{skillsAdminStats.totalSkillEntries} / {skillsAdminStats.totalNeedEntries} {t('skills.entriesTotal')}</span>
              {skillsAdminStats.pendingSuggestions > 0 && (
                <span className="text-amber-500 font-medium">{skillsAdminStats.pendingSuggestions} {t('skills.pendingCount')}</span>
              )}
            </div>

            {skillsAdminStats.topSkills.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t('skills.topSkills')}</p>
                <div className="flex flex-wrap gap-1">
                  {skillsAdminStats.topSkills.map((s: { key: string; count: number }) => (
                    <span key={s.key} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600">
                      {t(`skills.${s.key}`)} ({s.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {skillsAdminStats.topNeeds.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t('skills.topNeeds')}</p>
                <div className="flex flex-wrap gap-1">
                  {skillsAdminStats.topNeeds.map((n: { key: string; count: number }) => (
                    <span key={n.key} className="px-2 py-0.5 text-xs rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600">
                      {t(`skills.${n.key}`)} ({n.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Suggested categories moderation */}
      {adminData?.isAdmin && suggestions && suggestions.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-1.5 mb-3">
              <MessageSquarePlus className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('skills.suggestions')} ({suggestions.length})
              </span>
            </div>
            <div className="space-y-2">
              {suggestions.map((s: { id: string; text: string; group: string; type: string; user: { name: string } }) => (
                <div key={s.id} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  {/* Row 1: Full category name + group editing */}
                  {editingSuggId === s.id ? (
                    <div className="space-y-1.5 mb-1.5">
                      <input
                        value={editingSuggText}
                        onChange={(e) => setEditingSuggText(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <div className="flex gap-1.5 items-center">
                        <select
                          value={editingSuggGroup}
                          onChange={(e) => setEditingSuggGroup(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          {SKILL_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {SKILL_GROUP_ICONS[g as SkillGroup]} {t(`skills.group_${g}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const updates: { id: string; text?: string; group?: string } = { id: s.id };
                            if (editingSuggText.trim() && editingSuggText.trim() !== s.text) updates.text = editingSuggText.trim();
                            if (editingSuggGroup !== s.group) updates.group = editingSuggGroup;
                            if (updates.text || updates.group) updateSuggMut.mutate(updates);
                            setEditingSuggId(null);
                          }}
                          className="px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => setEditingSuggId(null)}
                          className="px-2 py-1 text-xs text-gray-400"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                      &ldquo;{s.text}&rdquo;
                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                        {SKILL_GROUP_ICONS[s.group as SkillGroup]} {t(`skills.group_${s.group}`)} &middot; {s.user.name}
                        {' '}&middot;{' '}
                        <span className={s.type === 'NEED' ? 'text-rose-400' : 'text-emerald-400'}>
                          {s.type === 'NEED' ? t('skills.iNeed') : t('skills.iCan')}
                        </span>
                      </span>
                    </p>
                  )}
                  {/* Row 2: Buttons */}
                  <div className="flex gap-1.5">
                    {editingSuggId !== s.id && (
                      <button
                        onClick={() => { setEditingSuggId(s.id); setEditingSuggText(s.text); setEditingSuggGroup(s.group); }}
                        className="px-2 py-0.5 text-xs font-medium rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                      >
                        {t('skills.editSuggestion')}
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        // Auto-save edited text/group before approving
                        if (editingSuggId === s.id) {
                          const updates: { id: string; text?: string; group?: string } = { id: s.id };
                          if (editingSuggText.trim() && editingSuggText.trim() !== s.text) updates.text = editingSuggText.trim();
                          if (editingSuggGroup !== s.group) updates.group = editingSuggGroup;
                          if (updates.text || updates.group) {
                            await updateSuggMut.mutateAsync(updates);
                          }
                          setEditingSuggId(null);
                        }
                        approveMut.mutate({ id: s.id });
                      }}
                      disabled={approveMut.isPending || updateSuggMut.isPending}
                      className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200"
                    >
                      {t('common.confirm')}
                    </button>
                    <button
                      onClick={() => rejectMut.mutate({ id: s.id })}
                      disabled={rejectMut.isPending}
                      className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
