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
