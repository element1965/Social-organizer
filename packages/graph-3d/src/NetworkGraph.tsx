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
  darkMode?: boolean;
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
  darkMode = true,
}: NetworkGraphProps) {
  const fgRef = useRef<FGRef>(null);
  const highlightSet = new Set(highlightPath ?? []);

  // Фиксируем центральный узел в центре графа
  const processedNodes = nodes.map((n) => ({
    ...n,
    fx: n.isCenter ? 0 : undefined,
    fy: n.isCenter ? 0 : undefined,
    fz: n.isCenter ? 0 : undefined,
  }));

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

      // Цвета для тёмной и светлой темы
      const colors = darkMode
        ? {
            deleted: '#888888',
            center: '#3b82f6',
            highlight: '#f59e0b',
            normal: '#e2e8f0',
            deletedBg: 'rgba(80,80,80,0.6)',
            centerBg: 'rgba(59,130,246,0.2)',
            highlightBg: 'rgba(245,158,11,0.2)',
            normalBg: 'rgba(0,0,0,0.4)',
          }
        : {
            deleted: '#9ca3af',
            center: '#2563eb',
            highlight: '#d97706',
            normal: '#1f2937',
            deletedBg: 'rgba(156,163,175,0.3)',
            centerBg: 'rgba(37,99,235,0.15)',
            highlightBg: 'rgba(217,119,6,0.15)',
            normalBg: 'rgba(255,255,255,0.8)',
          };

      label.color = node.isDeleted
        ? colors.deleted
        : node.isCenter
        ? colors.center
        : highlightSet.has(String(node.id))
        ? colors.highlight
        : colors.normal;
      label.textHeight = node.isCenter ? 3.5 : 2;
      label.backgroundColor = node.isDeleted
        ? colors.deletedBg
        : node.isCenter
        ? colors.centerBg
        : highlightSet.has(String(node.id))
        ? colors.highlightBg
        : colors.normalBg;
      label.padding = 2;
      label.borderRadius = 4;
      return label as unknown as Object3D;
    },
    [highlightSet, darkMode],
  );

  const linkColor = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      if (src && tgt && highlightSet.has(src) && highlightSet.has(tgt)) {
        return 'rgba(245,158,11,0.8)';
      }
      return darkMode ? 'rgba(100,140,200,0.3)' : 'rgba(59,130,246,0.4)';
    },
    [highlightSet, darkMode],
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

  const graphData = { nodes: processedNodes, links: edges };

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
