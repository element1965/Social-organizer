import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ strokeWidth = 1.8, children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export function IconPen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10.2-10.2a2 2 0 0 0 0-2.8l-.2-.2a2 2 0 0 0-2.8 0L5 17v3z" />
      <path d="m13.5 6.5 4 4" />
    </Svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="17" cy="6.5" r="2.2" />
      <circle cx="17" cy="17.5" r="2.2" />
      <path d="m8 11 7-3.5M8 13l7 3.5" />
    </Svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6z" />
      <path d="M14.2 14.2h1.6v1.6h-1.6zM17.6 14.2H19.2v1.6h-1.6zM14.2 17.6h1.6V19.2h-1.6zM17.6 17.6H19.2V19.2h-1.6z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 16.5 3.8 20l3.8-1.6A8.5 8.5 0 1 0 5 16.5z" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...props}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  );
}
