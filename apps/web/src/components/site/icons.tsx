import type { SVGProps } from 'react';

/** Brand and pictogram glyphs for the site (from docs/redesign/mockups/v2/web.js). All use currentColor. */
type P = SVGProps<SVGSVGElement>;

const base = { viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const };

export function IconPlay(p: P) {
  return (
    <svg {...base} fill="currentColor" {...p}>
      <path d="M5 3.8v16.4c0 .6.6.9 1.1.6l13.2-8.2c.5-.3.5-1 0-1.3L6.1 3.2c-.5-.3-1.1 0-1.1.6z" />
    </svg>
  );
}

export function IconApple(p: P) {
  return (
    <svg {...base} fill="currentColor" {...p}>
      <path d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.6-4zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4z" />
    </svg>
  );
}

export function IconTelegram(p: P) {
  return (
    <svg {...base} fill="currentColor" {...p}>
      <path d="m3.5 11.3 15.4-6c.7-.3 1.3.2 1.1 1.2l-2.6 12.3c-.2.9-.7 1.1-1.5.7l-4-3-1.9 1.9c-.2.2-.4.4-.8.4l.3-4 7.3-6.6c.3-.3-.1-.4-.5-.2l-9 5.7-3.9-1.2c-.8-.3-.8-.8.1-1.2z" />
    </svg>
  );
}

export function IconGithub(p: P) {
  return (
    <svg {...base} fill="currentColor" {...p}>
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z" />
    </svg>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const };

export function IconWallet(p: P) {
  return (
    <svg {...base} {...stroke} {...p}>
      <rect x="3.5" y="6.5" width="17" height="12" rx="3" />
      <path d="M15 12.5h5.5" />
    </svg>
  );
}

export function IconFree(p: P) {
  return (
    <svg {...base} {...stroke} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m7 7 10 10" />
    </svg>
  );
}

export function IconShield(p: P) {
  return (
    <svg {...base} {...stroke} strokeLinejoin="round" {...p}>
      <path d="M12 3.5 5 6v5.5c0 4 3 7.3 7 9 4-1.7 7-5 7-9V6z" />
    </svg>
  );
}

export function IconGlobe(p: P) {
  return (
    <svg {...base} {...stroke} strokeWidth={1.8} {...p}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M3.5 12h17M12 3.25c2.4 2.4 3.6 5.3 3.6 8.75s-1.2 6.35-3.6 8.75c-2.4-2.4-3.6-5.3-3.6-8.75S9.6 5.65 12 3.25z" />
    </svg>
  );
}
