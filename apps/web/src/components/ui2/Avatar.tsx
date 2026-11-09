import { cn } from '../../lib/utils';

const sizeClass = {
  36: 'h-9 w-9 rounded-r-md text-micro',
  40: 'h-10 w-10 rounded-r-md text-body-s',
  48: 'h-12 w-12 rounded-r-lg text-body-l',
  64: 'h-16 w-16 rounded-r-xl text-h3',
  88: 'h-[88px] w-[88px] rounded-r-2xl text-h1',
} as const;

export type AvatarSize = keyof typeof sizeClass;

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
};

export function Avatar({ name, src, size = 40, online = false, className }: AvatarProps) {
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center bg-care-soft font-extrabold text-care', sizeClass[size], className)}>
      {src ? <img src={src} alt="" className="h-full w-full rounded-[inherit] object-cover" /> : letter}
      {online ? (
        <i className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-care ring-[3px] ring-surface" />
      ) : null}
    </span>
  );
}
