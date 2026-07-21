import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
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

/*
 * Match-engine coordinates are stored in pitch pixels.
 * Three.js uses smaller world units.
 */
const SCALE = 1 / 40;

const PITCH_WORLD_WIDTH =
  PITCH_WIDTH * SCALE;

const PITCH_WORLD_HEIGHT =
  PITCH_HEIGHT * SCALE;

/*
 * MOBILE CAMERA
 *
 * The camera is positioned 41 degrees toward the right side from a
 * straight-behind-the-player-goal position.
 *
 * The pitch itself is not separately rotated. The camera azimuth creates
 * the diagonal presentation. This avoids rotating both the camera and the
 * pitch and accidentally cancelling or reversing the intended angle.
 */
const MOBILE_CAMERA_FOV = 33;

const MOBILE_CAMERA_AZIMUTH_DEG = 41;
const MOBILE_CAMERA_ELEVATION_DEG = 48;

const MOBILE_CAMERA_DISTANCE = 17;
const MOBILE_CAMERA_TARGET_HEIGHT = 0.36;

/*
 * The camera shows only part of the pitch and can travel along its length.
 *
 * 0 = own-goal side
 * 0.5 = midfield
 * 1 = opponent-goal side
 */
const MOBILE_INITIAL_PAN = 0.16;

const MOBILE_CAMERA_PAN_RANGE =
  PITCH_WORLD_WIDTH * 0.34;

const MOBILE_CAMERA_PAN_DAMPING = 10;

const MOBILE_VERTICAL_DRAG_SENSITIVITY = 1.05;
const MOBILE_HORIZONTAL_DRAG_SENSITIVITY = 0.3;
const MOBILE_WHEEL_SENSITIVITY = 0.0009;

const MOBILE_DRAG_THRESHOLD = 7;

/*
 * DESKTOP CAMERA
 *
 * Desktop continues using the previous orthographic presentation.
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
    Math.min(
      maximum,
      value,
    ),
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

function createSceneFitCorners(): THREE.Vector3[] {
  const halfPitchWidth =
    PITCH_WORLD_WIDTH / 2;

  const halfPitchHeight =
    PITCH_WORLD_HEIGHT / 2;

  return [
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
}

/*
 * Uses the perspective camera created directly by Canvas.
 *
 * This component does not create or replace the active camera. It only
 * positions the existing camera, preventing the previous default-camera
 * conflict that could leave the WebGL scene rendering transparent.
 */
