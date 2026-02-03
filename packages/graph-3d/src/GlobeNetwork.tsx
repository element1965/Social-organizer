import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- GLSL: процедурная планета (simplex noise terrain) ---------- */

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = dot(hash33(i), f);
    float b = dot(hash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
    float c = dot(hash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
    float d = dot(hash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
    float e = dot(hash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
    float ff = dot(hash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
    float g = dot(hash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
    float h = dot(hash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
    float x1 = mix(a, b, f.x);
    float x2 = mix(c, d, f.x);
    float x3 = mix(e, ff, f.x);
    float x4 = mix(g, h, f.x);
    float y1 = mix(x1, x2, f.y);
    float y2 = mix(x3, x4, f.y);
    return mix(y1, y2, f.z) * 0.5 + 0.5;
  }

  void main() {
    vec3 pos = vPosition * 2.0 + uTime * 0.05;
    float n = noise3d(pos);
    n += noise3d(pos * 2.0) * 0.5;
    n += noise3d(pos * 4.0) * 0.25;
    n /= 1.75;

    vec3 ocean = vec3(0.05, 0.15, 0.45);
    vec3 land = vec3(0.12, 0.42, 0.18);
    vec3 mountain = vec3(0.35, 0.25, 0.15);
    vec3 snow = vec3(0.9, 0.92, 0.95);

    vec3 color = ocean;
    if (n > 0.45) color = mix(ocean, land, (n - 0.45) / 0.1);
    if (n > 0.55) color = mix(land, mountain, (n - 0.55) / 0.15);
    if (n > 0.70) color = mix(mountain, snow, (n - 0.70) / 0.1);

    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;

    float fresnel = pow(1.0 - max(dot(vNormal, normalize(cameraPosition - vPosition)), 0.0), 3.0);
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * fresnel * 0.5;

    gl_FragColor = vec4(color * diff + atmosphere, 1.0);
  }
`;

/* ---------- Fibonacci sphere sampling ---------- */

function fibonacciSphere(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

/* ---------- Планета с scroll-управлением ---------- */

function Planet({ scrollProgress }: { scrollProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const currentRotation = useRef(0);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      const target = scrollProgress * Math.PI * 3;
      currentRotation.current += (target - currentRotation.current) * 0.08;
      meshRef.current.rotation.y = currentRotation.current;
      uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.5, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

/* ---------- Узлы на поверхности (InstancedMesh) ---------- */

const MIN_NODE_COUNT = 12;
const MAX_NODE_COUNT = 300;
const NODE_RADIUS = 1.7;
const NODE_COLORS = [
  new THREE.Color(0x14b8a6), // teal
  new THREE.Color(0x3b82f6), // blue
  new THREE.Color(0xf59e0b), // amber
];

function NetworkNodes({ scrollProgress }: { scrollProgress: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const currentRotation = useRef(0);

  // Node count increases with scroll (densification effect)
  const nodeCount = Math.floor(MIN_NODE_COUNT + scrollProgress * (MAX_NODE_COUNT - MIN_NODE_COUNT));

  const { nodePositions, colors } = useMemo(() => {
    const pos = fibonacciSphere(MAX_NODE_COUNT, NODE_RADIUS);
    const col = new Float32Array(MAX_NODE_COUNT * 3);
    for (let i = 0; i < MAX_NODE_COUNT; i++) {
      const c = NODE_COLORS[i % NODE_COLORS.length]!;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { nodePositions: pos, colors: col };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hiddenMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    return m;
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    const target = scrollProgress * Math.PI * 3;
    currentRotation.current += (target - currentRotation.current) * 0.08;

    const rotMatrix = new THREE.Matrix4().makeRotationY(currentRotation.current);

    // Show first nodeCount nodes (Fibonacci spiral is already uniform)
    for (let i = 0; i < MAX_NODE_COUNT; i++) {
      if (i < nodeCount) {
        const idx = i * 3;
        const v = new THREE.Vector3(
          nodePositions[idx]!,
          nodePositions[idx + 1]!,
          nodePositions[idx + 2]!,
        ).applyMatrix4(rotMatrix);
        dummy.position.copy(v);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);

        const color = new THREE.Color(colors[idx]!, colors[idx + 1]!, colors[idx + 2]!);
        meshRef.current.setColorAt(i, color);
      } else {
        meshRef.current.setMatrixAt(i, hiddenMatrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_NODE_COUNT]}>
      <sphereGeometry args={[0.035, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/* ---------- Связи между ближними узлами (LineSegments) ---------- */

const NEIGHBORS_PER_NODE = 6; // Each node connects to K nearest neighbors

function NetworkEdges({ scrollProgress }: { scrollProgress: number }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const currentRotation = useRef(0);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  // Node count increases with scroll
  const nodeCount = Math.floor(MIN_NODE_COUNT + scrollProgress * (MAX_NODE_COUNT - MIN_NODE_COUNT));

  // Precompute node positions
  const nodePositions = useMemo(() => fibonacciSphere(MAX_NODE_COUNT, NODE_RADIUS), []);

  // Precompute K nearest neighbors for each node
  const neighborsMap = useMemo(() => {
    const map: number[][] = [];
    for (let i = 0; i < MAX_NODE_COUNT; i++) {
      const ix = i * 3;
      const distances: { j: number; dist: number }[] = [];

      for (let j = 0; j < MAX_NODE_COUNT; j++) {
        if (i === j) continue;
        const jx = j * 3;
        const dx = nodePositions[ix]! - nodePositions[jx]!;
        const dy = nodePositions[ix + 1]! - nodePositions[jx + 1]!;
        const dz = nodePositions[ix + 2]! - nodePositions[jx + 2]!;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        distances.push({ j, dist });
      }

      // Sort by distance and take K nearest
      distances.sort((a, b) => a.dist - b.dist);
      map[i] = distances.slice(0, NEIGHBORS_PER_NODE).map(d => d.j);
    }
    return map;
  }, [nodePositions]);

  // Build edges dynamically based on visible nodes
  const edgePositions = useMemo(() => {
    const edgeSet = new Set<string>();
    const edges: number[] = [];
    const lift = 1.02;

    // For each visible node, connect to its K nearest neighbors (if also visible)
    for (let i = 0; i < nodeCount; i++) {
      const neighbors = neighborsMap[i] || [];
      for (const j of neighbors) {
        if (j < nodeCount) {
          // Avoid duplicate edges
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            const ix = i * 3;
            const jx = j * 3;
            edges.push(
              nodePositions[ix]! * lift, nodePositions[ix + 1]! * lift, nodePositions[ix + 2]! * lift,
              nodePositions[jx]! * lift, nodePositions[jx + 1]! * lift, nodePositions[jx + 2]! * lift,
            );
          }
        }
      }
    }

    return new Float32Array(edges);
  }, [nodeCount, nodePositions, neighborsMap]);

  useFrame(() => {
    if (!lineRef.current || !geometryRef.current) return;
    const target = scrollProgress * Math.PI * 3;
    currentRotation.current += (target - currentRotation.current) * 0.08;
    lineRef.current.rotation.y = currentRotation.current;
  });

  // Update geometry when edges change
  useEffect(() => {
    if (geometryRef.current) {
      geometryRef.current.setAttribute(
        'position',
        new THREE.BufferAttribute(edgePositions, 3)
      );
      geometryRef.current.attributes.position!.needsUpdate = true;
    }
  }, [edgePositions]);

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[edgePositions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#6ee7b7" transparent opacity={0.35} />
    </lineSegments>
  );
}

/* ---------- Звёзды ---------- */

function Stars({ count = 150 }: { count?: number }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#6688cc" sizeAttenuation />
    </points>
  );
}

/* ---------- Адаптивная камера для мобильных ---------- */

function AdaptiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    // On mobile (width < 768), move camera much further back so planet is fully visible
    const isMobile = size.width < 768;
    const targetZ = isMobile ? 8.5 : 5.5;
    camera.position.z = targetZ;
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  return null;
}

/* ---------- Экспорт ---------- */

export interface GlobeNetworkProps {
  className?: string;
  scrollProgress: number;
}

export function GlobeNetwork({ className, scrollProgress }: GlobeNetworkProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
        <AdaptiveCamera />
        <ambientLight intensity={0.3} />
        <Planet scrollProgress={scrollProgress} />
        <NetworkNodes scrollProgress={scrollProgress} />
        <NetworkEdges scrollProgress={scrollProgress} />
        <Stars />
      </Canvas>
    </div>
  );
}
