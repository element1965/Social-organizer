import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { Handshake, Globe, MapPin, ChevronRight, Link2, ArrowRight, MessageCircle, ExternalLink } from 'lucide-react';

export function MatchesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'helpMe' | 'helpThem' | 'chains'>('helpMe');

  const { data: helpMe, isLoading: loadingHelpMe } = trpc.matches.whoCanHelpMe.useQuery();
  const { data: helpThem, isLoading: loadingHelpThem } = trpc.matches.whoNeedsMyHelp.useQuery();
  const { data: chains, isLoading: loadingChains } = trpc.matches.myChains.useQuery();
  const setChatLink = trpc.matches.setChatLink.useMutation({
    onSuccess: () => utils.matches.myChains.invalidate(),
  });
  const utils = trpc.useUtils();

  const items = tab === 'helpMe' ? helpMe : tab === 'helpThem' ? helpThem : null;
  const isLoading = tab === 'helpMe' ? loadingHelpMe : tab === 'helpThem' ? loadingHelpThem : loadingChains;

  // Group direct matches by user
  const grouped = items
    ? Array.from(
        items.reduce((map, item) => {
          const existing = map.get(item.userId);
          if (existing) {
            existing.skills.push({ categoryKey: item.categoryKey, isOnline: item.isOnline, note: item.note });
          } else {
            map.set(item.userId, {
              userId: item.userId,
              userName: item.userName,
              photoUrl: item.photoUrl,
              geoMatch: item.geoMatch,
              distance: item.distance,
              skills: [{ categoryKey: item.categoryKey, isOnline: item.isOnline, note: item.note }],
            });
          }
          return map;
        }, new Map<string, { userId: string; userName: string; photoUrl: string | null; geoMatch: string | null; distance: string | null; skills: Array<{ categoryKey: string; isOnline: boolean; note: string | null }> }>()),
      ).map(([, v]) => v)
    : [];

  const handleAddChatLink = (chainId: string) => {
    const url = prompt(t('matches.chatLinkPrompt'));
    if (!url || !url.includes('t.me/')) return;
    setChatLink.mutate({ chainId, telegramChatUrl: url });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Handshake className="w-5 h-5" /> {t('matches.title')}
      </h1>

      {/* Tab switcher */}
      <div className="grid grid-cols-3 gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setTab('helpMe')}
          className={cn(
            'py-2 rounded-md text-xs font-medium transition-colors',
            tab === 'helpMe'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {t('matches.whoCanHelpMe')}
          {helpMe && helpMe.length > 0 && (
            <span className="ml-1 text-emerald-500">({helpMe.length})</span>
          )}
        </button>
        <button
          onClick={() => setTab('helpThem')}
          className={cn(
            'py-2 rounded-md text-xs font-medium transition-colors',
            tab === 'helpThem'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {t('matches.whoNeedsMyHelp')}
          {helpThem && helpThem.length > 0 && (
            <span className="ml-1 text-orange-500">({helpThem.length})</span>
          )}
        </button>
        <button
          onClick={() => setTab('chains')}
          className={cn(
            'py-2 rounded-md text-xs font-medium transition-colors',
            tab === 'chains'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {t('matches.chains')}
          {chains && chains.length > 0 && (
            <span className="ml-1 text-purple-500">({chains.length})</span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : tab === 'chains' ? (
        // Chains tab
        !chains || chains.length === 0 ? (
          <div className="text-center py-8">
            <Link2 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">{t('matches.noChains')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('matches.noChainsHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {chains.map((chain) => (
              <Card key={chain.id}>
                <CardContent className="p-4">
                  {/* Chain visualization */}
                  <div className="flex items-center gap-1 mb-3 text-xs font-medium text-purple-600 dark:text-purple-400">
                    <Link2 className="w-3.5 h-3.5" />
                    {t('matches.chainOf', { count: chain.length })}
                  </div>

                  {/* Links */}
                  <div className="space-y-2">
                    {chain.links.map((link, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/profile/${link.giver.id}`)}
                          className="flex items-center gap-1.5 min-w-0"
                        >
                          <Avatar src={link.giver.photoUrl} name={link.giver.name} size="sm" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[80px]">
                            {link.giver.name}
                          </span>
                        </button>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">
                          {t(`skills.${link.categoryKey}`)}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <button
                          onClick={() => navigate(`/profile/${link.receiver.id}`)}
                          className="flex items-center gap-1.5 min-w-0"
                        >
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[80px]">
                            {link.receiver.name}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Chat section */}
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    {chain.length <= 2 ? (
                      // Direct pair — TG deep link
                      <p className="text-xs text-gray-400">{t('matches.pairHint')}</p>
                    ) : chain.telegramChatUrl ? (
                      // Chain 3+ with chat link
                      <a
                        href={chain.telegramChatUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 py-2 px-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{t('matches.openChat')}</span>
                        <ExternalLink className="w-3.5 h-3.5 ml-auto" />
                      </a>
                    ) : (
                      // Chain 3+ without chat link — instructions
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('matches.chainInstruction')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => handleAddChatLink(chain.id)}
                          disabled={setChatLink.isPending}
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1.5" />
                          {t('matches.addChatLink')}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : grouped.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          {tab === 'helpMe' ? t('matches.noMatches') : t('matches.noMatchesNeeds')}
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map((match) => (
            <Card key={match.userId}>
              <CardContent className="p-3">
                <button
                  onClick={() => navigate(`/profile/${match.userId}`)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <Avatar src={match.photoUrl} name={match.userName} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {match.userName}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {match.skills.map((s) => (
                        <span
                          key={s.categoryKey}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            tab === 'helpMe'
                              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
                          )}
                        >
                          {s.isOnline && <Globe className="w-3 h-3" />}
                          {t(`skills.${s.categoryKey}`)}
                        </span>
                      ))}
                    </div>
                    {match.geoMatch && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" />
                        {match.geoMatch === 'sameCity' && t('matches.sameCity')}
                        {match.geoMatch === 'sameCountry' && t('matches.sameCountry')}
                        {match.geoMatch === 'remote' && t('matches.remote')}
                        {match.distance && ` (${match.distance})`}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
