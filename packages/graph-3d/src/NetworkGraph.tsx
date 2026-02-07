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

/* ---------- LOD distances ---------- */
const LOD_CLOSE = 150;   // Full avatar + label
const LOD_MEDIUM = 300;  // Small dot + label
const LOD_FAR = 500;     // Tiny dot only

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

  useEffect(() => {
    if (fgRef.current) {
      const fg = fgRef.current;
      if (typeof fg.d3Force === 'function') {
        const charge = fg.d3Force('charge');
        if (charge && typeof charge.strength === 'function') charge.strength(-80);
      }
      // Zoom camera closer after graph settles
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.cameraPosition({ x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 0 }, 1000);
        }
      }, 500);
    }
  }, []);

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

  // Lazy texture loading - load textures only when camera is close
  const loadTextureForNode = useCallback((photoUrl: string, nodeId: string) => {
    if (textureCache.current.has(photoUrl) || pendingLoads.current.has(photoUrl)) {
      return;
    }
    pendingLoads.current.add(photoUrl);
    textureLoader.load(
      photoUrl,
      (texture) => {
        textureCache.current.set(photoUrl, texture);
        pendingLoads.current.delete(photoUrl);
        // Update the LOD object with the loaded texture
        const lodInfo = lodObjectsRef.current.get(nodeId);
        if (lodInfo) {
          updateLodWithTexture(lodInfo.lod, texture, lodInfo.nodeData);
        }
      },
      undefined,
      () => {
        pendingLoads.current.delete(photoUrl);
      }
    );
  }, [textureLoader, updateLodWithTexture]);

  const handleNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id && onNodeClick) onNodeClick(String(node.id));
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
    (node: { id?: string | number; name?: string; photoUrl?: string | null; isCenter?: boolean; isDeleted?: boolean }) => {
      const lod = new THREE.LOD();
      const nodeId = String(node.id);

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
            dot: 0x6366f1,
            dotCenter: 0x3b82f6,
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
            dot: 0x6366f1,
            dotCenter: 0x2563eb,
          };

      const avatarSize = node.isCenter ? 8 : 5;
      const textOffset = avatarSize / 2 + 2;
      const dotColor = node.isCenter ? colors.dotCenter : colors.dot;

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

      // Ring for center node
      if (node.isCenter) {
        const ringGeometry = new THREE.RingGeometry(avatarSize / 2 + 0.3, avatarSize / 2 + 0.8, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: colors.center,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        closeGroup.add(ring);
      }

      // Label with name
      const label = new SpriteText(String(node.name ?? ''));
      label.color = node.isDeleted
        ? colors.deleted
        : node.isCenter
        ? colors.center
        : highlightSet.has(nodeId)
        ? colors.highlight
        : colors.normal;
      label.textHeight = node.isCenter ? 2.5 : 1.8;
      label.backgroundColor = node.isDeleted
        ? colors.deletedBg
        : node.isCenter
        ? colors.centerBg
        : highlightSet.has(nodeId)
        ? colors.highlightBg
        : colors.normalBg;
      label.padding = 1.5;
      label.borderRadius = 3;
      label.position.y = -textOffset;
      closeGroup.add(label);

      lod.addLevel(closeGroup, 0);

      /* ========== LOD Level 1: Medium - Small dot + label ========== */
      const mediumGroup = new THREE.Group();
      mediumGroup.name = 'lod-medium';

      const mediumDotGeom = new THREE.SphereGeometry(node.isCenter ? 3 : 2, 16, 16);
      const mediumDotMat = new THREE.MeshBasicMaterial({
        color: dotColor,
        transparent: true,
        opacity: node.isDeleted ? 0.5 : 0.9,
      });
      const mediumDot = new THREE.Mesh(mediumDotGeom, mediumDotMat);
      mediumGroup.add(mediumDot);

      // Smaller label
      const mediumLabel = new SpriteText(String(node.name ?? ''));
      mediumLabel.color = colors.normal;
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

      const farDotGeom = new THREE.SphereGeometry(node.isCenter ? 1.5 : 1, 8, 8);
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

      // Trigger lazy texture loading when camera is close
      lod.onBeforeRender = (_renderer, _scene, camera) => {
        if (!node.photoUrl) return;
        const lodInfo = lodObjectsRef.current.get(nodeId);
        if (!lodInfo) return;

        // Calculate distance to camera
        const nodePos = new THREE.Vector3();
        lod.getWorldPosition(nodePos);
        const dist = camera.position.distanceTo(nodePos);

        // Load texture when within close range and not already loaded
        if (dist < LOD_CLOSE && !textureCache.current.has(node.photoUrl)) {
          loadTextureForNode(node.photoUrl, nodeId);
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
