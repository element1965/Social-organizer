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
          'absolute top-[0.1875rem] h-6 w-6 rounded-full bg-surface shadow-float transition-[inset-inline-start,width] duration-base ease-so motion-reduce:transition-none',
          // On press, the knob stretches in the direction it will move.
          checked ? 'start-[1.3125rem] group-active:w-7 group-active:start-[1.0625rem]' : 'start-[0.1875rem] group-active:w-7',
        )}
      />
    </button>
  );
}
