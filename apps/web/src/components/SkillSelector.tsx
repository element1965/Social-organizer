import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SKILL_GROUPS, SKILL_GROUP_ICONS } from '@so/shared';
import type { SkillGroup } from '@so/shared';
import { cn } from '../lib/utils';
import { Search, ChevronDown, Wrench, Heart, Globe } from 'lucide-react';

interface Category {
  id: string;
  key: string;
  group: string;
  isOnline?: boolean;
}

interface SkillSelectorProps {
  categories: Category[];
  selectedSkills: Set<string>;
  selectedNeeds: Set<string>;
  onToggleSkill: (categoryId: string) => void;
  onToggleNeed: (categoryId: string) => void;
  notes?: Map<string, string>;
  onNoteChange?: (categoryId: string, note: string) => void;
}

export function SkillSelector({
  categories,
  selectedSkills,
  selectedNeeds,
  onToggleSkill,
  onToggleNeed,
  notes,
  onNoteChange,
}: SkillSelectorProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, Category[]> = {};
    for (const g of SKILL_GROUPS) map[g] = [];
    for (const c of categories) {
      if (map[c.group]) map[c.group].push(c);
    }
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase().trim();
    const result: Record<string, Category[]> = {};
    for (const [group, items] of Object.entries(grouped)) {
      const matching = items.filter((c) => {
        const name = t(`skills.${c.key}`).toLowerCase();
        return name.includes(q) || c.key.toLowerCase().includes(q);
      });
      if (matching.length > 0) result[group] = matching;
    }
    return result;
  }, [grouped, search, t]);

  const isSearching = search.trim().length > 0;
  const toggleGroup = (group: string) => {
    setExpanded((prev) => (prev === group ? null : group));
  };

  const isExpanded = (group: string) => isSearching || expanded === group;

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative sticky top-0 z-10 bg-white dark:bg-gray-900 pb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('skills.searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Summary */}
      <div className="flex gap-3 text-xs font-medium px-1">
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Wrench className="w-3 h-3" /> {t('skills.canHelp')}: {selectedSkills.size}
        </span>
        <span className="flex items-center gap-1 text-orange-500 dark:text-orange-400">
          <Heart className="w-3 h-3" /> {t('skills.needHelp')}: {selectedNeeds.size}
        </span>
      </div>

      {/* Groups */}
      {SKILL_GROUPS.map((group) => {
        const items = filtered[group];
        if (!items || items.length === 0) return null;
        const open = isExpanded(group);
        const icon = SKILL_GROUP_ICONS[group as SkillGroup];
        const groupSkillCount = items.filter((c) => selectedSkills.has(c.id)).length;
        const groupNeedCount = items.filter((c) => selectedNeeds.has(c.id)).length;

        return (
          <div key={group} className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                <span>{icon}</span> {t(`skills.group_${group}`)}
                {(groupSkillCount > 0 || groupNeedCount > 0) && (
                  <span className="text-xs font-normal text-gray-400">
                    ({groupSkillCount > 0 && <span className="text-emerald-500">{groupSkillCount}</span>}
                    {groupSkillCount > 0 && groupNeedCount > 0 && '/'}
                    {groupNeedCount > 0 && <span className="text-orange-500">{groupNeedCount}</span>})
                  </span>
                )}
              </span>
              <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} />
            </button>

            {/* Items */}
            {open && (
              <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {items.map((cat) => {
                  const isSkill = selectedSkills.has(cat.id);
                  const isNeed = selectedNeeds.has(cat.id);
                  const isOther = cat.key.startsWith('other');
                  const showNote = isOther && (isSkill || isNeed);
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                            {t(`skills.${cat.key}`)}
                          </span>
                          {cat.isOnline && (
                            <Globe className="w-3 h-3 text-blue-400 shrink-0" title={t('skills.online')} />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => onToggleSkill(cat.id)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                              isSkill
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-600'
                            )}
                            title={t('skills.canHelp')}
                          >
                            {t('skills.iCan')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleNeed(cat.id)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                              isNeed
                                ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-600'
                            )}
                            title={t('skills.needHelp')}
                          >
                            {t('skills.iNeed')}
                          </button>
                        </div>
                      </div>
                      {showNote && onNoteChange && (
                        <div className="px-3 pb-2">
                          <input
                            type="text"
                            value={notes?.get(cat.id) ?? ''}
                            onChange={(e) => onNoteChange(cat.id, e.target.value)}
                            placeholder={t('skills.otherPlaceholder')}
                            maxLength={200}
                            className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(filtered).length === 0 && (
        <p className="text-center text-sm text-gray-400 py-4">{t('common.notFound')}</p>
      )}
    </div>
  );
}
