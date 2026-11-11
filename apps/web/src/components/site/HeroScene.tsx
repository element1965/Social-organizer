import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../../lib/scrollPlay';
import { heroGraph, type HeroGraphLabels } from './heroGraph';

/**
 * The live 3D network behind the landing hero (heroGraph.ts). Fills its positioned parent; the parent sets
 * where the ball sits through --hero-gx / --hero-gr / --hero-graph-h (site.css).
 */
export function HeroScene({ labels, ariaLabel }: { labels: HeroGraphLabels; ariaLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = usePrefersReducedMotion();
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return heroGraph(canvas, () => labelsRef.current, reduce).destroy;
  }, [reduce]);

  return <canvas ref={ref} className="site-hero-graph" role="img" aria-label={ariaLabel} />;
}
