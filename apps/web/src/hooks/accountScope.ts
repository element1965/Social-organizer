import { useEffect } from 'react';
import { syncAuthFromStorage } from './useAuth';

/** The server's answer to a query that named another account than the session's token (another tab switched). */
export function isAccountChanged(error: unknown): boolean {
  return (error as { message?: string } | null | undefined)?.message === 'ACCOUNT_CHANGED';
}

/** Retry for the account-scoped queries: never for ACCOUNT_CHANGED (it cannot succeed), otherwise once, as elsewhere. */
export function scopedRetry(failureCount: number, error: unknown): boolean {
  return !isAccountChanged(error) && failureCount < 1;
}

/** On ACCOUNT_CHANGED, re-read the stored session so the query re-keys on the account that is signed in now. */
export function useAccountChangeRecovery(error: unknown): void {
  useEffect(() => {
    if (isAccountChanged(error)) syncAuthFromStorage();
  }, [error]);
}
