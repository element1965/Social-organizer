import { Capacitor } from '@capacitor/core';
import { trpc } from '../lib/trpc';

/**
 * "Connect Telegram": a one-time link code opens the bot's mini app (startapp=link_CODE), which attaches
 * this Telegram to the signed-in account. If the Telegram already has an account with a network and this
 * one is still empty, the server folds this one into it, so the person keeps a single account.
 */
export function useConnectTelegram() {
  const generate = trpc.auth.generateLinkCode.useMutation();

  const connect = () => {
    // Open the window inside the tap: a popup opened after the request would be blocked
    const win = Capacitor.isNativePlatform() ? null : window.open('', '_blank');
    generate.mutate(undefined, {
      onSuccess: ({ code }) => {
        const bot = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'socialorganizer_bot';
        const url = `https://t.me/${bot}?startapp=link_${code}`;
        if (win) win.location.href = url;
        else window.open(url, '_blank');
      },
      onError: () => win?.close(),
    });
  };

  return { connect, isPending: generate.isPending };
}
