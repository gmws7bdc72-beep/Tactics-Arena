import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Canvas,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";
import type {
  Command,
  FrameSnapshot,
  TeamConfig,
  Vec2,
} from "../engine/types";
import { CommandType } from "../engine/types";
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
import { PlayerModel3D } from "./three/PlayerModel3D";
import { Ball3D } from "./three/Ball3D";

const SCALE = 1 / 40;

const PITCH_WORLD_WIDTH =
  PITCH_WIDTH * SCALE;

const PITCH_WORLD_HEIGHT =
  PITCH_HEIGHT * SCALE;

/*
 * The mobile pitch is mostly vertical with a slight clockwise lean.
 *
 * The former -82° orientation placed the opponent's goal nearest the
 * viewer. Rotating it by 180° keeps the same lean while putting the
 * player's own goal nearest the bottom of the screen.
 */
const MOBILE_SCENE_ROTATION_DEG = 98;

const MOBILE_SCENE_ROTATION =
  THREE.MathUtils.degToRad(
    MOBILE_SCENE_ROTATION_DEG,
  );

/*
 * Mobile uses perspective to imitate the supplied reference:
 *
 * - near end larger
 * - far end narrower
 * - strong vertical depth
 * - less width stretching
 * - player's goal closest to the viewer
 */
const MOBILE_CAMERA_FOV = 31;

/*
 * Additional horizontal padding deliberately makes the pitch narrower
 * on phones instead of allowing it to stretch across the entire width.
 */
const MOBILE_CAMERA_PADDING_X = 1.2;
const MOBILE_CAMERA_PADDING_Y = 1.045;

const MOBILE_CAMERA_TARGET_HEIGHT = 0.5;

/*
 * Positive local X points toward the opponent's goal.
 * A small positive target offset looks farther upfield.
 */
const MOBILE_CAMERA_TARGET_FORWARD =
  PITCH_WORLD_WIDTH * 0.045;

/*
 * Desktop retains an orthographic 2.5D presentation.
 */
const DESKTOP_CAMERA_ELEVATION_DEG = 42;
const DESKTOP_CAMERA_AZIMUTH_DEG = 12;
const DESKTOP_CAMERA_DISTANCE = 24;
const DESKTOP_CAMERA_TARGET_HEIGHT = 0.32;
const DESKTOP_CAMERA_PADDING_X = 1.1;
const DESKTOP_CAMERA_PADDING_Y = 1.12;

const PLAYER_SCENE_HEIGHT = 2.35;

interface Props {
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
  activePlanningTeam?:
    | "player"
    | "ai";
  onPlayerClick: (
    playerId: string,
    position: Vec2,
  ) => void;
  onTileClick: (
    position: Vec2,
    isEnemyTile: boolean,
  ) => void;
}

type TileState =
  | "reachable"
  | "reachable-enemy"
  | "reachable-friendly"
  | "current"
  | "none";

interface ArrowDefinition {
  key: string;
  from: [number, number];
  to: [number, number];
  color: string;
  arced: boolean;
}

const TILE_COLORS: Record<
  Exclude<TileState, "none">,
  string
> = {
  current: "#5fe0ff",
  reachable: "#7cfc9a",
  "reachable-friendly": "#b4b4b4",
  "reachable-enemy": "#ff6000",
};

const GOALKEEPER_CHARACTER_INDEX:
  | 0
  | 1
  | 2 = 2;

const OUTFIELD_CHARACTER_INDICES: Array<
  0 | 1 | 2
> = [0, 1];

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(
    minimum,
    Math.min(maximum, value),
  );
}

function pitchToWorld(
  position: Vec2,
): {
  x: number;
  z: number;
} {
  return {
    x:
      (position.x -
        PITCH_WIDTH / 2) *
      SCALE,
    z:
      (position.y -
        PITCH_HEIGHT / 2) *
      SCALE,
  };
}

function worldToPitch(
  worldX: number,
  worldZ: number,
): Vec2 {
  return {
    x: clamp(
      worldX / SCALE +
        PITCH_WIDTH / 2,
      0,
      PITCH_WIDTH - 1,
    ),
    y: clamp(
      worldZ / SCALE +
        PITCH_HEIGHT / 2,
      0,
      PITCH_HEIGHT - 1,
    ),
  };
}

