import { cn } from '../../lib/utils';

type PathFigureProps = {
  names: string[];
};

function shortName(name: string, compact: boolean): string {
  if (!compact) return name;
  const first = name.trim().split(/\s+/)[0];
  return first || name;
}

export function PathFigure({ names }: PathFigureProps) {
  const compact = names.length >= 4;
  return (
    <div className="flex items-start text-label font-bold text-ink-muted">
      {names.map((name, index) => {
        const end = index === names.length - 1;
        const start = index === 0;
        return (
          <div key={`${name}-${index}`} className="contents">
            <span className={cn('flex flex-col items-center gap-1 whitespace-nowrap', end && 'text-care', start && 'text-ink')}>
              <i
                className={cn(
                  'block h-2.5 w-2.5 rounded-full',
                  start && 'bg-ink',
                  end && !start && 'bg-care shadow-[0_0_0_4px_rgb(var(--so-care-soft))]',
                  !start && !end && 'bg-line',
                )}
              />
              {shortName(name, compact)}
            </span>
            {index < names.length - 1 ? <em className="mx-1.5 mt-1 h-0.5 min-w-3 flex-1 bg-care/70" /> : null}
          </div>
        );
      })}
    </div>
  );
}
