import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { SkillSelector } from './SkillSelector';
import { Button } from './ui/button';
import { X, Wrench, Heart } from 'lucide-react';
import { MIN_SKILLS, MIN_NEEDS } from '@so/shared';

export function SkillsPopup() {
  const { t } = useTranslation();
  const { data: mine } = trpc.skills.mine.useQuery();
  const { data: me } = trpc.user.me.useQuery();
  const { data: categories } = trpc.skills.categories.useQuery();

  const [tab, setTab] = useState<'skills' | 'needs'>('skills');
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedNeeds, setSelectedNeeds] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);

  const saveSkills = trpc.skills.saveSkills.useMutation();
  const saveNeeds = trpc.skills.saveNeeds.useMutation();
  const markCompleted = trpc.skills.markCompleted.useMutation();
  const utils = trpc.useUtils();

  // Only show for logged-in, onboarded users who haven't completed skills
  if (!me || !me.onboardingCompleted) return null;
  if (mine?.skillsCompleted) return null;
  if (dismissed) return null;

  const handleToggle = (id: string) => {
    const set = tab === 'skills' ? selectedSkills : selectedNeeds;
    const setter = tab === 'skills' ? setSelectedSkills : setSelectedNeeds;
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
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

  const selected = tab === 'skills' ? selectedSkills : selectedNeeds;
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

        {/* Tabs */}
        <div className="flex gap-2 px-4 mb-3">
          <button
            onClick={() => setTab('skills')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'skills'
                ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 ring-1 ring-blue-300 dark:ring-blue-700'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            }`}
          >
            <Wrench className="w-4 h-4" />
            {t('skills.tabSkills')}
            {selectedSkills.size > 0 && <span className="ml-1 text-xs">({selectedSkills.size})</span>}
          </button>
          <button
            onClick={() => setTab('needs')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'needs'
                ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 ring-1 ring-blue-300 dark:ring-blue-700'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            }`}
          >
            <Heart className="w-4 h-4" />
            {t('skills.tabNeeds')}
            {selectedNeeds.size > 0 && <span className="ml-1 text-xs">({selectedNeeds.size})</span>}
          </button>
        </div>

        {/* Selector */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {categories && (
            <SkillSelector
              categories={categories}
              selected={selected}
              onToggle={handleToggle}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <p className="text-xs text-center text-gray-400">
            {t('skills.selected', { count: selectedSkills.size })} / {t('skills.selectedNeeds', { count: selectedNeeds.size })}
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
