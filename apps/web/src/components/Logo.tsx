interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 80, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 120 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Fish body (ichthys) */}
      <path
        d="M8 42C8 42 30 12 70 12C110 12 112 42 112 42C112 42 110 72 70 72C30 72 8 42 8 42Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Tail / X crossing */}
      <path
        d="M2 22L28 62M2 62L28 22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Eye */}
      <circle
        cx="85"
        cy="38"
        r="4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Left leg */}
      <path
        d="M45 72L38 82L32 78"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Right leg */}
      <path
        d="M65 72L72 82L78 78"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
