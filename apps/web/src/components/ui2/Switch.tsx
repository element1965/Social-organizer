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
          'absolute start-[0.1875rem] top-[0.1875rem] h-6 w-6 rounded-full bg-surface shadow-float transition-transform duration-base ease-so group-active:scale-x-[1.166667] motion-reduce:transition-none',
          // On press, the knob stretches in the direction it will move.
          checked
            ? 'origin-right translate-x-[1.125rem] rtl:origin-left rtl:-translate-x-[1.125rem]'
            : 'origin-left rtl:origin-right',
        )}
      />
    </button>
  );
}
