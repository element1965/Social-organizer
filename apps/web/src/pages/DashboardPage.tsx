import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { InviteBlock } from '../components/InviteBlock';
import { ShareSheet } from '../components/ShareSheet';
import { buildWebInviteUrl } from '../lib/inviteUrl';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  UserPlus,
  TrendingUp,
  X,
  HelpCircle,
  MessageSquarePlus,
  Share2,
} from 'lucide-react';
import { SocialIcon } from '../components/ui/social-icons';
import { SKILL_GROUPS, SKILL_GROUP_ICONS } from '@so/shared';
import type { SkillGroup } from '@so/shared';
// SKILL_GROUPS/SKILL_GROUP_ICONS used by suggestions moderation block below
import { useNicknames } from '../hooks/useNicknames';

const LazyCloudBackground = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.CloudBackground })),
);

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const resolve = useNicknames();
  const [showTgChatPopup, setShowTgChatPopup] = useState(false);
  const [gateShareOpen, setGateShareOpen] = useState(false);
  const [inviteShareOpen, setInviteShareOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { refetchInterval: 30000 });
  const { data: networkStats, isLoading: networkLoading } = useCachedNetworkStats();
  const { data: networkCapabilities } = trpc.stats.networkCapabilities.useQuery(undefined, { refetchInterval: 60000 });
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const { data: suggestions } = trpc.skills.listSuggestions.useQuery(undefined, {
    enabled: !!adminData?.isAdmin,
  });
  const approveMut = trpc.skills.approveSuggestion.useMutation({ onSuccess: () => utils.skills.listSuggestions.invalidate() });
  const rejectMut = trpc.skills.rejectSuggestion.useMutation({ onSuccess: () => utils.skills.listSuggestions.invalidate() });
  const updateSuggMut = trpc.skills.updateSuggestion.useMutation({ onSuccess: () => utils.skills.listSuggestions.invalidate() });
  const [editingSuggId, setEditingSuggId] = useState<string | null>(null);
  const [editingSuggText, setEditingSuggText] = useState('');
  const [editingSuggGroup, setEditingSuggGroup] = useState('');


  const totalReachable = networkStats?.totalReachable ?? 0;
  const byDepth = networkStats?.byDepth ?? {};

  useEffect(() => {
    if (location.hash === '#invite') {
      setTimeout(() => document.getElementById('invite')?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, []);

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
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('dashboard.addFirstConnection')}
            </h2>
            <Button className="w-full" size="lg" onClick={() => setGateShareOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" /> {t('create.goToInvite')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ShareSheet for gate invite button */}
      {(() => {
        const token = me?.referralSlug || me?.id || '';
        const url = token ? buildWebInviteUrl(token) : '';
        return url ? (
          <ShareSheet
            open={gateShareOpen}
            onClose={() => setGateShareOpen(false)}
            url={url}
            shareText={t('invite.shareText', { name: me?.name || '' })}
          />
        ) : null;
      })()}

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
              {(() => {
                const count = byDepth[1] ?? 0;
                const isActive = count > 30;
                return (
                  <>
                    <span className={`text-xs font-semibold animate-pulse ${isActive ? 'text-green-500' : 'text-red-400'}`}>
                      {isActive ? t('network.active') : t('network.notActive')}
                    </span>
                    <div className="flex items-center gap-1 font-bold leading-none">
                      <span className={isActive ? 'text-green-500' : 'text-red-500 dark:text-red-400'} style={{ fontSize: 'clamp(1.6rem, 8vw, 2.4rem)' }}>{count}</span>
                      <span className="text-gray-400 dark:text-gray-500" style={{ fontSize: 'clamp(1rem, 5vw, 1.4rem)' }}>{isActive ? '>' : '<'}</span>
                      <span className={isActive ? 'text-gray-800 dark:text-gray-300' : 'text-green-500'} style={{ fontSize: 'clamp(1.6rem, 8vw, 2.4rem)' }}>30</span>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
          <button
            onClick={() => setInviteShareOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm"
          >
            <Share2 className="w-4 h-4" />
            {t('dashboard.inviteTrusted')}
          </button>
          <ShareSheet
            open={inviteShareOpen}
            onClose={() => setInviteShareOpen(false)}
            url={(() => { const tok = me?.referralSlug || me?.id || ''; return tok ? buildWebInviteUrl(tok) : ''; })()}
            shareText={t('invite.shareText', { name: me?.name || '' })}
          />
        </div>
        <InviteBlock id="invite" variant="qr" />
      </div>

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
              {suggestions.map((s: { id: string; text: string; group: string; type: string; user: { id: string; name: string } }) => (
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
                        {SKILL_GROUP_ICONS[s.group as SkillGroup]} {t(`skills.group_${s.group}`)} &middot; {resolve(s.user.id, s.user.name)}
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

    </div>
  );
}
