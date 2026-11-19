import type { Ring } from './circle-store';
import type { FarCount } from './far-rings';

/**
 * The network figure as one value (`stats.networkFigure`): people up to the 6th handshake and their declared
 * participation, with the ring chips that add up to the people count (1st + 2nd + 3rd + the far chip).
 */
export type NetworkFigure = {
  people: number;
  canHelp: number;
  rings: Record<Ring, number>;
  far: FarCount;
};

const count = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Whether a value has every field the figure needs (a saved copy or an answer from an older server may not). */
export function isNetworkFigure(value: unknown): value is NetworkFigure {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const rings = v.rings as Record<string, unknown> | undefined;
  const far = v.far as Record<string, unknown> | undefined;
  return (
    count(v.people) &&
    count(v.canHelp) &&
    !!rings && count(rings[1]) && count(rings[2]) && count(rings[3]) &&
    !!far && count(far.count) && typeof far.approx === 'boolean' && typeof far.few === 'boolean'
  );
}
