import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import {
  PlayerModel3D,
  type PlayerRole,
} from "../components/three/PlayerModel3D";
import { Ball3D } from "../components/three/Ball3D";

const TEAM_BLUE = "#2563eb";
const TEAM_RED = "#dc2626";

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
  {
    x: -5.7,
    z: 0,
    facing: Math.PI / 2,
    jerseyNumber: 1,
    name: "HART",
    role: "goalkeeper",
  },
  {
    x: -3.5,
    z: -2.2,
    facing: Math.PI / 2,
    jerseyNumber: 2,
    name: "COLE",
    role: "defender",
  },
  {
    x: -3.5,
    z: 2.2,
    facing: Math.PI / 2,
    jerseyNumber: 4,
    name: "STONE",
    role: "defender",
  },
  {
    x: -1.4,
    z: -1.8,
    facing: Math.PI / 2,
    jerseyNumber: 6,
    name: "MASON",
    role: "midfielder",
    isSelected: true,
  },
  {
    x: -1.4,
    z: 1.8,
    facing: Math.PI / 2,
    jerseyNumber: 8,
    name: "LEWIS",
    role: "midfielder",
  },
  {
    x: -0.2,
    z: 0,
    facing: Math.PI / 2,
    jerseyNumber: 9,
    name: "KANE",
    role: "striker",
  },
];

const RED_TEAM: PreviewPlayer[] = [
  {
    x: 5.7,
    z: 0,
    facing: -Math.PI / 2,
    jerseyNumber: 1,
    name: "REYES",
    role: "goalkeeper",
  },
  {
    x: 3.5,
    z: -2.2,
    facing: -Math.PI / 2,
    jerseyNumber: 3,
    name: "SILVA",
    role: "defender",
  },
  {
    x: 3.5,
    z: 2.2,
    facing: -Math.PI / 2,
    jerseyNumber: 5,
    name: "TORRES",
    role: "defender",
  },
  {
    x: 1.5,
    z: -1.8,
    facing: -Math.PI / 2,
    jerseyNumber: 7,
    name: "CRUZ",
    role: "midfielder",
  },
  {
    x: 1.5,
    z: 1.8,
    facing: -Math.PI / 2,
    jerseyNumber: 10,
    name: "DIAZ",
    role: "forward",
    offside: true,
  },
  {
    x: 0.3,
    z: 0,
    facing: -Math.PI / 2,
    jerseyNumber: 11,
    name: "LOPEZ",
    role: "striker",
  },
];

function FieldLine({
  position,
  scale,
}: {
  position: [number, number, number];
  scale: [number, number, number];
}) {
  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={scale}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#f8fafc" />
    </mesh>
  );
}