function inverseRotateXZ(
  worldX: number,
  worldZ: number,
  angle: number,
): {
  x: number;
  z: number;
} {
  const cosine =
    Math.cos(angle);

  const sine =
    Math.sin(angle);

  return {
    x:
      worldX * cosine -
      worldZ * sine,
    z:
      worldX * sine +
      worldZ * cosine,
  };
}

function characterIndexFor(player: {
  role: string;
  jerseyNumber: number;
}): 0 | 1 | 2 {
  if (
    player.role ===
    "goalkeeper"
  ) {
    return GOALKEEPER_CHARACTER_INDEX;
  }

  const index =
    Math.abs(
      player.jerseyNumber,
    ) %
    OUTFIELD_CHARACTER_INDICES.length;

  return OUTFIELD_CHARACTER_INDICES[
    index
  ];
}

function createSceneFitCorners(
  sceneRotation: number,
): THREE.Vector3[] {
  const halfPitchWidth =
    PITCH_WORLD_WIDTH / 2;

  const halfPitchHeight =
    PITCH_WORLD_HEIGHT / 2;

  const rotationQuaternion =
    new THREE.Quaternion()
      .setFromAxisAngle(
        new THREE.Vector3(
          0,
          1,
          0,
        ),
        sceneRotation,
      );

  const corners = [
    new THREE.Vector3(
      -halfPitchWidth,
      0,
      -halfPitchHeight,
    ),
    new THREE.Vector3(
      halfPitchWidth,
      0,
      -halfPitchHeight,
    ),
    new THREE.Vector3(
      halfPitchWidth,
      0,
      halfPitchHeight,
    ),
    new THREE.Vector3(
      -halfPitchWidth,
      0,
      halfPitchHeight,
    ),
    new THREE.Vector3(
      -halfPitchWidth,
      PLAYER_SCENE_HEIGHT,
      -halfPitchHeight,
    ),
    new THREE.Vector3(
      halfPitchWidth,
      PLAYER_SCENE_HEIGHT,
      -halfPitchHeight,
    ),
    new THREE.Vector3(
      halfPitchWidth,
      PLAYER_SCENE_HEIGHT,
      halfPitchHeight,
    ),
    new THREE.Vector3(
      -halfPitchWidth,
      PLAYER_SCENE_HEIGHT,
      halfPitchHeight,
    ),
  ];

  return corners.map(
    (corner) =>
      corner
        .clone()
        .applyQuaternion(
          rotationQuaternion,
        ),
  );
}

