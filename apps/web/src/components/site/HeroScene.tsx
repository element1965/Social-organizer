import { useEffect, useRef, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../lib/scrollPlay';
import { cn } from '../../lib/utils';
import { heroScene, type HeroSceneLabels } from './heroCanvas';

/**
 * The live scene of the site hero in a dark card: 560×480 on desktop, 320 px tall on phones (site.css).
 * Overlays (the pills with real numbers) go in `children`.
 */
export function HeroScene({
  labels,
  ariaLabel,
  className,
  children,
}: {
  labels: HeroSceneLabels;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = usePrefersReducedMotion();
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scene = heroScene(canvas, () => labelsRef.current, reduce);
    return scene.destroy;
  }, [reduce]);

  return (
    <div className={cn('site-planet', className)}>
      <canvas ref={ref} role="img" aria-label={ariaLabel} />
      {children}
    </div>
  );
}
