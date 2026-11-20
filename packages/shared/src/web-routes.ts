// Route patterns are used by both React Router and the production SPA fallback.
export const WEB_ROUTES = {
  WELCOME: '/welcome',
  ARVUT: '/arvut',
  GET: '/get',
  DASHBOARD: '/dashboard',
  NETWORK: '/network',
  NOTIFICATIONS: '/notifications',
  CREATE: '/create',
  SETTINGS: '/settings',
  FAQ: '/faq',
  ONBOARDING: '/onboarding',
  MATCHES: '/matches/*',
  SKILLS: '/skills/*',
  NEEDS: '/needs/*',
  PROFILE_REDIRECT: '/profile/:userId',
  INVITE_SLUG: '/i/:slug',
  LOGIN: '/login',
  GOOGLE_CALLBACK: '/auth/google/callback',
  APPLE_DONE: '/auth/apple/done',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  DELETE_ACCOUNT: '/delete-account',
  INVITE: '/invite/:token',
  SOS: '/sos/:collectionId',
  HOW: '/how',
  GROUPS: '/groups',
  INTRO: '/intro',
  SEED: '/seed',
  HOME: '/',
  ASK: '/ask',
  ADD: '/add',
  ADD_QR: '/add/qr',
  ADD_SCAN: '/add/scan',
  ME: '/me',
  ME_ACCOUNT: '/me/account',
  ME_STAKE: '/me/stake',
  ME_HISTORY: '/me/history',
  ME_HELP: '/me/help',
  ME_FAQ: '/me/help/faq',
  ME_ASSISTANT: '/me/help/assistant',
  ME_BROADCAST: '/me/broadcast',
  ME_STATS: '/me/stats',
  ME_SETTINGS: '/me/settings',
  PEOPLE: '/people',
  PEOPLE_RING: '/people/:ring',
  PERSON: '/person/:id',
  COLLECTION: '/collection/:id',
  SUPPORT: '/support',
} as const;

export const DEV_WEB_ROUTES = {
  DEV_UI: '/dev/ui',
  DEV_MODERATION: '/dev/moderation',
} as const;

// The production build has no sample Need at this reserved development URL.
export const SOS_PREVIEW_ID = 'preview';
export const SOS_PREVIEW_PATH = WEB_ROUTES.SOS.replace(':collectionId', SOS_PREVIEW_ID);

function decodedPath(path: string): string {
  try {
    return path.split('/').map((part) => decodeURIComponent(part).replaceAll('/', '%2F')).join('/');
  } catch {
    return path;
  }
}

const productionPatterns = Object.values(WEB_ROUTES).map((path) => {
  const parts = path.split('/').map((part) => part.startsWith(':') ? '[^/]+' : part);
  const pattern = parts.at(-1) === '*' ? parts.slice(0, -1).join('/') + '(?:/.*)?' : parts.join('/');
  return new RegExp('^' + pattern + '/*$', 'i');
});

export function isProductionWebRoute(path: string): boolean {
  const decoded = decodedPath(path);
  if (decoded.toLowerCase().replace(/\/+$/, '') === SOS_PREVIEW_PATH) return false;
  return productionPatterns.some((pattern) => pattern.test(decoded));
}

export const PUBLIC_PAGE_METADATA = {
  [WEB_ROUTES.HOME]: { title: 'landing.v2.meta.title', description: 'landing.v2.meta.description' },
  [WEB_ROUTES.HOW]: { title: 'how.meta.title', description: 'how.meta.description' },
  [WEB_ROUTES.GROUPS]: { title: 'groups.meta.title', description: 'groups.meta.description' },
  [WEB_ROUTES.TERMS]: { title: 'legal.termsTitle', description: 'legal.termsDoc.s1', appendBrand: true },
  [WEB_ROUTES.PRIVACY]: { title: 'legal.privacyTitle', description: 'legal.policy.s1', appendBrand: true },
  [WEB_ROUTES.DELETE_ACCOUNT]: { title: 'legal.deleteAccount', description: 'legal.del.lead', appendBrand: true },
} as const;

export type PublicPagePath = keyof typeof PUBLIC_PAGE_METADATA;

export function publicPagePath(path: string): PublicPagePath | undefined {
  const normalized = decodedPath(path).toLowerCase().replace(/\/+$/, '') || '/';
  return Object.hasOwn(PUBLIC_PAGE_METADATA, normalized) ? normalized as PublicPagePath : undefined;
}

export function publicPageUrl(origin: string, path: PublicPagePath, lang?: string): string {
  const url = new URL(path, origin);
  if (lang) url.searchParams.set('lang', lang);
  return url.href;
}

export function renderPublicSitemap(origin: string, languages: readonly string[]): string {
  const entries = (Object.keys(PUBLIC_PAGE_METADATA) as PublicPagePath[]).flatMap((path) => {
    const versions = [
      ...languages.map((lang) => ({ lang, url: publicPageUrl(origin, path, lang) })),
      { lang: 'x-default', url: publicPageUrl(origin, path) },
    ];
    const alternates = versions.map(({ lang, url }) =>
      '    <xhtml:link rel="alternate" hreflang="' + lang + '" href="' + url + '" />').join('\n');
    return versions.map(({ url }) => '  <url>\n    <loc>' + url + '</loc>\n' + alternates + '\n  </url>');
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') + '\n</urlset>\n';
}
