import { cn } from '../../lib/utils';
import { Avatar } from './Avatar';

type PersonRowProps = {
  name: string;
  subtitle?: string;
  value?: string;
  src?: string | null;
  online?: boolean;
  onClick?: () => void;
};

export function PersonRow({ name, subtitle, value, src, online, onClick }: PersonRowProps) {
  const body = (
    <>
      <Avatar name={name} src={src} size={40} online={online} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-body text-ink">{name}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{subtitle}</span> : null}
      </span>
      {value ? <span className="text-body font-extrabold tabular-nums text-ink">{value}</span> : null}
    </>
  );
  const className = 'flex min-h-row w-full items-center gap-3 px-4 py-2 text-left';
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={cn(className)}>{body}</div>;
}
