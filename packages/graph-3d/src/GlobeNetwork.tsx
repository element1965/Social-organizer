import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- GLSL: Реалистичная Земля с континентами ---------- */

const earthVertexShader = `
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

const earthFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  // Simplex noise functions
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Создаём реалистичные континенты используя FBM noise
    vec3 pos = normalize(vPosition) * 3.0;

    // Базовый noise для континентов
    float continentNoise = fbm(pos * 1.2);
    continentNoise += fbm(pos * 2.5) * 0.3;

    // Порог для суши/воды (настроен для ~30% суши)
    float landThreshold = 0.15;
    float isLand = smoothstep(landThreshold - 0.05, landThreshold + 0.05, continentNoise);

    // Цвета океана (глубина варьируется)
    vec3 deepOcean = vec3(0.02, 0.08, 0.25);
    vec3 shallowOcean = vec3(0.05, 0.18, 0.45);
    float oceanDepth = smoothstep(-0.3, 0.15, continentNoise);
    vec3 oceanColor = mix(deepOcean, shallowOcean, oceanDepth);

    // Цвета суши
    vec3 beach = vec3(0.76, 0.70, 0.50);
    vec3 lowland = vec3(0.2, 0.45, 0.15);
    vec3 forest = vec3(0.08, 0.32, 0.08);
    vec3 mountain = vec3(0.45, 0.38, 0.30);
    vec3 snow = vec3(0.95, 0.97, 1.0);

    // Высота для раскраски суши
    float elevation = (continentNoise - landThreshold) * 3.0;
    elevation = clamp(elevation, 0.0, 1.0);

    // Градиент суши по высоте
    vec3 landColor = beach;
    if (elevation > 0.1) landColor = mix(beach, lowland, (elevation - 0.1) / 0.2);
    if (elevation > 0.3) landColor = mix(lowland, forest, (elevation - 0.3) / 0.25);
    if (elevation > 0.55) landColor = mix(forest, mountain, (elevation - 0.55) / 0.25);
    if (elevation > 0.8) landColor = mix(mountain, snow, (elevation - 0.8) / 0.2);

    // Полярные шапки
    float latitude = abs(normalize(vPosition).y);
    float polarCap = smoothstep(0.75, 0.9, latitude);
    landColor = mix(landColor, snow, polarCap * 0.8);
    oceanColor = mix(oceanColor, vec3(0.7, 0.85, 0.95), polarCap * 0.5);

    // Финальный цвет поверхности
    vec3 surfaceColor = mix(oceanColor, landColor, isLand);

    // Облака (отдельный слой noise, движущийся со временем)
    vec3 cloudPos = pos * 1.5 + vec3(uTime * 0.02, 0.0, uTime * 0.01);
    float clouds = fbm(cloudPos);
    clouds = smoothstep(0.2, 0.6, clouds);
    vec3 cloudColor = vec3(1.0, 1.0, 1.0);
    surfaceColor = mix(surfaceColor, cloudColor, clouds * 0.4);

    // Освещение
    vec3 lightDir = normalize(vec3(1.0, 0.5, 0.8));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.25;
    float lighting = ambient + diff * 0.75;

    // Ночная сторона - огни городов (только на суше)
    float nightSide = 1.0 - smoothstep(-0.1, 0.2, dot(vNormal, lightDir));
    vec3 cityLights = vec3(1.0, 0.9, 0.6) * isLand * nightSide * 0.3;
    float cityNoise = smoothstep(0.3, 0.7, snoise(pos * 15.0));
    cityLights *= cityNoise;

    // Атмосферное свечение (Fresnel)
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * fresnel * 0.6;

    // Финальный цвет
    vec3 finalColor = surfaceColor * lighting + cityLights + atmosphere;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

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
    float intensity = pow(0.7 - dot(vNormal, viewDir), 2.0);
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * intensity;
    gl_FragColor = vec4(atmosphere, intensity * 0.5);
  }
`;

/* ---------- GLSL: Мерцающие звёзды с hover-эффектом ---------- */

const starsVertexShader = `
  attribute float size;
  attribute float twinkleSpeed;
  attribute float twinklePhase;

  uniform float uTime;
  uniform vec3 uMouseDir;      // Направление от камеры к точке под мышью
  uniform float uHoverRadius;  // Радиус влияния hover (в углах, примерно 0.1-0.3)

  varying float vBrightness;
  varying float vHoverIntensity;

  void main() {
    // Базовое мерцание с разной скоростью и фазой для каждой звезды
    float baseTwinkle = 0.5 + 0.5 * sin(uTime * twinkleSpeed + twinklePhase);

    // Вычисляем направление к звезде от начала координат (камера примерно там)
    vec3 starDir = normalize(position);

    // Угловое расстояние до направления мыши (dot product даёт косинус угла)
    float dotProduct = dot(starDir, uMouseDir);
    // Преобразуем в расстояние (1 = идеально совпадает, -1 = противоположно)
    float angularDist = 1.0 - dotProduct;

    // Hover интенсивность - близкие к мыши звёзды светятся ярче
    vHoverIntensity = smoothstep(uHoverRadius, 0.0, angularDist);

    // Комбинируем базовую яркость с hover-эффектом
    // При hover: ускоряем мерцание и увеличиваем яркость
    float hoverTwinkle = 0.5 + 0.5 * sin(uTime * twinkleSpeed * 3.0 + twinklePhase);
    vBrightness = mix(baseTwinkle, hoverTwinkle * 1.5 + 0.5, vHoverIntensity);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Увеличиваем размер звёзд при hover
    float hoverSize = size * (1.0 + vHoverIntensity * 1.5);
    gl_PointSize = hoverSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starsFragmentShader = `
  varying float vBrightness;
  varying float vHoverIntensity;

  void main() {
    // Круглая форма звезды
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Мягкие края
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    // Базовый цвет с мерцанием
    vec3 baseColor = vec3(0.9, 0.95, 1.0);

    // При hover добавляем тёплый оттенок и увеличиваем яркость
    vec3 hoverColor = vec3(1.0, 0.95, 0.8);
    vec3 color = mix(baseColor, hoverColor, vHoverIntensity * 0.5);
    color *= vBrightness;

    // Добавляем свечение (glow) при hover
    float glow = vHoverIntensity * 0.3 * (1.0 - dist * 2.0);
    color += vec3(0.5, 0.7, 1.0) * glow;

    gl_FragColor = vec4(color, alpha * vBrightness);
  }
