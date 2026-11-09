import { cn } from '../../lib/utils';

export type SegmentOption<T extends string> = { value: T; label: string; disabled?: boolean };

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  /** Inline is the 30px control used in a settings row. */
  variant?: 'block' | 'inline';
  className?: string;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  variant = 'block',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        variant === 'inline'
          ? 'inline-flex gap-0.5 rounded-md bg-canvas p-0.5'
          : 'grid gap-1 rounded-lg bg-canvas p-1',
        className,
      )}
      style={variant === 'block' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'so-focus font-bold disabled:opacity-40',
              variant === 'inline'
                ? 'h-[30px] rounded-sm px-2.5 text-micro'
                : 'h-secondary rounded-md px-2 text-body-s',
              selected
                ? variant === 'inline'
                  ? 'bg-surface text-ink shadow-card'
                  : 'bg-ink text-canvas'
                : 'text-ink-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
