import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { SkillSelector } from './SkillSelector';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { MIN_SKILLS, MIN_NEEDS } from '@so/shared';

export function SkillsPopup() {
  const { t } = useTranslation();
  const { data: mine } = trpc.skills.mine.useQuery();
  const { data: me } = trpc.user.me.useQuery();
  const { data: categories } = trpc.skills.categories.useQuery();

  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedNeeds, setSelectedNeeds] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);

  const saveSkills = trpc.skills.saveSkills.useMutation();
  const saveNeeds = trpc.skills.saveNeeds.useMutation();
  const markCompleted = trpc.skills.markCompleted.useMutation();
  const utils = trpc.useUtils();

  if (!me || !me.onboardingCompleted) return null;
  if (mine?.skillsCompleted) return null;
  if (dismissed) return null;

  const handleToggleSkill = (id: string) => {
    const next = new Set(selectedSkills);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSkills(next);
  };

  const handleToggleNeed = (id: string) => {
    const next = new Set(selectedNeeds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedNeeds(next);
  };

  const handleSave = async () => {
    await Promise.all([
      saveSkills.mutateAsync({ skills: [...selectedSkills].map((id) => ({ categoryId: id })) }),
      saveNeeds.mutateAsync({ needs: [...selectedNeeds].map((id) => ({ categoryId: id })) }),
    ]);
    await markCompleted.mutateAsync();
    utils.skills.mine.invalidate();
    setDismissed(true);
  };

  const handleSkip = async () => {
    await markCompleted.mutateAsync();
    utils.skills.mine.invalidate();
    setDismissed(true);
  };

  const canSave = selectedSkills.size >= MIN_SKILLS && selectedNeeds.size >= MIN_NEEDS;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('skills.popupTitle')}</h2>
          <button onClick={handleSkip} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-300" />
          </button>
        </div>
        <p className="px-4 text-sm text-gray-500 dark:text-gray-400 mb-3">{t('skills.popupText')}</p>

        {/* Selector — single pass */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {categories && (
            <SkillSelector
              categories={categories}
              selectedSkills={selectedSkills}
              selectedNeeds={selectedNeeds}
              onToggleSkill={handleToggleSkill}
              onToggleNeed={handleToggleNeed}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <p className="text-xs text-center text-gray-400">
            {t('skills.minHint', { skills: MIN_SKILLS, needs: MIN_NEEDS })}
          </p>
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!canSave || saveSkills.isPending || saveNeeds.isPending}
          >
            {t('common.save')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleSkip}>
            {t('skills.skip')}
          </Button>
        </div>
      </div>
    </div>
  );
}
