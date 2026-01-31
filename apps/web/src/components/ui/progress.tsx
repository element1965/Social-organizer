import { cn } from '../../lib/utils';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
}

export function Progress({ value, max = 100, className }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2', className)}>
      <div
        className={cn('h-full rounded-full transition-all', percentage >= 100 ? 'bg-green-500' : 'bg-blue-600')}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