function MobileScrollingCamera({
  currentPanRef,
  targetPanRef,
  suppressGroundClickRef,
}: {
  currentPanRef:
    MutableRefObject<number>;
  targetPanRef:
    MutableRefObject<number>;
  suppressGroundClickRef:
    MutableRefObject<boolean>;
}) {
  const {
    camera,
    gl,
    size,
  } = useThree();

  const activePointerIdRef =
    useRef<number | null>(
      null,
    );

  const pointerStartRef =
    useRef({
      x: 0,
      y: 0,
      pan: MOBILE_INITIAL_PAN,
    });

  const didDragRef =
    useRef(false);

  const cameraOffset =
    useMemo(() => {
      const azimuth =
        THREE.MathUtils.degToRad(
          MOBILE_CAMERA_AZIMUTH_DEG,
        );

      const elevation =
        THREE.MathUtils.degToRad(
          MOBILE_CAMERA_ELEVATION_DEG,
        );

      const horizontalDistance =
        Math.cos(
          elevation,
        ) *
        MOBILE_CAMERA_DISTANCE;

      const verticalDistance =
        Math.sin(
          elevation,
        ) *
        MOBILE_CAMERA_DISTANCE;

      /*
       * Negative X is behind the player's own goal.
       * Positive Z is toward the right touchline.
       */
      return new THREE.Vector3(
        -Math.cos(
          azimuth,
        ) *
          horizontalDistance,

        verticalDistance,

        Math.sin(
          azimuth,
        ) *
          horizontalDistance,
      );
    }, []);

  useEffect(() => {
    if (
      !(
        camera instanceof
        THREE.PerspectiveCamera
      )
    ) {
      return;
    }

    camera.fov =
      MOBILE_CAMERA_FOV;

    camera.aspect =
      size.width /
      Math.max(
        size.height,
        1,
      );

    camera.near = 0.1;
    camera.far = 220;

    camera.up.set(
      0,
      1,
      0,
    );

    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }, [
    camera,
    size.width,
    size.height,
  ]);

  useEffect(() => {
    const canvas =
      gl.domElement;

    const previousTouchAction =
      canvas.style.touchAction;

    const previousCursor =
      canvas.style.cursor;

    canvas.style.touchAction =
      "none";

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      if (
        activePointerIdRef.current !==
        null
      ) {
        return;
      }

      activePointerIdRef.current =
        event.pointerId;

      pointerStartRef.current = {
        x:
          event.clientX,

        y:
          event.clientY,

        pan:
          targetPanRef.current,
      };

      didDragRef.current =
        false;

      try {
        canvas.setPointerCapture(
          event.pointerId,
        );
      } catch {
        // Embedded mobile browsers may reject pointer capture.
      }
    };

    const handlePointerMove = (
      event: PointerEvent,
    ) => {
      if (
        activePointerIdRef.current !==
        event.pointerId
      ) {
        return;
      }

      const deltaX =
        event.clientX -
        pointerStartRef.current.x;

      const deltaY =
        event.clientY -
        pointerStartRef.current.y;

      const distance =
        Math.hypot(
          deltaX,
          deltaY,
        );

      if (
        distance >=
        MOBILE_DRAG_THRESHOLD
      ) {
        didDragRef.current =
          true;

        suppressGroundClickRef.current =
          true;

        canvas.style.cursor =
          "grabbing";
      }

      if (
        !didDragRef.current
      ) {
        return;
      }

      event.preventDefault();

      const normalizedX =
        deltaX /
        Math.max(
          size.width,
          1,
        );

      const normalizedY =
        deltaY /
        Math.max(
          size.height,
          1,
        );

      /*
       * Drag upward to move toward the opponent goal.
       * Drag downward to move toward the player's own goal.
       *
       * Horizontal motion contributes slightly because the field is viewed
       * diagonally from the right side.
       */
      const panDelta =
        -normalizedY *
          MOBILE_VERTICAL_DRAG_SENSITIVITY -
        normalizedX *
          MOBILE_HORIZONTAL_DRAG_SENSITIVITY;

      targetPanRef.current =
        clamp(
          pointerStartRef.current.pan +
            panDelta,
          0,
          1,
        );
    };

    const finishPointer = (
      event: PointerEvent,
    ) => {
      if (
        activePointerIdRef.current !==
        event.pointerId
      ) {
        return;
      }

      activePointerIdRef.current =
        null;

      canvas.style.cursor =
        previousCursor;

      try {
        canvas.releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // The pointer may already have been released.
      }
    };

    const handleWheel = (
      event: WheelEvent,
    ) => {
      event.preventDefault();

      targetPanRef.current =
        clamp(
          targetPanRef.current +
            event.deltaY *
              MOBILE_WHEEL_SENSITIVITY,
          0,
          1,
        );
    };

    const handleClickCapture = (
      event: MouseEvent,
    ) => {
      if (
        !suppressGroundClickRef.current
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      suppressGroundClickRef.current =
        false;
    };

    canvas.addEventListener(
      "pointerdown",
      handlePointerDown,
      {
        passive: true,
      },
    );

    canvas.addEventListener(
      "pointermove",
      handlePointerMove,
      {
        passive: false,
      },
    );

    canvas.addEventListener(
      "pointerup",
      finishPointer,
      {
        passive: true,
      },
    );

    canvas.addEventListener(
      "pointercancel",
      finishPointer,
      {
        passive: true,
      },
    );

    canvas.addEventListener(
      "wheel",
      handleWheel,
      {
        passive: false,
      },
    );

    canvas.addEventListener(
      "click",
      handleClickCapture,
      true,
    );

    return () => {
      canvas.style.touchAction =
        previousTouchAction;

      canvas.style.cursor =
        previousCursor;

      canvas.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );

      canvas.removeEventListener(
        "pointermove",
        handlePointerMove,
      );

      canvas.removeEventListener(
        "pointerup",
        finishPointer,
      );

      canvas.removeEventListener(
        "pointercancel",
        finishPointer,
      );

      canvas.removeEventListener(
        "wheel",
        handleWheel,
      );

      canvas.removeEventListener(
        "click",
        handleClickCapture,
        true,
      );
    };
  }, [
    gl,
    size.width,
    size.height,
    targetPanRef,
    suppressGroundClickRef,
  ]);

  useFrame(
    (_, delta) => {
      if (
        !(
          camera instanceof
          THREE.PerspectiveCamera
        )
      ) {
        return;
      }

      const safeDelta =
        Math.min(
          delta,
          0.05,
        );

      const dampingFactor =
        1 -
        Math.exp(
          -MOBILE_CAMERA_PAN_DAMPING *
            safeDelta,
        );

      currentPanRef.current =
        THREE.MathUtils.lerp(
          currentPanRef.current,
          targetPanRef.current,
          dampingFactor,
        );

      const targetX =
        THREE.MathUtils.lerp(
          -MOBILE_CAMERA_PAN_RANGE,
          MOBILE_CAMERA_PAN_RANGE,
          currentPanRef.current,
        );

      const target =
        new THREE.Vector3(
          targetX,
          MOBILE_CAMERA_TARGET_HEIGHT,
          0,
        );

      camera.position
        .copy(
          target,
        )
        .add(
          cameraOffset,
        );

      camera.up.set(
        0,
        1,
        0,
      );

      camera.lookAt(
        target,
      );

      camera.fov =
        MOBILE_CAMERA_FOV;

      camera.aspect =
        size.width /
        Math.max(
          size.height,
          1,
        );

      camera.near =
        0.1;

      camera.far =
        220;

      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    },
  );

  return null;
}

/*
 * Uses the orthographic camera created directly by Canvas.
 */
