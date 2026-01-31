import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin', className)} />
  );
}
