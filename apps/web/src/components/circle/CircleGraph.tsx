import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Ring } from './circle-store';
import type { NetPerson } from './network';

type GraphModule = typeof import('@so/graph-3d');
let graphComponent: GraphModule['NetworkGraph'] | null = null;

const LazyNetworkGraph = lazy(() =>
  import('@so/graph-3d').then((m) => {
    graphComponent = m.NetworkGraph;
    return { default: m.NetworkGraph };
  }),
);

/**
 * Camera state for "back to the same place". Opaque here: WP3 defines the shape
 * (position, target, zoom) and returns it from NetworkGraph ref getView().
 */
export type GraphView = Record<string, unknown>;

export type CircleGraphHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  focusOnMe: () => void;
  getView: () => GraphView | null;
  setView: (view: GraphView) => void;
};

type CircleGraphProps = {
  myId: string | null;
  people: Map<string, NetPerson>;
  edges: Array<{ from: string; to: string }>;
  /** Ids from me to the selected person. Not drawn until WP3 (see below). */
  highlightPath: string[];
  hiddenRings: Ring[];
  onNodeTap: (id: string) => void;
  /** Camera to restore on mount (no intro animation). */
  initialView?: GraphView | null;
  /** Changes with the URL layer/selection; the graph makes sure it is animating after each change. */
  resumeKey?: string;
  /** Dim the scene while the person card is open. */
  dimmed?: boolean;
};

type ForceGraphApi = { resumeAnimation?: () => void };

/**
 * TODO(WP3): the current NetworkGraph pauses its render loop inside onNodeClick (it expected a
 * navigation away) and exposes no ref. Until `onNodeTap` lands, the wrapper reaches the force-graph
 * instance through the NetworkGraph fiber (its first hook is `fgRef`) and calls resumeAnimation().
 * Delete this function once NetworkGraph has onNodeTap.
 */
function resumeLegacyGraph(box: HTMLElement | null) {
  const root = box?.firstElementChild;
  if (!root || !graphComponent) return;
  const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
  if (!key) return;
  type Fiber = { type: unknown; return: Fiber | null; memoizedState: { memoizedState?: { current?: ForceGraphApi } } | null };
  let fiber = (root as unknown as Record<string, Fiber>)[key] ?? null;
  while (fiber && fiber.type !== graphComponent) fiber = fiber.return;
  try {
    fiber?.memoizedState?.memoizedState?.current?.resumeAnimation?.();
  } catch {
    /* graph already torn down */
  }
}

/**
 * The only place that talks to @so/graph-3d. WP3 adds onNodeTap, highlightPath that works with
 * the ref, hiddenRings, theme and ref methods (zoomIn/zoomOut/fit/focusOnMe/getView/setView);
 * wiring them is a short change here.
 */
export const CircleGraph = forwardRef<CircleGraphHandle, CircleGraphProps>(function CircleGraph(
  { myId, people, edges, highlightPath, hiddenRings, onNodeTap, initialView, resumeKey, dimmed },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

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

  // TODO(WP3): pass hiddenRings to NetworkGraph instead of filtering the data here.
  const data = useMemo(() => {
    const hidden = new Set<number>(hiddenRings);
    const nodes = [...people.values()]
      .filter((p) => p.depth === 0 || !hidden.has(p.depth))
      .map((p) => ({
        id: p.id,
        name: p.name,
        photoUrl: p.photoUrl,
        isCenter: p.id === myId,
        depth: p.depth,
        connectionCount: p.connectionCount,
        lastSeen: p.lastSeen,
      }));
    const kept = new Set(nodes.map((n) => n.id));
    const links = edges
      .filter((e) => kept.has(e.from) && kept.has(e.to))
      .map((e) => ({ source: e.from, target: e.to }));
    return { nodes, links };
  }, [people, edges, hiddenRings, myId]);

  const handleTap = useCallback(
    (id: string) => {
      onNodeTap(id);
      // The legacy graph has just paused itself; keep it alive (TODO(WP3): drop with onNodeTap).
      requestAnimationFrame(() => resumeLegacyGraph(boxRef.current));
    },
    [onNodeTap],
  );

  // Safety net: after every layer or selection change the scene is animating again.
  useEffect(() => {
    const frame = requestAnimationFrame(() => resumeLegacyGraph(boxRef.current));
    return () => cancelAnimationFrame(frame);
  }, [resumeKey]);

  // Shims over the current graph: its built-in buttons are hidden and clicked programmatically,
  // zoom goes through a wheel event on the canvas (OrbitControls listens to it).
  const clickBuiltIn = (label: string) => {
    boxRef.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
  };
  const wheel = (deltaY: number) => {
    const canvas = boxRef.current?.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  useImperativeHandle(
    ref,
    () => ({
      // TODO(WP3): graphRef.zoomIn() / zoomOut() / fit() / focusOnMe().
      zoomIn: () => wheel(-240),
      zoomOut: () => wheel(240),
      fit: () => clickBuiltIn('Show whole network'),
      focusOnMe: () => clickBuiltIn('Focus on me'),
      // TODO(WP3): return graphRef.getView() and call graphRef.setView(view) once they exist.
      getView: () => null,
      setView: () => undefined,
    }),
    [],
  );

  // TODO(WP3): pass initialView to setView right after the first frame, without the pop-in intro.
  void initialView;
  // TODO(WP3): pass highlightPath. The current NetworkGraph crashes when it changes
  // (`fg.linkColor is not a function`: the force-graph ref has no accessor methods).
  void highlightPath;

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 overflow-hidden [&_button]:hidden"
      style={{ opacity: dimmed ? 0.55 : 1, transition: 'opacity 420ms cubic-bezier(0.22, 0.8, 0.24, 1)' }}
    >
      {size && data.nodes.length > 0 ? (
        <Suspense fallback={<SceneSkeleton />}>
          <LazyNetworkGraph
            nodes={data.nodes}
            edges={data.links}
            width={size.w}
            height={size.h}
            onNodeClick={handleTap}
            darkMode
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
