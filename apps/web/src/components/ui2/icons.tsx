import type { SVGProps } from 'react';
import { cn } from '../../lib/utils';

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
    // The network as a ball (like the 3D scene): an outline, the equator and a meridian,
    // you in the middle and people on the surface
    <Svg strokeWidth={1.6} {...props}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.4" strokeWidth={1.2} opacity={0.75} />
      <ellipse cx="12" cy="12" rx="3.6" ry="9" strokeWidth={1.2} opacity={0.75} />
      <circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="4.2" cy="13.7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.9" cy="14.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="4.2" r="1.5" fill="currentColor" stroke="none" />
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

const chevronDirection = { forward: 'rtl:-scale-x-100', down: 'rotate-90', up: '-rotate-90' };

export function IconChevron({ direction = 'forward', className, ...props }: IconProps & {
  direction?: keyof typeof chevronDirection;
}) {
  return (
    <Svg strokeWidth={1.8} {...props} className={cn(chevronDirection[direction], className)}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconBack({ className, ...props }: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...props} className={cn('rtl:-scale-x-100', className)}>
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

export { IconCheck, IconClose } from '../add/icons';
export { IconClock } from '../circle/icons';
export { IconGlobe, IconPlay } from '../site/icons';

export function IconChart(props: IconProps) {
  return <Svg {...props}><path d="M4 4v16h16M8 16v-4m5 4V7m5 9v-6" /></Svg>;
}

export function IconLink(props: IconProps) {
  return <Svg {...props}><path d="m10 14 4-4m-6 2-2 2a3 3 0 0 0 4 4l2-2m0-8 2-2a3 3 0 0 1 4 4l-2 2" /></Svg>;
}

export function IconPencil(props: IconProps) {
  return <Svg {...props}><path d="m4 20 1-5L16.5 3.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Zm10-14 4 4" /></Svg>;
}

export function IconSend(props: IconProps) {
  return <Svg {...props}><path d="m21 3-6 18-4-8-8-4 18-6ZM11 13 21 3" /></Svg>;
}

export function IconTrash(props: IconProps) {
  return <Svg {...props}><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></Svg>;
}

export function IconToggleOff(props: IconProps) {
  return <Svg {...props}><rect x="3" y="6" width="18" height="12" rx="6" /><circle cx="9" cy="12" r="2" /></Svg>;
}

export function IconToggleOn(props: IconProps) {
  return <Svg {...props}><rect x="3" y="6" width="18" height="12" rx="6" /><circle cx="15" cy="12" r="2" /></Svg>;
}

export function IconMic(props: IconProps) {
  return <Svg {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3" /></Svg>;
}

export function IconMicOff(props: IconProps) {
  return <Svg {...props}><path d="m3 3 18 18M9 5a3 3 0 0 1 6 1v5M9 9v2a3 3 0 0 0 4 3m-7-3v1a6 6 0 0 0 10 4m2-4v-1m-6 7v3" /></Svg>;
}

export function IconSpinner(props: IconProps) {
  return <Svg {...props}><path d="M21 12a9 9 0 1 1-9-9" /></Svg>;
}

export function IconAttachment(props: IconProps) {
  return <Svg {...props}><path d="m8 13 6-6a2 2 0 1 1 3 3l-7 7a4 4 0 0 1-6-6l7-7a6 6 0 0 1 9 9l-7 7" /></Svg>;
}

export function IconUpload(props: IconProps) {
  return <Svg {...props}><path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" /></Svg>;
}

export function IconMail(props: IconProps) {
  return <Svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
}

export function IconImagePlus(props: IconProps) {
  return <Svg {...props}><path d="M20 13v6H4V5h8m2 3h7m-3.5-3.5v7M4 17l5-5 4 4 2-2 5 5" /></Svg>;
}

export function IconFile(props: IconProps) {
  return <Svg {...props}><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4m-9 5h6m-6 4h6" /></Svg>;
}

export function IconVolume(props: IconProps) {
  return <Svg {...props}><path d="M3 9h4l5-4v14l-5-4H3V9Zm12 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" /></Svg>;
}
