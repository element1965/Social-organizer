import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../../lib/scrollPlay';
import { C } from './shared';

export type HuiStage = 0 | 1 | 2;

export interface HuiFigureLabels {
  names: string[];
  months: string[];
  /** Stage 0 note under the pot sum. */
  each: string;
  /** Stage 1 note. */
  onTable: string;
  /** Stage 2 note: who takes the pot. */
  takes: (name: string) => string;
  /** Currency formatting: "15 $". */
  money: (n: number) => string;
  aria: string;
}

export const HUI_LABELS_RU: HuiFigureLabels = {
  names: ['Линь', 'Чен', 'Мэй', 'Го', 'Сунь', 'Хуан'],
  months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь'],
  each: 'каждый кладёт долю',
  onTable: 'доли на столе',
  takes: (name) => `забирает ${name}`,
  money: (n) => `${n} $`,
  aria: 'Стол хуэй',
};

export interface HuiFigureProps {
  /** Share each member puts in per month. Default 15. */
  share?: number;
  /** Controlled month (who takes the pot, 0..5). Omit to let the figure keep it. */
  month?: number;
  defaultMonth?: number;
  onMonthChange?: (month: number) => void;
  /** Reports every frame: used by the page to sync captions. */
  onChange?: (month: number, stage: HuiStage) => void;
  /** Change the value to replay the cycle for the current month (e.g. on scroll entry). */
  playKey?: number;
  /** Do not play: show one frame (`stage`, default 1) and ignore the cycle. */
  static?: boolean;
  stage?: HuiStage;
  /** Outer size in px; the figure shrinks with its container (use 320 on phones). Default 440. */
  size?: number;
  labels?: Partial<HuiFigureLabels>;
  className?: string;
}

const SEATS = 6;

