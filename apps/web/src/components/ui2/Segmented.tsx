import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
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

/**
 * Tabs with one highlight that slides to the chosen option. The highlight is measured from the selected button,
 * so it follows any label width (inline) and any column count (block); the first placement does not animate.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  variant = 'block',
  className,
}: SegmentedProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const selected = list.querySelector<HTMLElement>('[aria-selected="true"]');
      setThumb(selected ? { left: selected.offsetLeft, width: selected.offsetWidth } : null);
    };
    measure();
    // Larger text, a language switch or a resized window change the button widths
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [value, options.length, variant]);

  // Animate from the second placement on: the first one only puts the highlight in place
  useLayoutEffect(() => {
    if (!thumb || placed.current) return;
    const frame = requestAnimationFrame(() => {
      placed.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [thumb]);

  const thumbStyle: CSSProperties | undefined = thumb
    ? { width: thumb.width, transform: `translateX(${thumb.left}px)` }
    : undefined;

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(
        'relative',
        variant === 'inline'
          ? 'inline-flex gap-0.5 rounded-md bg-canvas p-0.5'
          : 'grid gap-1 rounded-lg bg-canvas p-1',
        className,
      )}
      style={variant === 'block' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {thumb ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0',
            variant === 'inline' ? 'inset-y-0.5 rounded-sm bg-surface shadow-card' : 'inset-y-1 rounded-md bg-ink',
            placed.current && 'transition-[transform,width] duration-base ease-so motion-reduce:transition-none',
          )}
          style={thumbStyle}
        />
      ) : null}
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
              'so-focus relative font-bold transition-colors duration-base ease-so disabled:opacity-40 motion-reduce:transition-none',
              variant === 'inline'
                ? 'h-[30px] rounded-sm px-2.5 text-micro'
                : 'h-secondary rounded-md px-2 text-body-s',
              selected
                ? variant === 'inline'
                  ? 'text-ink'
                  : 'text-canvas'
                : 'text-ink-muted',
              // Before the highlight is measured, the selected button paints its own background
              selected && !thumb && (variant === 'inline' ? 'bg-surface shadow-card' : 'bg-ink'),
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
