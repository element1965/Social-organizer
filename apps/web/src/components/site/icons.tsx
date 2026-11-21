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

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const };

export function IconGlobe(p: P) {
  return (
    <svg {...base} {...stroke} strokeWidth={1.8} {...p}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M3.5 12h17M12 3.25c2.4 2.4 3.6 5.3 3.6 8.75s-1.2 6.35-3.6 8.75c-2.4-2.4-3.6-5.3-3.6-8.75S9.6 5.65 12 3.25z" />
    </svg>
  );
}
