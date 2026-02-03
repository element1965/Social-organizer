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
          <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
          {hint && (
            <Tooltip content={hint}>
              <button type="button" className="text-gray-400 hover:text-gray-500 focus:outline-none">
                <HelpCircle className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      <input
        id={id}
        className={cn(
          'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
