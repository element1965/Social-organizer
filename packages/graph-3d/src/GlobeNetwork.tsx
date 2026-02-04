import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- URL текстур NASA (jsdelivr CDN с CORS) ---------- */

const EARTH_TEXTURE_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const EARTH_BUMP_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-topology.png';
const EARTH_SPECULAR_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-water.png';
// Примечание: облака и луна используют процедурные материалы (текстуры недоступны на CDN)

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

    // Мягкие края для реалистичности
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha *= vBrightness;

    // Белый цвет с лёгким оттенком
    vec3 color = vec3(1.0, 1.0, 0.98) * vBrightness;

    gl_FragColor = vec4(color, alpha);
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
    const target = scrollProgress * Math.PI * 3;
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

/* ---------- Процедурная текстура Луны с кратерами ---------- */

function createMoonTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Базовый серый цвет луны
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, size, size);

  // Добавляем noise для текстуры поверхности
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 30;
    data[i] = Math.max(0, Math.min(255, data[i]! + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Рисуем кратеры разных размеров
  const craters = [
    // Большие кратеры
    { x: 0.25, y: 0.3, r: 0.12 },
    { x: 0.7, y: 0.25, r: 0.1 },
    { x: 0.5, y: 0.65, r: 0.14 },
    { x: 0.15, y: 0.7, r: 0.08 },
    { x: 0.8, y: 0.6, r: 0.09 },
    // Средние кратеры
    { x: 0.35, y: 0.15, r: 0.05 },
    { x: 0.6, y: 0.45, r: 0.06 },
    { x: 0.2, y: 0.5, r: 0.04 },
    { x: 0.85, y: 0.35, r: 0.05 },
    { x: 0.45, y: 0.85, r: 0.055 },
    { x: 0.9, y: 0.8, r: 0.045 },
    { x: 0.1, y: 0.15, r: 0.035 },
    // Мелкие кратеры
    ...Array.from({ length: 40 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.01 + Math.random() * 0.025,
    })),
  ];

  for (const crater of craters) {
    const cx = crater.x * size;
    const cy = crater.y * size;
    const radius = crater.r * size;

    // Тень кратера (темнее)
    const gradient = ctx.createRadialGradient(
      cx - radius * 0.2, cy - radius * 0.2, 0,
      cx, cy, radius
    );
    gradient.addColorStop(0, 'rgba(40, 40, 40, 0.7)');
    gradient.addColorStop(0.5, 'rgba(60, 60, 60, 0.5)');
    gradient.addColorStop(0.8, 'rgba(100, 100, 100, 0.3)');
    gradient.addColorStop(1, 'rgba(120, 120, 120, 0)');

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Светлый ободок (освещённый край)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 180, 180, 0.3)';
    ctx.lineWidth = radius * 0.1;
    ctx.stroke();
  }

  // Добавляем тёмные "моря" (mare)
  const maria = [
    { x: 0.4, y: 0.4, rx: 0.2, ry: 0.15 },
    { x: 0.65, y: 0.55, rx: 0.12, ry: 0.18 },
  ];

  for (const mare of maria) {
    ctx.beginPath();
    ctx.ellipse(mare.x * size, mare.y * size, mare.rx * size, mare.ry * size, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(70, 70, 75, 0.4)';
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/* ---------- Луна с процедурными кратерами ---------- */

function Moon({ scrollProgress }: { scrollProgress: number }) {
  const moonRef = useRef<THREE.Mesh>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const currentOrbitAngle = useRef(0);

  const moonTexture = useMemo(() => createMoonTexture(), []);

  useFrame(() => {
    if (orbitRef.current) {
      const targetAngle = scrollProgress * Math.PI * 4;
      currentOrbitAngle.current += (targetAngle - currentOrbitAngle.current) * 0.05;
      orbitRef.current.rotation.y = currentOrbitAngle.current;
    }
    if (moonRef.current) {
      moonRef.current.rotation.y = -currentOrbitAngle.current;
    }
  });

  return (
    <group ref={orbitRef}>
      <mesh ref={moonRef} position={[3.5, 0.3, 0]}>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial
          map={moonTexture}
          roughness={0.95}
          metalness={0.0}
          bumpMap={moonTexture}
          bumpScale={0.02}
        />
      </mesh>
    </group>
  );
}

/* ---------- Реалистичные мелкие звёзды ---------- */

function Stars({ count = 3000 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, pointer } = useThree();

  const { positions, sizes, brightness, twinkleSpeeds, twinklePhases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const bright = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Звёзды очень далеко - от 50 до 150 единиц
      const r = 50 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Размер - большинство очень мелкие, редко крупнее
      const sizeRandom = Math.random();
      if (sizeRandom < 0.7) {
        sz[i] = 0.3 + Math.random() * 0.4; // 70% мелкие
      } else if (sizeRandom < 0.95) {
        sz[i] = 0.7 + Math.random() * 0.5; // 25% средние
      } else {
        sz[i] = 1.2 + Math.random() * 0.6; // 5% яркие
      }

      // Яркость - большинство тусклые
      bright[i] = 0.3 + Math.random() * 0.7;

      // Медленное мерцание
      speeds[i] = 0.3 + Math.random() * 1.5;
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

function Scene({ scrollProgress }: { scrollProgress: number }) {
  const [texturesLoaded, setTexturesLoaded] = useState(false);

  useEffect(() => {
    // Предзагрузка текстур Земли
    const loader = new THREE.TextureLoader();
    Promise.all([
      loader.loadAsync(EARTH_TEXTURE_URL),
      loader.loadAsync(EARTH_BUMP_URL),
      loader.loadAsync(EARTH_SPECULAR_URL),
    ]).then(() => setTexturesLoaded(true)).catch(() => setTexturesLoaded(true));
  }, []);

  return (
    <>
      <AdaptiveCamera />
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />

      {texturesLoaded ? (
        <>
          <Earth scrollProgress={scrollProgress} />
          <Moon scrollProgress={scrollProgress} />
        </>
      ) : (
        <LoadingFallback />
      )}

      <NetworkNodes scrollProgress={scrollProgress} />
      <NetworkEdges scrollProgress={scrollProgress} />
      <Stars count={3000} />
    </>
  );
}

/* ---------- Экспорт ---------- */

export interface GlobeNetworkProps {
  className?: string;
  scrollProgress: number;
}

export function GlobeNetwork({ className, scrollProgress }: GlobeNetworkProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'linear-gradient(to bottom, #000510 0%, #020817 50%, #030b1a 100%)' }}
      >
        <color attach="background" args={['#020817']} />
        <Scene scrollProgress={scrollProgress} />
      </Canvas>
    </div>
  );
}