function MobilePerspectiveCamera({
  sceneRotation,
}: {
  sceneRotation: number;
}) {
  const cameraRef =
    useRef<THREE.PerspectiveCamera>(
      null,
    );

  const {
    size,
  } = useThree();

  useEffect(() => {
    const camera =
      cameraRef.current;

    if (
      !camera ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      return;
    }

    camera.fov =
      MOBILE_CAMERA_FOV;

    camera.aspect =
      size.width /
      size.height;

    camera.near =
      0.1;

    camera.far =
      220;

    camera.up.set(
      0,
      1,
      0,
    );

    const rotationQuaternion =
      new THREE.Quaternion()
        .setFromAxisAngle(
          new THREE.Vector3(
            0,
            1,
            0,
          ),
          sceneRotation,
        );

    /*
     * Local negative X is behind the player's own goal.
     *
     * The camera sits behind that near goal and slightly to one side,
     * producing the same kind of depth as the supplied reference.
     */
    const localCameraDirection =
      new THREE.Vector3(
        -1,
        0.88,
        0.17,
      ).normalize();

    const cameraDirection =
      localCameraDirection
        .clone()
        .applyQuaternion(
          rotationQuaternion,
        )
        .normalize();

    const localTarget =
      new THREE.Vector3(
        MOBILE_CAMERA_TARGET_FORWARD,
        MOBILE_CAMERA_TARGET_HEIGHT,
        0,
      );

    const target =
      localTarget
        .clone()
        .applyQuaternion(
          rotationQuaternion,
        );

    const fitCorners =
      createSceneFitCorners(
        sceneRotation,
      );

    const horizontalLimit =
      1 /
      MOBILE_CAMERA_PADDING_X;

    const verticalLimit =
      1 /
      MOBILE_CAMERA_PADDING_Y;

    const placeCamera = (
      distance: number,
    ) => {
      camera.position
        .copy(target)
        .addScaledVector(
          cameraDirection,
          distance,
        );

      camera.lookAt(
        target,
      );

      camera.updateProjectionMatrix();

      camera.updateMatrixWorld(
        true,
      );
    };

    const fitsAtDistance = (
      distance: number,
    ): boolean => {
      placeCamera(
        distance,
      );

      let maximumX = 0;
      let maximumY = 0;

      for (
        const corner of
        fitCorners
      ) {
        const projected =
          corner
            .clone()
            .project(
              camera,
            );

        if (
          !Number.isFinite(
            projected.x,
          ) ||
          !Number.isFinite(
            projected.y,
          ) ||
          !Number.isFinite(
            projected.z,
          ) ||
          projected.z < -1 ||
          projected.z > 1
        ) {
          return false;
        }

        maximumX =
          Math.max(
            maximumX,
            Math.abs(
              projected.x,
            ),
          );

        maximumY =
          Math.max(
            maximumY,
            Math.abs(
              projected.y,
            ),
          );
      }

      return (
        maximumX <=
          horizontalLimit &&
        maximumY <=
          verticalLimit
      );
    };

    let minimumDistance =
      8;

    let maximumDistance =
      48;

    while (
      !fitsAtDistance(
        maximumDistance,
      ) &&
      maximumDistance < 180
    ) {
      maximumDistance *=
        1.25;
    }

    for (
      let iteration = 0;
      iteration < 30;
      iteration += 1
    ) {
      const middleDistance =
        (
          minimumDistance +
          maximumDistance
        ) /
        2;

      if (
        fitsAtDistance(
          middleDistance,
        )
      ) {
        maximumDistance =
          middleDistance;
      } else {
        minimumDistance =
          middleDistance;
      }
    }

    placeCamera(
      maximumDistance *
        1.012,
    );
  }, [
    size.width,
    size.height,
    sceneRotation,
  ]);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={
        MOBILE_CAMERA_FOV
      }
      near={0.1}
      far={220}
      position={[
        0,
        18,
        20,
      ]}
    />
  );
}

