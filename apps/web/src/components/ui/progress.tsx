import { cn } from '../../lib/utils';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
}

export function Progress({ value, max = 100, className }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('w-full bg-surface-2 rounded-full h-2', className)}>
      <div
        className="h-full rounded-full bg-care transition-all"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
