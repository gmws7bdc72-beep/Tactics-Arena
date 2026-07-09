import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Text } from "@react-three/drei";
import { Player3D } from "../components/three/Player3D";
import { PlayerModel3D, type PlayerRole } from "../components/three/PlayerModel3D";
import { Ball3D } from "../components/three/Ball3D";
import { useGameState } from "../hooks/useGameState";
import { AI_TEAMS } from "../game/league";


interface PreviewPlayer {
  x: number;
  z: number;
  facing: number;
  jerseyNumber: number;
  name: string;
  role: PlayerRole;
  isSelected?: boolean;
  offside?: boolean;
}

const BLUE_TEAM: PreviewPlayer[] = [
  { x: -5.4, z: 0, facing: Math.PI / 2, jerseyNumber: 1, name: "Keeper", role: "goalkeeper" },
  { x: -3.6, z: -1.7, facing: Math.PI / 2, jerseyNumber: 4, name: "Stone", role: "defender" },
  { x: -3.2, z: 1.7, facing: Math.PI / 2, jerseyNumber: 5, name: "Wall", role: "defender" },
  { x: -1.3, z: -0.9, facing: Math.PI / 2, jerseyNumber: 8, name: "Tempo", role: "midfielder", isSelected: true },
  { x: -0.9, z: 1.1, facing: Math.PI / 2, jerseyNumber: 10, name: "Ace", role: "forward" },
  { x: 0.8, z: 0, facing: Math.PI / 2, jerseyNumber: 9, name: "Flash", role: "striker" },
];

const RED_TEAM: PreviewPlayer[] = [
  { x: 5.4, z: 0, facing: -Math.PI / 2, jerseyNumber: 1, name: "Guard", role: "goalkeeper" },
  { x: 3.5, z: -1.6, facing: -Math.PI / 2, jerseyNumber: 2, name: "Rook", role: "defender" },
  { x: 3.4, z: 1.6, facing: -Math.PI / 2, jerseyNumber: 6, name: "Lock", role: "defender" },
  { x: 1.4, z: -1.1, facing: -Math.PI / 2, jerseyNumber: 7, name: "Spark", role: "midfielder" },
  { x: 1.5, z: 1.1, facing: -Math.PI / 2, jerseyNumber: 11, name: "Wide", role: "forward", offside: true },
  { x: 0.2, z: -0.05, facing: -Math.PI / 2, jerseyNumber: 9, name: "Target", role: "striker" },
];

