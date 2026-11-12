import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Chip } from '../ui2/Chip';
import type { Ring } from './circle-store';
import { IconAim } from './icons';
import { useFarRings } from './far-rings';

const DOT: Record<Ring, string> = { 1: 'bg-node-1', 2: 'bg-node-2', 3: 'bg-node-3' };

type RingChipsProps = {
  counts: Record<Ring, number>;
  /** Rings hidden on the graph (switched in People) are drawn dimmed. */
  hiddenRings: Ring[];
  /** "Back to me" button at the end of the row. Omit to hide it. */
  onSelf?: () => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * Ring counters on the scene ("● 9 1st") and the "Back to me" button. A one-word caption above the
 * chips says what the rings are, so "1st / 2nd / 3rd" reads without the intro; aria-labels carry the full text.
 * A tap opens People for the ring, over the feed and on the expanded graph alike; the switch that shows or
 * hides a ring on the graph is in that list.
 */
export function RingChips({ counts, hiddenRings, onSelf, className, style }: RingChipsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const far = useFarRings();
  const rings: Ring[] = [1, 2, 3];

  return (
    <div className={className} style={style}>
      <p className="mb-1 flex items-baseline justify-between gap-3 px-1 text-micro font-bold text-node-2">
        <span aria-hidden>{t('circle.rings.caption')}</span>
        {/* 4th and 5th rings: a rounded count only, nobody there is named */}
        {far.label ? <span className="truncate text-node-3">{far.label}</span> : null}
      </p>
      <div className="flex items-center gap-2">
        {rings.map((ring) => {
          const hidden = hiddenRings.includes(ring);
          const label = t(`circle.rings.short${ring}`);
          return (
            <Chip
              key={ring}
              variant="onscene"
              aria-label={t('circle.rings.open', { ring: t(`circle.rings.full${ring}`), count: counts[ring] })}
              className={cn('backdrop-blur-md', hidden && 'opacity-40')}
              onClick={() => navigate(`/people/${ring}`)}
            >
              <i className={cn('h-2 w-2 rounded-full', DOT[ring])} aria-hidden />
              <b className="text-caption font-extrabold tabular-nums tracking-tight text-node-1">{counts[ring]}</b>
              {label}
            </Chip>
          );
        })}
        {onSelf ? (
          // On a phone only the icon: three counters with three-digit numbers already fill the row
          <Chip
            variant="onscene"
            aria-label={t('circle.toSelf')}
            title={t('circle.toSelf')}
            className="ml-auto shrink-0 text-node-1 backdrop-blur-md max-sm:w-[34px] max-sm:px-0"
            onClick={onSelf}
          >
            <IconAim className="h-4 w-4" />
            <span className="max-sm:hidden">{t('circle.toSelf')}</span>
          </Chip>
        ) : null}
      </div>
    </div>
  );
}
