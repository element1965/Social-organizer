// @so/tg-adapter — Telegram WebApp SDK
/// <reference path="./telegram-webapp.d.ts" />

// ---- Detection ----

export function isTelegramWebApp(): boolean {
  return typeof window !== 'undefined' &&
    !!window.Telegram?.WebApp?.initData &&
    window.Telegram.WebApp.initData !== '';
}

// ---- Initialization ----

const initializedApps = new WeakSet<TelegramWebApp>();

export function initTelegramWebApp(): void {
  if (!isTelegramWebApp()) return;
  const wa = window.Telegram?.WebApp;
  if (!wa || initializedApps.has(wa)) return;
  initializedApps.add(wa);

  wa.ready();
  wa.expand();
  try { wa.disableVerticalSwipes?.(); } catch { /* old SDK versions */ }
}

// ---- User data ----

export function getTGInitData(): string | null {
  const data = window.Telegram?.WebApp?.initData;
  return data && data !== '' ? data : null;
}

// ---- Start param (deep linking) ----

export function getStartParam(): string | null {
  const param = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return param && param !== '' ? param : null;
}

// ---- Theme ----

export function setTGChromeColor(canvas: string): void {
  if (!isTelegramWebApp()) return;
  const wa = window.Telegram?.WebApp;
  if (!wa?.isVersionAtLeast?.('6.1')) return;

  wa.setBackgroundColor?.(canvas);
  // Older clients accept only Telegram's own theme colours for the header.
  wa.setHeaderColor?.(wa.isVersionAtLeast('6.9') ? canvas : 'bg_color');
}

export function getTGColorScheme(): 'light' | 'dark' {
  return window.Telegram?.WebApp?.colorScheme ?? 'light';
}

// ---- BackButton ----

export function showBackButton(callback: () => void): void {
  const btn = window.Telegram?.WebApp?.BackButton;
  if (!btn) return;
  btn.onClick(callback);
  btn.show();
}

export function hideBackButton(callback?: () => void): void {
  const btn = window.Telegram?.WebApp?.BackButton;
  if (!btn) return;
  if (callback) btn.offClick(callback);
  btn.hide();
}

// ---- Haptic Feedback ----

export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'): void {
  try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style); } catch { /* noop */ }
}

export function hapticNotification(type: 'error' | 'success' | 'warning' = 'success'): void {
  try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type); } catch { /* noop */ }
}

export function hapticSelection(): void {
  try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); } catch { /* noop */ }
}

// ---- Events ----

export function onThemeChanged(callback: () => void): () => void {
  window.Telegram?.WebApp?.onEvent('themeChanged', callback);
  return () => window.Telegram?.WebApp?.offEvent('themeChanged', callback);
}