/** The hui table: six seats, a pot in the middle, coins that go to the pot and then to the taker. */
export function HuiFigure({
  share = 15,
  month: monthProp,
  defaultMonth = 0,
  onMonthChange,
  onChange,
  playKey = 0,
  static: isStatic,
  stage: staticStage = 1,
  size = 440,
  labels,
  className,
}: HuiFigureProps) {
  const reduce = usePrefersReducedMotion();
  const L = { ...HUI_LABELS_RU, ...labels };
  const [inner, setInner] = useState(defaultMonth);
  const [replay, setReplay] = useState(0);
  const month = monthProp ?? inner;
  const still = reduce || !!isStatic;
  const finalStage: HuiStage = isStatic ? staticStage : 2;
  // The stage belongs to one run (month + replay counters); a new run reads as stage 0 right away,
  // so onChange never sees a new month with the previous month's stage.
  const runKey = `${month}:${playKey}:${replay}`;
  const [run, setRun] = useState<{ key: string; stage: HuiStage }>({ key: runKey, stage: still ? finalStage : 0 });
  const stage: HuiStage = still ? finalStage : run.key === runKey ? run.stage : 0;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // One cycle per run: shares go to the table, then to the one who takes the pot.
  useEffect(() => {
    if (still) return;
    setRun({ key: runKey, stage: 0 });
    const t1 = setTimeout(() => setRun({ key: runKey, stage: 1 }), 260);
    const t2 = setTimeout(() => setRun({ key: runKey, stage: 2 }), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [runKey, still]);

  useEffect(() => {
    onChangeRef.current?.(month, stage);
  }, [month, stage]);

  const S = size;
  const c = S / 2;
  const R = S * 0.4;
  const small = size <= 360;
  const names = L.names.slice(0, SEATS);
  const givers = names.map((_, i) => i).filter((i) => i !== month);

  const pt = (i: number, k = 1) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return { x: 50 + Math.cos(a) * 40 * k, y: 50 + Math.sin(a) * 40 * k }; // percent of the box
  };
  const arc = (m: number) => {
    if (m <= 0) return '';
    const p = (a: number) => `${(c + Math.cos((a * Math.PI) / 180) * R).toFixed(1)} ${(c + Math.sin((a * Math.PI) / 180) * R).toFixed(1)}`;
    // A single arc cannot span 360 degrees: the full circle is two half arcs.
    if (m >= SEATS) return `M${p(-90)} A${R} ${R} 0 1 1 ${p(90)} A${R} ${R} 0 1 1 ${p(-90)}`;
    return `M${p(-90)} A${R} ${R} 0 ${m * 60 > 180 ? 1 : 0} 1 ${p(-90 + m * 60)}`;
  };

  const move = still ? 'none' : undefined;
  const ease = 'var(--ease-out, cubic-bezier(.22,.8,.24,1))';
  const shadowCard = 'var(--shadow-card, 0 0 0 0 transparent)';

  const pot = (names.length - 1) * share;
  const potSum = stage === 0 ? `${names.length - 1} × ${L.money(share)}` : L.money(pot);
  const note = stage === 0 ? L.each : stage === 1 ? L.onTable : L.takes(names[month] ?? '');

  const box: CSSProperties = { position: 'relative', width: S, maxWidth: '100%', aspectRatio: '1 / 1', margin: '0 auto' };
  const abs: CSSProperties = { position: 'absolute', transform: 'translate(-50%, -50%)' };

  return (
    <div className={className} style={box} role="group" aria-label={L.aria}>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <circle cx={c} cy={c} r={R} fill="none" stroke={C.line} strokeWidth={1.5} />
        {names.map((_, i) => {
          const a = ((-90 + i * 60) * Math.PI) / 180;
          return <circle key={i} cx={+(c + Math.cos(a) * R).toFixed(1)} cy={+(c + Math.sin(a) * R).toFixed(1)} r={3} fill={C.lineStrong} />;
        })}
        <path d={arc(month + (stage === 2 ? 1 : 0))} fill="none" stroke={C.care} strokeWidth={4} strokeLinecap="round" />
      </svg>

      <div
        style={{
          ...abs,
          left: '50%',
          top: '50%',
          width: '46%',
          height: '46%',
          borderRadius: '50%',
          background: C.surface2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          paddingTop: small ? 28 : 34,
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>{L.months[month]}</span>
        <b style={{ fontSize: small ? 20 : 26, fontWeight: 800, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: C.ink }}>{potSum}</b>
        <small style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, maxWidth: '86%', color: C.muted }}>{note}</small>
      </div>

      {names.map((n, i) => {
        const p = pt(i);
        const on = i === month && stage >= 1;
        const got = i === month && stage === 2;
        const ava = small ? 40 : 48;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={i === month}
            onClick={() => {
              if (i === month) setReplay((n) => n + 1);
              else setInner(i);
              onMonthChange?.(i);
            }}
            className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[rgb(var(--so-care))]"
            style={{
              ...abs,
              left: `${p.x}%`,
              top: `${p.y}%`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              border: 0,
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              zIndex: 2,
            }}
          >
            <span
              aria-hidden={!got}
              style={{
                position: 'absolute',
                top: -30,
                left: '50%',
                transform: `translate(-50%, ${got ? 0 : 6}px)`,
                height: 24,
                padding: '0 10px',
                borderRadius: 12,
                background: C.careSoft,
                color: C.care,
                fontSize: 12,
                fontWeight: 800,
                lineHeight: '24px',
                opacity: got ? 1 : 0,
                whiteSpace: 'nowrap',
                transition: move ?? `opacity var(--dur-base, .26s), transform var(--dur-base, .26s) ${ease}`,
              }}
            >
              +{L.money(share * (names.length - 1))}
            </span>
            <span
              style={{
                width: ava,
                height: ava,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: on ? C.care : C.paper,
                color: on ? C.onCare : C.ink,
                boxShadow: on ? `0 0 0 4px ${C.careSoft}, ${shadowCard}` : `${shadowCard}, inset 0 0 0 1px ${C.line}`,
                transform: on ? 'scale(1.12)' : undefined,
                transition: move ?? `background var(--dur-base, .26s), color var(--dur-base, .26s), transform var(--dur-base, .26s) ${ease}, box-shadow var(--dur-base, .26s)`,
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" width={26} height={26}>
                <circle cx="12" cy="8.4" r="4.2" fill="currentColor" />
                <path d="M4 21.5a8 8 0 0 1 16 0z" fill="currentColor" />
              </svg>
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: i === month && stage >= 1 ? C.ink : C.muted }}>{n}</span>
          </button>
        );
      })}

      {names.map((_, i) => {
        // Coin positions: at its seat (stage 0), on the table (stage 1), at the taker's seat and gone (stage 2).
        let left: string;
        let top: string;
        let opacity = 1;
        if (i === month) {
          const p = pt(i);
          left = `${p.x}%`;
          top = `${p.y}%`;
          opacity = 0;
        } else if (stage === 0) {
          // Closer to the pot on a phone: at 320 px a coin at .72 lands on the seat names and on the bottom seat.
          const p = pt(i, small ? 0.62 : 0.72);
          left = `${p.x}%`;
          top = `${p.y}%`;
        } else if (stage === 1) {
          const k = givers.indexOf(i);
          left = `calc(50% + ${(k - 2) * 24}px)`;
          top = 'calc(50% - 54px)';
        } else {
          const p = pt(i);
          left = `${p.x}%`;
          top = `${p.y}%`;
          opacity = 0;
        }
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              ...abs,
              left,
              top,
              opacity,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: C.warmSoft,
              color: C.warmInk,
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 800,
              boxShadow: `inset 0 0 0 2px ${C.warm}, ${shadowCard}`,
              zIndex: 3,
              pointerEvents: 'none',
              transition: move ?? `left var(--dur-screen, .42s) ${ease}, top var(--dur-screen, .42s) ${ease}, opacity var(--dur-base, .26s)`,
            }}
          >
            {share}
          </span>
        );
      })}
    </div>
  );
}
