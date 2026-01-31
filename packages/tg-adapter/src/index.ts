// @so/tg-adapter — Telegram WebApp SDK (stub)
export interface TGUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

export function initTelegramWebApp(): void {
  // TODO: window.Telegram.WebApp.ready()
}

export function getTGUser(): TGUser | null {
  // TODO: window.Telegram.WebApp.initDataUnsafe.user
  return null;
}

export function getTGInitData(): string | null {
  // TODO: window.Telegram.WebApp.initData
  return null;
}
