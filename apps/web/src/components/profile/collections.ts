import { REGULAR_CYCLE_DAYS } from '@so/shared';

export function isLive(status: string): boolean {
  return status === 'ACTIVE' || status === 'BLOCKED';
}

/** Plural form for one/few/many keys. Uses the language's own rules when given (en: 261 → many). */
export function countForm(count: number, lang?: string): 'one' | 'few' | 'many' {
  if (lang) {
    try {
      const form = new Intl.PluralRules(lang).select(count);
      return form === 'one' ? 'one' : form === 'few' ? 'few' : 'many';
    } catch {
      // Unknown locale: fall back to the Slavic rule below.
    }
  }
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export function openCountKey(count: number): 'profile.openOne' | 'profile.openMany' {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'profile.openOne';
  return 'profile.openMany';
}

type Participation = {
  unsubscribedAt: Date | string | null;
  collection: { status: string; creator: { id: string } };
};

/** Joined collections that are still open and not the viewer's own. */
export function isOpenParticipation(row: Participation, selfId: string): boolean {
  return row.collection.creator.id !== selfId && isLive(row.collection.status) && !row.unsubscribedAt;
}

/** Joined collections that are closed, cancelled, or that the viewer left. */
export function isPastParticipation(row: Participation, selfId: string): boolean {
  if (row.collection.creator.id === selfId) return false;
  if (row.unsubscribedAt) return true;
  return row.collection.status === 'CLOSED' || row.collection.status === 'CANCELLED';
}

export function cycleDeadline(start: Date | string | null | undefined): Date | null {
  if (!start) return null;
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + REGULAR_CYCLE_DAYS);
  return date;
}
