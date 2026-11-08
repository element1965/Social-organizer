import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from './tooltip';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ className, label, error, hint, id, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center gap-1">
          <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
            {label}
          </label>
          {hint && (
            <Tooltip content={hint}>
              <button type="button" className="text-ink-subtle hover:text-ink-muted focus:outline-none">
                <HelpCircle className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      <input
        id={id}
        className={cn(
          'w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-care focus:border-transparent',
          error && 'border-sos focus:ring-sos',
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-sos">{error}</p>}
    </div>
  );
}
