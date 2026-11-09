import type { SVGProps } from 'react';

/* Circle-only icons from mockups/v2/circle-a.html. Candidates for ui2/icons (see WP2 report). */

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ strokeWidth = 1.8, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconRepeat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 2.5 20.5 6 17 9.5M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5M7 21.5l-3.5-3.5L7 14.5M20.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5H3.5" />
    </Svg>
  );
}

export function IconDone(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...props}>
      <path d="m6 12.5 4 4 8-9" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function IconAim(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconFit(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconUp(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9v6M14 9v6" />
    </Svg>
  );
}
