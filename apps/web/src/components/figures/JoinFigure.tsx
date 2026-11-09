import { C, Person, Pill, You } from './shared';

export type JoinStep = 0 | 1;

export interface JoinFigureLabels {
  newcomer: string;
  /** Under the newcomer before / after you confirmed. */
  newcomerSub: [string, string];
  you: string;
  /** Under "you" before / after you confirmed. */
  youSub: [string, string];
  /** On the link before / after. */
  link: [string, string];
  aria: string;
}

export const JOIN_LABELS_RU: JoinFigureLabels = {
  newcomer: 'Катя',
  newcomerSub: ['вошла по ссылке', '1-е рукопожатие'],
  you: 'Вы',
  youSub: ['получили пуш', 'подтвердили'],
  link: ['ссылка', 'знакомы ✓'],
  aria: 'Новый человек',
};

export interface JoinFigureProps {
  /** 0 = opened your link, 1 = you confirmed. */
  step: JoinStep;
  labels?: Partial<JoinFigureLabels>;
  onSelect?: (index: 0 | 1) => void;
  className?: string;
}

const XA = 110;
const XB = 290;
const Y = 50;
const R = 24;

/** A new person: opened your link (0), you confirmed (1). viewBox 400x110. */
export function JoinFigure({ step, labels, onSelect, className }: JoinFigureProps) {
  const L = { ...JOIN_LABELS_RU, ...labels };
  const s = step ? 1 : 0;
  const sel = (i: 0 | 1) => (onSelect ? () => onSelect(i) : undefined);
  return (
    <svg viewBox="0 0 400 110" role="img" aria-label={L.aria} className={className}>
      <line
        x1={XA + R + 4}
        y1={Y}
        x2={XB - R - 4}
        y2={Y}
        stroke={s ? C.care : C.lineStrong}
        strokeWidth={s ? 3 : 1.5}
        strokeLinecap="round"
        strokeDasharray={s ? undefined : '4 5'}
      />
      <Pill x={(XA + XB) / 2} y={Y} text={L.link[s]} hot={!!s} />
      <Person x={XA} y={Y} r={R} hot={!!s} dashed={!s} name={L.newcomer} sub={L.newcomerSub[s]} onSelect={sel(0)} />
      <You x={XB} y={Y} r={R} hot={false} label={L.you} name={L.you} sub={L.youSub[s]} onSelect={sel(1)} />
    </svg>
  );
}
