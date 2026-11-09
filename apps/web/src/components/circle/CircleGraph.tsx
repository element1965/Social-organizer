import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode, GraphView, NetworkGraphHandle } from '@so/graph-3d';
import { useCircleStore, type Ring } from './circle-store';
import type { NetPerson } from './network';

const LazyNetworkGraph = lazy(() => import('@so/graph-3d').then((m) => ({ default: m.NetworkGraph })));

export type { GraphView };

export type CircleGraphHandle = Pick<NetworkGraphHandle, 'zoomIn' | 'zoomOut' | 'fit' | 'focusOnMe' | 'getView' | 'setView'>;

type CircleGraphProps = {
  myId: string | null;
  people: Map<string, NetPerson>;
  edges: Array<{ from: string; to: string }>;
  /** Ids from me to the selected person (or to the first request author). */
  highlightPath: string[];
  hiddenRings: Ring[];
  onNodeTap: (id: string) => void;
  /** Dim the scene while the person card is open. */
  dimmed?: boolean;
  /** The person whose card is open: the camera flies to them and slowly orbits. */
  focusId?: string | null;
  /** Fraction of the height to raise the focused person by (room for a card at the bottom). */
  focusLift?: number;
};

/**
 * The only place that talks to @so/graph-3d.
 *
 * Colours: the graph defaults (`GRAPH_COLORS`) are the dark v2 scene tokens (`--so-scene`, `--so-node-1..3`,
 * `--so-care-scene`, `--so-care-bright`), which the app does not redefine per theme, so no `colors` prop is
 * passed. The scene stays dark in both themes, hence `theme="dark"` for the in-canvas tooltip.
 *
 * Camera: the view is saved to the Circle store when the graph unmounts (navigation to Person, Collection,
 * People, or a phone/desktop layout switch) and handed back as `initialView`, which skips the intro fly.
 */
export const CircleGraph = forwardRef<CircleGraphHandle, CircleGraphProps>(function CircleGraph(
  { myId, people, edges, highlightPath, hiddenRings, onNodeTap, dimmed, focusId, focusLift },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<NetworkGraphHandle | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const saveView = useCircleStore((s) => s.saveView);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : w > 0 && h > 0 ? { w, h } : prev));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A layout-effect cleanup runs before the child graph drops its imperative handle, so getView() still works.
  useLayoutEffect(
    () => () => {
      const view = graphRef.current?.getView();
      if (view) saveView(view);
    },
    [saveView],
  );

  const data = useMemo(() => {
    const nodes: GraphNode[] = [...people.values()].map((p) => ({
      id: p.id,
      name: p.name,
      photoUrl: p.photoUrl,
      isCenter: p.id === myId,
      depth: p.depth,
      connectionCount: p.connectionCount,
      lastSeen: p.lastSeen,
    }));
    const links = edges.map((e) => ({ source: e.from, target: e.to }));
    return { nodes, links };
  }, [people, edges, myId]);

  const handleTap = useCallback((node: GraphNode) => onNodeTap(node.id), [onNodeTap]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => graphRef.current?.zoomIn(),
      zoomOut: () => graphRef.current?.zoomOut(),
      fit: () => graphRef.current?.fit(),
      focusOnMe: () => graphRef.current?.focusOnMe(),
      getView: () => graphRef.current?.getView() ?? null,
      setView: (view, options) => graphRef.current?.setView(view, options),
    }),
    [],
  );

  // Read when the graph mounts (NetworkGraph applies initialView once), so a view saved by a graph that
  // unmounted in the same commit is already in the store.
  const initialView = useCircleStore.getState().view ?? undefined;

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 overflow-hidden"
      style={{ opacity: dimmed ? 0.55 : 1, transition: 'opacity 420ms cubic-bezier(0.22, 0.8, 0.24, 1)' }}
    >
      {size && data.nodes.length > 0 ? (
        <Suspense fallback={<SceneSkeleton />}>
          <LazyNetworkGraph
            ref={graphRef}
            nodes={data.nodes}
            edges={data.links}
            width={size.w}
            height={size.h}
            onNodeTap={handleTap}
            highlightPath={highlightPath}
            hiddenRings={hiddenRings}
            initialView={initialView}
            focusId={focusId ?? null}
            focusLift={focusLift}
            showControls={false}
            theme="dark"
          />
        </Suspense>
      ) : (
        <SceneSkeleton />
      )}
    </div>
  );
});

export function SceneSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center" aria-hidden>
      <span className="h-40 w-40 animate-pulse rounded-full bg-scene-3/60 motion-reduce:animate-none" />
    </div>
  );
}
