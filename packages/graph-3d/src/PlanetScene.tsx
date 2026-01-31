import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- GLSL: процедурная планета (simplex noise в шейдере) ---------- */

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

  // Simplex-like hash
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

    // Цвета: океан (синий) → суша (зелёный) → горы (коричневый) → снег (белый)
    vec3 ocean = vec3(0.05, 0.15, 0.45);
    vec3 land = vec3(0.12, 0.42, 0.18);
    vec3 mountain = vec3(0.35, 0.25, 0.15);
    vec3 snow = vec3(0.9, 0.92, 0.95);

    vec3 color = ocean;
    if (n > 0.45) color = mix(ocean, land, (n - 0.45) / 0.1);
    if (n > 0.55) color = mix(land, mountain, (n - 0.55) / 0.15);
    if (n > 0.70) color = mix(mountain, snow, (n - 0.70) / 0.1);

    // Простое освещение
    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;

    // Атмосферное свечение по краям (Fresnel)
    float fresnel = pow(1.0 - max(dot(vNormal, normalize(cameraPosition - vPosition)), 0.0), 3.0);
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * fresnel * 0.5;

    gl_FragColor = vec4(color * diff + atmosphere, 1.0);
  }
`;

/* ---------- Компонент вращающейся планеты ---------- */

function Planet() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.8, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

/* ---------- Декоративные точки-звёзды вокруг ---------- */

function Stars({ count = 200 }: { count?: number }) {
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

/* ---------- Экспорт ---------- */

export interface PlanetSceneProps {
  className?: string;
}

export function PlanetScene({ className }: PlanetSceneProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.3} />
        <Planet />
        <Stars />
      </Canvas>
    </div>
  );
}
