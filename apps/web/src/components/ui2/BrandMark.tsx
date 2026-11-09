import { Logo } from '../Logo';
import { cn } from '../../lib/utils';

/**
 * The brand mark: the existing Social Organizer logo (`/logo.png`, Exodus brand) on a care tile.
 * Never redraw the mark with an icon; always use this component or `Logo`.
 */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center bg-care text-care-on', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.29) }}
    >
      <Logo size={Math.round(size * 0.68)} />
    </span>
  );
}
