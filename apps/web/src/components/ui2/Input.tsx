import { useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { IconLock, IconSearch } from './icons';

type Common = {
  label?: string;
  hint?: string;
  error?: string;
};

type TextProps = Common &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    variant?: 'text' | 'search' | 'locked';
  };

type MoneyProps = Common & {
  variant: 'money';
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
};

type CodeProps = Common & {
  variant: 'code';
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
};

export type InputProps = TextProps | MoneyProps | CodeProps;

export function Input(props: InputProps) {
  if (props.variant === 'money') return <MoneyField {...props} />;
  if (props.variant === 'code') return <CodeField {...props} />;
  if (props.variant === 'locked') return <LockedField {...props} />;
  return <TextField {...props} />;
}

function FieldChrome({
  id,
  label,
  hint,
  error,
  children,
}: Common & { id: string; children: ReactNode }) {
  const hintId = `${id}-hint`;
  return (
    <label className="block" htmlFor={id}>
      {label ? <span className="mb-1.5 block text-label font-semibold text-ink-muted">{label}</span> : null}
      {children}
      {error ? (
        <span id={hintId} className="mt-1.5 block text-label font-semibold text-sos">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="mt-1.5 block text-label font-semibold text-ink-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function TextField({ label, hint, error, variant, className, id, ...rest }: TextProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const search = variant === 'search';
  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error}>
      <span className="relative block">
        {search ? (
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-subtle" />
        ) : null}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
          className={cn(
            'w-full border bg-surface-2 text-ink outline-none placeholder:text-ink-subtle',
            'focus:border-care',
            search
              ? 'h-secondary rounded-r-lg pl-10 pr-3 text-body-s font-semibold'
              : 'h-primary rounded-r-lg px-3.5 text-body-l font-semibold',
            error ? 'border-sos' : 'border-line',
            className,
          )}
          {...rest}
        />
      </span>
    </FieldChrome>
  );
}

function LockedField({ label, hint, error, value, id, className }: TextProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error}>
      <span
        id={fieldId}
        className={cn(
          'flex h-primary items-center gap-2 rounded-r-lg border border-line bg-surface-2 px-3.5 text-body-l font-semibold text-ink',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <IconLock className="h-5 w-5 shrink-0 text-ink-subtle" />
      </span>
    </FieldChrome>
  );
}

function MoneyField({ label, hint, error, value, onValueChange, placeholder, id, name }: MoneyProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error}>
      <span className={cn('flex h-[72px] items-baseline gap-2 border-b-2', error ? 'border-sos' : 'border-transparent')}>
        <input
          id={fieldId}
          name={name}
          inputMode="decimal"
          value={value}
          placeholder={placeholder ?? '0'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
          onChange={(event) => onValueChange?.(event.target.value.replace(/[^\d.,]/g, ''))}
          className="min-w-0 flex-1 bg-transparent text-display font-extrabold tabular-nums text-ink outline-none placeholder:text-ink-subtle"
        />
        <span className="text-[24px] font-bold leading-none text-ink-muted">$</span>
      </span>
    </FieldChrome>
  );
}

function CodeField({ label, hint, error, value, onValueChange, id }: CodeProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '');

  const write = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onValueChange(next.join('').replace(/\s+/g, ''));
  };

  const focusAt = (index: number) => {
    const el = refs.current[index];
    el?.focus();
    el?.select();
  };

  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error}>
      <span className="flex justify-between gap-1.5" role="group" aria-describedby={error || hint ? `${fieldId}-hint` : undefined}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={index === 0 ? fieldId : undefined}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            aria-label={`${index + 1}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              const raw = event.target.value.replace(/\D/g, '');
              if (!raw) {
                write(index, '');
                return;
              }
              write(index, raw.slice(-1));
              if (index < 5) focusAt(index + 1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digits[index] && index > 0) {
                write(index - 1, '');
                focusAt(index - 1);
              }
              if (event.key === 'ArrowLeft' && index > 0) focusAt(index - 1);
              if (event.key === 'ArrowRight' && index < 5) focusAt(index + 1);
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
              if (!pasted) return;
              event.preventDefault();
              onValueChange(pasted);
              focusAt(Math.min(pasted.length, 5));
            }}
            className={cn(
              'h-primary w-12 rounded-r-lg border bg-surface-2 text-center text-body-l font-bold tabular-nums text-ink outline-none',
              'focus:border-2 focus:border-care',
              error ? 'border-sos' : 'border-line',
            )}
          />
        ))}
      </span>
    </FieldChrome>
  );
}
