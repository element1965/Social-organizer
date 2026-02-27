export const SKILL_GROUPS = [
  'home', 'construction', 'professional', 'legal', 'creative',
  'health', 'beauty', 'transport', 'auto', 'digital',
  'education', 'events', 'pets', 'outdoor', 'agriculture',
  'community',
] as const;

export type SkillGroup = typeof SKILL_GROUPS[number];

export const SKILL_GROUP_ICONS: Record<SkillGroup, string> = {
  home: '🏠',
  construction: '🔨',
  professional: '💼',
  legal: '⚖️',
  creative: '🎨',
  health: '🏥',
  beauty: '💅',
  transport: '🚗',
  auto: '🔧',
  digital: '💻',
  education: '🎓',
  events: '🎉',
  pets: '🐾',
  outdoor: '⛰️',
  agriculture: '🌱',
  community: '🤝',
};

export const MIN_SKILLS = 3;
export const MIN_NEEDS = 2;