function Goal({
  x,
  facing,
}: {
  x: number;
  facing: 1 | -1;
}) {
  return (
    <group position={[x, 0, 0]} rotation={[0, facing === 1 ? 0 : Math.PI, 0]}>
      <mesh position={[0, 0.75, -1.35]}>
        <boxGeometry args={[0.08, 1.5, 0.08]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      <mesh position={[0, 0.75, 1.35]}>
        <boxGeometry args={[0.08, 1.5, 0.08]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.08, 0.08, 2.78]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      <mesh
        position={[0.55 * facing, 0.75, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <boxGeometry args={[1.1, 0.02, 2.7]} />
        <meshBasicMaterial
          color="#dbeafe"
          transparent
          opacity={0.2}
          wireframe
        />
      </mesh>
    </group>
  );
}

function PitchScene() {
  return (
    <>
      <color attach="background" args={["#07111f"]} />

      <ambientLight intensity={1.45} />

      <hemisphereLight
        intensity={1.1}
        color="#ffffff"
        groundColor="#123522"
      />

      <directionalLight
        position={[-6, 12, 5]}
        intensity={2.3}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[15.6, 0.16, 10.4]} />
        <meshStandardMaterial color="#193d27" roughness={1} />
      </mesh>

      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[14, 0.08, 9]} />
        <meshStandardMaterial color="#3f7f3e" roughness={1} />
      </mesh>

      {Array.from({ length: 14 }).map((_, index) => (
        <mesh
          key={`stripe-${index}`}
          position={[-6.5 + index, 0.045, 0]}
          receiveShadow
        >
          <boxGeometry args={[1, 0.012, 9]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? "#4b8b45" : "#39783a"}
            roughness={1}
          />
        </mesh>
      ))}

      <FieldLine position={[0, 0.066, -4.46]} scale={[14, 0.06, 1]} />
      <FieldLine position={[0, 0.066, 4.46]} scale={[14, 0.06, 1]} />
      <FieldLine position={[-6.96, 0.066, 0]} scale={[0.06, 9, 1]} />
      <FieldLine position={[6.96, 0.066, 0]} scale={[0.06, 9, 1]} />
      <FieldLine position={[0, 0.067, 0]} scale={[0.055, 9, 1]} />

      <mesh
        position={[0, 0.068, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.08, 1.14, 64]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>

      <mesh
        position={[0, 0.069, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.07, 24]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>

      <FieldLine position={[-5.55, 0.067, -2.55]} scale={[2.8, 0.055, 1]} />
      <FieldLine position={[-5.55, 0.067, 2.55]} scale={[2.8, 0.055, 1]} />
      <FieldLine position={[-4.18, 0.067, 0]} scale={[0.055, 5.15, 1]} />

      <FieldLine position={[5.55, 0.067, -2.55]} scale={[2.8, 0.055, 1]} />
      <FieldLine position={[5.55, 0.067, 2.55]} scale={[2.8, 0.055, 1]} />
      <FieldLine position={[4.18, 0.067, 0]} scale={[0.055, 5.15, 1]} />

      <Goal x={-7.02} facing={-1} />
      <Goal x={7.02} facing={1} />

      <Suspense fallback={null}>
        {BLUE_TEAM.map((player, index) => (
          <PlayerModel3D
            key={`blue-${player.jerseyNumber}`}
            x={player.x}
            z={player.z}
            facing={player.facing}
            characterIndex={(index % 3) as 0 | 1 | 2}
            teamColor={TEAM_BLUE}
            jerseyNumber={player.jerseyNumber}
            name={player.name}
            role={player.role}
            isSelected={player.isSelected}
            offside={player.offside}
          />
        ))}

        {RED_TEAM.map((player, index) => (
          <PlayerModel3D
            key={`red-${player.jerseyNumber}`}
            x={player.x}
            z={player.z}
            facing={player.facing}
            characterIndex={(index % 3) as 0 | 1 | 2}
            teamColor={TEAM_RED}
            jerseyNumber={player.jerseyNumber}
            name={player.name}
            role={player.role}
            isSelected={player.isSelected}
            offside={player.offside}
          />
        ))}

        <Ball3D x={0} z={0} active />
      </Suspense>

      <ContactShadows
        position={[0, 0.08, 0]}
        opacity={0.42}
        scale={18}
        blur={2.2}
        far={10}
        resolution={256}
        frames={1}
      />

      <OrbitControls
        makeDefault
        target={[0, 0.7, 0]}
        minDistance={7}
        maxDistance={22}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
        enablePan={false}
      />
    </>
  );
}

export default function Pitch3DPreview() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950">
      <Canvas
        shadows
        dpr={[1, 1.25]}
        camera={{
          position: [10.5, 11.5, 12.5],
          fov: 42,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <PitchScene />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="rounded-xl border border-white/15 bg-black/55 px-3 py-2 text-white shadow-lg backdrop-blur">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
            Football Tactics Arena
          </div>

          <div className="mt-1 text-sm font-bold">
            3D Player Model Preview
          </div>
        </div>

        <button
          type="button"
          className="pointer-events-auto rounded-xl border border-white/20 bg-black/60 px-4 py-2 text-sm font-black text-white shadow-lg backdrop-blur active:scale-95"
          onClick={() => {
            window.location.hash = "/";
          }}
        >
          Back
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <div className="rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-semibold text-white/80 shadow-lg backdrop-blur">
          Drag to rotate · Pinch to zoom
        </div>
      </div>
    </div>
  );
}4