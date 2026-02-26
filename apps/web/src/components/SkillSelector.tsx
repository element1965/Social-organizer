import { useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SKILL_GROUPS, SKILL_GROUP_ICONS } from '@so/shared';
import type { SkillGroup } from '@so/shared';
import { cn } from '../lib/utils';
import { Search, ChevronDown, Wrench, Heart, Globe, GripVertical, ArrowUp, ArrowDown, FolderInput } from 'lucide-react';

interface Category {
  id: string;
  key: string;
  group: string;
  sortOrder?: number;
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
  isAdmin?: boolean;
  onMoveCategory?: (id: string, group: string, sortOrder: number) => void;
  onReorderCategories?: (updates: Array<{ id: string; group: string; sortOrder: number }>) => void;
}

export function SkillSelector({
  categories,
  selectedSkills,
  selectedNeeds,
  onToggleSkill,
  onToggleNeed,
  notes,
  onNoteChange,
  isAdmin,
  onMoveCategory,
  onReorderCategories,
}: SkillSelectorProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adminEditId, setAdminEditId] = useState<string | null>(null);
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('before');

  const grouped = useMemo(() => {
    const map: Record<string, Category[]> = {};
    for (const g of SKILL_GROUPS) map[g] = [];
    for (const c of categories) {
      if (map[c.group]) map[c.group].push(c);
    }
    // "other*" always last in each group
    for (const g of SKILL_GROUPS) {
      map[g].sort((a, b) => {
        const aOther = a.key.startsWith('other') ? 1 : 0;
        const bOther = b.key.startsWith('other') ? 1 : 0;
        if (aOther !== bOther) return aOther - bOther;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
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

  const handleMoveUp = useCallback((group: string, catId: string) => {
    const items = grouped[group];
    if (!items || !onReorderCategories) return;
    const cat = items.find((c) => c.id === catId);
    if (!cat || cat.key.startsWith('other')) return; // "other" stays last
    const idx = items.findIndex((c) => c.id === catId);
    if (idx <= 0) return;
    const updates = items.map((c, i) => ({ id: c.id, group, sortOrder: c.sortOrder ?? i }));
    const temp = updates[idx].sortOrder;
    updates[idx].sortOrder = updates[idx - 1].sortOrder;
    updates[idx - 1].sortOrder = temp;
    onReorderCategories(updates);
  }, [grouped, onReorderCategories]);

  const handleMoveDown = useCallback((group: string, catId: string) => {
    const items = grouped[group];
    if (!items || !onReorderCategories) return;
    const cat = items.find((c) => c.id === catId);
    if (!cat || cat.key.startsWith('other')) return; // "other" stays last
    const idx = items.findIndex((c) => c.id === catId);
    if (idx < 0 || idx >= items.length - 1) return;
    // Don't move below "other*"
    if (items[idx + 1].key.startsWith('other')) return;
    const updates = items.map((c, i) => ({ id: c.id, group, sortOrder: c.sortOrder ?? i }));
    const temp = updates[idx].sortOrder;
    updates[idx].sortOrder = updates[idx + 1].sortOrder;
    updates[idx + 1].sortOrder = temp;
    onReorderCategories(updates);
  }, [grouped, onReorderCategories]);

  const handleMoveToGroup = useCallback((catId: string, newGroup: string, insertBeforeId?: string) => {
    if (!onMoveCategory || !onReorderCategories) return;
    const targetItems = [...(grouped[newGroup] || [])];
    // Find insert position: before the target item, but always before "other*"
    let insertIdx = targetItems.length;
    if (insertBeforeId) {
      const targetIdx = targetItems.findIndex((c) => c.id === insertBeforeId);
      if (targetIdx >= 0) insertIdx = targetIdx;
    }
    // Ensure we don't insert after "other*"
    const otherIdx = targetItems.findIndex((c) => c.key.startsWith('other'));
    if (otherIdx >= 0 && insertIdx > otherIdx) insertIdx = otherIdx;
    // Assign new sortOrders: items before insert keep their order, inserted item gets slot, rest shift
    const updates: Array<{ id: string; group: string; sortOrder: number }> = [];
    let order = 0;
    for (let i = 0; i < targetItems.length; i++) {
      if (i === insertIdx) order++; // leave a slot for the inserted item
      updates.push({ id: targetItems[i].id, group: newGroup, sortOrder: order });
      order++;
    }
    // The dragged item gets the insert slot
    const insertOrder = insertIdx;
    onMoveCategory(catId, newGroup, insertOrder);
    if (updates.length > 0) onReorderCategories(updates);
    setAdminEditId(null);
  }, [grouped, onMoveCategory, onReorderCategories]);

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
          <div
            key={group}
            className={cn(
              'border rounded-lg overflow-hidden',
              dragOverGroup === group
                ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-gray-100 dark:border-gray-800',
            )}
            onDragOver={isAdmin ? (e) => { e.preventDefault(); setDragOverGroup(group); } : undefined}
            onDragLeave={isAdmin ? () => setDragOverGroup(null) : undefined}
            onDrop={isAdmin ? (e) => {
              e.preventDefault();
              setDragOverGroup(null);
              if (dragCatId && dragCatId !== '') {
                handleMoveToGroup(dragCatId, group);
                setDragCatId(null);
              }
            } : undefined}
          >
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
                {items.map((cat, idx) => {
                  const isSkill = selectedSkills.has(cat.id);
                  const isNeed = selectedNeeds.has(cat.id);
                  const isOther = cat.key.startsWith('other');
                  const showNote = isOther && (isSkill || isNeed);
                  const isEditing = isAdmin && adminEditId === cat.id;
                  const showDropBefore = isAdmin && dragCatId && dragCatId !== cat.id && dragOverItemId === cat.id && dragOverPos === 'before';
                  const showDropAfter = isAdmin && dragCatId && dragCatId !== cat.id && dragOverItemId === cat.id && dragOverPos === 'after' && !isOther;
                  return (
                    <div
                      key={cat.id}
                      draggable={isAdmin && !isSearching && !isOther}
                      onDragStart={isAdmin ? (e) => {
                        setDragCatId(cat.id);
                        e.dataTransfer.effectAllowed = 'move';
                      } : undefined}
                      onDragEnd={isAdmin ? () => { setDragCatId(null); setDragOverGroup(null); setDragOverItemId(null); } : undefined}
                      onDragOver={isAdmin ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const mid = rect.top + rect.height / 2;
                        setDragOverItemId(cat.id);
                        setDragOverPos(e.clientY < mid ? 'before' : 'after');
                        setDragOverGroup(group);
                      } : undefined}
                      onDrop={isAdmin ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverItemId(null);
                        setDragOverGroup(null);
                        if (!dragCatId || dragCatId === cat.id) return;
                        // Same group: reorder
                        const srcInGroup = items.find((c) => c.id === dragCatId);
                        if (srcInGroup) {
                          const srcIdx = items.findIndex((c) => c.id === dragCatId);
                          let tgtIdx = idx;
                          if (dragOverPos === 'after') tgtIdx = Math.min(idx + 1, items.length);
                          // Don't go past "other*"
                          const otherIdx = items.findIndex((c) => c.key.startsWith('other'));
                          if (otherIdx >= 0 && tgtIdx > otherIdx) tgtIdx = otherIdx;
                          if (srcIdx === tgtIdx) return;
                          const reordered = [...items];
                          const [moved] = reordered.splice(srcIdx, 1);
                          const insertAt = tgtIdx > srcIdx ? tgtIdx - 1 : tgtIdx;
                          reordered.splice(insertAt, 0, moved);
                          onReorderCategories?.(reordered.map((c, i) => ({ id: c.id, group, sortOrder: i })));
                        } else {
                          // Different group: move to this group at this position
                          handleMoveToGroup(dragCatId, group, dragOverPos === 'before' ? cat.id : items[idx + 1]?.id);
                        }
                        setDragCatId(null);
                      } : undefined}
                    >
                      {showDropBefore && <div className="h-0.5 bg-blue-400 mx-3 rounded-full" />}
                      <div className={cn(
                        'flex items-center px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30',
                        dragCatId === cat.id && 'opacity-40',
                      )}>
                        {/* Admin: grip handle */}
                        {isAdmin && !isSearching && (
                          <button
                            type="button"
                            onClick={() => setAdminEditId(isEditing ? null : cat.id)}
                            className={cn(
                              'mr-1 p-0.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 touch-none',
                              !isOther && 'cursor-grab active:cursor-grabbing',
                            )}
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                            {t(`skills.${cat.key}`)}
                          </span>
                          {cat.isOnline && (
                            <Globe className="w-3 h-3 text-blue-400 shrink-0" title={t('skills.online')} />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {/* Admin: reorder buttons */}
                          {isEditing && !isOther && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMoveUp(group, cat.id)}
                                disabled={idx === 0}
                                className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveDown(group, cat.id)}
                                disabled={idx >= items.length - 1 || items[idx + 1]?.key.startsWith('other')}
                                className="p-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => onToggleSkill(cat.id)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-medium transition-all border whitespace-nowrap',
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
                              'px-2.5 py-1 rounded-md text-xs font-medium transition-all border whitespace-nowrap',
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
                      {showDropAfter && <div className="h-0.5 bg-blue-400 mx-3 rounded-full" />}
                      {/* Admin: move to group panel */}
                      {isEditing && (
                        <div className="px-3 pb-2">
                          <div className="flex items-center gap-1 mb-1">
                            <FolderInput className="w-3 h-3 text-gray-400" />
                            <span className="text-[10px] text-gray-400">{t('skills.moveToGroup')}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {SKILL_GROUPS.filter((g) => g !== group).map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => handleMoveToGroup(cat.id, g)}
                                className="px-2 py-0.5 text-[10px] rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors"
                              >
                                {SKILL_GROUP_ICONS[g as SkillGroup]} {t(`skills.group_${g}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
