/*
 * Third-party brand marks for the sign-in buttons.
 *
 * This is the only file in the onboarding folder with raw colors: the Google "G" and the Telegram button
 * must keep their brand colors in both themes, and the token set has no brand slots. Everything else in
 * the flow uses the --so-* tokens. If a `--so-telegram` token is added later, swap TELEGRAM_BG for it.
 */
import type { SVGProps } from 'react';

/** Telegram brand blue (as in the mockup); text on it is white in both themes. */
export const TELEGRAM_BG = '#229ED9';
export const TELEGRAM_FG = '#FFFFFF';

type P = SVGProps<SVGSVGElement>;

export function AppleMark(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.6-4zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4z" />
    </svg>
  );
}

export function GoogleMark(props: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
    </svg>
  );
}

export function TelegramMark(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="m3.5 11.3 15.4-6c.7-.3 1.3.2 1.1 1.2l-2.6 12.3c-.2.9-.7 1.1-1.5.7l-4-3-1.9 1.9c-.2.2-.4.4-.8.4l.3-4 7.3-6.6c.3-.3-.1-.4-.5-.2l-9 5.7-3.9-1.2c-.8-.3-.8-.8.1-1.2z" />
    </svg>
  );
}

export function MailMark(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function CheckMark(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
