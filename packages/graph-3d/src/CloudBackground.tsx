import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- Облака-частицы (декоративный фон графа на дашборде) ---------- */

function CloudParticles({ count = 300 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Разброс в виде нескольких кластеров
      const cluster = Math.floor(Math.random() * 5);
      const cx = (cluster % 3 - 1) * 3;
      const cy = (Math.floor(cluster / 3) - 0.5) * 2;
      pos[i * 3] = cx + (Math.random() - 0.5) * 4;
      pos[i * 3 + 1] = cy + (Math.random() - 0.5) * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;

      // Пастельные цвета: голубой → фиолетовый
      const t = Math.random();
      col[i * 3] = 0.3 + t * 0.3;     // R
      col[i * 3 + 1] = 0.4 + t * 0.2; // G
      col[i * 3 + 2] = 0.8 + t * 0.2; // B

    }
    return { positions: pos, colors: col };
  }, [count]);

  // Связи между близкими точками
  const linePositions = useMemo(() => {
    const lines: number[] = [];
    const threshold = 1.8;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count && lines.length < count * 6; j++) {
        const dx = positions[i * 3]! - positions[j * 3]!;
        const dy = positions[i * 3 + 1]! - positions[j * 3 + 1]!;
        const dz = positions[i * 3 + 2]! - positions[j * 3 + 2]!;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < threshold) {
          lines.push(
            positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!,
            positions[j * 3]!, positions[j * 3 + 1]!, positions[j * 3 + 2]!,
          );
        }
      }
    }
    return new Float32Array(lines);
  }, [positions, count]);

  useFrame((_state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.03;
      pointsRef.current.rotation.x += delta * 0.01;
    }
  });

  return (
    <group ref={pointsRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.08} vertexColors sizeAttenuation transparent opacity={0.6} />
      </points>
      {linePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[linePositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#4466aa" transparent opacity={0.12} />
        </lineSegments>
      )}
    </group>
  );
}

/* ---------- Экспорт ---------- */

export interface CloudBackgroundProps {
  className?: string;
  particleCount?: number;
}

export function CloudBackground({ className, particleCount = 300 }: CloudBackgroundProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <CloudParticles count={particleCount} />
      </Canvas>
    </div>
  );
}
