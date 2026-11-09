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
        'relative h-[30px] w-12 shrink-0 rounded-pill transition-colors duration-200 motion-reduce:transition-none',
        'so-focus',
        'disabled:opacity-[0.45]',
        checked ? 'bg-care' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-6 w-6 rounded-full bg-surface shadow-float transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-[21px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
