import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- URL текстур (CDN с CORS) ---------- */

const EARTH_TEXTURE_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const EARTH_BUMP_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-topology.png';
const EARTH_SPECULAR_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-water.png';
const MOON_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r152/examples/textures/planets/moon_1024.jpg';

/* ---------- GLSL: Атмосфера (внешнее свечение) ---------- */

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float intensity = pow(0.65 - dot(vNormal, viewDir), 2.0);
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * intensity;
    gl_FragColor = vec4(atmosphere, intensity * 0.6);
  }
`;

/* ---------- GLSL: Мерцающие звёзды (мелкие, далёкие) ---------- */

const starsVertexShader = `
  attribute float size;
  attribute float brightness;
  attribute float twinkleSpeed;
  attribute float twinklePhase;

  uniform float uTime;
  uniform vec3 uMouseDir;
  uniform float uHoverRadius;

  varying float vBrightness;

  void main() {
    // Базовое мерцание - очень тонкое
    float twinkle = 0.7 + 0.3 * sin(uTime * twinkleSpeed + twinklePhase);

    // Hover эффект - только яркость, без увеличения размера
    vec3 starDir = normalize(position);
    float dotProduct = dot(starDir, uMouseDir);
    float angularDist = 1.0 - dotProduct;
    float hoverIntensity = smoothstep(uHoverRadius, 0.0, angularDist);

    // Комбинируем
    vBrightness = brightness * twinkle * (1.0 + hoverIntensity * 0.5);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (150.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starsFragmentShader = `
  varying float vBrightness;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Яркое ядро с мягким свечением
    float core = 1.0 - smoothstep(0.0, 0.15, dist);
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    float alpha = (core * 1.5 + glow * 0.5) * vBrightness;

    // Белый цвет с лёгким голубоватым оттенком
    vec3 color = vec3(0.95, 0.97, 1.0) * (vBrightness + 0.3);

    gl_FragColor = vec4(color, min(alpha, 1.0));
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

/* ---------- Реалистичная Земля с текстурами NASA ---------- */

function Earth({ scrollProgress }: { scrollProgress: number }) {
  const earthRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const currentRotation = useRef(0);

  // Загружаем текстуры (без облаков - они недоступны на CDN)
  const [earthTexture, bumpMap, specularMap] = useLoader(THREE.TextureLoader, [
    EARTH_TEXTURE_URL,
    EARTH_BUMP_URL,
    EARTH_SPECULAR_URL,
  ]);

  useFrame(() => {
    const target = scrollProgress * Math.PI * 1.5;
    currentRotation.current += (target - currentRotation.current) * 0.08;

    if (earthRef.current) {
      earthRef.current.rotation.y = currentRotation.current;
    }
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y = currentRotation.current;
    }
  });

  return (
    <group>
      {/* Земля с реальной текстурой */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[1.5, 64, 64]} />
        <meshPhongMaterial
          map={earthTexture}
          bumpMap={bumpMap}
          bumpScale={0.05}
          specularMap={specularMap}
          specular={new THREE.Color(0x333333)}
          shininess={5}
        />
      </mesh>

      {/* Атмосфера */}
      <mesh ref={atmosphereRef} scale={1.12}>
        <sphereGeometry args={[1.5, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          transparent
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ---------- Луна с реальной текстурой ---------- */

function Moon({ scrollProgress }: { scrollProgress: number }) {
  const moonRef = useRef<THREE.Mesh>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const currentOrbitAngle = useRef(0);

  const moonTexture = useLoader(THREE.TextureLoader, MOON_TEXTURE_URL);

  useFrame(() => {
    if (orbitRef.current) {
      const targetAngle = scrollProgress * Math.PI * 2;
      currentOrbitAngle.current += (targetAngle - currentOrbitAngle.current) * 0.05;
      orbitRef.current.rotation.y = currentOrbitAngle.current;
    }
    if (moonRef.current) {
      moonRef.current.rotation.y = -currentOrbitAngle.current * 0.5;
    }
  });

  return (
    <group ref={orbitRef}>
      <mesh ref={moonRef} position={[3.5, 0.3, 0]}>
        <sphereGeometry args={[0.4, 64, 64]} />
        <meshStandardMaterial
          map={moonTexture}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/* ---------- Яркие звёзды ---------- */

function Stars({ count = 5000 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, pointer } = useThree();

  const { positions, sizes, brightness, twinkleSpeeds, twinklePhases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const bright = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Звёзды на сфере вокруг сцены
      const r = 80 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Размер - больше звёзд крупных
      const sizeRandom = Math.random();
      if (sizeRandom < 0.5) {
        sz[i] = 1.0 + Math.random() * 1.0; // 50% мелкие
      } else if (sizeRandom < 0.85) {
        sz[i] = 2.0 + Math.random() * 1.5; // 35% средние
      } else {
        sz[i] = 3.5 + Math.random() * 2.0; // 15% яркие
      }

      // Яркость - большинство яркие
      bright[i] = 0.6 + Math.random() * 0.4;

      // Медленное мерцание
      speeds[i] = 0.5 + Math.random() * 2.0;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return { positions: pos, sizes: sz, brightness: bright, twinkleSpeeds: speeds, twinklePhases: phases };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouseDir: { value: new THREE.Vector3(0, 0, 1) },
    uHoverRadius: { value: 0.08 },
  }), []);

  const mouseDir = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useFrame((_state, delta) => {
    uniforms.uTime.value += delta;
    raycaster.setFromCamera(pointer, camera);
    mouseDir.copy(raycaster.ray.direction).normalize();
    uniforms.uMouseDir.value.copy(mouseDir);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-brightness" args={[brightness, 1]} />
        <bufferAttribute attach="attributes-twinkleSpeed" args={[twinkleSpeeds, 1]} />
        <bufferAttribute attach="attributes-twinklePhase" args={[twinklePhases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={starsVertexShader}
        fragmentShader={starsFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
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

/* ---------- Связи между узлами ---------- */

const NEIGHBORS_PER_NODE = 6;

function NetworkEdges({ scrollProgress }: { scrollProgress: number }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const currentRotation = useRef(0);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  const nodeCount = Math.floor(MIN_NODE_COUNT + scrollProgress * (MAX_NODE_COUNT - MIN_NODE_COUNT));
  const nodePositions = useMemo(() => fibonacciSphere(MAX_NODE_COUNT, NODE_RADIUS), []);

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

      distances.sort((a, b) => a.dist - b.dist);
      map[i] = distances.slice(0, NEIGHBORS_PER_NODE).map(d => d.j);
    }
    return map;
  }, [nodePositions]);

  const edgePositions = useMemo(() => {
    const edgeSet = new Set<string>();
    const edges: number[] = [];
    const lift = 1.02;

    for (let i = 0; i < nodeCount; i++) {
      const neighbors = neighborsMap[i] || [];
      for (const j of neighbors) {
        if (j < nodeCount) {
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

/* ---------- Адаптивная камера ---------- */

function AdaptiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const isMobile = size.width < 768;
    const targetZ = isMobile ? 8.5 : 5.5;
    camera.position.z = targetZ;
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  return null;
}

/* ---------- Suspense fallback ---------- */

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1.5, 32, 32]} />
      <meshBasicMaterial color="#1e3a5f" wireframe />
    </mesh>
  );
}

/* ---------- Внутренняя сцена ---------- */

function Scene({ scrollProgress, heroProgress }: { scrollProgress: number; heroProgress: number }) {
  const [texturesLoaded, setTexturesLoaded] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    // Предзагрузка текстур Земли и Луны
    const loader = new THREE.TextureLoader();
    Promise.all([
      loader.loadAsync(EARTH_TEXTURE_URL),
      loader.loadAsync(EARTH_BUMP_URL),
      loader.loadAsync(EARTH_SPECULAR_URL),
      loader.loadAsync(MOON_TEXTURE_URL),
    ]).then(() => setTexturesLoaded(true)).catch(() => setTexturesLoaded(true));
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      const targetY = heroProgress * 1.3;
      const targetScale = 1 - heroProgress * 0.35;
      groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.08;
      const s = groupRef.current.scale.x + (targetScale - groupRef.current.scale.x) * 0.08;
      groupRef.current.scale.setScalar(s);
    }
  });

  const showNetwork = heroProgress < 0.3;

  return (
    <>
      <AdaptiveCamera />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} />

      <group ref={groupRef}>
        {texturesLoaded ? (
          <>
            <Earth scrollProgress={scrollProgress} />
            <Moon scrollProgress={scrollProgress} />
          </>
        ) : (
          <LoadingFallback />
        )}

        {showNetwork && (
          <>
            <NetworkNodes scrollProgress={scrollProgress} />
            <NetworkEdges scrollProgress={scrollProgress} />
          </>
        )}
      </group>

      <Stars count={6000} />
    </>
  );
}

/* ---------- Экспорт ---------- */

export interface GlobeNetworkProps {
  className?: string;
  scrollProgress: number;
  heroProgress?: number;
}

export function GlobeNetwork({ className, scrollProgress, heroProgress = 0 }: GlobeNetworkProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'linear-gradient(to bottom, #000510 0%, #020817 50%, #030b1a 100%)' }}
      >
        <color attach="background" args={['#020817']} />
        <Scene scrollProgress={scrollProgress} heroProgress={heroProgress} />
      </Canvas>
    </div>
  );
}
