import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  depth?: number;
  connectionCount?: number;
  lastSeen?: string | Date | null;
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

/* ---------- LOD distances ---------- */
const LOD_CLOSE = 150;   // Full avatar + label
const LOD_MEDIUM = 300;  // Small dot + label
const LOD_FAR = 500;     // Tiny dot only

/* ---------- Depth colors ---------- */
export const DEPTH_COLORS_DARK = [
  { main: '#3b82f6', bg: 'rgba(59,130,246,0.2)', dot: 0x3b82f6 },  // 0: center — blue
  { main: '#6366f1', bg: 'rgba(99,102,241,0.2)', dot: 0x6366f1 },  // 1: indigo
  { main: '#06b6d4', bg: 'rgba(6,182,212,0.2)', dot: 0x06b6d4 },   // 2: cyan
  { main: '#64748b', bg: 'rgba(100,116,139,0.2)', dot: 0x64748b },  // 3: slate
];
export const DEPTH_COLORS_LIGHT = [
  { main: '#2563eb', bg: 'rgba(37,99,235,0.15)', dot: 0x2563eb },   // 0: center — blue
  { main: '#4f46e5', bg: 'rgba(79,70,229,0.15)', dot: 0x4f46e5 },   // 1: indigo
  { main: '#0891b2', bg: 'rgba(8,145,178,0.15)', dot: 0x0891b2 },   // 2: cyan
  { main: '#475569', bg: 'rgba(71,85,105,0.15)', dot: 0x475569 },   // 3: slate
];

/** Map connectionCount → avatar scale factor (1.0 – 1.6) */
function sizeFromConnections(count: number): number {
  if (count <= 1) return 1.0;
  if (count >= 30) return 1.6;
  return 1.0 + (count - 1) * 0.6 / 29;
}

