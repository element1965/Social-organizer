import { cn } from '../../lib/utils';
import { askRing, type AskProgress } from './ask-progress';
import { IconHand } from './icons';

const CIRC = 88;

type AskMarkProps = {
  progress: AskProgress;
  active?: boolean;
  className?: string;
};

/** The ready hand uses a solid tile only in the Need section. */
export function AskMark({ progress, active = false, className }: AskMarkProps) {
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
          ready && active && 'bg-sos text-sos-on',
          ready && !active && 'bg-sos-soft text-sos',
          !ready && 'text-ink-subtle',
        )}
      >
        <IconHand className={cn('h-4 w-4', !ready && 'opacity-60')} />
      </span>
    </span>
  );
}
