import { MIN_OBLIGATION_AMOUNT, MIN_COLLECTION_AMOUNT, MAX_CONNECTIONS } from './constants.js';
import { isSupportedCurrency } from './currencies.js';

export function validateCollectionAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount < MIN_COLLECTION_AMOUNT) {
    return `Amount must be at least ${MIN_COLLECTION_AMOUNT}`;
  }
  return null;
}

export function validateObligationAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount < MIN_OBLIGATION_AMOUNT) {
    return `Amount must be at least ${MIN_OBLIGATION_AMOUNT}`;
  }
  return null;
}

export function validateCurrency(code: string): string | null {
  if (!isSupportedCurrency(code)) {
    return `Unsupported currency: ${code}`;
  }
  return null;
}

export function validateChatLink(url: string): string | null {
  try {
    new URL(url);
    return null;
  } catch {
    return 'Invalid URL';
  }
}

export function validateConnectionLimit(currentCount: number): string | null {
  if (currentCount >= MAX_CONNECTIONS) {
    return `Connection limit reached (${MAX_CONNECTIONS})`;
  }
  return null;
}

/**
 * Validate a contact value by type.
 * Returns null if valid, or an i18n error key if invalid.
 * Empty values are considered valid (not required per-field).
 */
export function validateContact(type: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null; // empty is ok

  const ERR = 'validation.invalidContact';

  switch (type) {
    case 'whatsapp': {
      // +prefix, 10-15 digits total
      const digits = v.replace(/[^0-9]/g, '');
      if (!v.startsWith('+') || digits.length < 10 || digits.length > 15) return ERR;
      return null;
    }
    case 'instagram': {
      const handle = v.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/\/$/, '');
      return /^[a-zA-Z0-9._]{1,30}$/.test(handle) ? null : ERR;
    }
    case 'twitter': {
      const handle = v.replace(/^(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\//, '').replace(/^@/, '').replace(/\/$/, '');
      return /^[a-zA-Z0-9_]{1,15}$/.test(handle) ? null : ERR;
    }
    case 'tiktok': {
      const handle = v.replace(/^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@?/, '').replace(/^@/, '').replace(/\/$/, '');
      return /^[a-zA-Z0-9._]{2,24}$/.test(handle) ? null : ERR;
    }
    case 'telegram': {
      const handle = v.replace(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\//, '').replace(/^@/, '').replace(/\/$/, '');
      return /^[a-zA-Z0-9_]{5,32}$/.test(handle) ? null : ERR;
    }
    case 'facebook': {
      const cleaned = v.replace(/^(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\//, '').replace(/\/$/, '');
      return cleaned.length >= 5 ? null : ERR;
    }
    case 'linkedin': {
      const cleaned = v.replace(/^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '');
      return cleaned.length >= 3 ? null : ERR;
    }
    case 'vk': {
      const cleaned = v.replace(/^(?:https?:\/\/)?(?:www\.)?vk\.com\//, '').replace(/\/$/, '');
      return cleaned.length >= 1 ? null : ERR;
    }
    case 'email':
      return /^.+@.+\..+$/.test(v) ? null : ERR;
    case 'website':
      return /^https?:\/\/.+\..+/.test(v) || /^.+\..+/.test(v) ? null : ERR;
    default:
      return null;
  }
}
