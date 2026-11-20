interface Window {
  Telegram?: {
    WebApp?: {
      openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
      /** Opens a t.me link inside Telegram (a chat, a share sheet) instead of the browser */
      openTelegramLink?: (url: string) => void;
    };
  };
}
