import { useLocation } from 'react-router-dom';

/**
 * Crumb for Screen. History idx > 0 lets CrumbLink call navigate(-1).
 * A direct visit (idx 0 or missing) goes to `fallback` instead of leaving the app.
 * `location.state.backLabel` overrides the visible label when a caller set one.
 */
export function useSmartBack(label: string, fallback: string): { label: string; to?: string } {
  const location = useLocation();
  const fromState = (location.state as { backLabel?: unknown } | null)?.backLabel;
  const text = typeof fromState === 'string' && fromState.trim() ? fromState : label;
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) return { label: text };
  return { label: text, to: fallback };
}
