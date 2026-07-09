interface Ball3DProps {
  x: number;
  z: number;
  active?: boolean;
}

export function Ball3D({ x, z, active = false }: Ball3DProps) {
  return (
    <group position={[x, 0.18, z]}>
      <mesh castShadow>
        <sphereGeometry args={[0.18, 32, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.45} metalness={0.02} />
      </mesh>

      <mesh rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[0.182, 0.007, 8, 40]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.184, 0.006, 8, 40]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>

      {active && (
        <mesh position={[0, -0.165, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.26, 0.34, 32]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}
