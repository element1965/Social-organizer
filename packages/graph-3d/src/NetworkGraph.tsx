import { useCallback, useEffect, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import type { Object3D } from 'three';

/* ---------- Типы ---------- */

export interface GraphNode {
  id: string;
  name: string;
  photoUrl: string | null;
  isCenter?: boolean;
  isDeleted?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface NetworkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightPath?: string[];
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
}

/* ---------- Компонент ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGRef = any;

export function NetworkGraph({
  nodes,
  edges,
  highlightPath,
  width,
  height,
  onNodeClick,
}: NetworkGraphProps) {
  const fgRef = useRef<FGRef>(null);
  const highlightSet = new Set(highlightPath ?? []);

  useEffect(() => {
    if (fgRef.current) {
      const fg = fgRef.current;
      if (typeof fg.d3Force === 'function') {
        const charge = fg.d3Force('charge');
        if (charge && typeof charge.strength === 'function') charge.strength(-80);
      }
    }
  }, []);

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id && onNodeClick) onNodeClick(String(node.id));
    },
    [onNodeClick],
  );

  const nodeThreeObject = useCallback(
    (node: { id?: string | number; name?: string; isCenter?: boolean; isDeleted?: boolean }) => {
      const label = new SpriteText(String(node.name ?? ''));
      label.color = node.isDeleted
        ? '#888888'
        : node.isCenter
        ? '#3b82f6'
        : highlightSet.has(String(node.id))
        ? '#f59e0b'
        : '#e2e8f0';
      label.textHeight = node.isCenter ? 3 : 2;
      label.backgroundColor = node.isDeleted
        ? 'rgba(80,80,80,0.6)'
        : node.isCenter
        ? 'rgba(59,130,246,0.15)'
        : highlightSet.has(String(node.id))
        ? 'rgba(245,158,11,0.15)'
        : 'rgba(0,0,0,0.3)';
      label.padding = 2;
      label.borderRadius = 4;
      return label as unknown as Object3D;
    },
    [highlightSet],
  );

  const linkColor = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      if (src && tgt && highlightSet.has(src) && highlightSet.has(tgt)) {
        return 'rgba(245,158,11,0.8)';
      }
      return 'rgba(100,140,200,0.2)';
    },
    [highlightSet],
  );

  const linkWidth = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      if (src && tgt && highlightSet.has(src) && highlightSet.has(tgt)) return 2;
      return 0.5;
    },
    [highlightSet],
  );

  const graphData = { nodes, links: edges };

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkOpacity={0.6}
      onNodeClick={handleNodeClick}
      enableNodeDrag={false}
      warmupTicks={50}
      cooldownTime={3000}
    />
  );
}
