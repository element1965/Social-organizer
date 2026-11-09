import { usePrefersReducedMotion } from '../../lib/scrollPlay';
import { C, FigText, Person, You } from './shared';

export type ChainStep = 0 | 1 | 2;

export interface ChainFigureLabels {
  asker: string;
  askerSub: string;
  mediator: string;
  mediatorSub: string;
  you: string;
  youSub: string;
  amount: string;
  aria: string;
}

export const CHAIN_LABELS_RU: ChainFigureLabels = {
  asker: 'Мария',
  askerSub: 'просит 300 $',
  mediator: 'Олег',
  mediatorSub: 'ваш брат',
  you: 'Вы',
  youSub: 'решаете сами',
  amount: '300 $',
  aria: 'Путь просьбы',
};

export interface ChainFigureProps {
  /** Lights the path up to this person: 0 asker, 1 the one who vouches, 2 you. */
  step: ChainStep;
  labels?: Partial<ChainFigureLabels>;
  /** Makes the three people clickable (the /how page lets you tap them). */
  onSelect?: (step: ChainStep) => void;
  className?: string;
}

const X = [60, 200, 340] as const;
const Y = 50;
const R = 24;

/** Vouching: Maria asks, Oleg knows her, you know Oleg. viewBox 400x110. */
export function ChainFigure({ step, labels, onSelect, className }: ChainFigureProps) {
  const reduce = usePrefersReducedMotion();
  const L = { ...CHAIN_LABELS_RU, ...labels };
  const sel = (i: ChainStep) => (onSelect ? () => onSelect(i) : undefined);

  const seg = (i: 0 | 1) => {
    const lit = i < step;
    return (
      <line
        key={i}
        x1={X[i]! + R + 4}
        y1={Y}
        x2={X[i + 1]! - R - 4}
        y2={Y}
        stroke={lit ? C.care : C.lineStrong}
        strokeWidth={lit ? 3 : 1.5}
        strokeLinecap="round"
        strokeDasharray={lit ? undefined : '4 5'}
      />
    );
  };

  return (
    <svg viewBox="0 0 400 110" role="img" aria-label={L.aria} className={className}>
      {seg(0)}
      {seg(1)}
      <Person x={X[0]} y={Y} r={R} hot name={L.asker} sub={L.askerSub} onSelect={sel(0)} />
      <Person x={X[1]} y={Y} r={R} hot={step >= 1} name={L.mediator} sub={L.mediatorSub} onSelect={sel(1)} />
      <You x={X[2]} y={Y} r={R} hot={step >= 2} label={L.you} name={L.you} sub={L.youSub} onSelect={sel(2)} />
      <g>
        <rect x={X[0] + 10} y={Y - 48} width={54} height={22} rx={11} fill={C.care} />
        <FigText x={X[0] + 37} y={Y - 33} size={11} weight={800} color={C.onCare}>
          {L.amount}
        </FigText>
      </g>
      {step > 0 && !reduce && (
        <circle r={5} fill={C.care}>
          <animateMotion dur={`${1.1 * step}s`} repeatCount="indefinite" path={`M${X[0] + R + 4} ${Y} L${X[step]! - R - 4} ${Y}`} />
        </circle>
      )}
    </svg>
  );
}
