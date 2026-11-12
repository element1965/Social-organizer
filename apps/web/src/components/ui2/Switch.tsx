import { cn } from '../../lib/utils';

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
};

export function Switch({ checked, onCheckedChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // Every size in rem (30 × 48 px at the base size), so "Large text" scales the whole control
        'group relative h-[1.875rem] w-12 shrink-0 rounded-pill transition-colors duration-base ease-so motion-reduce:transition-none',
        'so-focus',
        'disabled:opacity-[0.45]',
        checked ? 'bg-care' : 'bg-line',
      )}
    >
      <span
        className={cn(
          // left-0: without it the knob starts at its static position (the track centre) and the
          // translate pushes it past the right edge
          'absolute left-0 top-[0.1875rem] h-6 w-6 rounded-full bg-surface shadow-float transition-[transform,width] duration-base ease-so motion-reduce:transition-none',
          // While pressed the knob widens towards where it will go, as a physical switch gives under the finger
          checked ? 'translate-x-[1.3125rem] group-active:w-7 group-active:translate-x-[1.0625rem]' : 'translate-x-[0.1875rem] group-active:w-7',
        )}
      />
    </button>
  );
}
