import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ strokeWidth = 1.8, children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v10" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6" />
    </Svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6z" />
      <path d="M14.2 14.2h1.8v1.8h-1.8zM17.8 14.2H19.6v1.8h-1.8zM14.2 17.8h1.8V19.6h-1.8zM17.8 17.8H19.6V19.6h-1.8z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconScan(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />
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

export function IconFlash(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M13 3 5 14h6l-1 7 8-11h-6z" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="m5 12 5 5L20 7" />
    </Svg>
  );
}
