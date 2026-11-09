/*
 * Building blocks of the auth/account-access states (mockups/v2/auth.html): a state tile, a status plaque in
 * four tones, the care spinner, and their glyphs. Tokens only; both themes switch by themselves.
 */
import type { ReactNode, SVGProps } from 'react';
import { cn } from '../../lib/utils';

type P = SVGProps<SVGSVGElement>;

function Line({ children, strokeWidth = 1.8, ...props }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const InfoGlyph = (p: P) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8h.01" />
  </Line>
);
export const AlertGlyph = (p: P) => (
  <Line strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.6v5.2M12 16.3h.01" />
  </Line>
);
export const UndoGlyph = (p: P) => (
  <Line strokeWidth={2} {...p}>
    <path d="M9 14 4.5 9.5 9 5" />
    <path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />
  </Line>
);
export const OfflineGlyph = (p: P) => (
  <Line {...p}>
    <path d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.6A5.6 5.6 0 0 0 7.2 9.4 4.6 4.6 0 0 0 7 18.5z" />
    <path d="m4 4 16 16" />
  </Line>
);
export const CrossGlyph = (p: P) => (
  <Line strokeWidth={2.6} {...p}>
    <path d="M7 7l10 10M17 7 7 17" />
  </Line>
);
export const DashGlyph = (p: P) => (
  <Line strokeWidth={2.6} {...p}>
    <path d="M7 12h10" />
  </Line>
);
export const ClockGlyph = (p: P) => (
  <Line strokeWidth={1.9} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Line>
);
export const CheckGlyph = (p: P) => (
  <Line strokeWidth={2.4} {...p}>
    <path d="m6 12.5 4 4 8-9" />
  </Line>
);
export const ShareGlyph = (p: P) => (
  <Line strokeWidth={1.9} {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
  </Line>
);

export type Tone = 'neutral' | 'care' | 'sos' | 'warm';

const tileTone: Record<Tone, string> = {
  neutral: 'bg-surface text-ink-muted shadow-card',
  care: 'bg-care-soft text-care',
  sos: 'bg-sos-soft text-sos',
  warm: 'bg-warm-soft text-warm-ink',
};

/**
 * A state picture: one glyph in a soft tile. `slot` puts the 120 px tile in the 240 px picture slot of a
 * left-aligned step; otherwise it is the 96 px tile of a centred step.
 */
export function StateTile({ tone = 'neutral', slot = false, children }: { tone?: Tone; slot?: boolean; children: ReactNode }) {
  const tile = (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        slot ? 'h-[120px] w-[120px] rounded-[36px] [&_svg]:h-[52px] [&_svg]:w-[52px]' : 'h-24 w-24 rounded-[30px] [&_svg]:h-11 [&_svg]:w-11',
        tileTone[tone],
      )}
      aria-hidden
    >
      {children}
    </span>
  );
  if (!slot) return tile;
  return <div className="mt-4 flex h-[240px] items-center justify-center">{tile}</div>;
}

const noteTone: Record<Tone, { box: string; icon: string }> = {
  neutral: { box: 'bg-surface shadow-[inset_0_0_0_1px_rgb(var(--so-line)/0.14)]', icon: 'bg-canvas text-ink-muted' },
  care: { box: 'bg-care-soft', icon: 'bg-surface text-care' },
  sos: { box: 'bg-sos-soft', icon: 'bg-surface text-sos' },
  warm: { box: 'bg-warm-soft', icon: 'bg-surface text-warm-ink' },
};

/** Status plaque: icon in a small tile and one or two sentences (the "request sent" shape). */
export function Note({
  tone = 'neutral',
  icon,
  children,
  role,
  className,
}: {
  tone?: Tone;
  icon: ReactNode;
  children: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3.5 py-3 text-left text-caption text-ink [&_b]:font-extrabold',
        noteTone[tone].box,
        className,
      )}
    >
      <i className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md [&_svg]:h-5 [&_svg]:w-5', noteTone[tone].icon)}>{icon}</i>
      <span>{children}</span>
    </div>
  );
}

/** The design-system loading state: care on a care tint. */
export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn(
        'so-spin inline-block shrink-0 rounded-full border-care-soft border-t-care motion-reduce:[animation-duration:2.4s]',
        small ? 'mr-1.5 h-4 w-4 border-2 align-[-3px]' : 'h-8 w-8 border-[3px]',
      )}
    />
  );
}

/** Text-only button of the flow ("Change the address", "Not now"): 44 px tall, centred. */
export function TextButton({
  children,
  onClick,
  tone = 'muted',
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: 'muted' | 'care' | 'sos';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'so-focus mt-2 block min-h-11 w-full text-center text-body-s font-bold disabled:opacity-[0.45]',
        tone === 'care' ? 'text-care' : tone === 'sos' ? 'text-sos' : 'text-ink-muted',
      )}
    >
      {children}
    </button>
  );
}
