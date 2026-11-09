import { cn } from '../../lib/utils';

type StageRailProps = {
  steps: string[];
  /** How many steps are already done. */
  done: number;
};

export function StageRail({ steps, done }: StageRailProps) {
  return (
    <ol className="mt-3.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const on = index < done;
        return (
          <li key={step}>
            <i className={cn('block h-1 rounded-r-xs', on ? 'bg-care' : 'bg-line')} />
            <span className={cn('mt-1.5 block text-micro font-bold', on ? 'text-ink' : 'text-ink-muted')}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
