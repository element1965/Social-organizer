import { cn } from '../../lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ className, label, options, id, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-ink-muted">{label}</label>}
      <select
        id={id}
        className={cn(
          'w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-care',
          className
        )}
        {...props}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