function DesktopOrthographicCamera() {
  const {
    camera,
    size,
  } = useThree();

  useEffect(() => {
    if (
      !(
        camera instanceof
        THREE.OrthographicCamera
      )
    ) {
      return;
    }

    if (
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
      createSceneFitCorners();

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
    camera,
    size.width,
    size.height,
  ]);

  return null;
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
    canvas.getContext(
      "2d",
    );

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

  /*
   * Alternating mowing stripes.
   */
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

  /*
   * Light grass texture.
   */
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

  context.strokeStyle =
    "rgba(255,255,255,0.84)";

  context.lineWidth =
    2.2;

  /*
   * Outer boundary.
   */
  context.strokeRect(
    1,
    1,
    canvas.width - 2,
    canvas.height - 2,
  );

  /*
   * Halfway line.
   */
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

  /*
   * Center circle.
   */
  context.beginPath();

  context.arc(
    PITCH_WIDTH / 2,
    PITCH_HEIGHT / 2,
    55,
    0,
    Math.PI * 2,
  );

  context.stroke();

  /*
   * Center spot.
   */
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

  /*
   * Penalty areas.
   */
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

  /*
   * Tactical thirds.
   */
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
      line:
        lineObject,

      headPosition:
        end,

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
        object={
          line
        }
        dispose={
          null
        }
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

        targetPosition:
          Vec2,

        color:
          string,

        arced:
          boolean,

        key:
          string,
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
         * Pass-then-move begins at the player's original tile.
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
            key={
              arrow.key
            }
            from={
              arrow.from
            }
            to={
              arrow.to
            }
            color={
              arrow.color
            }
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

  const currentPanRef =
    useRef(
      MOBILE_INITIAL_PAN,
    );

  const targetPanRef =
    useRef(
      MOBILE_INITIAL_PAN,
    );

  const suppressGroundClickRef =
    useRef(false);

  useEffect(() => {
    return () => {
      pitchTexture.dispose();
    };
  }, [pitchTexture]);

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
          suppressGroundClickRef.current
        ) {
          suppressGroundClickRef.current =
            false;

          event.stopPropagation();

          return;
        }

        if (
          phase !==
            "planning" ||
          !frame
        ) {
          return;
        }

        event.stopPropagation();

        /*
         * The pitch is no longer separately rotated on mobile.
         * The event point is already in pitch-world coordinates.
         */
        const clickedPosition =
          worldToPitch(
            event.point.x,
            event.point.z,
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

  const canvasCamera =
    isVertical
      ? {
          position:
            [
              -10,
              12,
              7,
            ] as [
              number,
              number,
              number,
            ],

          fov:
            MOBILE_CAMERA_FOV,

          near:
            0.1,

          far:
            220,
        }
      : {
          position:
            [
              0,
              16,
              15,
            ] as [
              number,
              number,
              number,
            ],

          zoom:
            40,

          near:
            0.1,

          far:
            120,
        };

  return (
    <div
      style={{
        width:
          "100%",

        height:
          "100%",

        position:
          "relative",

        overflow:
          "hidden",

        background:
          "radial-gradient(circle at 50% 45%, #47764a 0%, #315d3a 45%, #1d3e29 72%, #11271b 100%)",
      }}
    >
      <div
        style={{
          position:
            "absolute",

          inset:
            0,

          zIndex:
            1,
        }}
      >
        <Canvas
          shadows
          orthographic={
            !isVertical
          }
          dpr={[
            1,
            1.35,
          ]}
          camera={
            canvasCamera
          }
          style={{
            touchAction:
              isVertical
                ? "none"
                : "auto",
          }}
          gl={{
            antialias:
              true,

            alpha:
              true,

            powerPreference:
              "high-performance",
          }}
        >
          {isVertical ? (
            <MobileScrollingCamera
              currentPanRef={
                currentPanRef
              }
              targetPanRef={
                targetPanRef
              }
              suppressGroundClickRef={
                suppressGroundClickRef
              }
            />
          ) : (
            <DesktopOrthographicCamera />
          )}

          <ambientLight
            intensity={
              0.88
            }
          />

          <hemisphereLight
            intensity={
              0.58
            }
            color="#ffffff"
            groundColor="#26472d"
          />

          <directionalLight
            position={[
              6,
              12,
              7,
            ]}
            intensity={
              1.18
            }
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

          {/*
           * No mobile rotation is applied here.
           * The 41-degree perspective is produced by the camera.
           */}
          <group>
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
                map={
                  pitchTexture
                }
                color="#ffffff"
                roughness={
                  0.95
                }
                metalness={
                  0
                }
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
                ] =
                  key
                    .split(
                      ",",
                    )
                    .map(
                      Number,
                    );

                const center =
                  pitchToWorld(
                    tileToPos(
                      column,
                      row,
                    ),
                  );

                return (
                  <mesh
                    key={
                      key
                    }
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
                      opacity={
                        0.4
                      }
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
                frame={
                  frame
                }
                pendingCommands={
                  pendingCommands
                }
              />
            )}

            <Suspense
              fallback={
                null
              }
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