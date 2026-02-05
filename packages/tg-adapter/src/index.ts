// @so/tg-adapter — Telegram WebApp SDK
/// <reference path="./telegram-webapp.d.ts" />

export interface TGUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  languageCode?: string;
  isPremium?: boolean;
}

// ---- Detection ----

export function isTelegramWebApp(): boolean {
  return typeof window !== 'undefined' &&
    !!window.Telegram?.WebApp?.initData &&
    window.Telegram.WebApp.initData !== '';
}

// ---- Initialization ----

export function initTelegramWebApp(): void {
  const wa = window.Telegram?.WebApp;
  if (!wa) return;
  wa.ready();
  wa.expand();
  try { wa.disableVerticalSwipes(); } catch { /* old SDK versions */ }
}

// ---- User data ----

export function getTGUser(): TGUser | null {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    photoUrl: user.photo_url,
    languageCode: user.language_code,
    isPremium: user.is_premium,
  };
}

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

export function getTGColorScheme(): 'light' | 'dark' {
  return window.Telegram?.WebApp?.colorScheme ?? 'light';
}

export function getTGThemeParams(): Record<string, string | undefined> {
  const tp = window.Telegram?.WebApp?.themeParams;
  if (!tp) return {};
  return {
    bgColor: tp.bg_color,
    textColor: tp.text_color,
    hintColor: tp.hint_color,
    linkColor: tp.link_color,
    buttonColor: tp.button_color,
    buttonTextColor: tp.button_text_color,
    secondaryBgColor: tp.secondary_bg_color,
    headerBgColor: tp.header_bg_color,
    accentTextColor: tp.accent_text_color,
    sectionBgColor: tp.section_bg_color,
    sectionHeaderTextColor: tp.section_header_text_color,
    subtitleTextColor: tp.subtitle_text_color,
    destructiveTextColor: tp.destructive_text_color,
  };
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

// ---- MainButton ----

export function showMainButton(text: string, callback: () => void): void {
  const btn = window.Telegram?.WebApp?.MainButton;
  if (!btn) return;
  btn.setText(text);
  btn.onClick(callback);
  btn.show();
}

export function hideMainButton(callback?: () => void): void {
  const btn = window.Telegram?.WebApp?.MainButton;
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
