import {
  useCallback,
  useMemo,
} from "react";
import {
  Canvas,
  type ThreeEvent,
} from "@react-three/fiber";
import * as THREE from "three";
import type {
  Command,
  FrameSnapshot,
  TeamConfig,
  Vec2,
} from "../engine/types";
import {
  GOAL_TOP_Y,
  GOAL_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  PENALTY_AREA_HEIGHT,
  PENALTY_AREA_WIDTH,
  PITCH_HEIGHT,
  PITCH_WIDTH,
  TILE_H,
  TILE_W,
} from "../engine/constants";
import {
  getReachableTiles,
  posToTile,
  tileToPos,
} from "../engine/grid";
import {
  PlayerModel3D,
  type PlayerAnimationState,
  type PlayerRole,
} from "./three/PlayerModel3D";
import { Ball3D } from "./three/Ball3D";

const SCALE = 1 / 40;

const PITCH_WORLD_WIDTH =
  PITCH_WIDTH * SCALE;

const PITCH_WORLD_HEIGHT =
  PITCH_HEIGHT * SCALE;

type PlanningTeam = "player" | "ai";

type TileState =
  | "reachable"
  | "reachable-enemy"
  | "reachable-friendly"
  | "current";

interface MatchPitch3DProps {
  frame: FrameSnapshot | null;
  playerTeam: TeamConfig;
  aiTeamColor?: string;
  aiTeamSecondaryColor?: string;
  pendingCommands: Map<string, Command>;
  selectedPlayerId: string | null;
  passTargetMode: boolean;
  passOriginPos?: Vec2;
  phase:
    | "planning"
    | "simulating"
    | "finished";
  isVertical?: boolean;
  activePlanningTeam?: PlanningTeam;
  onPlayerClick: (
    playerId: string,
    position: Vec2,
  ) => void;
  onTileClick: (
    position: Vec2,
    isEnemyTile: boolean,
  ) => void;
}

const TILE_COLORS: Record<
  TileState,
  string
> = {
  current: "#5fe0ff",
  reachable: "#7cfc9a",
  "reachable-friendly": "#ffd54f",
  "reachable-enemy": "#ff5252",
};

function pitchToWorld(
  position: Vec2,
  isVertical: boolean,
): {
  x: number;
  z: number;
} {
  const transformed = isVertical
    ? {
        x: position.y,
        y: PITCH_WIDTH - position.x,
      }
    : {
        x: position.x,
        y: position.y,
      };

  const baseWidth = isVertical
    ? PITCH_HEIGHT
    : PITCH_WIDTH;

  const baseHeight = isVertical
    ? PITCH_WIDTH
    : PITCH_HEIGHT;

  return {
    x:
      (transformed.x - baseWidth / 2) *
      SCALE,
    z:
      (transformed.y - baseHeight / 2) *
      SCALE,
  };
}

function worldToPitch(
  worldX: number,
  worldZ: number,
  isVertical: boolean,
): Vec2 {
  const baseWidth = isVertical
    ? PITCH_HEIGHT
    : PITCH_WIDTH;

  const baseHeight = isVertical
    ? PITCH_WIDTH
    : PITCH_HEIGHT;

  const transformedX =
    worldX / SCALE + baseWidth / 2;

  const transformedY =
    worldZ / SCALE + baseHeight / 2;

  const pitchPosition = isVertical
    ? {
        x: PITCH_WIDTH - transformedY,
        y: transformedX,
      }
    : {
        x: transformedX,
        y: transformedY,
      };

  return {
    x: Math.max(
      0,
      Math.min(
        PITCH_WIDTH - 1,
        pitchPosition.x,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        PITCH_HEIGHT - 1,
        pitchPosition.y,
      ),
    ),
  };
}

