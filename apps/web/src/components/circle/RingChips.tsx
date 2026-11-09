import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Chip } from '../ui2/Chip';
import type { Ring } from './circle-store';
import { IconAim } from './icons';

const DOT: Record<Ring, string> = { 1: 'bg-node-1', 2: 'bg-node-2', 3: 'bg-node-3' };

type RingChipsProps = {
  counts: Record<Ring, number>;
  /** link: a tap opens People for the ring. filter: a tap hides or shows the ring on the scene. */
  mode: 'link' | 'filter';
  hiddenRings: Ring[];
  onToggle?: (ring: Ring) => void;
  /** "Back to me" button at the end of the row. Omit to hide it. */
  onSelf?: () => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * Ring counters on the scene ("● 9 1st") and the "Back to me" button. A one-word caption above the
 * chips says what the rings are, so "1st / 2nd / 3rd" reads without the intro; aria-labels carry the full text.
 */
export function RingChips({ counts, mode, hiddenRings, onToggle, onSelf, className, style }: RingChipsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rings: Ring[] = [1, 2, 3];

  return (
    <div className={className} style={style}>
      <p className="mb-1 px-1 text-micro font-bold text-node-2" aria-hidden>
        {t('circle.rings.caption')}
      </p>
      <div className="flex items-center gap-2">
        {rings.map((ring) => {
          const hidden = hiddenRings.includes(ring);
          const label = t(`circle.rings.short${ring}`);
          return (
            <Chip
              key={ring}
              variant="onscene"
              aria-pressed={mode === 'filter' ? !hidden : undefined}
              aria-label={
                mode === 'filter'
                  ? t(hidden ? 'circle.rings.show' : 'circle.rings.hide', { ring: t(`circle.rings.full${ring}`) })
                  : t('circle.rings.open', { ring: t(`circle.rings.full${ring}`), count: counts[ring] })
              }
              className={cn('backdrop-blur-md', hidden && 'opacity-40')}
              onClick={() => (mode === 'filter' ? onToggle?.(ring) : navigate(`/people/${ring}`))}
            >
              <i className={cn('h-2 w-2 rounded-full', DOT[ring])} aria-hidden />
              <b className="text-caption font-extrabold tabular-nums tracking-tight text-node-1">{counts[ring]}</b>
              {label}
            </Chip>
          );
        })}
        {onSelf ? (
          <Chip variant="onscene" className="ml-auto text-node-1 backdrop-blur-md" onClick={onSelf}>
            <IconAim className="h-4 w-4" />
            {t('circle.toSelf')}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}
