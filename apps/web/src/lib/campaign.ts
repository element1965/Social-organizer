import { CAMPAIGN_KEYS, campaignFrom, type Campaign, type LandingEvent } from '@so/shared';

const FIRST_TOUCH_KEY = 'so.signupCampaign';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type FirstTouch = { expiresAt: number; campaign: Campaign };
let current: FirstTouch | undefined;

export function campaignInSearch(search: string): Campaign | undefined {
  const params = new URLSearchParams(search);
  return campaignFrom(Object.fromEntries(CAMPAIGN_KEYS.map((key) => [key, params.get(key)])));
}

export function firstTouchCampaign(clearExpired = false): Campaign | undefined {
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (raw) {
      const saved: FirstTouch = JSON.parse(raw);
      if (saved.expiresAt > Date.now()) return campaignFrom(saved.campaign);
      if (clearExpired) localStorage.removeItem(FIRST_TOUCH_KEY);
    }
  } catch { /* storage may be unavailable */ }
  return current && current.expiresAt > Date.now() ? current.campaign : undefined;
}

export function rememberCampaign(search: string) {
  if (firstTouchCampaign(true)) return;
  const campaign = campaignInSearch(search);
  if (!campaign) return;
  current = { expiresAt: Date.now() + MAX_AGE, campaign };
  try { localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current)); } catch { /* storage may be unavailable */ }
}

export function clearCampaign() {
  current = undefined;
  try { localStorage.removeItem(FIRST_TOUCH_KEY); } catch { /* storage may be unavailable */ }
}

export function recordLandingEvent(action: LandingEvent, search: string) {
  const campaign = campaignInSearch(search);
  let referrerHost: string | undefined;
  try {
    const referrer = new URL(document.referrer);
    if (referrer.hostname !== window.location.hostname && /^https?:$/.test(referrer.protocol)) {
      referrerHost = referrer.hostname;
    }
  } catch { /* direct visit */ }
  void fetch('/api/landing/event', {
    method: 'POST',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, campaign, referrerHost }),
    keepalive: true,
  }).catch(() => undefined);
}
