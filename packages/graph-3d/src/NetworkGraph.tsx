import { useCallback, useEffect, useRef, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';

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
  controlsHint?: string;
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
  controlsHint,
}: NetworkGraphProps) {
  const fgRef = useRef<FGRef>(null);
  const highlightSet = new Set(highlightPath ?? []);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const textureCache = useRef<Map<string, THREE.Texture>>(new Map());

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

  // Предзагрузка текстур аватарок
  useEffect(() => {
    nodes.forEach((node) => {
      if (node.photoUrl && !textureCache.current.has(node.photoUrl)) {
        textureLoader.load(
          node.photoUrl,
          (texture) => {
            textureCache.current.set(node.photoUrl!, texture);
          },
          undefined,
          () => {
            // Ошибка загрузки - игнорируем
          }
        );
      }
    });
  }, [nodes, textureLoader]);

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id && onNodeClick) onNodeClick(String(node.id));
    },
    [onNodeClick],
  );

  const nodeThreeObject = useCallback(
    (node: { id?: string | number; name?: string; photoUrl?: string | null; isCenter?: boolean; isDeleted?: boolean }) => {
      const group = new THREE.Group();

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

      const avatarSize = node.isCenter ? 8 : 5;
      const textOffset = avatarSize / 2 + 2;

      // Аватарка
      const cachedTexture = node.photoUrl ? textureCache.current.get(node.photoUrl) : null;
      if (cachedTexture) {
        const spriteMaterial = new THREE.SpriteMaterial({
          map: cachedTexture,
          transparent: true,
          opacity: node.isDeleted ? 0.5 : 1,
        });
        const avatar = new THREE.Sprite(spriteMaterial);
        avatar.scale.set(avatarSize, avatarSize, 1);
        group.add(avatar);

        // Рамка вокруг аватарки для центрального узла
        if (node.isCenter) {
          const ringGeometry = new THREE.RingGeometry(avatarSize / 2 + 0.3, avatarSize / 2 + 0.8, 32);
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: colors.center,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          group.add(ring);
        }
      } else {
        // Заглушка если нет аватарки - круг с инициалом
        const initial = (String(node.name ?? '?')[0] || '?').toUpperCase();
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        // Градиентный фон
        const gradient = ctx.createLinearGradient(0, 0, 128, 128);
        gradient.addColorStop(0, node.isCenter ? '#3b82f6' : '#6366f1');
        gradient.addColorStop(1, node.isCenter ? '#1d4ed8' : '#4f46e5');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(64, 64, 64, 0, Math.PI * 2);
        ctx.fill();

        // Инициал
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, 64, 68);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: node.isDeleted ? 0.5 : 1,
        });
        const avatar = new THREE.Sprite(spriteMaterial);
        avatar.scale.set(avatarSize, avatarSize, 1);
        group.add(avatar);
      }

      // Текст с именем под аватаркой
      const label = new SpriteText(String(node.name ?? ''));
      label.color = node.isDeleted
        ? colors.deleted
        : node.isCenter
        ? colors.center
        : highlightSet.has(String(node.id))
        ? colors.highlight
        : colors.normal;
      label.textHeight = node.isCenter ? 2.5 : 1.8;
      label.backgroundColor = node.isDeleted
        ? colors.deletedBg
        : node.isCenter
        ? colors.centerBg
        : highlightSet.has(String(node.id))
        ? colors.highlightBg
        : colors.normalBg;
      label.padding = 1.5;
      label.borderRadius = 3;
      label.position.y = -textOffset;
      group.add(label);

      return group;
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
    <div style={{ position: 'relative', width: width || '100%', height: height || '100%' }}>
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
        showNavInfo={false}
      />
      {controlsHint && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 11,
            color: darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
            backgroundColor: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {controlsHint}
        </div>
      )}
    </div>
  );
}
