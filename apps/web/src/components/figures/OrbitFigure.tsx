import { usePrefersReducedMotion } from '../../lib/scrollPlay';
import { C, Person, Pill, You, polar, r1 } from './shared';

export type OrbitDepth = 0 | 1 | 2;

export interface OrbitFigureLabels {
  names: string[];
  you: string;
  /** Pills on the rings: 1st, 2nd and 3rd handshake with the number of people. */
  pills: [string, string, string];
  aria: string;
}

export const ORBIT_LABELS_RU: OrbitFigureLabels = {
  names: ['Кира', 'Олег', 'Ира', 'Дима', 'Лена', 'Макс'],
  you: 'Вы',
  pills: ['1-е · 6', '2-е · 36', '3-е · 216'],
  aria: 'Кольца рукопожатий',
};

export interface OrbitFigureProps {
  /** Lights the rings up to this depth: 0 = people you know, 1 = and theirs, 2 = and theirs again. */
  depth: OrbitDepth;
  labels?: Partial<OrbitFigureLabels>;
  className?: string;
}

const C0 = 220;
const R = [78, 140, 200] as const;

/** Handshake rings: you, six people you know, then the people they know. viewBox 440x440. */
export function OrbitFigure({ depth, labels, className }: OrbitFigureProps) {
  const reduce = usePrefersReducedMotion();
  const L = { ...ORBIT_LABELS_RU, ...labels };
  const names = L.names.length >= 6 ? L.names : ORBIT_LABELS_RU.names;
  const on = (k: number) => k <= depth;
  const fade = reduce ? undefined : { transition: 'opacity var(--dur-base, .26s)' };

  const ring3 = Array.from({ length: 72 }, (_, i) => polar(C0, C0, i * 5 - 90 + 2.5, R[2]));
  const ring2 = Array.from({ length: 36 }, (_, i) => polar(C0, C0, i * 10 - 90 + 5, R[1]));
  const people = names.slice(0, 6).map((n, i) => ({ n, ...polar(C0, C0, -90 + i * 60, R[0]) }));

  return (
    <svg viewBox="0 0 440 440" role="img" aria-label={L.aria} className={className}>
      <g style={fade} opacity={on(2) ? 1 : 0.15}>
        <circle cx={C0} cy={C0} r={R[2]} fill="none" stroke={C.line} strokeDasharray="2 6" strokeLinecap="round" />
        {ring3.map((p, i) => (
          <circle key={i} cx={r1(p.x)} cy={r1(p.y)} r={2.6} fill={C.lineStrong} />
        ))}
      </g>
      <g style={fade} opacity={on(1) ? 1 : 0.15}>
        <circle cx={C0} cy={C0} r={R[1]} fill="none" stroke={C.line} strokeDasharray="2 6" strokeLinecap="round" />
        {ring2.map((p, i) => (
          <circle key={i} cx={r1(p.x)} cy={r1(p.y)} r={6} fill={C.surface2} stroke={C.lineStrong} strokeWidth={1.2} />
        ))}
      </g>
      <g style={fade} opacity={on(0) ? 1 : 0.15}>
        <circle cx={C0} cy={C0} r={R[0]} fill="none" stroke={C.line} strokeDasharray="2 6" strokeLinecap="round" />
        {people.map((p, i) => (
          <line key={i} x1={C0} y1={C0} x2={r1(p.x)} y2={r1(p.y)} stroke={C.lineStrong} strokeWidth={1.5} />
        ))}
        {people.map((p, i) => (
          <Person key={i} x={r1(p.x)} y={r1(p.y)} r={16} name={p.n} />
        ))}
      </g>
      <You x={C0} y={C0} r={24} halo={depth === 0} label={L.you} />
      {L.pills.map((t, k) => {
        const p = polar(C0, C0, -42, R[k]!);
        return (
          <g key={k} style={fade} opacity={on(k) ? 1 : 0.35}>
            <Pill x={r1(p.x)} y={r1(p.y)} text={t} hot={depth === k} />
          </g>
        );
      })}
    </svg>
  );
}
