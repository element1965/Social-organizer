import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function SceneBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-r-xl bg-scene p-4 text-node-1',
        'bg-[radial-gradient(120%_90%_at_50%_38%,rgb(var(--so-scene-2))_0%,rgb(var(--so-scene))_70%)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SceneHint({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-micro font-semibold text-node-2">{children}</p>;
}

export function SceneAccent({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-label font-bold text-care-scene">{children}</p>;
}