function DesktopOrthographicCamera() {
  const cameraRef =
    useRef<THREE.OrthographicCamera>(
      null,
    );

  const {
    size,
  } = useThree();

  useEffect(() => {
    const camera =
      cameraRef.current;

    if (
      !camera ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      return;
    }

    const elevation =
      THREE.MathUtils.degToRad(
        DESKTOP_CAMERA_ELEVATION_DEG,
      );

    const azimuth =
      THREE.MathUtils.degToRad(
        DESKTOP_CAMERA_AZIMUTH_DEG,
      );

    const horizontalDistance =
      Math.cos(
        elevation,
      ) *
      DESKTOP_CAMERA_DISTANCE;

    const cameraHeight =
      Math.sin(
        elevation,
      ) *
      DESKTOP_CAMERA_DISTANCE;

    camera.position.set(
      Math.sin(
        azimuth,
      ) *
        horizontalDistance,
      cameraHeight,
      Math.cos(
        azimuth,
      ) *
        horizontalDistance,
    );

    const target =
      new THREE.Vector3(
        0,
        DESKTOP_CAMERA_TARGET_HEIGHT,
        0,
      );

    camera.lookAt(
      target,
    );

    camera.near =
      0.1;

    camera.far =
      120;

    camera.updateMatrixWorld(
      true,
    );

    const forward =
      target
        .clone()
        .sub(
          camera.position,
        )
        .normalize();

    const cameraRight =
      new THREE.Vector3()
        .crossVectors(
          forward,
          new THREE.Vector3(
            0,
            1,
            0,
          ),
        )
        .normalize();

    const cameraUp =
      new THREE.Vector3()
        .crossVectors(
          cameraRight,
          forward,
        )
        .normalize();

    const corners =
      createSceneFitCorners(
        0,
      );

    let minimumViewX =
      Infinity;

    let maximumViewX =
      -Infinity;

    let minimumViewY =
      Infinity;

    let maximumViewY =
      -Infinity;

    for (
      const corner of
      corners
    ) {
      const relative =
        corner
          .clone()
          .sub(
            target,
          );

      const viewX =
        relative.dot(
          cameraRight,
        );

      const viewY =
        relative.dot(
          cameraUp,
        );

      minimumViewX =
        Math.min(
          minimumViewX,
          viewX,
        );

      maximumViewX =
        Math.max(
          maximumViewX,
          viewX,
        );

      minimumViewY =
        Math.min(
          minimumViewY,
          viewY,
        );

      maximumViewY =
        Math.max(
          maximumViewY,
          viewY,
        );
    }

    const projectedWidth =
      Math.max(
        0.1,
        maximumViewX -
          minimumViewX,
      );

    const projectedHeight =
      Math.max(
        0.1,
        maximumViewY -
          minimumViewY,
      );

    const zoomForWidth =
      size.width /
      (
        projectedWidth *
        DESKTOP_CAMERA_PADDING_X
      );

    const zoomForHeight =
      size.height /
      (
        projectedHeight *
        DESKTOP_CAMERA_PADDING_Y
      );

    camera.zoom =
      clamp(
        Math.min(
          zoomForWidth,
          zoomForHeight,
        ),
        18,
        115,
      );

    camera.updateProjectionMatrix();
  }, [
    size.width,
    size.height,
  ]);

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      left={
        -size.width /
        2
      }
      right={
        size.width /
        2
      }
      top={
        size.height /
        2
      }
      bottom={
        -size.height /
        2
      }
      position={[
        0,
        16,
        15,
      ]}
      zoom={40}
      near={0.1}
      far={120}
    />
  );
}

function createPitchTexture(): THREE.CanvasTexture {
  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    PITCH_WIDTH;

  canvas.height =
    PITCH_HEIGHT;

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "MatchPitch3D could not create the pitch texture.",
    );
  }

  const grassGradient =
    context.createLinearGradient(
      0,
      0,
      0,
      canvas.height,
    );

  grassGradient.addColorStop(
    0,
    "#416e31",
  );

  grassGradient.addColorStop(
    0.5,
    "#547f36",
  );

  grassGradient.addColorStop(
    1,
    "#355a29",
  );

  context.fillStyle =
    grassGradient;

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
        ? "rgba(255,255,255,0.05)"
        : "rgba(0,0,0,0.04)";

    context.fillRect(
      column * TILE_W,
      0,
      TILE_W,
      canvas.height,
    );
  }

  context.save();

  context.globalAlpha =
    0.11;

  for (
    let index = 0;
    index < 190;
    index += 1
  ) {
    const x =
      (index * 193) %
      PITCH_WIDTH;

    const y =
      (index * 97) %
      PITCH_HEIGHT;

    context.fillStyle =
      index % 3 === 0
        ? "rgba(255,235,175,0.34)"
        : "rgba(25,20,10,0.25)";

    context.fillRect(
      x,
      y,
      1.15,
      1.15,
    );
  }

  context.restore();

  const whiteLine =
    "rgba(255,255,255,0.84)";

  context.strokeStyle =
    whiteLine;

  context.lineWidth =
    2.2;

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
    4,
    0,
    Math.PI * 2,
  );

  context.fillStyle =
    "rgba(255,255,255,0.92)";

  context.fill();

  const penaltyAreaTop =
    (
      PITCH_HEIGHT -
      PENALTY_AREA_HEIGHT
    ) /
    2;

  context.strokeRect(
    0,
    penaltyAreaTop,
    PENALTY_AREA_WIDTH,
    PENALTY_AREA_HEIGHT,
  );

  context.strokeRect(
    PITCH_WIDTH -
      PENALTY_AREA_WIDTH,
    penaltyAreaTop,
    PENALTY_AREA_WIDTH,
    PENALTY_AREA_HEIGHT,
  );

  context.save();

  context.setLineDash(
    [7, 5],
  );

  context.strokeStyle =
    "rgba(255,255,255,0.34)";

  context.lineWidth =
    1.2;

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
    (
      2 *
      PITCH_WIDTH
    ) /
      3,
    0,
  );

  context.lineTo(
    (
      2 *
      PITCH_WIDTH
    ) /
      3,
    PITCH_HEIGHT,
  );

  context.stroke();

  context.restore();

  const texture =
    new THREE.CanvasTexture(
      canvas,
    );

  texture.colorSpace =
    THREE.SRGBColorSpace;

  texture.minFilter =
    THREE.LinearFilter;

  texture.magFilter =
    THREE.LinearFilter;

  texture.generateMipmaps =
    false;

  texture.needsUpdate =
    true;

  return texture;
}

