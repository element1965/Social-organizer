const PUBLIC_ORIGIN = (import.meta.env.VITE_WEB_APP_URL || 'https://www.orginizer.com').replace(/\/$/, '');

export function inviteSlug(user: { id: string; referralSlug?: string | null }): string {
  return user.referralSlug || user.id;
}

/** Brand label shown on the card: orginizer.com/anna. The host drops a leading www. */
export function prettyInvite(slug: string): { host: string; slug: string } {
  let host = 'orginizer.com';
  try {
    host = new URL(PUBLIC_ORIGIN).host.replace(/^www\./, '');
  } catch {
    host = 'orginizer.com';
  }
  return { host, slug };
}

/**
 * Working permanent link. /:slug is not a route, so the shared URL is the existing ?invite= form.
 */
export function permanentInviteUrl(slug: string): string {
  return `${PUBLIC_ORIGIN}/?invite=${encodeURIComponent(slug)}`;
}

/** Live QR. Uses the current origin so two browsers on the same dev server can read each other. */
export function liveInviteUrl(token: string): string {
  const origin = typeof window === 'undefined' ? PUBLIC_ORIGIN : window.location.origin;
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export function appOrigin(): string {
  return PUBLIC_ORIGIN;
}
