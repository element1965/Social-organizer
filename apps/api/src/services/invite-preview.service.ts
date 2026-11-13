/*
 * Link previews for personal invites (SO-24, T10 п.4–5).
 * Messengers (Telegram, WhatsApp, iMessage…) read the HTML of /invite/<token> and /i/<slug> without running
 * JavaScript, so the inviter's name and photo have to be in the page the server sends.
 * Only the name and photo go into the card: no contacts, e-mail, network size or amounts.
 * Reading a preview never creates a request — it is a plain read.
 */
import type { PrismaClient } from '@so/db';
import { resources, SUPPORTED_LANGUAGES } from '@so/i18n';
import { firstName, inflectName, safeAddressee } from '@so/shared';

export { safeAddressee };

/** The same rule as the web client (flow.ts safeInviteToken): letters, digits, "_" and "-", sane length. */
const TOKEN_RE = /^[\w-]{1,128}$/;

export type InvitePreview = { name: string; photoUrl: string | null; language: string };

type Dict = Record<string, unknown>;

function lookup(lang: string, key: string): string | null {
  const res = resources as unknown as Record<string, Dict>;
  let node: unknown = res[lang];
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = (node as Dict)[part];
  }
  return typeof node === 'string' ? node : null;
}

function translate(lang: string, key: string, vars: Record<string, string>): string {
  const raw = lookup(lang, key) ?? lookup('en', key) ?? '';
  return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The first supported language of `?lang=`, then Accept-Language, then the inviter's own language. */
export function pickLanguage(queryLang: string | undefined, acceptLanguage: string | undefined, fallback: string): string {
  const supported = new Set<string>(SUPPORTED_LANGUAGES as readonly string[]);
  const norm = (v: string) => v.trim().toLowerCase().split(/[-_;]/)[0] ?? '';
  if (queryLang && supported.has(norm(queryLang))) return norm(queryLang);
  for (const part of (acceptLanguage ?? '').split(',')) {
    const code = norm(part);
    if (code && supported.has(code)) return code;
  }
  return supported.has(fallback) ? fallback : 'en';
}

/** Who stands behind a token: a single-use invite, a permanent link (user id) or a referral slug. */
export async function findInvitePreview(db: PrismaClient, rawToken: string): Promise<InvitePreview | null> {
  if (!TOKEN_RE.test(rawToken)) return null;
  const select = { name: true, photoUrl: true, language: true, deletedAt: true } as const;
  const invite = await db.inviteLink.findUnique({ where: { token: rawToken }, select: { inviter: { select } } });
  const user =
    invite?.inviter ??
    (await db.user.findUnique({ where: { id: rawToken }, select })) ??
    (await db.user.findUnique({ where: { referralSlug: rawToken.toLowerCase() }, select }));
  if (!user || user.deletedAt) return null;
  return { name: user.name, photoUrl: user.photoUrl, language: user.language };
}

/** Only http(s) photos and our own /api/avatar/… paths go into the card; anything else falls back to the site picture. */
export function absolutePhoto(photoUrl: string | null, origin: string): string | null {
  if (!photoUrl) return null;
  if (/^https:\/\//i.test(photoUrl)) return photoUrl;
  if (photoUrl.startsWith('/api/avatar/')) return `${origin}${photoUrl}`;
  return null;
}

/**
 * Rewrite the title, description and OG/Twitter tags of the built index.html for one invite.
 * The SPA itself is untouched: the browser still boots the same app on the same address.
 */
export function renderInvitePreview(
  html: string,
  preview: InvitePreview,
  opts: { lang: string; url: string; origin: string; to?: string | null },
): string {
  const name = preview.name.trim() || 'Social Organizer';
  const first = name.split(/\s+/)[0] || name;
  const to = safeAddressee(opts.to);
  return applyCard(html, {
    title: `${to ? `${to}, ` : ''}${translate(opts.lang, 'invite.calls', { name })}`,
    description: translate(opts.lang, 'invite.say', { name: first }),
    image: absolutePhoto(preview.photoUrl, opts.origin),
    imageAlt: name,
    lang: opts.lang,
    url: opts.url,
  });
}

export type SosPreview = {
  name: string;
  photoUrl: string | null;
  language: string;
  /** open: people can still take part; full: the amount is reported; closed; paused (moderation or the circle) */
  state: 'open' | 'full' | 'closed' | 'paused';
};

/** Collection ids are cuids; anything else is not looked up. */
const COLLECTION_ID_RE = /^[a-z0-9]{8,40}$/i;

/**
 * Who stands behind a public Need page. The card carries what the page itself shows first: the author's
 * name and photo. No amount, no description, no participants: a link card stays in chats long after
 * the Need is closed.
 */
export async function findSosPreview(db: PrismaClient, rawId: string): Promise<SosPreview | null> {
  if (!COLLECTION_ID_RE.test(rawId)) return null;
  const collection = await db.collection.findUnique({
    where: { id: rawId },
    select: {
      status: true,
      blockReason: true,
      creator: { select: { name: true, photoUrl: true, language: true, deletedAt: true } },
    },
  });
  if (!collection || collection.creator.deletedAt) return null;
  const state: SosPreview['state'] =
    collection.status === 'ACTIVE' ? 'open'
      : collection.status === 'BLOCKED' ? (collection.blockReason != null ? 'paused' : 'full')
        : 'closed';
  return { name: collection.creator.name, photoUrl: collection.creator.photoUrl, language: collection.creator.language, state };
}

const SOS_STATE_LINE: Record<SosPreview['state'], string> = {
  open: 'sos.joinCircleBody',
  full: 'sos.fullLine',
  closed: 'sos.closedLine',
  paused: 'sos.suspendedLine',
};

/** The same headline as the public page ("Anna needs assistance"; Russian puts the name in the dative). */
export function renderSosPreview(
  html: string,
  preview: SosPreview,
  opts: { lang: string; url: string; origin: string },
): string {
  const name = preview.name.trim() || 'Social Organizer';
  const shown = opts.lang === 'ru' ? inflectName(name, 'dative') : firstName(name);
  return applyCard(html, {
    title: translate(opts.lang, 'sos.headline', { name: shown }),
    description: translate(opts.lang, SOS_STATE_LINE[preview.state], { name: shown }),
    image: absolutePhoto(preview.photoUrl, opts.origin),
    imageAlt: name,
    lang: opts.lang,
    url: opts.url,
  });
}

/** Writes one link card (title, description, picture) into the built index.html. */
function applyCard(
  html: string,
  card: { title: string; description: string; image: string | null; imageAlt: string; lang: string; url: string },
): string {
  const { image } = card;
  const name = card.imageAlt;
  const opts = { lang: card.lang };
  const t = escapeHtml(card.title);
  const d = escapeHtml(card.description);
  const u = escapeHtml(card.url);
  let out = html;

  const setMeta = (attr: 'property' | 'name', key: string, value: string) => {
    const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`, 'i');
    const tag = `<meta ${attr}="${key}" content="${value}" />`;
    out = re.test(out) ? out.replace(re, tag) : out.replace('</head>', `    ${tag}\n  </head>`);
  };
  const dropMeta = (attr: 'property' | 'name', key: string) => {
    const re = new RegExp(`\\s*<meta\\s+${attr}="${key.replace(/[.:]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`, 'gi');
    out = out.replace(re, '');
  };

  out = out.replace(/<html lang="[^"]*"/i, `<html lang="${escapeHtml(opts.lang)}"`);
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
  setMeta('name', 'description', d);
  setMeta('property', 'og:title', t);
  setMeta('property', 'og:description', d);
  setMeta('property', 'og:url', u);
  setMeta('property', 'og:locale', escapeHtml(opts.lang));
  setMeta('name', 'twitter:title', t);
  setMeta('name', 'twitter:description', d);
  if (image) {
    // A profile photo is square and small: a summary card, no fixed 1200×630 size or the site's picture text
    const img = escapeHtml(image);
    setMeta('property', 'og:image', img);
    setMeta('name', 'twitter:image', img);
    setMeta('name', 'twitter:card', 'summary');
    setMeta('property', 'og:image:alt', escapeHtml(name));
    dropMeta('property', 'og:image:width');
    dropMeta('property', 'og:image:height');
  }
  return out;
}
