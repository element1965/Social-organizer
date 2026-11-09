import { Capacitor } from '@capacitor/core';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled';

export interface ShareLinkInput {
  title: string;
  text: string;
  url: string;
}

function cancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message) : '';
  return name === 'AbortError' || /cancel/i.test(message);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error('clipboard');
}

/**
 * Share a link through the native sheet, then the Web Share API.
 * If neither is available, copy the message and the link.
 */
export async function shareLink({ title, text, url }: ShareLinkInput): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    } catch (error) {
      if (cancelled(error)) return 'cancelled';
    }
  }

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (cancelled(error)) return 'cancelled';
    }
  }

  await copyText(`${text}\n${url}`);
  return 'copied';
}
