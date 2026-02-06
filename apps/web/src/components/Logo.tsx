interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 80, className = '' }: LogoProps) {
  // The logo.png is white on transparent, we use it as a mask to apply color via className
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size * 0.71,
        backgroundColor: 'currentColor',
        WebkitMaskImage: 'url(/logo.png)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskImage: 'url(/logo.png)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    />
  );
}