function PitchLines() {
  return (
    <group position={[0, 0.012, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12.8, 7.2]} />
        <meshStandardMaterial color="#2f7d32" roughness={0.85} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[0.78, 0.81, 96]} />
        <meshBasicMaterial color="#dbeafe" transparent opacity={0.9} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]}>
        <planeGeometry args={[0.03, 7.2]} />
        <meshBasicMaterial color="#dbeafe" transparent opacity={0.85} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5.45, 0.008, 0]}>
        <planeGeometry args={[1.7, 3.2]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.75} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5.45, 0.008, 0]}>
        <planeGeometry args={[1.7, 3.2]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.75} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.009, 0]}>
        <planeGeometry args={[12.8, 7.2]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function Goal({ side }: { side: "left" | "right" }) {
  const x = side === "left" ? -6.6 : 6.6;
  const rot = side === "left" ? 0 : Math.PI;

  return (
    <group position={[x, 0, 0]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.8, -0.9]}>
        <boxGeometry args={[0.06, 1.6, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0.8, 0.9]}>
        <boxGeometry args={[0.06, 1.6, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[0.06, 0.06, 1.86]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-0.5, 0.8, 0]}>
        <boxGeometry args={[0.04, 1.5, 1.8]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function StadiumShell() {
  return (
    <group>
      <mesh position={[0, -0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16.5, 10.5]} />
        <meshStandardMaterial color="#123524" roughness={1} />
      </mesh>

      <mesh position={[0, 0.05, -4.45]}>
        <boxGeometry args={[14.5, 0.3, 0.2]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, 0.05, 4.45]}>
        <boxGeometry args={[14.5, 0.3, 0.2]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[-7.25, 0.05, 0]}>
        <boxGeometry args={[0.2, 0.3, 8.6]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[7.25, 0.05, 0]}>
        <boxGeometry args={[0.2, 0.3, 8.6]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      <Text
        position={[0, 0.08, -4.58]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.36}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        FOOTBALL TACTICS ARENA
      </Text>
    </group>
  );
}

function PreviewPlayerModel({ player, index, teamColor, useRealModel }: {
  player: PreviewPlayer;
  index: number;
  teamColor: string;
  useRealModel: boolean;
}) {
  if (useRealModel) {
    return (
      <PlayerModel3D
        x={player.x}
        z={player.z}
        facing={player.facing}
        characterIndex={(index % 3) as 0 | 1 | 2}
        teamColor={teamColor}
        jerseyNumber={player.jerseyNumber}
        name={player.name}
        role={player.role}
        isSelected={player.isSelected}
        offside={player.offside}
      />
    );
  }

  return (
    <Player3D
      x={player.x}
      z={player.z}
      facing={player.facing}
      teamColor={teamColor}
      jerseyNumber={player.jerseyNumber}
      name={player.name}
      role={player.role}
      isSelected={player.isSelected}
      offside={player.offside}
    />
  );
}

export default function Pitch3DPreview() {
  const [useRealModel, setUseRealModel] = useState(false);
  const { team } = useGameState();
  const opponent = AI_TEAMS[0];
  const TEAM_BLUE = team.jerseyColor;
  const TEAM_RED = opponent.jerseyColor;

  useEffect(() => {
    let cancelled = false;

    fetch("/models/players.gltf", { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setUseRealModel(res.ok);
      })
      .catch(() => {
        if (!cancelled) setUseRealModel(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-3 px-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight">3D Arena Preview</h1>
            <p className="text-xs text-slate-300">
              {useRealModel
                ? `Using male GLTF models: ${team.name} vs ${opponent.name}`
                : "Using built-in fallback players. Add /public/models/players.gltf to use downloaded models."}
            </p>
          </div>
          <a
            href="#/"
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white"
          >
            Back
          </a>
        </div>

        <div className="h-[72vh] min-h-[520px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl">
          <Canvas shadows camera={{ position: [0, 8.2, 8.5], fov: 43 }}>
            <color attach="background" args={["#08111d"]} />
            <fog attach="fog" args={["#08111d", 12, 23]} />

            <ambientLight intensity={0.85} />
            <directionalLight
              position={[4, 8, 6]}
              intensity={1.35}
              castShadow
            />
            <pointLight position={[-6, 4, -4]} intensity={0.9} color="#60a5fa" />
            <pointLight position={[6, 4, 4]} intensity={0.7} color="#f87171" />

            <StadiumShell />
            <PitchLines />
            <Goal side="left" />
            <Goal side="right" />

            <Suspense fallback={null}>
              {BLUE_TEAM.map((p, i) => (
                <PreviewPlayerModel
                  key={`blue-${p.jerseyNumber}`}
                  player={p}
                  index={i}
                  teamColor={TEAM_BLUE}
                  useRealModel={useRealModel}
                />
              ))}

              {RED_TEAM.map((p, i) => (
                <PreviewPlayerModel
                  key={`red-${p.jerseyNumber}`}
                  player={p}
                  index={i}
                  teamColor={TEAM_RED}
                  useRealModel={useRealModel}
                />
              ))}

              <Ball3D x={0} z={0} active />
            </Suspense>

            <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={14} blur={2.4} far={4} />
            <OrbitControls
              target={[0, 0.6, 0]}
              enablePan={false}
              minDistance={5.5}
              maxDistance={14}
              maxPolarAngle={Math.PI / 2.15}
            />
          </Canvas>
        </div>
      </div>
    </div>
  );
}
