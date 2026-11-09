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

const LazyNetworkGraph = lazy(() => import('@so/graph-3d').then((m) => ({ default: m.NetworkGraph })));

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
  highlightPath: string[];
  hiddenRings: Ring[];
  onNodeTap: (id: string) => void;
  /** Camera to restore on mount (no intro animation). */
  initialView?: GraphView | null;
  /** Dim everything but the highlighted path (person card open). */
  dimmed?: boolean;
};

/*
 * TODO(WP3): the current NetworkGraph pauses its render loop inside onNodeClick (it expected a
 * navigation away). Until `onNodeTap` lands, the wrapper remounts the graph when the caller asks
 * to resume (card closed). Delete PAUSES_ON_TAP and the remount key once onNodeTap is wired.
 */
const PAUSES_ON_TAP = true;

/**
 * The only place that talks to @so/graph-3d. WP3 adds onNodeTap, hiddenRings, theme and ref
 * methods (zoomIn/zoomOut/fit/focusOnMe/getView/setView); wiring them is a short change here.
 */
export const CircleGraph = forwardRef<CircleGraphHandle & { resume: () => void }, CircleGraphProps>(
  function CircleGraph({ myId, people, edges, highlightPath, hiddenRings, onNodeTap, initialView, dimmed }, ref) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const [mountKey, setMountKey] = useState(0);
    const pausedRef = useRef(false);

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
        if (PAUSES_ON_TAP) pausedRef.current = true;
        onNodeTap(id);
      },
      [onNodeTap],
    );

    // Shims over the current graph: its built-in buttons are hidden and clicked programmatically,
    // zoom goes through a wheel event on the canvas (OrbitControls listens to it).
    const clickBuiltIn = (label: string) => {
      const button = boxRef.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      button?.click();
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
        resume: () => {
          if (!pausedRef.current) return;
          pausedRef.current = false;
          setMountKey((key) => key + 1);
        },
      }),
      [],
    );

    // TODO(WP3): pass initialView to setView right after the first frame, without the pop-in intro.
    void initialView;

    return (
      <div
        ref={boxRef}
        className="absolute inset-0 overflow-hidden [&_button]:hidden"
        style={{ opacity: dimmed ? 0.55 : 1, transition: 'opacity 420ms cubic-bezier(0.22, 0.8, 0.24, 1)' }}
      >
        {size && data.nodes.length > 0 ? (
          <Suspense fallback={<SceneSkeleton />}>
            <LazyNetworkGraph
              key={mountKey}
              nodes={data.nodes}
              edges={data.links}
              highlightPath={highlightPath}
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
  },
);

export function SceneSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center" aria-hidden>
      <span className="h-40 w-40 animate-pulse rounded-full bg-scene-3/60 motion-reduce:animate-none" />
    </div>
  );
}
