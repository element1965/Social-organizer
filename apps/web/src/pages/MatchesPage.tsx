import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import {
  Handshake, Globe, MapPin, ChevronRight, Link2, ArrowRight,
  MessageCircle, ExternalLink, Check, CheckCheck, Clock, RotateCcw,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  PROPOSED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ACTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export function MatchesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.userId);
  const [tab, setTab] = useState<'helpMe' | 'helpThem' | 'chains'>('helpMe');
  const [offerLinkId, setOfferLinkId] = useState<string | null>(null);
  const [offerHours, setOfferHours] = useState('');
  const [offerDesc, setOfferDesc] = useState('');

  const utils = trpc.useUtils();
  const { data: helpMe, isLoading: loadingHelpMe } = trpc.matches.whoCanHelpMe.useQuery();
  const { data: helpThem, isLoading: loadingHelpThem } = trpc.matches.whoNeedsMyHelp.useQuery();
  const { data: chains, isLoading: loadingChains } = trpc.matches.myChains.useQuery();

  const setChatLinkMut = trpc.matches.setChatLink.useMutation({
    onSuccess: () => utils.matches.myChains.invalidate(),
  });
  const setOfferMut = trpc.matches.setOffer.useMutation({
    onSuccess: () => {
      utils.matches.myChains.invalidate();
      setOfferLinkId(null);
      setOfferHours('');
      setOfferDesc('');
    },
  });
  const confirmLinkMut = trpc.matches.confirmLink.useMutation({
    onSuccess: () => utils.matches.myChains.invalidate(),
  });
  const completeLinkMut = trpc.matches.completeLink.useMutation({
    onSuccess: () => utils.matches.myChains.invalidate(),
  });
  const cancelChainMut = trpc.matches.cancelChain.useMutation({
    onSuccess: () => utils.matches.myChains.invalidate(),
  });

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
    setChatLinkMut.mutate({ chainId, telegramChatUrl: url });
  };

  const handleSetOffer = (linkId: string) => {
    const hours = parseFloat(offerHours);
    if (isNaN(hours) || hours < 0.5) return;
    setOfferMut.mutate({ linkId, hours, description: offerDesc || undefined });
  };

  const handleCancelChain = (chainId: string) => {
    if (!confirm(t('matches.cancelConfirm'))) return;
    cancelChainMut.mutate({ chainId });
  };

  const getLinkStatusIcon = (link: { giverConfirmed: boolean; receiverConfirmed: boolean; giverCompleted: boolean; receiverCompleted: boolean }) => {
    if (link.giverCompleted && link.receiverCompleted) return <CheckCheck className="w-4 h-4 text-green-500" />;
    if (link.giverCompleted || link.receiverCompleted) return <CheckCheck className="w-4 h-4 text-amber-500" />;
    if (link.giverConfirmed && link.receiverConfirmed) return <Check className="w-4 h-4 text-blue-500" />;
    if (link.giverConfirmed) return <Clock className="w-4 h-4 text-amber-500" />;
    return <Clock className="w-4 h-4 text-gray-300 dark:text-gray-600" />;
  };

  const statusKey = (status: string) =>
    `matches.status${status.charAt(0)}${status.slice(1).toLowerCase()}`;

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
        /* ===== Chains tab ===== */
        !chains || chains.length === 0 ? (
          <div className="text-center py-8">
            <Link2 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">{t('matches.noChains')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('matches.noChainsHint')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {chains.map((chain) => {
              const firstGiver = chain.links[0]?.giver;
              const isDone = chain.status === 'COMPLETED';
              const isCancelled = chain.status === 'CANCELLED';
              const isActive = chain.status === 'ACTIVE';

              return (
                <Card key={chain.id} className={cn(isCancelled && 'opacity-60')}>
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('matches.chainOf', { count: chain.length })}
                        </span>
                      </div>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[chain.status])}>
                        {t(statusKey(chain.status))}
                      </span>
                    </div>

                    {/* Ring visualization */}
                    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {/* Left accent line */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-400 via-purple-500 to-purple-400" />

                      <div className="pl-4">
                        {chain.links.map((link, idx) => {
                          const isGiver = link.giver.id === userId;
                          const isReceiver = link.receiver.id === userId;
                          const isLast = idx === chain.links.length - 1;

                          return (
                            <div key={link.id} className={cn('py-3 px-3', !isLast && 'border-b border-gray-100 dark:border-gray-800')}>
                              {/* Link row */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => navigate(`/profile/${link.giver.id}`)}
                                  className="flex items-center gap-1 shrink-0"
                                >
                                  <Avatar src={link.giver.photoUrl} name={link.giver.name} size="sm" />
                                  <span className={cn(
                                    'text-sm font-medium truncate max-w-[70px]',
                                    isGiver ? 'text-purple-600 dark:text-purple-400' : 'text-gray-900 dark:text-white',
                                  )}>
                                    {isGiver ? t('matches.you') : link.giver.name}
                                  </span>
                                </button>

                                <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />

                                <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0">
                                  {t(`skills.${link.categoryKey}`)}
                                </span>

                                <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />

                                <button
                                  onClick={() => navigate(`/profile/${link.receiver.id}`)}
                                  className="flex items-center gap-1 shrink-0"
                                >
                                  <Avatar src={link.receiver.photoUrl} name={link.receiver.name} size="sm" />
                                  <span className={cn(
                                    'text-sm font-medium truncate max-w-[70px]',
                                    isReceiver ? 'text-purple-600 dark:text-purple-400' : 'text-gray-900 dark:text-white',
                                  )}>
                                    {isReceiver ? t('matches.you') : link.receiver.name}
                                  </span>
                                </button>

                                <span className="ml-auto shrink-0">
                                  {getLinkStatusIcon(link)}
                                </span>
                              </div>

                              {/* Offer details */}
                              {link.offerHours != null && (
                                <p className="mt-1.5 ml-8 text-xs text-gray-500 dark:text-gray-400">
                                  {t('matches.offerSet', { hours: link.offerHours })}
                                  {link.offerDescription && ` — ${link.offerDescription}`}
                                </p>
                              )}

                              {/* Completion partial status */}
                              {isActive && (link.giverCompleted !== link.receiverCompleted) && (
                                <p className="mt-1 ml-8 text-xs text-amber-500">
                                  {link.giverCompleted ? t('matches.giverDone') : t('matches.receiverDone')}
                                </p>
                              )}

                              {/* Actions (only for non-done, non-cancelled chains) */}
                              {!isDone && !isCancelled && (
                                <>
                                  {/* Giver: set offer */}
                                  {isGiver && !link.giverConfirmed && (
                                    <div className="mt-2 ml-8">
                                      {offerLinkId === link.id ? (
                                        <div className="space-y-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                          <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            placeholder={t('matches.offerHoursPlaceholder')}
                                            value={offerHours}
                                            onChange={(e) => setOfferHours(e.target.value)}
                                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          />
                                          <input
                                            type="text"
                                            placeholder={t('matches.offerDescPlaceholder')}
                                            value={offerDesc}
                                            onChange={(e) => setOfferDesc(e.target.value)}
                                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          />
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              className="text-xs flex-1"
                                              onClick={() => handleSetOffer(link.id)}
                                              disabled={setOfferMut.isPending}
                                            >
                                              {t('matches.sendOffer')}
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="text-xs"
                                              onClick={() => setOfferLinkId(null)}
                                            >
                                              {t('common.cancel')}
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-xs"
                                          onClick={() => { setOfferLinkId(link.id); setOfferHours(''); setOfferDesc(''); }}
                                        >
                                          {t('matches.setOffer')}
                                        </Button>
                                      )}
                                    </div>
                                  )}

                                  {/* Receiver: confirm offer */}
                                  {isReceiver && link.giverConfirmed && !link.receiverConfirmed && (
                                    <div className="mt-2 ml-8">
                                      <Button
                                        size="sm"
                                        className="text-xs"
                                        onClick={() => confirmLinkMut.mutate({ linkId: link.id })}
                                        disabled={confirmLinkMut.isPending}
                                      >
                                        <Check className="w-3.5 h-3.5 mr-1" />
                                        {t('matches.confirmOffer')}
                                      </Button>
                                    </div>
                                  )}

                                  {/* Receiver waiting for giver's offer */}
                                  {isReceiver && !link.giverConfirmed && (
                                    <p className="mt-1.5 ml-8 text-xs text-gray-400">{t('matches.awaitingOffer')}</p>
                                  )}

                                  {/* Giver waiting for receiver confirmation */}
                                  {isGiver && link.giverConfirmed && !link.receiverConfirmed && (
                                    <p className="mt-1.5 ml-8 text-xs text-gray-400">{t('matches.awaitingConfirm')}</p>
                                  )}

                                  {/* Complete buttons (ACTIVE chain) */}
                                  {isActive && isGiver && !link.giverCompleted && (
                                    <div className="mt-2 ml-8">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                                        onClick={() => completeLinkMut.mutate({ linkId: link.id, role: 'giver' })}
                                        disabled={completeLinkMut.isPending}
                                      >
                                        <CheckCheck className="w-3.5 h-3.5 mr-1" />
                                        {t('matches.markComplete')}
                                      </Button>
                                    </div>
                                  )}
                                  {isActive && isReceiver && !link.receiverCompleted && (
                                    <div className="mt-2 ml-8">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                                        onClick={() => completeLinkMut.mutate({ linkId: link.id, role: 'receiver' })}
                                        disabled={completeLinkMut.isPending}
                                      >
                                        <CheckCheck className="w-3.5 h-3.5 mr-1" />
                                        {t('matches.markComplete')}
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Fully completed link */}
                              {link.giverCompleted && link.receiverCompleted && (
                                <p className="mt-1 ml-8 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <CheckCheck className="w-3 h-3" /> {t('matches.linkCompleted')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Ring closure indicator */}
                      {firstGiver && (
                        <div className="pl-4 py-2 px-3 bg-purple-50/50 dark:bg-purple-900/10 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {t('matches.ringCloses')}{' '}
                            <strong>{firstGiver.id === userId ? t('matches.you') : firstGiver.name}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Chat section */}
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      {chain.length <= 2 ? (
                        <p className="text-xs text-gray-400">{t('matches.pairHint')}</p>
                      ) : chain.telegramChatUrl ? (
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
                      ) : !isCancelled && !isDone ? (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('matches.chainInstruction')}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => handleAddChatLink(chain.id)}
                            disabled={setChatLinkMut.isPending}
                          >
                            <Link2 className="w-3.5 h-3.5 mr-1.5" />
                            {t('matches.addChatLink')}
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {/* Cancel button */}
                    {(chain.status === 'PROPOSED' || chain.status === 'ACTIVE') && (
                      <button
                        onClick={() => handleCancelChain(chain.id)}
                        className="mt-2 text-xs text-red-400 hover:text-red-500 transition-colors"
                        disabled={cancelChainMut.isPending}
                      >
                        {t('matches.cancelChain')}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : /* ===== helpMe / helpThem tabs ===== */
      grouped.length === 0 ? (
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
