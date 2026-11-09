import { cn } from '../../lib/utils';
import { askRing, type AskProgress } from './ask-progress';
import { IconHand } from './icons';

const CIRC = 88;

type AskMarkProps = {
  progress: AskProgress;
  className?: string;
};

/** Red hand when the request is open. Quiet hand and a care ring while it is not. */
export function AskMark({ progress, className }: AskMarkProps) {
  const { ready, ratio } = askRing(progress);
  return (
    <span className={cn('relative grid h-[26px] w-[26px] place-items-center', className)}>
      {ready ? null : (
        <svg className="absolute -inset-[3px] h-8 w-8 -rotate-90" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="14" fill="none" strokeWidth="2.2" className="stroke-line" />
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="stroke-care"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - ratio)}
          />
        </svg>
      )}
      <span
        className={cn(
          'grid h-[26px] w-[26px] place-items-center rounded-sm',
          ready ? 'bg-sos text-sos-on' : 'text-ink-subtle',
        )}
      >
        <IconHand className="h-4 w-4" />
      </span>
    </span>
  );
}
