import { useMemo } from "react";
import * as THREE from "three";

interface Ball3DProps {
  x: number;
  y?: number;
  z: number;
  radius?: number;
  active?: boolean;
}

function createBallTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, size, size);

  const patches: Array<[number, number, number]> = [
    [size * 0.5, size * 0.5, size * 0.13],
    [size * 0.18, size * 0.22, size * 0.1],
    [size * 0.82, size * 0.22, size * 0.1],
    [size * 0.18, size * 0.78, size * 0.1],
    [size * 0.82, size * 0.78, size * 0.1],
    [size * 0.5, size * 0.08, size * 0.09],
    [size * 0.5, size * 0.92, size * 0.09],
  ];

  ctx.fillStyle = "#1c1c1c";

  for (const [px, py, pr] of patches) {
    ctx.beginPath();
    const spikes = 5;
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const r = i % 2 === 0 ? pr : pr * 0.42;
      const vx = px + Math.cos(angle) * r;
      const vy = py + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function Ball3D({ x, y = 0, z, radius = 0.11, active = false }: Ball3DProps) {
  const texture = useMemo(() => createBallTexture(), []);

  return (
    <group position={[x, y + radius, z]}>
      {active && (
        <mesh position={[0, -y - radius + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.4, radius * 2.1, 32]} />
          <meshBasicMaterial color="#ff3d3d" transparent opacity={0.7} />
        </mesh>
      )}

      <mesh castShadow>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial map={texture} roughness={0.5} />
      </mesh>
    </group>
  );
}
