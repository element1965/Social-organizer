export const SKILL_GROUPS = ['home', 'professional', 'health', 'transport', 'digital', 'social'] as const;
export type SkillGroup = typeof SKILL_GROUPS[number];

export const SKILL_GROUP_ICONS: Record<SkillGroup, string> = {
  home: '🔧',
  professional: '💼',
  health: '🏥',
  transport: '🚗',
  digital: '💻',
  social: '🎓',
};

export const MIN_SKILLS = 3;
export const MIN_NEEDS = 2;
