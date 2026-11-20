export const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

export type Campaign = Partial<Record<(typeof CAMPAIGN_KEYS)[number], string>>;

/** Campaign labels are short slugs. Never send URLs, search terms or contact details as labels. */
export function campaignFrom(value: unknown): Campaign | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const campaign: Campaign = {};
  for (const key of CAMPAIGN_KEYS) {
    const label = (value as Record<string, unknown>)[key];
    if (typeof label === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(label)) campaign[key] = label;
  }
  return Object.keys(campaign).length ? campaign : undefined;
}

export const LANDING_EVENTS = [
  'view', 'header_signin', 'header_start', 'hero_start', 'hero_how', 'story_start',
  'team', 'share', 'play', 'appstore', 'web', 'telegram', 'footer_signin',
] as const;

export type LandingEvent = (typeof LANDING_EVENTS)[number];
