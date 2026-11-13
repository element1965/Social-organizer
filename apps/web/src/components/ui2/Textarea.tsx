import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
  label?: string;
  hint?: string;
  error?: string;
  value: string;
  /** Shows "length / max" under the field; also sets maxLength. */
  max?: number;
};

/** Multi-line text field with the same chrome as Input. Direction follows the typed text (RTL friendly). */
export function Textarea({ label, hint, error, value, max, className, id, rows = 3, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const note = error || hint;
  return (
    <div>
      {label ? <label htmlFor={fieldId} className="mb-1.5 block text-label font-semibold text-ink-muted">{label}</label> : null}
      <textarea
        id={fieldId}
        dir="auto"
        rows={rows}
        value={value}
        maxLength={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? hintId : undefined}
        className={cn(
          'min-h-[88px] w-full resize-none rounded-lg border bg-surface-2 px-3.5 py-3 so-field text-body-s font-semibold text-ink outline-none placeholder:text-ink-subtle',
          'focus:border-care',
          error ? 'border-sos' : 'border-line',
          className,
        )}
        {...rest}
      />
      <span className="mt-1.5 flex items-start justify-between gap-3 text-label font-semibold">
        {note ? (
          <span id={hintId} className={error ? 'text-sos' : 'text-ink-muted'}>{note}</span>
        ) : <span />}
        {max ? <span className="shrink-0 tabular-nums text-ink-muted" dir="ltr">{value.length} / {max}</span> : null}
      </span>
    </div>
  );
}