function GoalFrame({
  atRightEnd,
}: {
  atRightEnd: boolean;
}) {
  const goalTop =
    (
      GOAL_TOP_Y -
      PITCH_HEIGHT / 2
    ) *
    SCALE;

  const goalBottom =
    (
      GOAL_TOP_Y +
      GOAL_WIDTH -
      PITCH_HEIGHT / 2
    ) *
    SCALE;

  const postHeight =
    0.9;

  const postRadius =
    0.035;

  const goalX =
    atRightEnd
      ? PITCH_WORLD_WIDTH /
          2 +
        0.05
      : -PITCH_WORLD_WIDTH /
          2 -
        0.05;

  const goalCenterZ =
    (
      goalTop +
      goalBottom
    ) /
    2;

  const crossbarLength =
    Math.abs(
      goalBottom -
        goalTop,
    );

  return (
    <group>
      <mesh
        position={[
          goalX,
          postHeight / 2,
          goalTop,
        ]}
        castShadow
      >
        <cylinderGeometry
          args={[
            postRadius,
            postRadius,
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

      <mesh
        position={[
          goalX,
          postHeight / 2,
          goalBottom,
        ]}
        castShadow
      >
        <cylinderGeometry
          args={[
            postRadius,
            postRadius,
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

      <mesh
        position={[
          goalX,
          postHeight,
          goalCenterZ,
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
            postRadius,
            postRadius,
            crossbarLength,
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

function Arrow3D({
  from,
  to,
  color,
  arced = false,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
  arced?: boolean;
}) {
  const {
    line,
    headPosition,
    headQuaternion,
  } = useMemo(() => {
    const lineHeight =
      0.045;

    const start =
      new THREE.Vector3(
        from[0],
        lineHeight,
        from[1],
      );

    const end =
      new THREE.Vector3(
        to[0],
        lineHeight,
        to[1],
      );

    let points:
      THREE.Vector3[];

    if (arced) {
      const midpoint =
        new THREE.Vector3(
          (
            start.x +
            end.x
          ) /
            2,
          lineHeight +
            0.55,
          (
            start.z +
            end.z
          ) /
            2,
        );

      const curve =
        new THREE.QuadraticBezierCurve3(
          start,
          midpoint,
          end,
        );

      points =
        curve.getPoints(
          22,
        );
    } else {
      points = [
        start,
        end,
      ];
    }

    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints(
          points,
        );

    const material =
      new THREE.LineDashedMaterial({
        color,
        dashSize: 0.15,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.88,
      });

    const lineObject =
      new THREE.Line(
        geometry,
        material,
      );

    lineObject.computeLineDistances();

    const tangent =
      points[
        points.length - 1
      ]
        .clone()
        .sub(
          points[
            points.length - 2
          ],
        )
        .normalize();

    const quaternion =
      new THREE.Quaternion()
        .setFromUnitVectors(
          new THREE.Vector3(
            0,
            1,
            0,
          ),
          tangent,
        );

    return {
      line: lineObject,
      headPosition: end,
      headQuaternion:
        quaternion,
    };
  }, [
    from[0],
    from[1],
    to[0],
    to[1],
    color,
    arced,
  ]);

  useEffect(() => {
    return () => {
      line.geometry.dispose();

      if (
        Array.isArray(
          line.material,
        )
      ) {
        for (
          const material of
          line.material
        ) {
          material.dispose();
        }
      } else {
        line.material.dispose();
      }
    };
  }, [line]);

  return (
    <group>
      <primitive
        object={line}
        dispose={null}
      />

      <mesh
        position={
          headPosition
        }
        quaternion={
          headQuaternion
        }
      >
        <coneGeometry
          args={[
            0.09,
            0.22,
            12,
          ]}
        />

        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.92}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function CommandArrows({
  frame,
  pendingCommands,
}: {
  frame: FrameSnapshot;
  pendingCommands:
    Map<string, Command>;
}) {
  const arrows:
    ArrowDefinition[] = [];

  pendingCommands.forEach(
    (
      command,
      playerId,
    ) => {
      const player =
        frame.players.find(
          (candidate) =>
            candidate.id ===
            playerId,
        );

      if (!player) {
        return;
      }

      const playerWorld =
        pitchToWorld(
          player.position,
        );

      const addArrow = (
        from:
          [number, number],
        targetPosition: Vec2,
        color: string,
        arced: boolean,
        key: string,
      ) => {
        const targetWorld =
          pitchToWorld(
            targetPosition,
          );

        arrows.push({
          key,
          from,
          to: [
            targetWorld.x,
            targetWorld.z,
          ],
          color,
          arced,
        });
      };

      if (
        command.type ===
          CommandType.MOVE &&
        command.targetPosition
      ) {
        addArrow(
          [
            playerWorld.x,
            playerWorld.z,
          ],
          command.targetPosition,
          "#00e676",
          false,
          `${playerId}-move`,
        );

        if (
          command.followUp
            ?.type ===
            CommandType.PASS &&
          command.followUp
            .targetPosition
        ) {
          const moveEnd =
            pitchToWorld(
              command.targetPosition,
            );

          addArrow(
            [
              moveEnd.x,
              moveEnd.z,
            ],
            command.followUp
              .targetPosition,
            "#ff1744",
            command.followUp
              .passStyle ===
              "long",
            `${playerId}-move-pass`,
          );
        }
      } else if (
        command.type ===
          CommandType.PASS &&
        command.targetPosition
      ) {
        addArrow(
          [
            playerWorld.x,
            playerWorld.z,
          ],
          command.targetPosition,
          "#ffeb3b",
          command.passStyle ===
            "long",
          `${playerId}-pass`,
        );

        /*
         * Pass-then-move begins from the original player's starting tile,
         * not from the destination of the pass.
         */
        if (
          command.followUp
            ?.type ===
            CommandType.MOVE &&
          command.followUp
            .targetPosition
        ) {
          addArrow(
            [
              playerWorld.x,
              playerWorld.z,
            ],
            command.followUp
              .targetPosition,
            "#ff9800",
            false,
            `${playerId}-pass-move`,
          );
        }
      } else if (
        command.type ===
        CommandType.SHOOT
      ) {
        addArrow(
          [
            playerWorld.x,
            playerWorld.z,
          ],
          {
            x:
              player.teamId ===
              "player"
                ? PITCH_WIDTH
                : 0,
            y:
              PITCH_HEIGHT /
              2,
          },
          "#ff6b35",
          false,
          `${playerId}-shoot`,
        );
      }
    },
  );

  return (
    <>
      {arrows.map(
        (arrow) => (
          <Arrow3D
            key={arrow.key}
            from={arrow.from}
            to={arrow.to}
            color={arrow.color}
            arced={
              arrow.arced
            }
          />
        ),
      )}
    </>
  );
}

export default function MatchPitch3D({
  frame,
  playerTeam,
  aiTeamColor = "#e53935",
  aiTeamSecondaryColor = "#ffffff",
  pendingCommands,
  selectedPlayerId,
  passTargetMode,
  phase,
  isVertical = false,
  activePlanningTeam,
  onPlayerClick,
  onTileClick,
}: Props) {
  const pitchTexture =
    useMemo(
      () =>
        createPitchTexture(),
      [],
    );

  useEffect(() => {
    return () => {
      pitchTexture.dispose();
    };
  }, [pitchTexture]);

  const sceneRotation =
    isVertical
      ? MOBILE_SCENE_ROTATION
      : 0;

  const tileMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          TileState
        >();

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
          | "friendly"
          | "enemy"
        >();

      for (
        const player of
        frame.players
      ) {
        if (
          player.id ===
          selectedPlayerId
        ) {
          continue;
        }

        const tile =
          posToTile(
            player.position,
          );

        occupancy.set(
          `${tile.col},${tile.row}`,
          player.teamId ===
            selectedPlayer.teamId
            ? "friendly"
            : "enemy",
        );
      }

      const reachable =
        getReachableTiles(
          selectedTile.col,
          selectedTile.row,
          selectedPlayer.tileRange,
          isGoalkeeper,
          selectedPlayer.teamId,
        );

      for (
        const tile of
        reachable
      ) {
        const key =
          `${tile.col},${tile.row}`;

        const occupant =
          occupancy.get(
            key,
          );

        if (
          occupant ===
          "friendly"
        ) {
          map.set(
            key,
            "reachable-friendly",
          );
        } else if (
          occupant ===
          "enemy"
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
        event:
          ThreeEvent<MouseEvent>,
      ) => {
        if (
          phase !==
            "planning" ||
          !frame
        ) {
          return;
        }

        event.stopPropagation();

        const localPoint =
          inverseRotateXZ(
            event.point.x,
            event.point.z,
            sceneRotation,
          );

        const clickedPosition =
          worldToPitch(
            localPoint.x,
            localPoint.z,
          );

        const selectableTeam =
          activePlanningTeam ??
          "player";

        for (
          const player of
          frame.players
        ) {
          const hitRadius =
            14 +
            (
              player.role ===
              "goalkeeper"
                ? 4
                : 2
            ) +
            8;

          const distance =
            Math.hypot(
              player.position.x -
                clickedPosition.x,
              player.position.y -
                clickedPosition.y,
            );

          if (
            distance <
              hitRadius &&
            player.teamId ===
              selectableTeam
          ) {
            onPlayerClick(
              player.id,
              clickedPosition,
            );

            return;
          }
        }

        if (
          !selectedPlayerId
        ) {
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
          clamp(
            Math.floor(
              clickedPosition.x /
                TILE_W,
            ),
            0,
            GRID_COLS - 1,
          );

        const clickedRow =
          clamp(
            Math.floor(
              clickedPosition.y /
                TILE_H,
            ),
            0,
            GRID_ROWS - 1,
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

        if (
          !passTargetMode
        ) {
          const reachable =
            getReachableTiles(
              selectedTile.col,
              selectedTile.row,
              selectedPlayer.tileRange,
              selectedPlayer.role ===
                "goalkeeper",
              selectedPlayer.teamId,
            );

          const isReachable =
            reachable.some(
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
        sceneRotation,
        onPlayerClick,
        onTileClick,
      ],
    );

  if (!frame) {
    return null;
  }

  const ballWorld =
    pitchToWorld(
      frame.ball.position,
    );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 45%, #47764a 0%, #315d3a 45%, #1d3e29 72%, #11271b 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <Canvas
          shadows
          dpr={[
            1,
            1.35,
          ]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference:
              "high-performance",
          }}
        >
          {isVertical ? (
            <MobilePerspectiveCamera
              sceneRotation={
                sceneRotation
              }
            />
          ) : (
            <DesktopOrthographicCamera />
          )}

          <ambientLight
            intensity={0.88}
          />

          <hemisphereLight
            intensity={0.58}
            color="#ffffff"
            groundColor="#26472d"
          />

          <directionalLight
            position={[
              6,
              12,
              7,
            ]}
            intensity={1.18}
            castShadow
            shadow-mapSize-width={
              1024
            }
            shadow-mapSize-height={
              1024
            }
            shadow-camera-left={
              -14
            }
            shadow-camera-right={
              14
            }
            shadow-camera-top={
              14
            }
            shadow-camera-bottom={
              -14
            }
          />

          <group
            rotation={[
              0,
              sceneRotation,
              0,
            ]}
          >
            <mesh
              rotation={[
                -Math.PI /
                  2,
                0,
                0,
              ]}
              receiveShadow
              onClick={
                handleGroundClick
              }
            >
              <planeGeometry
                args={[
                  PITCH_WORLD_WIDTH,
                  PITCH_WORLD_HEIGHT,
                ]}
              />

              <meshStandardMaterial
                map={pitchTexture}
                color="#ffffff"
                roughness={0.95}
                metalness={0}
                side={
                  THREE.DoubleSide
                }
              />
            </mesh>

            <GoalFrame
              atRightEnd={
                false
              }
            />

            <GoalFrame
              atRightEnd
            />

            {Array.from(
              tileMap.entries(),
            ).map(
              ([
                key,
                state,
              ]) => {
                if (
                  state ===
                  "none"
                ) {
                  return null;
                }

                const [
                  column,
                  row,
                ] = key
                  .split(",")
                  .map(Number);

                const center =
                  pitchToWorld(
                    tileToPos(
                      column,
                      row,
                    ),
                  );

                return (
                  <mesh
                    key={key}
                    position={[
                      center.x,
                      0.022,
                      center.z,
                    ]}
                    rotation={[
                      -Math.PI /
                        2,
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
                        TILE_COLORS[
                          state
                        ]
                      }
                      transparent
                      opacity={0.4}
                      depthWrite={
                        false
                      }
                      toneMapped={
                        false
                      }
                    />
                  </mesh>
                );
              },
            )}

            {phase ===
              "planning" && (
              <CommandArrows
                frame={frame}
                pendingCommands={
                  pendingCommands
                }
              />
            )}

            <Suspense
              fallback={null}
            >
              {frame.players.map(
                (player) => {
                  const isPlayerTeam =
                    player.teamId ===
                    "player";

                  const worldPosition =
                    pitchToWorld(
                      player.position,
                    );

                  const pendingCommand =
                    pendingCommands.get(
                      player.id,
                    );

                  let facing:
                    number | undefined;

                  let facingTarget:
                    Vec2 | undefined;

                  /*
                   * During planning, face toward the primary command target.
                   * During a shot, face the opposing goal.
                   */
                  if (
                    pendingCommand
                      ?.targetPosition
                  ) {
                    facingTarget =
                      pendingCommand.targetPosition;
                  } else if (
                    player.state ===
                    "SHOOTING"
                  ) {
                    facingTarget = {
                      x:
                        player.teamId ===
                        "player"
                          ? PITCH_WIDTH
                          : 0,
                      y:
                        PITCH_HEIGHT /
                        2,
                    };
                  }

                  if (
                    facingTarget
                  ) {
                    const targetWorld =
                      pitchToWorld(
                        facingTarget,
                      );

                    facing =
                      Math.atan2(
                        targetWorld.x -
                          worldPosition.x,
                        targetWorld.z -
                          worldPosition.z,
                      );
                  }

                  return (
                    <PlayerModel3D
                      key={
                        player.id
                      }
                      x={
                        worldPosition.x
                      }
                      z={
                        worldPosition.z
                      }
                      facing={
                        facing
                      }
                      characterIndex={characterIndexFor(
                        player,
                      )}
                      teamColor={
                        isPlayerTeam
                          ? playerTeam.jerseyColor
                          : aiTeamColor
                      }
                      secondaryColor={
                        isPlayerTeam
                          ? playerTeam.secondaryColor
                          : aiTeamSecondaryColor
                      }
                      jerseyNumber={
                        player.jerseyNumber
                      }
                      name={
                        player.name
                      }
                      role={
                        player.role
                      }
                      isSelected={
                        player.id ===
                        selectedPlayerId
                      }
                      hasBall={
                        frame.ball
                          .ownerId ===
                        player.id
                      }
                      offside={
                        player.offside
                      }
                      playerState={
                        phase ===
                        "simulating"
                          ? player.state
                          : "IDLE"
                      }
                    />
                  );
                },
              )}
            </Suspense>

            <Ball3D
              x={
                ballWorld.x
              }
              z={
                ballWorld.z
              }
              y={
                (
                  frame.ball.height ??
                  0
                ) *
                SCALE
              }
              active={
                phase ===
                "simulating"
              }
            />
          </group>
        </Canvas>
      </div>
    </div>
  );
}