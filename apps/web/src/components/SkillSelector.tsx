import { useTranslation } from 'react-i18next';
import { SKILL_GROUPS, SKILL_GROUP_ICONS } from '@so/shared';
import type { SkillGroup } from '@so/shared';
import { cn } from '../lib/utils';

interface Category {
  id: string;
  key: string;
  group: string;
}

interface SkillSelectorProps {
  categories: Category[];
  selected: Set<string>;
  onToggle: (categoryId: string) => void;
}

export function SkillSelector({ categories, selected, onToggle }: SkillSelectorProps) {
  const { t } = useTranslation();

  const grouped = SKILL_GROUPS.reduce<Record<string, Category[]>>((acc, group) => {
    acc[group] = categories.filter((c) => c.group === group);
    return acc;
  }, {} as Record<string, Category[]>);

  return (
    <div className="space-y-4">
      {SKILL_GROUPS.map((group) => {
        const items = grouped[group];
        if (!items || items.length === 0) return null;
        return (
          <div key={group}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              {SKILL_GROUP_ICONS[group as SkillGroup]} {t(`skills.group_${group}`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((cat) => {
                const isSelected = selected.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onToggle(cat.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600',
                    )}
                  >
                    {t(`skills.${cat.key}`)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
