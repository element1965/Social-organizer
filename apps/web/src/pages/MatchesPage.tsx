import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { cn } from '../lib/utils';
import { Handshake, Globe, MapPin, ChevronRight } from 'lucide-react';

export function MatchesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'helpMe' | 'helpThem'>('helpMe');

  const { data: helpMe, isLoading: loadingHelpMe } = trpc.matches.whoCanHelpMe.useQuery();
  const { data: helpThem, isLoading: loadingHelpThem } = trpc.matches.whoNeedsMyHelp.useQuery();

  const items = tab === 'helpMe' ? helpMe : helpThem;
  const isLoading = tab === 'helpMe' ? loadingHelpMe : loadingHelpThem;
  const emptyText = tab === 'helpMe' ? t('matches.noMatches') : t('matches.noMatchesNeeds');

  // Group by user for cleaner display
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

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Handshake className="w-5 h-5" /> {t('matches.title')}
      </h1>

      {/* Tab switcher */}
      <div className="grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setTab('helpMe')}
          className={cn(
            'py-2 rounded-md text-sm font-medium transition-colors',
            tab === 'helpMe'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {t('matches.whoCanHelpMe')}
          {helpMe && helpMe.length > 0 && (
            <span className="ml-1 text-xs text-emerald-500">({helpMe.length})</span>
          )}
        </button>
        <button
          onClick={() => setTab('helpThem')}
          className={cn(
            'py-2 rounded-md text-sm font-medium transition-colors',
            tab === 'helpThem'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {t('matches.whoNeedsMyHelp')}
          {helpThem && helpThem.length > 0 && (
            <span className="ml-1 text-xs text-orange-500">({helpThem.length})</span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : grouped.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">{emptyText}</p>
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
                    {/* Geo info */}
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
