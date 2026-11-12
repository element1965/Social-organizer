import { cn } from '../../lib/utils';
import { Avatar } from './Avatar';

type PersonRowProps = {
  name: string;
  subtitle?: string;
  value?: string;
  /** Small caption under the value ("Intention"); the value is then set smaller to share the row. */
  valueCaption?: string;
  /** 2: the subtitle may wrap to a second line instead of being cut (long handshake chains). */
  subtitleLines?: 1 | 2;
  src?: string | null;
  online?: boolean;
  onClick?: () => void;
};

export function PersonRow({ name, subtitle, value, valueCaption, subtitleLines = 1, src, online, onClick }: PersonRowProps) {
  const body = (
    <>
      <Avatar name={name} src={src} size={40} online={online} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-body text-ink">{name}</span>
        {subtitle ? (
          <span
            className={cn(
              'mt-0.5 block text-label font-semibold text-ink-muted',
              subtitleLines === 2 ? 'line-clamp-2 break-words' : 'truncate',
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
      {value && valueCaption ? (
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-body-s font-extrabold tabular-nums text-ink">{value}</span>
          <span className="text-micro font-bold text-ink-muted">{valueCaption}</span>
        </span>
      ) : value ? (
        <span className="text-body font-extrabold tabular-nums text-ink">{value}</span>
      ) : null}
    </>
  );
  const className = 'flex min-h-row w-full items-center gap-3 px-4 py-2 text-left';
  if (onClick) {
    return (
      <button
        type="button"
        className={cn(className, 'so-focus transition-colors duration-fast ease-so active:bg-surface-2 motion-reduce:transition-none')}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }
  return <div className={cn(className)}>{body}</div>;
}
