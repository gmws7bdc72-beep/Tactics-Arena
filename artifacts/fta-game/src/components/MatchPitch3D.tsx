import { useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { FrameSnapshot, TeamConfig, Vec2, Command } from "../engine/types";
import { CommandType } from "../engine/types";
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  GOAL_WIDTH,
  GOAL_TOP_Y,
  PENALTY_AREA_WIDTH,
  PENALTY_AREA_HEIGHT,
  TILE_W,
  TILE_H,
  GRID_COLS,
  GRID_ROWS,
} from "../engine/constants";
import { posToTile, getReachableTiles, tileToPos } from "../engine/grid";
import { PlayerModel3D } from "./three/PlayerModel3D";
import { Ball3D } from "./three/Ball3D";

// World units per pitch pixel. Pitch is 744x460px -> ~18.6 x 11.5 world units.
const SCALE = 1 / 40;
const TILT_DEG = 28;
const AZIMUTH_DEG = 8;

interface Props {
  frame: FrameSnapshot | null;
  playerTeam: TeamConfig;
  aiTeamColor?: string;
  aiTeamSecondaryColor?: string;
  pendingCommands: Map<string, Command>;
  selectedPlayerId: string | null;
  passTargetMode: boolean;
  passOriginPos?: Vec2;
  phase: "planning" | "simulating" | "finished";
  isVertical?: boolean;
  activePlanningTeam?: "player" | "ai";
  onPlayerClick: (playerId: string, pos: Vec2) => void;
  onTileClick: (pos: Vec2, isEnemyTile: boolean) => void;
}

type TileState = "reachable" | "reachable-enemy" | "reachable-friendly" | "current" | "none";

function pitchToWorld(p: Vec2, isVertical: boolean): { x: number; z: number } {
  const b = isVertical ? { x: p.y, y: PITCH_WIDTH - p.x } : { x: p.x, y: p.y };
  const baseW = isVertical ? PITCH_HEIGHT : PITCH_WIDTH;
  const baseH = isVertical ? PITCH_WIDTH : PITCH_HEIGHT;

  return {
    x: (b.x - baseW / 2) * SCALE,
    z: (b.y - baseH / 2) * SCALE,
  };
}

function worldToPitch(x: number, z: number, isVertical: boolean): Vec2 {
  const baseW = isVertical ? PITCH_HEIGHT : PITCH_WIDTH;
  const baseH = isVertical ? PITCH_WIDTH : PITCH_HEIGHT;
  const bx = x / SCALE + baseW / 2;
  const by = z / SCALE + baseH / 2;

  const pitch = isVertical ? { x: PITCH_WIDTH - by, y: bx } : { x: bx, y: by };

  return {
    x: Math.max(0, Math.min(PITCH_WIDTH - 1, pitch.x)),
    y: Math.max(0, Math.min(PITCH_HEIGHT - 1, pitch.y)),
  };
}

const pitchW = PITCH_WIDTH * SCALE;
const pitchH = PITCH_HEIGHT * SCALE;
const PLAYER_HEIGHT_APPROX = 1.7;

// ---------------------------------------------------------------------------
// Camera that keeps the whole pitch framed on any screen size/aspect ratio,
// instead of a fixed distance that looks tiny on a wide desktop/tablet window.
// ---------------------------------------------------------------------------
function ResponsiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const tilt = (TILT_DEG * Math.PI) / 180;
    const azimuth = (AZIMUTH_DEG * Math.PI) / 180;

    const targetDepth =
      pitchH * Math.cos(tilt) + PLAYER_HEIGHT_APPROX * Math.sin(tilt) * 1.2;
    const padFactor = 1.18;

    const zoomForWidth = size.width / (pitchW * padFactor);
    const zoomForHeight = size.height / (targetDepth * padFactor);
    ortho.zoom = Math.min(zoomForWidth, zoomForHeight);

    const dist = 16;
    ortho.position.set(
      Math.sin(azimuth) * dist,
      Math.cos(tilt) * dist,
      Math.sin(tilt) * dist,
    );
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

