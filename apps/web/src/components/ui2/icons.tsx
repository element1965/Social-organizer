import type { SVGProps } from 'react';

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

export function IconCircle(props: IconProps) {
  return (
    <Svg strokeWidth={1.7} {...props}>
      <circle cx="12" cy="12.4" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="5.6" cy="7.4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.4" cy="7.6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="17.6" r="1.6" fill="currentColor" stroke="none" />
      <path d="M7 8.4 10.3 11.2M13.9 11.3 17 8.6M13.3 13.9l2.3 2.7" />
    </Svg>
  );
}

export function IconHand(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8.2a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5.1-2.9L3.2 13a1.5 1.5 0 0 1 2.5-1.6L8 14.5" />
    </Svg>
  );
}

export function IconAdd(props: IconProps) {
  return (
    <Svg strokeWidth={1.75} {...props}>
      <circle cx="9" cy="8" r="2.7" />
      <path d="M3.6 18.4c.8-2.6 2.7-4 5.4-4s4.6 1.4 5.4 4M17.2 6.2v5.2M14.6 8.8h5.2" />
    </Svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <Svg strokeWidth={1.75} {...props}>
      <circle cx="8.5" cy="8.2" r="2.5" />
      <circle cx="15.6" cy="9" r="2" />
      <path d="M3.4 18.2c.7-2.5 2.4-3.8 5.1-3.8 2.5 0 4.2 1.2 5 3.4" />
      <path d="M13.2 14.8c1.5-.4 3 .1 4 1.5.8 1.1 1 1.8.9 2" />
    </Svg>
  );
}

export function IconPerson(props: IconProps) {
  return (
    <Svg strokeWidth={1.75} {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.2 18.6c1.05-3 3.4-4.5 6.8-4.5s5.75 1.5 6.8 4.5" />
    </Svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Svg strokeWidth={1.8} {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconBack(props: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg strokeWidth={1.8} {...props}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconUserPlus(props: IconProps) {
  return (
    <Svg strokeWidth={1.8} {...props}>
      <circle cx="10" cy="8" r="3" />
      <path d="M4 19c1-3 3.2-4.5 6-4.5s5 1.5 6 4.5M17 5.5v5M14.5 8h5" />
    </Svg>
  );
}
