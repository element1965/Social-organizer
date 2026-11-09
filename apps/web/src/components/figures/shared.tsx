/*
 * Shared drawing pieces for the explainer figures. Colors are the --so-* token triplets ("R G B"),
 * so both themes switch by themselves; no hex and no `dark:` variants here.
 */
import type { KeyboardEvent, ReactNode } from 'react';

const tok = (name: string, alpha?: number) => (alpha == null ? `rgb(var(--so-${name}))` : `rgb(var(--so-${name}) / ${alpha})`);

export const C = {
  ink: tok('ink'),
  muted: tok('ink-muted'),
  subtle: tok('ink-subtle'),
  canvas: tok('canvas'),
  paper: tok('surface'),
  surface2: tok('surface-2'),
  /** Hairlines: the line token is a base color, alpha is applied here (same values as the mockup aliases). */
  line: tok('line', 0.14),
  lineStrong: tok('line', 0.24),
  care: tok('care'),
  careSoft: tok('care-soft'),
  onCare: tok('on-care'),
  warm: tok('warm'),
} as const;

export const FIG_FONT = 'Manrope, "Segoe UI", system-ui, sans-serif';

/** Person silhouette: head and shoulders. */
export function Glyph({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <>
      <circle cx={x} cy={+(y - r * 0.2).toFixed(1)} r={+(r * 0.27).toFixed(1)} fill={color} />
      <path d={`M${(x - r * 0.52).toFixed(1)} ${(y + r * 0.66).toFixed(1)} a${(r * 0.52).toFixed(1)} ${(r * 0.52).toFixed(1)} 0 0 1 ${(r * 1.04).toFixed(1)} 0z`} fill={color} />
    </>
  );
}

export function FigText({
  x,
  y,
  size,
  weight,
  color,
  anchor = 'middle',
  children,
}: {
  x: number;
  y: number;
  size: number;
  weight: number;
  color: string;
  anchor?: 'start' | 'middle' | 'end';
  children: ReactNode;
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={FIG_FONT} fontSize={size} fontWeight={weight} fill={color}>
      {children}
    </text>
  );
}

/** Makes an SVG group a button when `onSelect` is given. */
function pick(onSelect?: () => void, label?: string) {
  if (!onSelect) return {};
  return {
    style: { cursor: 'pointer' } as const,
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onSelect,
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
  };
}

/** A person: hot = care, dashed = not connected yet. */
export function Person({
  x,
  y,
  r,
  hot,
  dashed,
  name,
  sub,
  onSelect,
}: {
  x: number;
  y: number;
  r: number;
  hot?: boolean;
  dashed?: boolean;
  name?: string;
  sub?: string;
  onSelect?: () => void;
}) {
  return (
    <g {...pick(onSelect, name)}>
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={hot ? C.careSoft : C.paper}
        stroke={hot ? C.care : C.lineStrong}
        strokeWidth={hot ? 2 : 1.5}
        strokeDasharray={dashed ? '4 4' : undefined}
      />
      <Glyph x={x} y={y} r={r} color={hot ? C.care : dashed ? C.subtle : C.ink} />
      {name && (
        <FigText x={x} y={y + r + 16} size={13} weight={700} color={hot ? C.care : C.ink}>
          {name}
        </FigText>
      )}
      {sub && (
        <FigText x={x} y={y + r + 31} size={11} weight={700} color={C.muted}>
          {sub}
        </FigText>
      )}
    </g>
  );
}

/** "You": the care avatar. `hot === false` draws it as a plain (not highlighted) circle. */
export function You({
  x,
  y,
  r,
  hot = true,
  halo,
  label,
  name,
  sub,
  onSelect,
}: {
  x: number;
  y: number;
  r: number;
  hot?: boolean;
  halo?: boolean;
  label: string;
  name?: string;
  sub?: string;
  onSelect?: () => void;
}) {
  return (
    <g {...pick(onSelect, name ?? label)}>
      {halo && <circle cx={x} cy={y} r={r + 10} fill="none" stroke={C.care} strokeWidth={1.5} opacity={0.45} />}
      <circle cx={x} cy={y} r={r} fill={hot ? C.care : C.paper} stroke={hot ? 'none' : C.lineStrong} strokeWidth={1.5} />
      <FigText x={x} y={y + r * 0.22} size={Math.round(r * 0.6)} weight={800} color={hot ? C.onCare : C.ink}>
        {label}
      </FigText>
      {name && (
        <FigText x={x} y={y + r + 16} size={13} weight={700} color={hot ? C.care : C.ink}>
          {name}
        </FigText>
      )}
      {sub && (
        <FigText x={x} y={y + r + 31} size={11} weight={700} color={C.muted}>
          {sub}
        </FigText>
      )}
    </g>
  );
}

/** Small rounded label: the amount tag or a state on a link. */
export function Pill({ x, y, text, hot }: { x: number; y: number; text: string; hot?: boolean }) {
  const w = text.length * 7 + 20;
  return (
    <g>
      <rect x={+(x - w / 2).toFixed(1)} y={y - 11} width={w} height={22} rx={11} fill={hot ? C.care : C.paper} stroke={hot ? 'none' : C.lineStrong} />
      <FigText x={x} y={y + 4} size={11} weight={800} color={hot ? C.onCare : C.ink}>
        {text}
      </FigText>
    </g>
  );
}

/** Point on a circle around (cx, cy); angle in degrees, 0 = right, -90 = top. */
export function polar(cx: number, cy: number, angle: number, r: number) {
  const a = (angle * Math.PI) / 180;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

export const r1 = (n: number) => +n.toFixed(1);