// ---------------------------------------------------------------------------
// Crowd / stadium backdrop. Lives on its own 2D canvas behind the 3D layer --
// same spirit as the previous stadium art (gradient stands + dot crowd),
// kept in 2D since only the pitch itself needed to become 3D.
// ---------------------------------------------------------------------------
function StadiumBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const W = parent.clientWidth;
      const H = parent.clientHeight;
      canvas.width = W;
      canvas.height = H;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#3a7748");
      bg.addColorStop(0.5, "#2c643c");
      bg.addColorStop(1, "#1e4a31");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Pitch footprint on screen is roughly a centered band; keep the crowd
      // clear of it with a soft-edged hole rather than trying to trace the
      // exact 3D-projected pitch outline.
      const holeW = W * 0.86;
      const holeH = H * 0.68;
      const holeX = (W - holeW) / 2;
      const holeY = (H - holeH) / 2;

      const crowdColors = ["#2f80ed", "#eb5757", "#f2c94c", "#27ae60", "#ffffff", "#9b51e0", "#56ccf2", "#f2994a"];

      ctx.save();
      ctx.globalAlpha = 0.75;
      let seed = 0;
      const dot = (x: number, y: number) => {
        if (x > holeX - 10 && x < holeX + holeW + 10 && y > holeY - 10 && y < holeY + holeH + 10) return;
        ctx.fillStyle = crowdColors[seed % crowdColors.length];
        ctx.fillRect(x, y, 2.4, 2.4);
        seed++;
      };

      for (let row = 0; row < 6; row++) {
        for (let i = 0; i < 90; i++) {
          const t = i / 89;
          dot(t * W + ((i % 3) - 1) * 3, row * (H / 7) + ((i % 5) - 2) * 4);
        }
      }
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `900 ${Math.max(11, Math.round(H * 0.024))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FTA ARENA", W / 2, Math.max(16, holeY - H * 0.03));

      const vignette = ctx.createRadialGradient(W / 2, H * 0.52, W * 0.14, W / 2, H * 0.52, W * 0.94);
      vignette.addColorStop(0, "rgba(255,255,255,0.03)");
      vignette.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    };

    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
    />
  );
}

function createPitchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = PITCH_WIDTH;
  canvas.height = PITCH_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#416e31");
  grad.addColorStop(0.5, "#547f36");
  grad.addColorStop(1, "#355a29");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let col = 0; col < GRID_COLS; col++) {
    ctx.fillStyle = col % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.035)";
    ctx.fillRect(col * TILE_W, 0, TILE_W, canvas.height);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = 2.2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  ctx.beginPath();
  ctx.moveTo(PITCH_WIDTH / 2, 0);
  ctx.lineTo(PITCH_WIDTH / 2, canvas.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(PITCH_WIDTH / 2, PITCH_HEIGHT / 2, 55, 0, Math.PI * 2);
  ctx.stroke();

  const paY = (PITCH_HEIGHT - PENALTY_AREA_HEIGHT) / 2;
  ctx.strokeRect(0, paY, PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT);
  ctx.strokeRect(PITCH_WIDTH - PENALTY_AREA_WIDTH, paY, PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT);

  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.moveTo(PITCH_WIDTH / 3, 0);
  ctx.lineTo(PITCH_WIDTH / 3, canvas.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo((2 * PITCH_WIDTH) / 3, 0);
  ctx.lineTo((2 * PITCH_WIDTH) / 3, canvas.height);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function GoalFrame({ atRightEnd }: { atRightEnd: boolean }) {
  const goalTop = pitchToWorld({ x: 0, y: GOAL_TOP_Y }, false).z;
  const goalBottom = pitchToWorld({ x: 0, y: GOAL_TOP_Y + GOAL_WIDTH }, false).z;
  const postHeight = 0.9;
  const x = atRightEnd ? pitchW / 2 + 0.05 : -pitchW / 2 - 0.05;

  return (
    <group>
      {[goalTop, goalBottom].map((z) => (
        <mesh key={z} position={[x, postHeight / 2, z]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, postHeight, 10]} />
          <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[x, postHeight, (goalTop + goalBottom) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, Math.abs(goalBottom - goalTop), 10]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
      </mesh>
    </group>
  );
}

const TILE_COLORS: Record<Exclude<TileState, "none">, string> = {
  current: "#5fe0ff",
  reachable: "#7CFC9A",
  "reachable-friendly": "#b4b4b4",
  "reachable-enemy": "#ff6000",
};

// ---------------------------------------------------------------------------
// Planned-move preview arrows, ported from PitchCanvas's drawArrow: MOVE is a
// straight dashed line, PASS/SHOOT arc upward, with the same color coding.
// ---------------------------------------------------------------------------
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
  const { line, headPos, headQuat } = useMemo(() => {
    const y = 0.03;
    const start = new THREE.Vector3(from[0], y, from[1]);
    const end = new THREE.Vector3(to[0], y, to[1]);

    let points: THREE.Vector3[];
    if (arced) {
      const mid = new THREE.Vector3((start.x + end.x) / 2, y + 0.5, (start.z + end.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      points = curve.getPoints(20);
    } else {
      points = [start, end];
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.15,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    const lineObj = new THREE.Line(geo, mat);
    lineObj.computeLineDistances();

    const tangent = points[points.length - 1]
      .clone()
      .sub(points[points.length - 2])
      .normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);

    return { line: lineObj, headPos: end, headQuat: quat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], to[0], to[1], color, arced]);

  return (
    <group>
      <primitive object={line} />
      <mesh position={headPos} quaternion={headQuat}>
        <coneGeometry args={[0.09, 0.22, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function CommandArrows({
  frame,
  pendingCommands,
  isVertical,
}: {
  frame: FrameSnapshot;
  pendingCommands: Map<string, Command>;
  isVertical: boolean;
}) {
  const arrows: { key: string; from: [number, number]; to: [number, number]; color: string; arced: boolean }[] = [];

  pendingCommands.forEach((cmd, playerId) => {
    const pf = frame.players.find((p) => p.id === playerId);
    if (!pf) return;

    const fromWorld = pitchToWorld(pf.position, isVertical);
    const from: [number, number] = [fromWorld.x, fromWorld.z];

    const push = (toPitch: Vec2, color: string, arced: boolean, key: string) => {
      const w = pitchToWorld(toPitch, isVertical);
      arrows.push({ key, from, to: [w.x, w.z], color, arced });
    };

    if (cmd.type === CommandType.MOVE && cmd.targetPosition) {
      push(cmd.targetPosition, "#00e676", false, `${playerId}-move`);

      if (cmd.followUp?.type === CommandType.PASS && cmd.followUp.targetPosition) {
        const w = pitchToWorld(cmd.targetPosition, isVertical);
        const wTo = pitchToWorld(cmd.followUp.targetPosition, isVertical);
        arrows.push({
          key: `${playerId}-move-pass`,
          from: [w.x, w.z],
          to: [wTo.x, wTo.z],
          color: "#ff1744",
          arced: true,
        });
      }
    } else if (cmd.type === CommandType.PASS && cmd.targetPosition) {
      push(cmd.targetPosition, "#ffeb3b", true, `${playerId}-pass`);

      if (cmd.followUp?.type === CommandType.MOVE && cmd.followUp.targetPosition) {
        push(cmd.followUp.targetPosition, "#ff9800", false, `${playerId}-pass-move`);
      }
    } else if (cmd.type === CommandType.SHOOT) {
      const goalPitch: Vec2 = {
        x: pf.teamId === "player" ? PITCH_WIDTH : 0,
        y: PITCH_HEIGHT / 2,
      };
      push(goalPitch, "#ff6b35", true, `${playerId}-shoot`);
    }
  });

  return (
    <>
      {arrows.map((a) => (
        <Arrow3D key={a.key} from={a.from} to={a.to} color={a.color} arced={a.arced} />
      ))}
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
  const pitchTexture = useMemo(() => createPitchTexture(), []);

  const tileMap = useMemo((): Map<string, TileState> => {
    const map = new Map<string, TileState>();
    if (!frame || !selectedPlayerId || passTargetMode) return map;

    const selPlayer = frame.players.find((p) => p.id === selectedPlayerId);
    if (!selPlayer) return map;

    const pt = posToTile(selPlayer.position);
    const isGK = selPlayer.role === "goalkeeper";
    map.set(`${pt.col},${pt.row}`, "current");

    const occupancy = new Map<string, "friendly" | "enemy">();
    for (const p of frame.players) {
      if (p.id === selectedPlayerId) continue;
      const t = posToTile(p.position);
      occupancy.set(`${t.col},${t.row}`, p.teamId === selPlayer.teamId ? "friendly" : "enemy");
    }

    const reachable = getReachableTiles(pt.col, pt.row, selPlayer.tileRange, isGK, selPlayer.teamId);
    for (const t of reachable) {
      const key = `${t.col},${t.row}`;
      const occ = occupancy.get(key);
      if (occ === "friendly") map.set(key, "reachable-friendly");
      else if (occ === "enemy") map.set(key, "reachable-enemy");
      else map.set(key, "reachable");
    }

    return map;
  }, [frame, selectedPlayerId, passTargetMode]);

  const handleGroundClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (phase !== "planning" || !frame) return;
      e.stopPropagation();

      const pos = worldToPitch(e.point.x, e.point.z, isVertical);
      const selectableTeam = activePlanningTeam ?? "player";

      for (const p of frame.players) {
        const isGK = p.role === "goalkeeper";
        const hitR = 14 + (isGK ? 4 : 2) + 8;
        const d = Math.hypot(p.position.x - pos.x, p.position.y - pos.y);
        if (d < hitR && p.teamId === selectableTeam) {
          onPlayerClick(p.id, pos);
          return;
        }
      }

      if (!selectedPlayerId) return;
      const selPlayer = frame.players.find((p) => p.id === selectedPlayerId);
      if (!selPlayer || selPlayer.teamId !== selectableTeam) return;

      const clickedCol = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(pos.x / TILE_W)));
      const clickedRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(pos.y / TILE_H)));
      const selTile = posToTile(selPlayer.position);
      if (clickedCol === selTile.col && clickedRow === selTile.row) return;

      if (!passTargetMode) {
        const isGK = selPlayer.role === "goalkeeper";
        const reachable = getReachableTiles(selTile.col, selTile.row, selPlayer.tileRange, isGK, selPlayer.teamId);
        const isReachable = reachable.some((t) => t.col === clickedCol && t.row === clickedRow);
        if (!isReachable) return;
      }

      const occupant = frame.players.find((p) => {
        const t = posToTile(p.position);
        return t.col === clickedCol && t.row === clickedRow;
      });

      if (occupant?.teamId === selectableTeam && occupant.id !== selectedPlayerId) return;

      const isEnemy = occupant?.teamId !== undefined && occupant.teamId !== selectableTeam;
      onTileClick(tileToPos(clickedCol, clickedRow), isEnemy);
    },
    [phase, frame, selectedPlayerId, passTargetMode, activePlanningTeam, isVertical, onPlayerClick, onTileClick],
  );

  if (!frame) return null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#1e4a31" }}>
      <StadiumBackdrop />

      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <Canvas shadows orthographic camera={{ position: [1.5, 12, 12], zoom: 40, near: -50, far: 50 }}>
          <ResponsiveCamera />
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[pitchW * 0.3, 10, pitchH * 0.5]}
            intensity={1.15}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />

          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={handleGroundClick}>
            <planeGeometry args={[pitchW, pitchH]} />
            <meshStandardMaterial map={pitchTexture} roughness={0.95} />
          </mesh>

          <GoalFrame atRightEnd={false} />
          <GoalFrame atRightEnd={true} />

          {Array.from(tileMap.entries()).map(([key, state]) => {
            if (state === "none") return null;
            const [col, row] = key.split(",").map(Number);
            const center = pitchToWorld(tileToPos(col, row), isVertical);
            return (
              <mesh key={key} position={[center.x, 0.008, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[TILE_W * SCALE * 0.88, TILE_H * SCALE * 0.88]} />
                <meshBasicMaterial color={TILE_COLORS[state]} transparent opacity={0.4} />
              </mesh>
            );
          })}

          {phase === "planning" && (
            <CommandArrows frame={frame} pendingCommands={pendingCommands} isVertical={isVertical} />
          )}

          {frame.players.map((p) => {
            const isPlayerTeam = p.teamId === "player";
            const world = pitchToWorld(p.position, isVertical);
            return (
              <PlayerModel3D
                key={p.id}
                x={world.x}
                z={world.z}
                characterIndex={(p.jerseyNumber % 3) as 0 | 1 | 2}
                teamColor={isPlayerTeam ? playerTeam.jerseyColor : aiTeamColor}
                secondaryColor={isPlayerTeam ? playerTeam.secondaryColor : aiTeamSecondaryColor}
                jerseyNumber={p.jerseyNumber}
                name={p.name}
                role={p.role}
                isSelected={p.id === selectedPlayerId}
                hasBall={frame.ball.ownerId === p.id}
                offside={p.offside}
                playerState={p.state}
              />
            );
          })}

          <Ball3D
            x={pitchToWorld(frame.ball.position, isVertical).x}
            z={pitchToWorld(frame.ball.position, isVertical).z}
            y={(frame.ball.height ?? 0) * SCALE}
            active={phase === "simulating"}
          />
        </Canvas>
      </div>
    </div>
  );
}