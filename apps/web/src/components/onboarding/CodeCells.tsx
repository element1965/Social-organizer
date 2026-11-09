/*
 * Six code cells backed by ONE transparent input, so paste, OS autofill (one-time-code) and backspace
 * behave like a normal field. Calls onComplete when the sixth digit lands.
 * (ui2 Input variant="code" uses six inputs with maxLength=1, which blocks a pasted/autofilled code.)
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export function CodeCells({
  value,
  onChange,
  onComplete,
  label,
  invalid = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const cursor = Math.min(value.length, 5);

  return (
    <div className="relative mt-5">
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const digit = value[i];
          const current = focused && i === cursor && value.length < 6;
          return (
            <span
              key={i}
              className={cn(
                'grid h-primary place-items-center rounded-lg bg-surface text-h3 font-extrabold tabular-nums text-ink shadow-[inset_0_0_0_1px_rgb(var(--so-line)/0.14)]',
                digit && 'shadow-[inset_0_0_0_2px_rgb(var(--so-care))]',
                invalid && 'shadow-[inset_0_0_0_2px_rgb(var(--so-sos))]',
              )}
            >
              {digit ?? (current ? <i className="block motion-safe:animate-pulse h-[26px] w-0.5 rounded-[1px] bg-care" /> : null)}
            </span>
          );
        })}
      </div>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        aria-label={label}
        aria-invalid={invalid || undefined}
        maxLength={6}
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(next);
          if (next.length === 6) onComplete(next);
        }}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  );
}
