import { cn } from '../../lib/utils';

type PathFigureProps = {
  names: string[];
  scene?: boolean;
  /** A not-yet-confirmed acquaintance: dashed, and named, so it is not the solid line of a handshake. */
  pending?: boolean;
  /** Visible name of a pending line, for example "Invitation". */
  lineLabel?: string;
};

function shortName(name: string, compact: boolean): string {
  if (!compact) return name;
  const first = name.trim().split(/\s+/)[0];
  return first || name;
}

export function PathFigure({ names, scene = false, pending = false, lineLabel }: PathFigureProps) {
  const compact = names.length >= 4;
  return (
    <div className={cn('flex items-start text-label font-bold text-ink-muted', scene && 'relative')}>
      {scene && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-1/4 top-1 h-0.5',
            pending
              ? 'text-node-2 [background-image:repeating-linear-gradient(90deg,currentColor_0_6px,transparent_6px_10px)]'
              : 'bg-care-scene/60',
          )}
        />
      )}
      {scene && pending && lineLabel ? (
        <span className="absolute left-1/2 top-1 z-[1] -translate-x-1/2 -translate-y-1/2 bg-scene px-1.5 text-center text-micro font-bold leading-tight text-node-2">
          {lineLabel}
        </span>
      ) : null}
      {names.map((name, index) => {
        const end = index === names.length - 1;
        const start = index === 0;
        return (
          <div key={`${name}-${index}`} className="contents">
            <span className={cn(
              'flex flex-col items-center gap-1',
              scene ? 'relative min-w-0 flex-1 text-center text-node-1' : 'whitespace-nowrap',
              scene ? end && 'text-care-scene' : end && 'text-care',
              !scene && start && 'text-ink',
            )}>
              <i
                className={cn(
                  'block h-2.5 w-2.5 rounded-full',
                  start && (scene ? 'bg-node-1 ring-4 ring-node-1/20' : 'bg-ink'),
                  end && !start && (scene ? 'bg-care-scene ring-4 ring-care-scene/20' : 'bg-care shadow-[0_0_0_4px_rgb(var(--so-care-soft))]'),
                  !start && !end && 'bg-line',
                )}
              />
              <bdi className={scene ? 'max-w-full break-words' : undefined}>{shortName(name, compact)}</bdi>
            </span>
            {!scene && index < names.length - 1 ? (
              <span aria-hidden className="mx-1.5 mt-1 h-0.5 min-w-3 flex-1 bg-care/70" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