/** Check if user is online (lastSeen within 5 minutes) */
function isOnline(lastSeen: string | Date | null | undefined): boolean {
  if (!lastSeen) return false;
  const ts = typeof lastSeen === 'string' ? new Date(lastSeen).getTime() : lastSeen.getTime();
  return Date.now() - ts < 5 * 60 * 1000;
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
  controlsHint: _controlsHint,
}: NetworkGraphProps) {
  const fgRef = useRef<FGRef>(null);
  const highlightSet = new Set(highlightPath ?? []);
  const textureCache = useRef<Map<string, THREE.Texture>>(new Map());
  // Track pending texture loads to avoid duplicate requests
  const pendingLoads = useRef<Set<string>>(new Set());
  // Store LOD objects for lazy texture updates
  const lodObjectsRef = useRef<Map<string, { lod: THREE.LOD; photoUrl: string; nodeData: typeof nodes[0] }>>(new Map());

  // Фиксируем центральный узел в центре графа
  const processedNodes = nodes.map((n) => ({
    ...n,
    fx: n.isCenter ? 0 : undefined,
    fy: n.isCenter ? 0 : undefined,
    fz: n.isCenter ? 0 : undefined,
  }));

  const nodeDepthMap = useMemo(() => new Map(nodes.map(n => [n.id, n.depth ?? (n.isCenter ? 0 : 1)])), [nodes]);

  // Compute max subtree depth for each node (how deep its descendants go)
  const subtreeDepthMap = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source)!.push(e.target);
      adj.get(e.target)!.push(e.source);
    }

    const cache = new Map<string, number>();
    const computing = new Set<string>(); // cycle guard

    function getMaxSubtreeDepth(nodeId: string): number {
      if (cache.has(nodeId)) return cache.get(nodeId)!;
      if (computing.has(nodeId)) return 0;
      computing.add(nodeId);

      const myDepth = nodeDepthMap.get(nodeId) ?? 0;
      const neighbors = adj.get(nodeId) ?? [];
      // Children = neighbors with depth = myDepth + 1
      const children = neighbors.filter(nId => (nodeDepthMap.get(nId) ?? 0) === myDepth + 1);

      let maxD = 0;
      for (const child of children) {
        maxD = Math.max(maxD, 1 + getMaxSubtreeDepth(child));
      }

      computing.delete(nodeId);
      cache.set(nodeId, maxD);
      return maxD;
    }

    for (const n of nodes) getMaxSubtreeDepth(n.id);
    return cache;
  }, [nodes, edges, nodeDepthMap]);

  useEffect(() => {
    const fg = fgRef.current;
    if (fg) {
      // Auto-rotate when user is not interacting
      const controls = fg.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
      }
      // Zoom camera closer after graph settles
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.cameraPosition({ x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 0 }, 1000);
        }
      }, 500);
    }

    // Cleanup: use `fg` from closure because fgRef.current is already null
    // when parent cleanup runs (React unmounts children first, clearing the
    // useImperativeHandle ref before our effect cleanup fires).
    return () => {
      if (fg) {
        try { fg.pauseAnimation(); } catch { /* noop */ }
        try {
          const c = fg.controls();
          if (c) c.dispose();
        } catch { /* noop */ }
        // Deferred: release WebGL context AFTER react-kapsule _destructor.
        // three-render-objects has no _destructor, so renderer/context leak
        // unless we explicitly clean up. We use setTimeout so that
        // react-kapsule's synchronous _destructor (pauseAnimation + graphData
        // clear) finishes before we kill the renderer.
        try {
          const r = fg.renderer();
          if (r) {
            setTimeout(() => {
              try {
                r.setAnimationLoop(null);
                r.dispose();
                r.forceContextLoss();
              } catch { /* noop */ }
            }, 0);
          }
        } catch { /* noop */ }
      }
      // Release GPU textures
      textureCache.current.forEach((tex) => tex.dispose());
      textureCache.current.clear();
      lodObjectsRef.current.clear();
      pendingLoads.current.clear();
    };
  }, []);

  // Dynamic forces based on subtree depth:
  // 1) link distance — nodes with subtrees get longer links
  // 2) per-node charge — nodes with subtrees repel stronger, claiming more space
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;
    if (typeof fg.d3Force !== 'function') return;

    // Per-node charge: nodes with deeper subtrees repel more strongly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge = fg.d3Force('charge') as any;
    if (charge && typeof charge.strength === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      charge.strength((node: any) => {
        const nodeId = String(node.id ?? '');
        const d = subtreeDepthMap.get(nodeId) ?? 0;
        // Leaf: -80, subtree=1: -160, subtree=2: -280, subtree=3: -440
        return -80 * (1 + d * (d + 1) / 4);
      });
    }

    const BASE_LINK_DIST = 30;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkForce = fg.d3Force('link') as any;
    if (linkForce && typeof linkForce.distance === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkForce.distance((link: any) => {
        const srcId = typeof link.source === 'object' ? link.source?.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target?.id : link.target;
        const srcDepth = nodeDepthMap.get(String(srcId)) ?? 1;
        const tgtDepth = nodeDepthMap.get(String(tgtId)) ?? 1;
        // The "child" node is the one with greater depth
        const childId = tgtDepth > srcDepth ? String(tgtId) : String(srcId);
        const d = subtreeDepthMap.get(childId) ?? 0;
        // Quadratic growth: d=0→1x, d=1→1.5x, d=2→2.5x, d=3→4x
        return BASE_LINK_DIST * (1 + d * (d + 1) / 4);
      });
    }

    fg.d3ReheatSimulation();
  }, [subtreeDepthMap, nodeDepthMap]);

  // Function to update LOD with loaded texture
  const updateLodWithTexture = useCallback((lod: THREE.LOD, texture: THREE.Texture, node: typeof nodes[0]) => {
    const closeLevel = lod.getObjectByName('lod-close');
    if (!closeLevel) return;

    const avatarSize = node.isCenter ? 8 : 5;

    // Find and remove placeholder avatar
    const placeholder = closeLevel.getObjectByName('avatar-placeholder');
    if (placeholder) {
      closeLevel.remove(placeholder);
    }

    // Add real avatar sprite
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: node.isDeleted ? 0.5 : 1,
    });
    const avatar = new THREE.Sprite(spriteMaterial);
    avatar.name = 'avatar-real';
    avatar.scale.set(avatarSize, avatarSize, 1);
    closeLevel.add(avatar);
  }, []);

  // Load image via server proxy (to bypass CORS), draw circular on canvas
  const loadTextureForNode = useCallback((photoUrl: string, nodeId: string) => {
    if (textureCache.current.has(photoUrl) || pendingLoads.current.has(photoUrl)) {
      return;
    }
    pendingLoads.current.add(photoUrl);
    // Proxy external URLs through our API to avoid CORS issues
    const src = photoUrl.startsWith('/') || photoUrl.startsWith(window.location.origin)
      ? photoUrl
      : `/api/image-proxy?url=${encodeURIComponent(photoUrl)}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      textureCache.current.set(photoUrl, texture);
      pendingLoads.current.delete(photoUrl);
      const lodInfo = lodObjectsRef.current.get(nodeId);
      if (lodInfo) {
        updateLodWithTexture(lodInfo.lod, texture, lodInfo.nodeData);
      }
    };
    img.onerror = () => {
      pendingLoads.current.delete(photoUrl);
    };
    img.src = src;
  }, [updateLodWithTexture]);

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id && onNodeClick) {
        // Eagerly stop graph and dispose controls BEFORE navigate triggers unmount.
        // fgRef.current is still valid here (component is still mounted).
        if (fgRef.current) {
          try { fgRef.current.pauseAnimation(); } catch { /* noop */ }
          try {
            const c = fgRef.current.controls();
            if (c) c.dispose();
          } catch { /* noop */ }
          try {
            const r = fgRef.current.renderer();
            if (r) {
              r.setAnimationLoop(null);
              r.dispose();
              r.forceContextLoss();
            }
          } catch { /* noop */ }
        }
        onNodeClick(String(node.id));
      }
    },
    [onNodeClick],
  );

  // Helper to create avatar placeholder (initials or loading state)
  const createAvatarPlaceholder = useCallback((node: { name?: string; isCenter?: boolean; isDeleted?: boolean }, size: number) => {
    const initial = (String(node.name ?? '?')[0] || '?').toUpperCase();
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, node.isCenter ? '#3b82f6' : '#6366f1');
    gradient.addColorStop(1, node.isCenter ? '#1d4ed8' : '#4f46e5');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();

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
    avatar.name = 'avatar-placeholder';
    avatar.scale.set(size, size, 1);
    return avatar;
  }, []);

  const nodeThreeObject = useCallback(
    (node: { id?: string | number; name?: string; photoUrl?: string | null; isCenter?: boolean; isDeleted?: boolean; depth?: number; connectionCount?: number; lastSeen?: string | Date | null }) => {
      const lod = new THREE.LOD();
      const nodeId = String(node.id);

      const depthIdx = Math.min(node.depth ?? (node.isCenter ? 0 : 1), 3);
      const depthPalette = darkMode ? DEPTH_COLORS_DARK : DEPTH_COLORS_LIGHT;
      const depthColor = depthPalette[depthIdx] ?? depthPalette[depthPalette.length - 1]!;

      // Цвета для тёмной и светлой темы
      const colors = darkMode
        ? {
            deleted: '#888888',
            highlight: '#f59e0b',
            deletedBg: 'rgba(80,80,80,0.6)',
            highlightBg: 'rgba(245,158,11,0.2)',
            normalBg: 'rgba(0,0,0,0.4)',
          }
        : {
            deleted: '#9ca3af',
            highlight: '#d97706',
            deletedBg: 'rgba(156,163,175,0.3)',
            highlightBg: 'rgba(217,119,6,0.15)',
            normalBg: 'rgba(255,255,255,0.8)',
          };

      const scaleFactor = node.isCenter ? 1 : sizeFromConnections(node.connectionCount ?? 0);
      const baseAvatarSize = node.isCenter ? 12 : 5;
      const avatarSize = baseAvatarSize * scaleFactor;
      const textOffset = avatarSize / 2 + 2;
      const dotColor = depthColor.dot;
      const online = isOnline(node.lastSeen);

      /* ========== LOD Level 0: Close - Full avatar + label ========== */
      const closeGroup = new THREE.Group();
      closeGroup.name = 'lod-close';

      // Check if texture is already cached
      const cachedTexture = node.photoUrl ? textureCache.current.get(node.photoUrl) : null;
      if (cachedTexture) {
        const spriteMaterial = new THREE.SpriteMaterial({
          map: cachedTexture,
          transparent: true,
          opacity: node.isDeleted ? 0.5 : 1,
        });
        const avatar = new THREE.Sprite(spriteMaterial);
        avatar.name = 'avatar-real';
        avatar.scale.set(avatarSize, avatarSize, 1);
        closeGroup.add(avatar);
      } else {
        // Add placeholder - will be replaced when texture loads
        closeGroup.add(createAvatarPlaceholder(node, avatarSize));

        // Store LOD reference and start loading texture immediately
        if (node.photoUrl) {
          lodObjectsRef.current.set(nodeId, {
            lod,
            photoUrl: node.photoUrl,
            nodeData: node as typeof nodes[0],
          });
          loadTextureForNode(node.photoUrl, nodeId);
        }
      }

      // Rings for center node (double ring for emphasis)
      if (node.isCenter) {
        // Inner ring
        const innerRingGeom = new THREE.RingGeometry(avatarSize / 2 + 0.3, avatarSize / 2 + 1, 48);
        const innerRingMat = new THREE.MeshBasicMaterial({
          color: 0x3b82f6,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        });
        closeGroup.add(new THREE.Mesh(innerRingGeom, innerRingMat));

        // Outer glow ring
        const outerRingGeom = new THREE.RingGeometry(avatarSize / 2 + 1.2, avatarSize / 2 + 2.2, 48);
        const outerRingMat = new THREE.MeshBasicMaterial({
          color: 0x60a5fa,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
        });
        closeGroup.add(new THREE.Mesh(outerRingGeom, outerRingMat));
      }

      // Online pulse ring
      if (online && !node.isDeleted) {
        const pulseRingGeom = new THREE.RingGeometry(avatarSize / 2 + 0.5, avatarSize / 2 + 1.2, 32);
        const pulseRingMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const pulseRing = new THREE.Mesh(pulseRingGeom, pulseRingMat);
        pulseRing.name = 'pulse-ring';
        closeGroup.add(pulseRing);
      }

      // Label with name
      const label = new SpriteText(String(node.name ?? ''));
      label.color = node.isDeleted
        ? colors.deleted
        : highlightSet.has(nodeId)
        ? colors.highlight
        : depthColor.main;
      label.textHeight = node.isCenter ? 2.5 : 1.8;
      label.backgroundColor = node.isDeleted
        ? colors.deletedBg
        : highlightSet.has(nodeId)
        ? colors.highlightBg
        : depthColor.bg;
      label.padding = 1.5;
      label.borderRadius = 3;
      label.position.y = -textOffset;
      closeGroup.add(label);

      lod.addLevel(closeGroup, 0);

      /* ========== LOD Level 1: Medium - Small dot + label ========== */
      const mediumGroup = new THREE.Group();
      mediumGroup.name = 'lod-medium';

      const mediumDotSize = node.isCenter ? 5 : 2 * scaleFactor;
      const mediumDotGeom = new THREE.SphereGeometry(mediumDotSize, 16, 16);
      const mediumDotMat = new THREE.MeshBasicMaterial({
        color: dotColor,
        transparent: true,
        opacity: node.isDeleted ? 0.5 : 0.9,
      });
      const mediumDot = new THREE.Mesh(mediumDotGeom, mediumDotMat);
      mediumGroup.add(mediumDot);

      // Smaller label
      const mediumLabel = new SpriteText(String(node.name ?? ''));
      mediumLabel.color = depthColor.main;
      mediumLabel.textHeight = 1.5;
      mediumLabel.backgroundColor = colors.normalBg;
      mediumLabel.padding = 1;
      mediumLabel.borderRadius = 2;
      mediumLabel.position.y = -4;
      mediumGroup.add(mediumLabel);

      lod.addLevel(mediumGroup, LOD_CLOSE);

      /* ========== LOD Level 2: Far - Tiny dot only ========== */
      const farGroup = new THREE.Group();
      farGroup.name = 'lod-far';

      const farDotGeom = new THREE.SphereGeometry(node.isCenter ? 3 : 1 * scaleFactor, 8, 8);
      const farDotMat = new THREE.MeshBasicMaterial({
        color: dotColor,
        transparent: true,
        opacity: node.isDeleted ? 0.3 : 0.7,
      });
      const farDot = new THREE.Mesh(farDotGeom, farDotMat);
      farGroup.add(farDot);

      lod.addLevel(farGroup, LOD_MEDIUM);

      /* ========== LOD Level 3: Very far - Minimal point ========== */
      const veryFarGroup = new THREE.Group();
      veryFarGroup.name = 'lod-veryfar';

      const veryFarDotGeom = new THREE.SphereGeometry(0.5, 4, 4);
      const veryFarDotMat = new THREE.MeshBasicMaterial({
        color: dotColor,
        transparent: true,
        opacity: 0.4,
      });
      const veryFarDot = new THREE.Mesh(veryFarDotGeom, veryFarDotMat);
      veryFarGroup.add(veryFarDot);

      lod.addLevel(veryFarGroup, LOD_FAR);

      // Trigger lazy texture loading when camera is close + animate pulse ring
      lod.onBeforeRender = (_renderer, _scene, camera) => {
        // Lazy texture loading
        if (node.photoUrl) {
          const lodInfo = lodObjectsRef.current.get(nodeId);
          if (lodInfo) {
            const nodePos = new THREE.Vector3();
            lod.getWorldPosition(nodePos);
            const dist = camera.position.distanceTo(nodePos);
            if (dist < LOD_CLOSE && !textureCache.current.has(node.photoUrl)) {
              loadTextureForNode(node.photoUrl, nodeId);
            }
          }
        }

        // Animate online pulse ring
        if (online) {
          const pulseRing = closeGroup.getObjectByName('pulse-ring') as THREE.Mesh | undefined;
          if (pulseRing) {
            const t = performance.now() * 0.003;
            const scale = 1.0 + 0.15 * Math.sin(t);
            pulseRing.scale.set(scale, scale, 1);
            (pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t);
          }
        }
      };

      return lod;
    },
    [highlightSet, darkMode, createAvatarPlaceholder, loadTextureForNode],
  );

  const linkColor = useCallback(
    (link: { source?: string | { id?: string }; target?: string | { id?: string } }) => {
      const src = typeof link.source === 'object' ? link.source?.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target?.id : link.target;
      if (src && tgt && highlightSet.has(src) && highlightSet.has(tgt)) {
        return 'rgba(245,158,11,0.8)';
      }
      // Color by max depth of endpoints
      const srcDepth = src ? (nodeDepthMap.get(src) ?? 3) : 3;
      const tgtDepth = tgt ? (nodeDepthMap.get(tgt) ?? 3) : 3;
      const maxDepth = Math.min(Math.max(srcDepth, tgtDepth), 3);
      const depthPalette = darkMode ? DEPTH_COLORS_DARK : DEPTH_COLORS_LIGHT;
      const color = depthPalette[maxDepth] ?? depthPalette[depthPalette.length - 1]!;
      return color.main + '55';
    },
    [highlightSet, darkMode, nodeDepthMap],
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

  const nodeLabel = useCallback(
    (node: { name?: string; connectionCount?: number; lastSeen?: string | Date | null; isCenter?: boolean }) => {
      const name = node.name ?? '';
      const count = node.connectionCount ?? 0;
      const online = isOnline(node.lastSeen);
      const status = online
        ? '<span style="color:#22c55e">● Online</span>'
        : '';
      return `<div style="padding:6px 10px;border-radius:8px;background:${darkMode ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)'};color:${darkMode ? '#e2e8f0' : '#1e293b'};font-size:12px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none">
        <div style="font-weight:600;font-size:13px">${name}</div>
        <div style="opacity:0.7">🤝 ${count} connections</div>
        ${status ? `<div>${status}</div>` : ''}
      </div>`;
    },
    [darkMode],
  );

  // Focus camera on center node (the "me" node)
  const focusOnMe = useCallback(() => {
    if (!fgRef.current) return;
    const centerNode = processedNodes.find(n => n.isCenter);
    if (!centerNode) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = centerNode as any;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const z = node.z ?? 0;
    fgRef.current.cameraPosition(
      { x: x, y: y, z: z + 80 },
      { x, y, z },
      800,
    );
  }, [processedNodes]);

  const graphData = { nodes: processedNodes, links: edges };

  return (
    <div style={{ position: 'relative', width: width || '100%', height: height || '100%' }}>
      {/* "Find me" button — like Google Maps geolocation */}
        <button
          onClick={focusOnMe}
          title="Focus on me"
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: darkMode ? 'rgba(30,41,59,0.85)' : 'rgba(255,255,255,0.9)',
            color: darkMode ? '#60a5fa' : '#2563eb',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontSize: 20,
            lineHeight: 1,
            transition: 'background 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.transform = 'scale(1)'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          nodeLabel={nodeLabel}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={0.2}
          linkOpacity={0.6}
          onNodeClick={handleNodeClick}
          enableNodeDrag={false}
          warmupTicks={50}
          cooldownTime={3000}
          showNavInfo={false}
        />
    </div>
  );
}