function createPitchTexture(): THREE.CanvasTexture {
  const canvas =
    document.createElement("canvas");

  canvas.width = PITCH_WIDTH;
  canvas.height = PITCH_HEIGHT;

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "MatchPitch3D could not create the pitch texture.",
    );
  }

  const gradient =
    context.createLinearGradient(
      0,
      0,
      0,
      canvas.height,
    );

  gradient.addColorStop(
    0,
    "#416e31",
  );

  gradient.addColorStop(
    0.5,
    "#547f36",
  );

  gradient.addColorStop(
    1,
    "#355a29",
  );

  context.fillStyle = gradient;

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  for (
    let column = 0;
    column < GRID_COLS;
    column += 1
  ) {
    context.fillStyle =
      column % 2 === 0
        ? "rgba(255,255,255,0.045)"
        : "rgba(0,0,0,0.035)";

    context.fillRect(
      column * TILE_W,
      0,
      TILE_W,
      canvas.height,
    );
  }

  context.strokeStyle =
    "rgba(255,255,255,0.82)";

  context.lineWidth = 2.2;

  context.strokeRect(
    1,
    1,
    canvas.width - 2,
    canvas.height - 2,
  );

  context.beginPath();

  context.moveTo(
    PITCH_WIDTH / 2,
    0,
  );

  context.lineTo(
    PITCH_WIDTH / 2,
    PITCH_HEIGHT,
  );

  context.stroke();

  context.beginPath();

  context.arc(
    PITCH_WIDTH / 2,
    PITCH_HEIGHT / 2,
    55,
    0,
    Math.PI * 2,
  );

  context.stroke();

  context.beginPath();

  context.arc(
    PITCH_WIDTH / 2,
    PITCH_HEIGHT / 2,
    3.5,
    0,
    Math.PI * 2,
  );

  context.fillStyle =
    "rgba(255,255,255,0.9)";

  context.fill();

  const penaltyAreaY =
    (PITCH_HEIGHT -
      PENALTY_AREA_HEIGHT) /
    2;

  context.strokeRect(
    0,
    penaltyAreaY,
    PENALTY_AREA_WIDTH,
    PENALTY_AREA_HEIGHT,
  );

  context.strokeRect(
    PITCH_WIDTH -
      PENALTY_AREA_WIDTH,
    penaltyAreaY,
    PENALTY_AREA_WIDTH,
    PENALTY_AREA_HEIGHT,
  );

  context.save();

  context.setLineDash([7, 5]);

  context.strokeStyle =
    "rgba(255,255,255,0.35)";

  context.lineWidth = 1.2;

  context.beginPath();

  context.moveTo(
    PITCH_WIDTH / 3,
    0,
  );

  context.lineTo(
    PITCH_WIDTH / 3,
    PITCH_HEIGHT,
  );

  context.stroke();

  context.beginPath();

  context.moveTo(
    (2 * PITCH_WIDTH) / 3,
    0,
  );

  context.lineTo(
    (2 * PITCH_WIDTH) / 3,
    PITCH_HEIGHT,
  );

  context.stroke();

  context.restore();

  const texture =
    new THREE.CanvasTexture(canvas);

  texture.colorSpace =
    THREE.SRGBColorSpace;

  texture.wrapS =
    THREE.ClampToEdgeWrapping;

  texture.wrapT =
    THREE.ClampToEdgeWrapping;

  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function GoalFrame({
  atRightEnd,
}: {
  atRightEnd: boolean;
}) {
  const goalTop =
    pitchToWorld(
      {
        x: 0,
        y: GOAL_TOP_Y,
      },
      false,
    ).z;

  const goalBottom =
    pitchToWorld(
      {
        x: 0,
        y:
          GOAL_TOP_Y +
          GOAL_WIDTH,
      },
      false,
    ).z;

  const postHeight = 0.9;

  const goalX = atRightEnd
    ? PITCH_WORLD_WIDTH / 2 + 0.05
    : -PITCH_WORLD_WIDTH / 2 - 0.05;

  return (
    <group>
      {[goalTop, goalBottom].map(
        (goalZ) => (
          <mesh
            key={goalZ}
            position={[
              goalX,
              postHeight / 2,
              goalZ,
            ]}
            castShadow
          >
            <cylinderGeometry
              args={[
                0.035,
                0.035,
                postHeight,
                10,
              ]}
            />

            <meshStandardMaterial
              color="#f5f5f5"
              roughness={0.4}
              metalness={0}
            />
          </mesh>
        ),
      )}

      <mesh
        position={[
          goalX,
          postHeight,
          (goalTop + goalBottom) / 2,
        ]}
        rotation={[
          Math.PI / 2,
          0,
          0,
        ]}
        castShadow
      >
        <cylinderGeometry
          args={[
            0.035,
            0.035,
            Math.abs(
              goalBottom - goalTop,
            ),
            10,
          ]}
        />

        <meshStandardMaterial
          color="#f5f5f5"
          roughness={0.4}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

function normalizePlayerRole(
  role: string,
): PlayerRole {
  switch (role) {
    case "goalkeeper":
      return "goalkeeper";

    case "defender":
      return "defender";

    case "midfielder":
      return "midfielder";

    case "forward":
      return "forward";

    case "striker":
      return "striker";

    default:
      return "midfielder";
  }
}

function normalizePlayerState(
  state: string | undefined,
): PlayerAnimationState {
  switch (state) {
    case "MOVING":
    case "DRIBBLING":
    case "PASSING":
    case "SHOOTING":
    case "CONTESTING":
    case "RECOVERING":
      return state;

    case "IDLE":
    default:
      return "IDLE";
  }
}

function getFacingAngle(
  velocity: Vec2 | undefined,
  teamId: string,
): number {
  if (
    velocity &&
    (Math.abs(velocity.x) > 0.01 ||
      Math.abs(velocity.y) > 0.01)
  ) {
    return Math.atan2(
      velocity.x,
      velocity.y,
    );
  }

  return teamId === "player"
    ? Math.PI / 2
    : -Math.PI / 2;
}

export default function MatchPitch3D({
  frame,
  playerTeam,
  aiTeamColor = "#e53935",
  selectedPlayerId,
  passTargetMode,
  phase,
  isVertical = false,
  activePlanningTeam,
  onPlayerClick,
  onTileClick,
}: MatchPitch3DProps) {
  const pitchTexture = useMemo(
    () => createPitchTexture(),
    [],
  );

  const tileMap = useMemo(() => {
    const map =
      new Map<string, TileState>();

    if (
      !frame ||
      !selectedPlayerId ||
      passTargetMode
    ) {
      return map;
    }

    const selectedPlayer =
      frame.players.find(
        (player) =>
          player.id ===
          selectedPlayerId,
      );

    if (!selectedPlayer) {
      return map;
    }

    const selectedTile =
      posToTile(
        selectedPlayer.position,
      );

    const isGoalkeeper =
      selectedPlayer.role ===
      "goalkeeper";

    map.set(
      `${selectedTile.col},${selectedTile.row}`,
      "current",
    );

    const occupancy =
      new Map<
        string,
        "friendly" | "enemy"
      >();

    for (const player of frame.players) {
      if (
        player.id ===
        selectedPlayerId
      ) {
        continue;
      }

      const tile =
        posToTile(player.position);

      occupancy.set(
        `${tile.col},${tile.row}`,
        player.teamId ===
          selectedPlayer.teamId
          ? "friendly"
          : "enemy",
      );
    }

    const reachableTiles =
      getReachableTiles(
        selectedTile.col,
        selectedTile.row,
        selectedPlayer.tileRange,
        isGoalkeeper,
        selectedPlayer.teamId,
      );

    for (const tile of reachableTiles) {
      const key =
        `${tile.col},${tile.row}`;

      const occupant =
        occupancy.get(key);

      if (occupant === "friendly") {
        map.set(
          key,
          "reachable-friendly",
        );
      } else if (
        occupant === "enemy"
      ) {
        map.set(
          key,
          "reachable-enemy",
        );
      } else {
        map.set(
          key,
          "reachable",
        );
      }
    }

    return map;
  }, [
    frame,
    selectedPlayerId,
    passTargetMode,
  ]);

  const handleGroundClick =
    useCallback(
      (
        event: ThreeEvent<MouseEvent>,
      ) => {
        if (
          phase !== "planning" ||
          !frame
        ) {
          return;
        }

        event.stopPropagation();

        const pitchPosition =
          worldToPitch(
            event.point.x,
            event.point.z,
            isVertical,
          );

        const selectableTeam =
          activePlanningTeam ??
          "player";

        for (const player of frame.players) {
          const isGoalkeeper =
            player.role ===
            "goalkeeper";

          const hitRadius =
            14 +
            (isGoalkeeper ? 4 : 2) +
            8;

          const distance =
            Math.hypot(
              player.position.x -
                pitchPosition.x,
              player.position.y -
                pitchPosition.y,
            );

          if (
            distance < hitRadius &&
            player.teamId ===
              selectableTeam
          ) {
            onPlayerClick(
              player.id,
              pitchPosition,
            );

            return;
          }
        }

        if (!selectedPlayerId) {
          return;
        }

        const selectedPlayer =
          frame.players.find(
            (player) =>
              player.id ===
              selectedPlayerId,
          );

        if (
          !selectedPlayer ||
          selectedPlayer.teamId !==
            selectableTeam
        ) {
          return;
        }

        const clickedColumn =
          Math.max(
            0,
            Math.min(
              GRID_COLS - 1,
              Math.floor(
                pitchPosition.x /
                  TILE_W,
              ),
            ),
          );

        const clickedRow =
          Math.max(
            0,
            Math.min(
              GRID_ROWS - 1,
              Math.floor(
                pitchPosition.y /
                  TILE_H,
              ),
            ),
          );

        const selectedTile =
          posToTile(
            selectedPlayer.position,
          );

        if (
          clickedColumn ===
            selectedTile.col &&
          clickedRow ===
            selectedTile.row
        ) {
          return;
        }

        if (!passTargetMode) {
          const isGoalkeeper =
            selectedPlayer.role ===
            "goalkeeper";

          const reachableTiles =
            getReachableTiles(
              selectedTile.col,
              selectedTile.row,
              selectedPlayer.tileRange,
              isGoalkeeper,
              selectedPlayer.teamId,
            );

          const isReachable =
            reachableTiles.some(
              (tile) =>
                tile.col ===
                  clickedColumn &&
                tile.row ===
                  clickedRow,
            );

          if (!isReachable) {
            return;
          }
        }

        const occupant =
          frame.players.find(
            (player) => {
              const tile =
                posToTile(
                  player.position,
                );

              return (
                tile.col ===
                  clickedColumn &&
                tile.row ===
                  clickedRow
              );
            },
          );

        if (
          occupant?.teamId ===
            selectableTeam &&
          occupant.id !==
            selectedPlayerId
        ) {
          return;
        }

        const isEnemy =
          occupant?.teamId !==
            undefined &&
          occupant.teamId !==
            selectableTeam;

        onTileClick(
          tileToPos(
            clickedColumn,
            clickedRow,
          ),
          isEnemy,
        );
      },
      [
        phase,
        frame,
        selectedPlayerId,
        passTargetMode,
        activePlanningTeam,
        isVertical,
        onPlayerClick,
        onTileClick,
      ],
    );

  if (!frame) {
    return null;
  }

  const cameraDistance =
    Math.max(
      PITCH_WORLD_WIDTH,
      PITCH_WORLD_HEIGHT,
    ) * 1.05;

  const ballWorldPosition =
    pitchToWorld(
      frame.ball.position,
      isVertical,
    );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#243d2b",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 1.25]}
        camera={{
          position: [
            1.5,
            cameraDistance * 1.05,
            cameraDistance * 0.62,
          ],
          fov: 32,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference:
            "high-performance",
        }}
      >
        <color
          attach="background"
          args={["#243d2b"]}
        />

        <ambientLight
          intensity={1.05}
        />

        <hemisphereLight
          intensity={0.75}
          color="#ffffff"
          groundColor="#28482c"
        />

        <directionalLight
          position={[
            PITCH_WORLD_WIDTH * 0.3,
            10,
            PITCH_WORLD_HEIGHT * 0.5,
          ]}
          intensity={1.25}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        <mesh
          rotation={[
            -Math.PI / 2,
            0,
            0,
          ]}
          receiveShadow
          onClick={handleGroundClick}
        >
          <planeGeometry
            args={[
              PITCH_WORLD_WIDTH,
              PITCH_WORLD_HEIGHT,
            ]}
          />

          <meshStandardMaterial
            map={pitchTexture}
            roughness={0.95}
            metalness={0}
          />
        </mesh>

        <GoalFrame
          atRightEnd={false}
        />

        <GoalFrame
          atRightEnd
        />

        {Array.from(
          tileMap.entries(),
        ).map(([key, state]) => {
          const [column, row] =
            key
              .split(",")
              .map(Number);

          const center =
            pitchToWorld(
              tileToPos(
                column,
                row,
              ),
              isVertical,
            );

          return (
            <mesh
              key={key}
              position={[
                center.x,
                0.008,
                center.z,
              ]}
              rotation={[
                -Math.PI / 2,
                0,
                0,
              ]}
            >
              <planeGeometry
                args={[
                  TILE_W *
                    SCALE *
                    0.88,
                  TILE_H *
                    SCALE *
                    0.88,
                ]}
              />

              <meshBasicMaterial
                color={
                  TILE_COLORS[state]
                }
                transparent
                opacity={0.4}
                depthWrite={false}
              />
            </mesh>
          );
        })}

        {frame.players.map(
          (player) => {
            const belongsToPlayerTeam =
              player.teamId ===
              "player";

            const worldPosition =
              pitchToWorld(
                player.position,
                isVertical,
              );

            const playerVelocity =
              "velocity" in player
                ? (player.velocity as
                    | Vec2
                    | undefined)
                : undefined;

            return (
              <PlayerModel3D
                key={player.id}
                x={worldPosition.x}
                z={worldPosition.z}
                facing={getFacingAngle(
                  playerVelocity,
                  player.teamId,
                )}
                characterIndex={
                  (player.jerseyNumber %
                    3) as
                    | 0
                    | 1
                    | 2
                }
                teamColor={
                  belongsToPlayerTeam
                    ? playerTeam.jerseyColor
                    : aiTeamColor
                }
                jerseyNumber={
                  player.jerseyNumber
                }
                name={player.name}
                role={normalizePlayerRole(
                  player.role,
                )}
                isSelected={
                  player.id ===
                  selectedPlayerId
                }
                hasBall={
                  frame.ball.ownerId ===
                  player.id
                }
                offside={
                  player.offside
                }
                playerState={normalizePlayerState(
                  player.state,
                )}
              />
            );
          },
        )}

        <Ball3D
          x={ballWorldPosition.x}
          z={ballWorldPosition.z}
          active={
            phase === "simulating"
          }
        />
      </Canvas>
    </div>
  );
}