import { useMemo } from "react";
import { Billboard, Text } from "@react-three/drei";

export type PlayerRole =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward"
  | "striker";

interface Player3DProps {
  x: number;
  z: number;
  facing?: number;
  teamColor: string;
  shortsColor?: string;
  skinTone?: string;
  hairColor?: string;
  bootColor?: string;
  jerseyNumber: number;
  name: string;
  role: PlayerRole;
  isSelected?: boolean;
  offside?: boolean;
}

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

function shade(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16,
  );

  const r = Math.max(0, Math.min(255, ((bigint >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((bigint >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (bigint & 255) + amount));

  return `rgb(${r},${g},${b})`;
}

export function Player3D({
  x,
  z,
  facing = 0,
  teamColor,
  shortsColor,
  skinTone = "#e0a878",
  hairColor = "#3a2a1a",
  bootColor = "#f5c518",
  jerseyNumber,
  name,
  role,
  isSelected = false,
  offside = false,
}: Player3DProps) {
  const shorts = shortsColor ?? shade(teamColor, -70);
  const isGK = role === "goalkeeper";
  const gloveColor = isGK ? "#f5c518" : skinTone;
  const badge = ROLE_BADGE[role];
  const badgeColor = isGK ? "#c9a34b" : ROLE_BADGE_COLOR[role];

  const legOffsets = useMemo(() => [-0.11, 0.11], []);
  const armOffsets = useMemo(() => [-0.26, 0.26], []);

  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {isSelected && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.36, 32]} />
          <meshBasicMaterial color="#5fe0ff" transparent opacity={0.85} />
        </mesh>
      )}

      {/* boots */}
      {legOffsets.map((ox) => (
        <mesh key={`boot-${ox}`} position={[ox, 0.06, 0.04]} castShadow>
          <boxGeometry args={[0.11, 0.1, 0.2]} />
          <meshStandardMaterial color={bootColor} roughness={0.6} />
        </mesh>
      ))}

      {/* legs */}
      {legOffsets.map((ox) => (
        <mesh key={`leg-${ox}`} position={[ox, 0.34, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
          <meshStandardMaterial color={skinTone} roughness={0.85} />
        </mesh>
      ))}

      {/* shorts */}
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.16, 0.24, 12]} />
        <meshStandardMaterial color={shorts} roughness={0.75} />
      </mesh>

      {/* torso / jersey */}
      <mesh position={[0, 0.92, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.4, 4, 8]} />
        <meshStandardMaterial color={teamColor} roughness={0.7} />
      </mesh>

      {/* arms */}
      {armOffsets.map((ox) => (
        <mesh
          key={`arm-${ox}`}
          position={[ox, 0.95, 0]}
          rotation={[0, 0, ox > 0 ? -0.18 : 0.18]}
          castShadow
        >
          <capsuleGeometry args={[0.06, 0.38, 4, 8]} />
          <meshStandardMaterial color={teamColor} roughness={0.7} />
        </mesh>
      ))}

      {/* hands / gloves */}
      {armOffsets.map((ox) => (
        <mesh key={`hand-${ox}`} position={[ox * 1.25, 0.7, 0]} castShadow>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color={gloveColor} roughness={0.6} />
        </mesh>
      ))}

      {/* head */}
      <mesh position={[0, 1.32, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color={skinTone} roughness={0.8} />
      </mesh>

      {/* hair */}
      <mesh position={[0, 1.4, -0.02]} castShadow>
        <sphereGeometry args={[0.155, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={hairColor} roughness={0.9} />
      </mesh>

      {/* jersey number, chest */}
      <Billboard position={[0, 0.95, 0.19]}>
        <Text fontSize={0.14} color="#ffffff" anchorX="center" anchorY="middle">
          {jerseyNumber}
        </Text>
      </Billboard>

      {/* name + role tag */}
      <Billboard position={[0, 1.72, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.85, 0.24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.55} />
        </mesh>
        <Text
          position={[-0.14, 0.045, 0]}
          fontSize={0.09}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {name}
        </Text>
        <Text
          position={[0.3, 0.045, 0]}
          fontSize={0.07}
          color={badgeColor}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {badge}
        </Text>
      </Billboard>

      {offside && (
        <Billboard position={[0.42, 1.72, 0]}>
          <mesh>
            <planeGeometry args={[0.32, 0.18]} />
            <meshBasicMaterial color="#ff1744" />
          </mesh>
          <Text fontSize={0.09} color="#ffffff" anchorX="center" anchorY="middle">
            OS
          </Text>
        </Billboard>
      )}
    </group>
  );
}