`;

/* ---------- GLSL: Луна ---------- */

const moonFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  // Simple noise for craters
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Базовый серый цвет луны
    vec3 baseColor = vec3(0.75, 0.73, 0.70);

    // Кратеры через noise
    vec2 uv = vUv * 20.0;
    float craters = noise(uv) * 0.5 + noise(uv * 2.0) * 0.25 + noise(uv * 4.0) * 0.125;
    craters = smoothstep(0.3, 0.7, craters);

    // Тёмные моря (более крупные области)
    float maria = noise(vUv * 5.0);
    maria = smoothstep(0.4, 0.6, maria);

    vec3 moonColor = mix(baseColor * 0.7, baseColor, craters);
    moonColor = mix(moonColor, baseColor * 0.5, maria * 0.3);

    // Освещение
    vec3 lightDir = normalize(vec3(1.0, 0.5, 0.8));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.1;

    vec3 finalColor = moonColor * (ambient + diff * 0.9);

    gl_FragColor = vec4(finalColor, 1.0);
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

/* ---------- Планета Земля ---------- */

function Earth({ scrollProgress }: { scrollProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
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
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y = currentRotation.current;
    }
  });

  return (
    <group>
      {/* Земля */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.5, 128, 128]} />
        <shaderMaterial
          vertexShader={earthVertexShader}
          fragmentShader={earthFragmentShader}
          uniforms={uniforms}
        />
      </mesh>
      {/* Атмосфера */}
      <mesh ref={atmosphereRef} scale={1.15}>
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

/* ---------- Луна ---------- */

function Moon({ scrollProgress }: { scrollProgress: number }) {
  const moonRef = useRef<THREE.Mesh>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const currentOrbitAngle = useRef(0);

  useFrame(() => {
    if (orbitRef.current) {
      // Луна вращается вокруг Земли при скролле
      const targetAngle = scrollProgress * Math.PI * 4;
      currentOrbitAngle.current += (targetAngle - currentOrbitAngle.current) * 0.05;
      orbitRef.current.rotation.y = currentOrbitAngle.current;
    }
    if (moonRef.current) {
      // Луна всегда повёрнута к Земле (tidal lock)
      moonRef.current.rotation.y = -currentOrbitAngle.current;
    }
  });

  return (
    <group ref={orbitRef}>
      <mesh ref={moonRef} position={[3.5, 0.3, 0]}>
        <sphereGeometry args={[0.35, 64, 64]} />
        <shaderMaterial
          vertexShader={earthVertexShader}
          fragmentShader={moonFragmentShader}
          uniforms={{ uTime: { value: 0 } }}
        />
      </mesh>
    </group>
  );
}

/* ---------- Мерцающие звёзды с интерактивностью ---------- */

function TwinklingStars({ count = 500 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, pointer } = useThree();

  const { positions, sizes, twinkleSpeeds, twinklePhases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Распределяем звёзды в сферической оболочке
      const r = 8 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Разный размер звёзд
      sz[i] = 0.5 + Math.random() * 2.0;

      // Разная скорость и фаза мерцания
      speeds[i] = 0.5 + Math.random() * 3.0;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return { positions: pos, sizes: sz, twinkleSpeeds: speeds, twinklePhases: phases };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouseDir: { value: new THREE.Vector3(0, 0, 1) },
    uHoverRadius: { value: 0.15 }, // Радиус влияния hover
  }), []);

  // Вектор для расчёта направления мыши
  const mouseDir = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useFrame((_state, delta) => {
    uniforms.uTime.value += delta;

    // Вычисляем направление от камеры к точке под мышью
    raycaster.setFromCamera(pointer, camera);
    mouseDir.copy(raycaster.ray.direction).normalize();
    uniforms.uMouseDir.value.copy(mouseDir);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
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
        <Earth scrollProgress={scrollProgress} />
        <Moon scrollProgress={scrollProgress} />
        <NetworkNodes scrollProgress={scrollProgress} />
        <NetworkEdges scrollProgress={scrollProgress} />
        <TwinklingStars count={600} />
      </Canvas>
    </div>
  );
}
