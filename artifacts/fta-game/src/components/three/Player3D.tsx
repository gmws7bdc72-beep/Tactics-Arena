import { Billboard, Text } from "@react-three/drei";
import type { PlayerRole } from "./PlayerModel3D";

const ROLE_BADGE: Record<PlayerRole, string> = {
  goalkeeper: "GK",
  defender: "DEF",
  midfielder: "MID",
  forward: "FWD",
  striker: "ATK",
};

const ROLE_BADGE_COLOR: Record<PlayerRole, string> = {
  goalkeeper: "#c9a34b",
  defender: "#3d7dd8",
  midfielder: "#3fae5c",
  forward: "#d9483b",
  striker: "#d9483b",
};

interface Player3DProps {
  x: number;
  z: number;
  facing?: number;
  teamColor: string;
  secondaryColor?: string;
  jerseyNumber: number;
  name: string;
  role: PlayerRole;
  isSelected?: boolean;
  offside?: boolean;
}

export function Player3D({
  x,
  z,
  facing = 0,
  teamColor,
  secondaryColor = "#ffffff",
  jerseyNumber,
  name,
  role,
  isSelected = false,
  offside = false,
}: Player3DProps) {
  const badge = ROLE_BADGE[role];
  const badgeColor = role === "goalkeeper" ? "#c9a34b" : ROLE_BADGE_COLOR[role];

  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.44, 32]} />
          <meshBasicMaterial color="#5fe0ff" transparent opacity={0.85} />
        </mesh>
      )}

      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.34, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>

      <group position={[0, 0.82, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.18, 0.5, 8, 16]} />
          <meshStandardMaterial color={teamColor} roughness={0.55} />
        </mesh>

        <mesh position={[0, 0.43, 0]} castShadow>
          <sphereGeometry args={[0.17, 24, 24]} />
          <meshStandardMaterial color="#c68642" roughness={0.6} />
        </mesh>

        <mesh position={[0, 0.57, -0.02]} castShadow>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color="#211714" roughness={0.8} />
        </mesh>

        <mesh position={[-0.13, -0.46, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.46, 6, 10]} />
          <meshStandardMaterial color="#111827" roughness={0.6} />
        </mesh>

        <mesh position={[0.13, -0.46, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.46, 6, 10]} />
          <meshStandardMaterial color="#111827" roughness={0.6} />
        </mesh>

        <mesh position={[-0.29, 0.02, 0]} rotation={[0, 0, -0.35]} castShadow>
          <capsuleGeometry args={[0.045, 0.45, 6, 10]} />
          <meshStandardMaterial color={teamColor} roughness={0.6} />
        </mesh>

        <mesh position={[0.29, 0.02, 0]} rotation={[0, 0, 0.35]} castShadow>
          <capsuleGeometry args={[0.045, 0.45, 6, 10]} />
          <meshStandardMaterial color={teamColor} roughness={0.6} />
        </mesh>

        <Text
          position={[0, 0.02, 0.185]}
          rotation={[0, 0, 0]}
          fontSize={0.16}
          color={secondaryColor}
          anchorX="center"
          anchorY="middle"
        >
          {String(jerseyNumber)}
        </Text>
      </group>

      <Billboard position={[0, 1.68, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.9, 0.24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.6} />
        </mesh>
        <Text
          position={[-0.14, 0.045, 0]}
          fontSize={0.085}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {name}
        </Text>
        <Text
          position={[0.31, 0.045, 0]}
          fontSize={0.068}
          color={badgeColor}
          anchorX="center"
          anchorY="middle"
        >
          {badge}
        </Text>
      </Billboard>

      {offside && (
        <Billboard position={[0.42, 1.68, 0]}>
          <mesh>
            <planeGeometry args={[0.32, 0.18]} />
            <meshBasicMaterial color="#ff1744" />
          </mesh>
          <Text fontSize={0.085} color="#ffffff" anchorX="center" anchorY="middle">
            OS
          </Text>
        </Billboard>
      )}
    </group>
  );
}
