import { useRef, useEffect, useCallback, useState } from "react";
import type { MouseEvent } from "react";
import type {
  FrameSnapshot,
  TeamConfig,
  Vec2,
  Command,
  KitStyle,
  SleeveStyle,
} from "../engine/types";
import { CommandType } from "../engine/types";
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  GOAL_WIDTH,
  GOAL_DEPTH,
  GOAL_TOP_Y,
  PENALTY_AREA_WIDTH,
  PENALTY_AREA_HEIGHT,
  PLAYER_RADIUS,
  BALL_RADIUS,
  TILE_W,
  TILE_H,
  GRID_COLS,
  GRID_ROWS,
} from "../engine/constants";
import { posToTile, getReachableTiles, tileToPos } from "../engine/grid";
import { sampleChainedCurve } from "../engine/curve";
import {
  deriveKitStyle,
  deriveSleeveStyle,
  normalizeKitStyle,
  normalizeSleeveStyle,
} from "../game/visuals";

interface Props {
  frame: FrameSnapshot | null;
  playerTeam: TeamConfig;
  aiTeamColor?: string;
  aiTeamSecondaryColor?: string;
  aiTeamKitStyle?: KitStyle;
  aiTeamSleeveStyle?: SleeveStyle;
  pendingCommands: Map<string, Command>;
  selectedPlayerId: string | null;
  passTargetMode: boolean;
  passOriginPos?: Vec2;
  curveDraft?: {
    origin: Vec2;
    controls: Vec2[];
    target: Vec2;
    limit: number;
  };
  curveControlMode?: boolean;
  phase: "planning" | "simulating" | "finished";
  isVertical?: boolean;
  activePlanningTeam?: "player" | "ai";
  onPlayerClick: (playerId: string, pos: Vec2) => void;
  onTileClick: (pos: Vec2, isEnemyTile: boolean) => void;
  onCurvePointClick?: (pos: Vec2) => void;
}

type TileState =
  | "reachable"
  | "reachable-enemy"
  | "reachable-friendly"
  | "current"
  | "none";

type ScreenPoint = {
  x: number;
  y: number;
};

type View2_5D = {
  project: (p: Vec2) => ScreenPoint;
  unproject: (p: ScreenPoint) => Vec2;
  radius: (r: number, pitchY?: number) => number;
  depth: (p: Vec2) => number;
  base: (p: Vec2) => ScreenPoint;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function smooth01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function phaseEnvelope(
  value: number,
  riseStart: number,
  peak: number,
  fallEnd: number,
): number {
  if (value <= riseStart || value >= fallEnd) return 0;
  if (value < peak) return smooth01((value - riseStart) / Math.max(0.001, peak - riseStart));
  return 1 - smooth01((value - peak) / Math.max(0.001, fallEnd - peak));
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

type PlayerAnimMemory = {
  facing: number;
  state: string;
  stateTick: number;
  receiveTick: number;
  actionKind?: "pass" | "longPass" | "shot";
  actionTick: number;
};

function rgba(hex: string, alpha: number): string {
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

  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r},${g},${b},${alpha})`;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createView(W: number, H: number, isVertical: boolean): View2_5D {
  // FTA_MOBILE_TOP_DOWN_V3: mobile uses a straight orthographic top-down pitch.
  // FTA_GOAL_VIEW_BOUNDS_V2
  const viewMinX = -GOAL_DEPTH;
  const viewMaxX = PITCH_WIDTH + GOAL_DEPTH;
  const baseH = isVertical ? viewMaxX - viewMinX : PITCH_HEIGHT;

  // Mobile is a fixed, straight top-down view. Desktop keeps the angled presentation.
  const CAMERA_ZOOM = isVertical ? 1.0: 1.08;
  const CAMERA_SHIFT_X = 0;
  const CAMERA_SHIFT_Y = isVertical ? 0: 0.015;
  const skew = isVertical ? 0: 0.13;
  const squash = isVertical ? 1: 0.88;

  const base = (p: Vec2): ScreenPoint =>
    isVertical
      ? {
          x: p.y,
          y: viewMaxX - p.x,
        }
      : {
          x: p.x,
          y: p.y,
        };

  const raw = (p: Vec2): ScreenPoint => {
    const b = base(p);

    return {
      x: b.x - (b.y - baseH / 2) * skew,
      y: b.y * squash,
    };
  };

  const corners = [
    raw({ x: viewMinX, y: 0 }),
    raw({ x: viewMaxX, y: 0 }),
    raw({ x: viewMaxX, y: PITCH_HEIGHT }),
    raw({ x: viewMinX, y: PITCH_HEIGHT }),
  ];

  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));

  const padX = W * 0.012;
  const padTop = H * 0.012;
  const padBottom = H * 0.012;

  const fitScale = Math.min(
    (W - padX * 2) / (maxX - minX),
    (H - padTop - padBottom) / (maxY - minY),
  );

  const scale = fitScale * CAMERA_ZOOM;

  const fittedW = (maxX - minX) * scale;
  const fittedH = (maxY - minY) * scale;

  const ox = (W - fittedW) / 2 - minX * scale + W * CAMERA_SHIFT_X;
  const oy = (H - fittedH) / 2 - minY * scale + H * CAMERA_SHIFT_Y;

  const project = (p: Vec2): ScreenPoint => {
    const r = raw(p);

    return {
      x: ox + r.x * scale,
      y: oy + r.y * scale,
    };
  };

  const unproject = (s: ScreenPoint): Vec2 => {
    const rx = (s.x - ox) / scale;
    const ry = (s.y - oy) / scale;

    const by = ry / squash;
    const bx = rx + (by - baseH / 2) * skew;

    const pitch = isVertical
      ? {
          x: viewMaxX - by,
          y: bx,
        }
      : {
          x: bx,
          y: by,
        };

    return {
      x: clamp(pitch.x, viewMinX, viewMaxX),
      y: clamp(pitch.y, 0, PITCH_HEIGHT),
    };
  };

  const depth = (p: Vec2) => {
    const b = base(p);
    return clamp(b.y / baseH, 0, 1);
  };

  const radius = (r: number, pitchY = PITCH_HEIGHT / 2) => {
    const fakeDepth = isVertical ? 0.5 : clamp(pitchY / PITCH_HEIGHT, 0, 1);

    return r * scale * (0.95 + fakeDepth * 0.16);
  };

  return {
    project,
    unproject,
    radius,
    depth,
    base,
  };
}

function drawPoly(
  ctx: CanvasRenderingContext2D,
  points: ScreenPoint[],
  fill?: string | CanvasGradient,
  stroke?: string,
  lineWidth = 1,
) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawProjectedLine(
  ctx: CanvasRenderingContext2D,
  view: View2_5D,
  a: Vec2,
  b: Vec2,
  stroke: string,
  width = 2,
  dash?: number[],
) {
  const p1 = view.project(a);
  const p2 = view.project(b);

  ctx.save();

  if (dash) ctx.setLineDash(dash);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  ctx.restore();
}

function drawProjectedPath(
  ctx: CanvasRenderingContext2D,
  view: View2_5D,
  points: Vec2[],
  stroke: string,
  width = 2,
  close = false,
) {
  if (points.length === 0) return;

  const first = view.project(points[0]);

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);

  for (let i = 1; i < points.length; i++) {
    const p = view.project(points[i]);
    ctx.lineTo(p.x, p.y);
  }

  if (close) ctx.closePath();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function circlePoints(
  center: Vec2,
  radius: number,
  start = 0,
  end = Math.PI * 2,
  steps = 56,
): Vec2[] {
  const pts: Vec2[] = [];
  const total = Math.max(8, steps);

  for (let i = 0; i <= total; i++) {
    const t = start + ((end - start) * i) / total;

    pts.push({
      x: center.x + Math.cos(t) * radius,
      y: center.y + Math.sin(t) * radius,
    });
  }

  return pts;
}

function tileCorners(col: number, row: number): Vec2[] {
  const x = col * TILE_W;
  const y = row * TILE_H;

  return [
    { x, y },
    { x: x + TILE_W, y },
    { x: x + TILE_W, y: y + TILE_H },
    { x, y: y + TILE_H },
  ];
}

function drawCrowdDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  r: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawStadiumBackdrop(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pitchCorners: ScreenPoint[],
) {
  const [topLeft, topRight, bottomRight, bottomLeft] = pitchCorners;

  // Full canvas fill first. No more black void.
  const outside = ctx.createLinearGradient(0, 0, 0, H);
  outside.addColorStop(0, "#3a7748");
  outside.addColorStop(0.5, "#2c643c");
  outside.addColorStop(1, "#1e4a31");

  ctx.fillStyle = outside;
  ctx.fillRect(0, 0, W, H);

  // Stadium/floor texture everywhere outside pitch.
  ctx.save();
  ctx.globalAlpha = 0.12;

  for (let i = 0; i < 260; i++) {
    const x = (i * 137) % Math.floor(W);
    const y = (i * 89) % Math.floor(H);

    ctx.fillStyle = i % 2 === 0 ? "#67a85a" : "#173a28";
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.restore();

  const sideGap = Math.max(14, W * 0.025);
  const standDepth = Math.max(58, W * 0.095);
  const boardDepth = Math.max(13, W * 0.019);

  // Grass apron around pitch.
  drawPoly(
    ctx,
    [
      { x: Math.max(0, topLeft.x - standDepth * 0.65), y: Math.max(0, topLeft.y - standDepth * 0.55) },
      { x: Math.min(W, topRight.x + standDepth * 0.65), y: Math.max(0, topRight.y - standDepth * 0.55) },
      { x: Math.min(W, bottomRight.x + standDepth * 0.65), y: Math.min(H, bottomRight.y + standDepth * 0.5) },
      { x: Math.max(0, bottomLeft.x - standDepth * 0.65), y: Math.min(H, bottomLeft.y + standDepth * 0.5) },
    ],
    "rgba(37,92,51,0.74)",
  );

  // Left side stand, beside pitch.
  drawPoly(
    ctx,
    [
      { x: topLeft.x - sideGap, y: topLeft.y },
      { x: bottomLeft.x - sideGap, y: bottomLeft.y },
      { x: bottomLeft.x - standDepth, y: bottomLeft.y + standDepth * 0.24 },
      { x: topLeft.x - standDepth, y: topLeft.y - standDepth * 0.18 },
    ],
    "#1d3037",
    "rgba(255,255,255,0.13)",
    2,
  );

  // Right side stand, beside pitch.
  drawPoly(
    ctx,
    [
      { x: topRight.x + sideGap, y: topRight.y },
      { x: topRight.x + standDepth, y: topRight.y - standDepth * 0.18 },
      { x: bottomRight.x + standDepth, y: bottomRight.y + standDepth * 0.24 },
      { x: bottomRight.x + sideGap, y: bottomRight.y },
    ],
    "#1d3037",
    "rgba(255,255,255,0.13)",
    2,
  );

  // Far stand above far touchline.
  drawPoly(
    ctx,
    [
      { x: topLeft.x - sideGap, y: topLeft.y - boardDepth },
      { x: topRight.x + sideGap, y: topRight.y - boardDepth },
      { x: topRight.x + sideGap * 1.5, y: Math.max(0, topRight.y - standDepth * 0.72) },
      { x: topLeft.x - sideGap * 1.5, y: Math.max(0, topLeft.y - standDepth * 0.72) },
    ],
    "#172832",
    "rgba(255,255,255,0.1)",
    2,
  );

  // Near walkway below pitch.
  drawPoly(
    ctx,
    [
      { x: bottomLeft.x - sideGap, y: bottomLeft.y + boardDepth },
      { x: bottomRight.x + sideGap, y: bottomRight.y + boardDepth },
      { x: Math.min(W, bottomRight.x + standDepth * 0.88), y: Math.min(H, bottomRight.y + standDepth * 0.52) },
      { x: Math.max(0, bottomLeft.x - standDepth * 0.88), y: Math.min(H, bottomLeft.y + standDepth * 0.52) },
    ],
    "#333b3d",
    "rgba(255,255,255,0.08)",
    2,
  );

  // Boards tight to pitch sides.
  drawPoly(
    ctx,
    [
      { x: topLeft.x - boardDepth, y: topLeft.y + 3 },
      { x: bottomLeft.x - boardDepth, y: bottomLeft.y - 3 },
      { x: bottomLeft.x - boardDepth * 2.3, y: bottomLeft.y - 1 },
      { x: topLeft.x - boardDepth * 2.3, y: topLeft.y + 1 },
    ],
    "#1b5eaa",
  );

  drawPoly(
    ctx,
    [
      { x: topRight.x + boardDepth, y: topRight.y + 3 },
      { x: topRight.x + boardDepth * 2.3, y: topRight.y + 1 },
      { x: bottomRight.x + boardDepth * 2.3, y: bottomRight.y - 1 },
      { x: bottomRight.x + boardDepth, y: bottomRight.y - 3 },
    ],
    "#b3312b",
  );

  drawPoly(
    ctx,
    [
      { x: topLeft.x + W * 0.08, y: topLeft.y - boardDepth },
      { x: topLeft.x + W * 0.31, y: topLeft.y - boardDepth },
      { x: topLeft.x + W * 0.31, y: topLeft.y - boardDepth * 2.5 },
      { x: topLeft.x + W * 0.08, y: topLeft.y - boardDepth * 2.5 },
    ],
    "#2d6a4f",
  );

  drawPoly(
    ctx,
    [
      { x: topRight.x - W * 0.31, y: topRight.y - boardDepth },
      { x: topRight.x - W * 0.08, y: topRight.y - boardDepth },
      { x: topRight.x - W * 0.08, y: topRight.y - boardDepth * 2.5 },
      { x: topRight.x - W * 0.31, y: topRight.y - boardDepth * 2.5 },
    ],
    "#6a2db3",
  );

  // Crowd dots in side stands.
  const crowdColors = [
    "#2f80ed",
    "#eb5757",
    "#f2c94c",
    "#27ae60",
    "#ffffff",
    "#9b51e0",
    "#56ccf2",
    "#f2994a",
  ];

  function crowdStrip(
    a: ScreenPoint,
    b: ScreenPoint,
    offsetX: number,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const x = a.x + (b.x - a.x) * t + offsetX + ((i % 3) - 1) * 4;
      const y = a.y + (b.y - a.y) * t + ((i % 5) - 2) * 5;

      if (x < 0 || x > W || y < 0 || y > H) continue;

      drawCrowdDot(ctx, x, y, crowdColors[i % crowdColors.length], 2.4);
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.68;

  for (let row = 0; row < 4; row++) {
    crowdStrip(topLeft, bottomLeft, -standDepth * (0.32 + row * 0.13), 40);
    crowdStrip(topRight, bottomRight, standDepth * (0.32 + row * 0.13), 40);
  }

  // Top crowd row.
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 70; i++) {
      const t = i / 69;
      const x = topLeft.x + (topRight.x - topLeft.x) * t + ((i % 3) - 1) * 3;
      const y =
        topLeft.y +
        (topRight.y - topLeft.y) * t -
        standDepth * (0.18 + row * 0.12);

      if (x < 0 || x > W || y < 0 || y > H) continue;

      drawCrowdDot(ctx, x, y, crowdColors[(i + row * 9) % crowdColors.length], 2.25);
    }
  }

  ctx.restore();

  // Board text.
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `900 ${Math.max(10, Math.round(H * 0.021))}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(
    "PLAY SMART",
    topLeft.x + W * 0.195,
    topLeft.y - boardDepth * 1.75,
  );

  ctx.fillText(
    "FTA ARENA",
    W / 2,
    Math.max(18, topLeft.y - standDepth * 0.38),
  );

  ctx.fillText(
    "WIN THE TURN",
    topRight.x - W * 0.195,
    topRight.y - boardDepth * 1.75,
  );

  // Warm lights.
  const lightTop = ctx.createRadialGradient(
    W * 0.5,
    H * 0.05,
    0,
    W * 0.5,
    H * 0.05,
    W * 0.72,
  );

  lightTop.addColorStop(0, "rgba(255,255,210,0.18)");
  lightTop.addColorStop(1, "rgba(255,255,210,0)");

  ctx.fillStyle = lightTop;
  ctx.fillRect(0, 0, W, H);

  // Gentle vignette only. No black void.
  const vignette = ctx.createRadialGradient(
    W / 2,
    H * 0.52,
    W * 0.14,
    W / 2,
    H * 0.52,
    W * 0.94,
  );

  vignette.addColorStop(0, "rgba(255,255,255,0.03)");
  vignette.addColorStop(1, "rgba(0,0,0,0.16)");

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

export default function PitchCanvas({
  frame,
  playerTeam,
  aiTeamColor = "#e53935",
  aiTeamSecondaryColor = "#ffffff",
  aiTeamKitStyle,
  aiTeamSleeveStyle,
  pendingCommands,
  selectedPlayerId,
  passTargetMode,
  curveDraft,
  curveControlMode = false,
  phase,
  isVertical = false,
  activePlanningTeam,
  onPlayerClick,
  onTileClick,
  onCurvePointClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerAnimMemoryRef = useRef<Map<string, PlayerAnimMemory>>(new Map());
  const previousBallOwnerRef = useRef<string | null>(null);
  // FTA_ANIMATION_OVERHAUL_V1
  // A 42 FPS presentation clock keeps procedural body motion fluid without
  // changing the match simulation speed.
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let previousTime = 0;

    const animate = (time: number) => {
      if (time - previousTime >= 24) {
        previousTime = time;
        setAnimationTick((tick) => (tick + 1) % 100000);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const canvasToPitch = useCallback(
    (cx: number, cy: number): Vec2 => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return { x: 0, y: 0 };
      }

      const rect = canvas.getBoundingClientRect();

      const sx = ((cx - rect.left) / rect.width) * canvas.width;
      const sy = ((cy - rect.top) / rect.height) * canvas.height;

      return createView(canvas.width, canvas.height, isVertical).unproject({
        x: sx,
        y: sy,
      });
    },
    [isVertical],
  );

  const buildTileMap = useCallback((): Map<string, TileState> => {
    const map = new Map<string, TileState>();

    if (!frame || !selectedPlayerId) return map;
    if (passTargetMode) return map;

    const selPlayer = frame.players.find((p) => p.id === selectedPlayerId);

    if (!selPlayer) return map;

    const pt = posToTile(selPlayer.position);
    const isGK = selPlayer.role === "goalkeeper";
    const range = selPlayer.tileRange;

    map.set(`${pt.col},${pt.row}`, "current");

    const occupancy = new Map<string, "friendly" | "enemy">();

    for (const p of frame.players) {
      if (p.id === selectedPlayerId) continue;

      const t = posToTile(p.position);
      occupancy.set(
        `${t.col},${t.row}`,
        p.teamId === selPlayer.teamId ? "friendly" : "enemy",
      );
    }

    const reachable = getReachableTiles(
      pt.col,
      pt.row,
      range,
      isGK,
      selPlayer.teamId,
    );

    for (const t of reachable) {
      const key = `${t.col},${t.row}`;
      const occ = occupancy.get(key);

      if (occ === "friendly") map.set(key, "reachable-friendly");
      else if (occ === "enemy") map.set(key, "reachable-enemy");
      else map.set(key, "reachable");
    }

    return map;
  }, [frame, selectedPlayerId, passTargetMode]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !frame) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const view = createView(W, H, isVertical);

    ctx.clearRect(0, 0, W, H);

    const pitchCorners = [
      view.project({ x: 0, y: 0 }),
      view.project({ x: PITCH_WIDTH, y: 0 }),
      view.project({ x: PITCH_WIDTH, y: PITCH_HEIGHT }),
      view.project({ x: 0, y: PITCH_HEIGHT }),
    ];

    drawStadiumBackdrop(ctx, W, H, pitchCorners);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 14;
    drawPoly(ctx, pitchCorners, "#243d2b", "rgba(255,255,255,0.15)", 2);
    ctx.restore();

    const pitchGrad = ctx.createLinearGradient(
      0,
      pitchCorners[0].y,
      0,
      pitchCorners[2].y,
    );

    pitchGrad.addColorStop(0, "#416e31");
    pitchGrad.addColorStop(0.5, "#547f36");
    pitchGrad.addColorStop(1, "#355a29");

    drawPoly(ctx, pitchCorners, pitchGrad, "rgba(255,255,255,0.28)", 2.2);

    for (let col = 0; col < GRID_COLS; col++) {
      const fill =
        col % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.035)";
      const x1 = col * TILE_W;
      const x2 = x1 + TILE_W;

      drawPoly(
        ctx,
        [
          view.project({ x: x1, y: 0 }),
          view.project({ x: x2, y: 0 }),
          view.project({ x: x2, y: PITCH_HEIGHT }),
          view.project({ x: x1, y: PITCH_HEIGHT }),
        ],
        fill,
      );
    }

    ctx.save();
    ctx.globalAlpha = 0.13;

    for (let i = 0; i < 150; i++) {
      const rx = (i * 193) % Math.floor(PITCH_WIDTH);
      const ry = (i * 97) % Math.floor(PITCH_HEIGHT);
      const p = view.project({ x: rx, y: ry });

      ctx.fillStyle =
        i % 3 === 0 ? "rgba(255,230,165,0.35)" : "rgba(30,20,10,0.28)";
      ctx.fillRect(p.x, p.y, 1.1, 1.1);
    }

    ctx.restore();

    const line = "rgba(255,255,255,0.78)";

    drawProjectedPath(
      ctx,
      view,
      [
        { x: 0, y: 0 },
        { x: PITCH_WIDTH, y: 0 },
        { x: PITCH_WIDTH, y: PITCH_HEIGHT },
        { x: 0, y: PITCH_HEIGHT },
      ],
      line,
      2.2,
      true,
    );

    drawProjectedLine(
      ctx,
      view,
      { x: PITCH_WIDTH / 2, y: 0 },
      { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT },
      line,
      2,
    );

    drawProjectedPath(
      ctx,
      view,
      circlePoints({ x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 }, 55),
      line,
      1.8,
    );

    const paY = (PITCH_HEIGHT - PENALTY_AREA_HEIGHT) / 2;

    const leftPA = [
      { x: 0, y: paY },
      { x: PENALTY_AREA_WIDTH, y: paY },
      { x: PENALTY_AREA_WIDTH, y: paY + PENALTY_AREA_HEIGHT },
      { x: 0, y: paY + PENALTY_AREA_HEIGHT },
    ];

    const rightPA = [
      { x: PITCH_WIDTH, y: paY },
      { x: PITCH_WIDTH - PENALTY_AREA_WIDTH, y: paY },
      { x: PITCH_WIDTH - PENALTY_AREA_WIDTH, y: paY + PENALTY_AREA_HEIGHT },
      { x: PITCH_WIDTH, y: paY + PENALTY_AREA_HEIGHT },
    ];

    drawProjectedPath(ctx, view, leftPA, line, 2, false);
    drawProjectedPath(ctx, view, rightPA, line, 2, false);

    const goalTop = GOAL_TOP_Y;
    const goalBottom = GOAL_TOP_Y + GOAL_WIDTH;

    drawProjectedPath(
      ctx,
      view,
      [
        { x: 0, y: goalTop },
        { x: -GOAL_DEPTH, y: goalTop },
        { x: -GOAL_DEPTH, y: goalBottom },
        { x: 0, y: goalBottom },
      ],
      "rgba(255,255,255,0.72)",
      2.4,
    );

    drawProjectedPath(
      ctx,
      view,
      [
        { x: PITCH_WIDTH, y: goalTop },
        { x: PITCH_WIDTH + GOAL_DEPTH, y: goalTop },
        { x: PITCH_WIDTH + GOAL_DEPTH, y: goalBottom },
        { x: PITCH_WIDTH, y: goalBottom },
      ],
      "rgba(255,255,255,0.72)",
      2.4,
    );

    // Draw the four posts from the exact same goal-mouth coordinates as the
    // net box. This removes the visual offset that appeared after adding depth.
    for (const post of [
      { x: 0, y: goalTop },
      { x: 0, y: goalBottom },
      { x: PITCH_WIDTH, y: goalTop },
      { x: PITCH_WIDTH, y: goalBottom },
    ]) {
      const screenPost = view.project(post);
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(15,23,42,0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screenPost.x, screenPost.y, Math.max(2.2, view.radius(3.2, post.y)), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // FTA_GOAL_DEPTH_NET
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = goalTop + (GOAL_WIDTH * i) / 4;
      drawProjectedPath(
        ctx,
        view,
        [
          { x: -GOAL_DEPTH, y },
          { x: 0, y },
        ],
        "rgba(255,255,255,0.22)",
        1,
      );
      drawProjectedPath(
        ctx,
        view,
        [
          { x: PITCH_WIDTH, y },
          { x: PITCH_WIDTH + GOAL_DEPTH, y },
        ],
        "rgba(255,255,255,0.22)",
        1,
      );
    }
    for (let i = 1; i < 3; i += 1) {
      const leftX = (-GOAL_DEPTH * i) / 3;
      const rightX = PITCH_WIDTH + (GOAL_DEPTH * i) / 3;
      drawProjectedPath(
        ctx,
        view,
        [
          { x: leftX, y: goalTop },
          { x: leftX, y: goalBottom },
        ],
        "rgba(255,255,255,0.18)",
        1,
      );
      drawProjectedPath(
        ctx,
        view,
        [
          { x: rightX, y: goalTop },
          { x: rightX, y: goalBottom },
        ],
        "rgba(255,255,255,0.18)",
        1,
      );
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.08;

    drawPoly(
      ctx,
      [
        view.project({ x: 0, y: 0 }),
        view.project({ x: PITCH_WIDTH / 3, y: 0 }),
        view.project({ x: PITCH_WIDTH / 3, y: PITCH_HEIGHT }),
        view.project({ x: 0, y: PITCH_HEIGHT }),
      ],
      "#ffffff",
    );

    drawPoly(
      ctx,
      [
        view.project({ x: (2 * PITCH_WIDTH) / 3, y: 0 }),
        view.project({ x: PITCH_WIDTH, y: 0 }),
        view.project({ x: PITCH_WIDTH, y: PITCH_HEIGHT }),
        view.project({ x: (2 * PITCH_WIDTH) / 3, y: PITCH_HEIGHT }),
      ],
      "#ffffff",
    );

    ctx.restore();

    drawProjectedLine(
      ctx,
      view,
      { x: PITCH_WIDTH / 3, y: 0 },
      { x: PITCH_WIDTH / 3, y: PITCH_HEIGHT },
      "rgba(255,255,255,0.35)",
      1.2,
      [7, 5],
    );

    drawProjectedLine(
      ctx,
      view,
      { x: (2 * PITCH_WIDTH) / 3, y: 0 },
      { x: (2 * PITCH_WIDTH) / 3, y: PITCH_HEIGHT },
      "rgba(255,255,255,0.35)",
      1.2,
      [7, 5],
    );

    const selPlayer = selectedPlayerId
      ? frame.players.find((p) => p.id === selectedPlayerId)
      : null;

    const tileMap =
      phase === "planning" ? buildTileMap() : new Map<string, TileState>();

    if (phase === "planning") {
      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          const key = `${col},${row}`;
          const state = tileMap.get(key) ?? "none";
          const corners = tileCorners(col, row).map(view.project);

          if (selPlayer && state === "current") {
            drawPoly(
              ctx,
              corners,
              "rgba(255,220,0,0.25)",
              "rgba(255,220,0,0.75)",
              1.3,
            );
          } else if (selPlayer && state === "reachable") {
            drawPoly(
              ctx,
              corners,
              "rgba(0,230,118,0.16)",
              "rgba(0,230,118,0.45)",
              1.1,
            );
          } else if (selPlayer && state === "reachable-enemy") {
            drawPoly(
              ctx,
              corners,
              "rgba(255,96,0,0.22)",
              "rgba(255,96,0,0.65)",
              1.2,
            );
          } else if (selPlayer && state === "reachable-friendly") {
            drawPoly(
              ctx,
              corners,
              "rgba(120,120,120,0.12)",
              "rgba(180,180,180,0.32)",
              1,
            );
          } else {
            drawPoly(ctx, corners, undefined, "rgba(255,255,255,0.055)", 0.6);
          }
        }
      }
    }

    if (phase === "planning") {
      pendingCommands.forEach((cmd, playerId) => {
        const pf = frame.players.find((p) => p.id === playerId);

        if (!pf) return;

        const drawArrow = (
          fromPitch: Vec2,
          toPitch: Vec2,
          color: string,
          dashed = true,
          arc = false,
          controls: Vec2[] = [],
        ) => {
          const fromPos = view.project(fromPitch);
          const to = view.project(toPitch);
          const curvedPath =
            controls.length >= 2
              ? sampleChainedCurve(fromPitch, controls, toPitch).map(view.project)
              : [];

          ctx.save();
          ctx.globalAlpha = 0.82;
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = arc ? 4 : 3;
          ctx.lineCap = "round";

          if (dashed) {
            ctx.setLineDash(arc ? [13, 8] : [8, 6]);
          }

          ctx.beginPath();

          if (curvedPath.length > 0) {
            ctx.moveTo(fromPos.x, fromPos.y);
            for (const point of curvedPath) ctx.lineTo(point.x, point.y);
          } else if (arc) {
            const mid = {
              x: (fromPos.x + to.x) / 2,
              y:
                Math.min(fromPos.y, to.y) -
                Math.abs(to.x - fromPos.x) * 0.18 -
                38,
            };

            ctx.moveTo(fromPos.x, fromPos.y);
            ctx.quadraticCurveTo(mid.x, mid.y, to.x, to.y);
          } else {
            ctx.moveTo(fromPos.x, fromPos.y);
            ctx.lineTo(to.x, to.y);
          }

          ctx.stroke();
          ctx.setLineDash([]);

          const arrowFrom =
            curvedPath.length > 1
              ? curvedPath[curvedPath.length - 2]
              : fromPos;
          const ang = Math.atan2(to.y - arrowFrom.y, to.x - arrowFrom.x);

          ctx.beginPath();
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(
            to.x - Math.cos(ang - 0.5) * 14,
            to.y - Math.sin(ang - 0.5) * 14,
          );
          ctx.lineTo(
            to.x - Math.cos(ang + 0.5) * 14,
            to.y - Math.sin(ang + 0.5) * 14,
          );
          ctx.closePath();
          ctx.fill();

          ctx.restore();
        };

        if (cmd.type === CommandType.MOVE && cmd.targetPosition) {
          drawArrow(
            pf.position,
            cmd.targetPosition,
            "#00e676",
            true,
            false,
            cmd.curvePoints,
          );

          if (
            cmd.followUp?.type === CommandType.PASS &&
            cmd.followUp.targetPosition
          ) {
            drawArrow(
              cmd.targetPosition,
              cmd.followUp.targetPosition,
              "#ff1744",
              true,
              true,
              cmd.followUp.curvePoints,
            );
          }
        } else if (cmd.type === CommandType.PASS && cmd.targetPosition) {
          drawArrow(
            pf.position,
            cmd.targetPosition,
            "#ffeb3b",
            true,
            true,
            cmd.curvePoints,
          );

          if (
            cmd.followUp?.type === CommandType.MOVE &&
            cmd.followUp.targetPosition
          ) {
            drawArrow(
              pf.position,
              cmd.followUp.targetPosition,
              "#ff9800",
              true,
              false,
              cmd.followUp.curvePoints,
            );
          }
        } else if (cmd.type === CommandType.SHOOT) {
          drawArrow(
            pf.position,
            cmd.targetPosition ?? {
              x: pf.teamId === "player"
                ? PITCH_WIDTH + GOAL_DEPTH * 0.65
                : -GOAL_DEPTH * 0.65,
              y: PITCH_HEIGHT / 2,
            },
            "#ff6b35",
            true,
            false,
            cmd.curvePoints,
          );
        }
      });

      if (curveDraft) {
        const points =
          curveDraft.controls.length >= 2
            ? [curveDraft.origin, ...sampleChainedCurve(
                curveDraft.origin,
                curveDraft.controls,
                curveDraft.target,
              )]
            : [curveDraft.origin, ...curveDraft.controls, curveDraft.target];
        drawProjectedPath(ctx, view, points, "#22d3ee", 4);

        curveDraft.controls.forEach((control, index) => {
          const point = view.project(control);
          ctx.save();
          ctx.fillStyle = "#07111f";
          ctx.strokeStyle = "#67e8f9";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = "800 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(index + 1), point.x, point.y);
          ctx.restore();
        });
      }
    }

    // Match shirts use the same saved pattern and sleeve choices shown in Customize.
    const playerKitStyle = normalizeKitStyle(playerTeam.kitStyle);
    const playerSleeveStyle = normalizeSleeveStyle(playerTeam.sleeveStyle);
    const resolvedAiKitStyle = normalizeKitStyle(
      aiTeamKitStyle ?? deriveKitStyle(`${aiTeamColor}:${aiTeamSecondaryColor}`),
    );
    const resolvedAiSleeveStyle = normalizeSleeveStyle(
      aiTeamSleeveStyle ?? deriveSleeveStyle(`${aiTeamColor}:${aiTeamSecondaryColor}`),
    );

    // FTA_ANIMATION_OVERHAUL_V1
    // Every football action is rendered as anticipation -> contact -> follow
    // through -> recovery. The presentation layer is procedural and does not
    // alter simulation positions or timing.
    const players = [...frame.players].sort(
      (a, b) => view.project(a.position).y - view.project(b.position).y,
    );

    if (
      frame.ball.ownerId &&
      previousBallOwnerRef.current !== frame.ball.ownerId
    ) {
      const receiverMemory = playerAnimMemoryRef.current.get(frame.ball.ownerId);
      if (receiverMemory) receiverMemory.receiveTick = animationTick;
    }
    previousBallOwnerRef.current = frame.ball.ownerId;

    const drawLimb = (
      a: ScreenPoint,
      joint: ScreenPoint,
      b: ScreenPoint,
      width: number,
      color: string,
      endColor?: string,
    ) => {
      const drawSegment = (
        from: ScreenPoint,
        to: ScreenPoint,
        segmentColor: string,
        segmentWidth: number,
      ) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = segmentWidth + 2.4;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        gradient.addColorStop(0, rgba("#ffffff", 0.17));
        gradient.addColorStop(0.24, segmentColor);
        gradient.addColorStop(1, rgba(segmentColor, 0.76));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = segmentWidth;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(0.7, segmentWidth * 0.16);
        ctx.beginPath();
        ctx.moveTo(from.x - 0.5, from.y - 0.5);
        ctx.lineTo(to.x - 0.5, to.y - 0.5);
        ctx.stroke();
        ctx.restore();
      };

      drawSegment(a, joint, color, width);
      drawSegment(joint, b, endColor ?? color, Math.max(2, width * 0.84));

      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, Math.max(1.8, width * 0.48), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const drawShoe = (
      foot: ScreenPoint,
      knee: ScreenPoint,
      radius: number,
      color: string,
    ) => {
      const angle = Math.atan2(foot.y - knee.y, foot.x - knee.x) + Math.PI / 2;
      ctx.save();
      ctx.translate(foot.x, foot.y);
      ctx.rotate(angle);
      ctx.fillStyle = "#17191d";
      ctx.strokeStyle = "rgba(0,0,0,0.62)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.08, radius * 0.32, radius * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(color, 0.82);
      ctx.fillRect(-radius * 0.18, radius * 0.02, radius * 0.36, radius * 0.05);
      ctx.restore();
    };

    for (const [playerIndex, p] of players.entries()) {
      const ground = view.project(p.position);
      const isPlayerTeam = p.teamId === "player";
      const isSelected = p.id === selectedPlayerId;
      const isGK = p.role === "goalkeeper";
      const baseColor = isPlayerTeam ? playerTeam.jerseyColor : aiTeamColor;
      const secColor = isPlayerTeam ? playerTeam.secondaryColor : aiTeamSecondaryColor;
      const kitStyle = isPlayerTeam ? playerKitStyle : resolvedAiKitStyle;
      const sleeveStyle = isPlayerTeam ? playerSleeveStyle : resolvedAiSleeveStyle;
      const leftSleeveColor = sleeveStyle === "secondary" ? secColor : baseColor;
      const rightSleeveColor = sleeveStyle === "secondary" || sleeveStyle === "split"
        ? secColor
        : baseColor;
      const skin = p.appearance?.skinTone ?? "#c98b6b";
      const hair = p.appearance?.hairColor ?? "#211915";
      const ringColor = isSelected
        ? "#00e5ff"
        : frame.ball.ownerId === p.id
          ? "#ffd700"
          : rgba(baseColor, 0.9);
      const r = view.radius(isGK ? PLAYER_RADIUS + 3 : PLAYER_RADIUS, p.position.y);
      const seed = hashUnit(p.id);
      const speed = Math.hypot(p.velocity.x, p.velocity.y);
      const diving = p.state === "DIVING";
      const moving = !diving && speed > 4 && (p.state === "MOVING" || p.state === "DRIBBLING");
      const dribbling = moving && p.state === "DRIBBLING";
      const contesting = p.state === "CONTESTING";
      const recovering = p.state === "RECOVERING";
      const ownsBall = frame.ball.ownerId === p.id;

      let memory = playerAnimMemoryRef.current.get(p.id);
      if (!memory) {
        const attackTarget = view.project({
          x: p.position.x + (p.teamId === "player" ? TILE_W : -TILE_W),
          y: p.position.y,
        });
        memory = {
          facing: Math.atan2(attackTarget.y - ground.y, attackTarget.x - ground.x),
          state: p.state,
          stateTick: animationTick,
          receiveTick: -9999,
          actionTick: -9999,
        };
        playerAnimMemoryRef.current.set(p.id, memory);
      }
      if (memory.state !== p.state) {
        memory.state = p.state;
        memory.stateTick = animationTick;
      }

      // Simulation snapshots can leave PASSING immediately after contact. Keep
      // the visual action alive long enough to show anticipation, contact,
      // follow-through and recovery instead of flashing for a single frame.
      if (p.state === "PASSING") {
        const nextKind = p.actionPassStyle === "long" ? "longPass" : "pass";
        if (memory.actionKind !== nextKind || memory.actionTick < animationTick - 28) {
          memory.actionKind = nextKind;
          memory.actionTick = animationTick;
        }
      } else if (p.state === "SHOOTING") {
        if (memory.actionKind !== "shot" || memory.actionTick < animationTick - 30) {
          memory.actionKind = "shot";
          memory.actionTick = animationTick;
        }
      }

      const directionTarget = p.actionTarget
        ? view.project(p.actionTarget)
        : speed > 2
          ? view.project({
              x: p.position.x + p.velocity.x,
              y: p.position.y + p.velocity.y,
            })
          : view.project({
              x: p.position.x + (p.teamId === "player" ? TILE_W : -TILE_W),
              y: p.position.y,
            });
      const desiredFacing = Math.atan2(
        directionTarget.y - ground.y,
        directionTarget.x - ground.x,
      );
      memory.facing += angleDelta(memory.facing, desiredFacing) * (moving ? 0.24 : 0.13);

      const stateAge = (animationTick - memory.stateTick + 100000) % 100000;
      const receiveAge = (animationTick - memory.receiveTick + 100000) % 100000;
      const actionAge = (animationTick - memory.actionTick + 100000) % 100000;
      const actionDurationTicks = memory.actionKind === "shot" ? 27 : memory.actionKind === "longPass" ? 28 : 24;
      const actionActive = actionAge <= actionDurationTicks;
      const passing = actionActive && (memory.actionKind === "pass" || memory.actionKind === "longPass");
      const shooting = actionActive && memory.actionKind === "shot";
      const longPass = actionActive && memory.actionKind === "longPass";
      const receiving = ownsBall && speed < 7 && receiveAge < 17 && !passing && !shooting;
      const receiveProgress = clamp(receiveAge / 16, 0, 1);
      const receiveCushion = receiving ? phaseEnvelope(receiveProgress, 0, 0.34, 1) : 0;

      const velocityNorm = clamp(speed / 190, 0, 1);
      const runCadence = 0.66 + velocityNorm * 0.82;
      const t = animationTick * runCadence * 0.31 + playerIndex * 0.73 + seed * 4.7;
      const gait = moving ? Math.sin(t * Math.PI) : 0;
      const stridePulse = moving ? Math.abs(Math.sin(t * Math.PI)) : 0;
      const idleBreath = Math.sin(animationTick * 0.095 + seed * 8.4);
      const headScan = Math.sin(animationTick * 0.043 + seed * 11.2);
      const callForBall =
        moving &&
        !ownsBall &&
        !passing &&
        !shooting &&
        Math.sin(animationTick * 0.072 + seed * 24) > 0.88;

      const actionProgress = passing || shooting
        ? clamp(actionAge / Math.max(1, actionDurationTicks), 0, 1)
        : 0;
      const anticipation = smooth01(clamp(actionProgress / 0.34, 0, 1));
      const contact = phaseEnvelope(actionProgress, 0.26, 0.48, 0.66);
      const followThrough = smooth01(clamp((actionProgress - 0.44) / 0.34, 0, 1));
      const recovery = smooth01(clamp((actionProgress - 0.74) / 0.26, 0, 1));

      const diveProgress = diving
        ? p.stateTimer != null
          ? clamp(1 - p.stateTimer / 0.46, 0, 1)
          : clamp(stateAge / 20, 0, 1)
        : 0;
      const divePreload = 1 - smooth01(clamp(diveProgress / 0.16, 0, 1));
      const diveLaunch = smooth01(clamp((diveProgress - 0.1) / 0.28, 0, 1));
      const diveHang = phaseEnvelope(diveProgress, 0.26, 0.53, 0.76);
      const diveLanding = smooth01(clamp((diveProgress - 0.66) / 0.24, 0, 1));
      const diveRecover = smooth01(clamp((diveProgress - 0.86) / 0.14, 0, 1));

      const facingX = Math.cos(memory.facing);
      const facingY = Math.sin(memory.facing);
      const mirror = facingX < 0 ? -1 : 1;
      const stanceWidth = isGK && !moving ? 1.18 : 1;
      const runLean = moving ? 0.08 + velocityNorm * 0.12 : 0;
      const actionLean = shooting
        ? -0.18 * anticipation + 0.17 * followThrough
        : longPass
          ? -0.14 * anticipation + 0.11 * followThrough
          : passing
            ? -0.06 * anticipation + 0.1 * followThrough
            : 0;
      const contestLean = contesting ? 0.16 : 0;
      const stumble = recovering ? Math.sin(Math.min(1, stateAge / 18) * Math.PI) : 0;
      const crouch =
        (isGK && !moving && !diving ? r * 0.12 : 0) +
        (contesting ? r * 0.1 : 0) +
        (receiving ? r * 0.1 * receiveCushion : 0) +
        (diving ? r * 0.28 * divePreload : 0);
      const bob = moving
        ? stridePulse * r * (0.045 + velocityNorm * 0.045)
        : idleBreath * r * 0.018;
      const diveLift = diving
        ? (Math.sin(Math.PI * clamp((diveProgress - 0.08) / 0.82, 0, 1)) * r * 0.82 + diveHang * r * 0.16)
        : 0;
      const bodyAngle = diving
        ? memory.facing + Math.PI / 2 + diveLanding * mirror * 0.08
        : mirror * (runLean + actionLean + contestLean) + stumble * mirror * 0.08;

      const hipOrigin = {
        x:
          ground.x +
          facingX * r * (moving ? velocityNorm * 0.08 : 0) +
          (diving ? facingX * r * (0.18 + diveLaunch * 0.44) : 0),
        y:
          ground.y -
          r * 0.08 -
          bob +
          crouch -
          diveLift +
          (diving ? facingY * r * (0.18 + diveLaunch * 0.44) : 0),
      };
      const cosBody = Math.cos(bodyAngle);
      const sinBody = Math.sin(bodyAngle);
      const world = (localX: number, localY: number): ScreenPoint => {
        const x = localX * mirror;
        return {
          x: hipOrigin.x + x * cosBody - localY * sinBody,
          y: hipOrigin.y + x * sinBody + localY * cosBody,
        };
      };

      const kickSide = seed > 0.5 ? 1 : -1;
      const baseStride = gait * r * (0.38 + velocityNorm * 0.3) * (dribbling ? 0.76 : 1);
      const kneeLiftLeft = Math.max(0, gait) * r * (0.08 + velocityNorm * 0.2);
      const kneeLiftRight = Math.max(0, -gait) * r * (0.08 + velocityNorm * 0.2);
      const windup = anticipation * (1 - contact);
      const strike = contact + followThrough * (1 - recovery);
      const actionScale = shooting ? 1.24 : longPass ? 1.16 : passing ? 1.02 : 0.7;
      const actionKick = (-windup * 0.48 + strike * 1.3 - recovery * 0.28) * r * actionScale;
      const passSweep = passing && !longPass
        ? (-windup * 0.22 + contact * 0.52 + followThrough * 0.34) * r
        : 0;
      const longLift = longPass ? (anticipation * 0.16 + contact * 0.34) * r : 0;
      const receiveKick = receiveCushion * r * 0.46;
      const leftAction = kickSide < 0 ? actionKick + receiveKick : 0;
      const rightAction = kickSide > 0 ? actionKick + receiveKick : 0;

      const hipHalf = r * 0.29 * stanceWidth;
      const shoulderHalf = r * (isGK ? 0.52 : 0.46);
      const torsoHeight = r * 0.94;
      const headR = r * 0.37;
      const leftHip = world(-hipHalf, 0);
      const rightHip = world(hipHalf, 0);
      const leftShoulder = world(-shoulderHalf, -torsoHeight);
      const rightShoulder = world(shoulderHalf, -torsoHeight);

      let leftKnee = world(
        -hipHalf + baseStride * 0.55 - leftAction * 0.16 + (kickSide < 0 ? passSweep * 0.18 : 0),
        r * 0.58 - kneeLiftLeft - Math.max(0, leftAction) * 0.28 - (kickSide < 0 ? longLift * 0.22 : 0),
      );
      let rightKnee = world(
        hipHalf - baseStride * 0.55 + rightAction * 0.16 - (kickSide > 0 ? passSweep * 0.18 : 0),
        r * 0.58 - kneeLiftRight - Math.max(0, rightAction) * 0.28 - (kickSide > 0 ? longLift * 0.22 : 0),
      );
      let leftFoot = world(
        -hipHalf + baseStride - leftAction * 0.34 + (kickSide < 0 ? passSweep * 0.55 : 0),
        r * 1.18 - kneeLiftLeft * 0.42 - Math.abs(leftAction) * 0.22 - (kickSide < 0 ? longLift : 0),
      );
      let rightFoot = world(
        hipHalf - baseStride + rightAction * 0.34 - (kickSide > 0 ? passSweep * 0.55 : 0),
        r * 1.18 - kneeLiftRight * 0.42 - Math.abs(rightAction) * 0.22 - (kickSide > 0 ? longLift : 0),
      );

      if (diving) {
        const trail = r * (0.16 + diveLaunch * 0.3);
        leftKnee = world(-hipHalf * 0.8, r * 0.62 + trail);
        rightKnee = world(hipHalf * 0.8, r * 0.69 + trail * 0.72);
        leftFoot = world(-hipHalf * 1.04, r * 1.18 + trail);
        rightFoot = world(hipHalf * 1.02, r * 1.23 + trail * 0.82);
      }

      const runArm = moving ? -baseStride * 0.72 : idleBreath * r * 0.025;
      const armOpen = passing
        ? (anticipation * 0.34 + followThrough * 0.18) * r
        : shooting
          ? anticipation * r * 0.42
          : 0;
      const brace = contesting ? r * 0.42 : 0;
      const gkReady = isGK && !moving && !diving ? r * 0.3 : 0;
      const pointArm = callForBall ? r * 0.72 : 0;
      let leftElbow = world(
        -shoulderHalf - r * 0.2 - runArm - brace - armOpen,
        -torsoHeight + r * 0.42 - gkReady - pointArm,
      );
      let rightElbow = world(
        shoulderHalf + r * 0.2 + runArm + brace + armOpen,
        -torsoHeight + r * 0.42 - gkReady,
      );
      let leftHand = world(
        -shoulderHalf - r * 0.34 - runArm * 1.2 - brace - armOpen,
        -torsoHeight + r * 0.78 - gkReady * 0.7 - pointArm * 1.15,
      );
      let rightHand = world(
        shoulderHalf + r * 0.34 + runArm * 1.2 + brace + armOpen,
        -torsoHeight + r * 0.78 - gkReady * 0.7,
      );

      if (diving) {
        const extension = r * (0.58 + diveLaunch * 0.92 + diveHang * 0.18);
        leftElbow = world(-shoulderHalf * 0.65, -torsoHeight - extension * 0.46);
        rightElbow = world(shoulderHalf * 0.65, -torsoHeight - extension * 0.42);
        leftHand = world(-shoulderHalf * 0.72, -torsoHeight - extension);
        rightHand = world(shoulderHalf * 0.72, -torsoHeight - extension * 0.96);
      }

      const ballLook = view.project(frame.ball.position);
      const lookDirection = clamp((ballLook.x - ground.x) / Math.max(1, r * 5), -1, 1);
      const neck = world(
        lookDirection * r * 0.05 + headScan * r * 0.018,
        -torsoHeight - r * 0.22,
      );
      const head = world(
        lookDirection * r * 0.09 + headScan * r * 0.026,
        -torsoHeight - r * 0.22 - headR * 0.94,
      );

      const shadowStretch = diving ? 1.55 : moving ? 1.06 + velocityNorm * 0.16 : 1;
      ctx.save();
      ctx.globalAlpha = diving ? 0.2 : 0.27;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(
        ground.x + facingX * r * 0.12,
        ground.y + r * 0.56,
        r * 1.05 * shadowStretch,
        r * (diving ? 0.24 : 0.3),
        memory.facing,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = isSelected ? 3.5 : 2.1;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = isSelected || ownsBall ? 12 : 3;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y + r * 0.48, r * 1.08, r * 0.36, -0.05, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      drawLimb(leftHip, leftKnee, leftFoot, Math.max(3.2, r * 0.2), "#242424", secColor);
      drawLimb(rightHip, rightKnee, rightFoot, Math.max(3.2, r * 0.2), "#242424", secColor);
      drawShoe(leftFoot, leftKnee, r, secColor);
      drawShoe(rightFoot, rightKnee, r, secColor);
      drawLimb(leftShoulder, leftElbow, leftHand, Math.max(3, r * 0.18), leftSleeveColor, skin);
      drawLimb(rightShoulder, rightElbow, rightHand, Math.max(3, r * 0.18), rightSleeveColor, skin);

      const torsoTopLeft = world(-shoulderHalf, -torsoHeight - r * 0.08);
      const torsoTopRight = world(shoulderHalf, -torsoHeight - r * 0.08);
      const torsoBottomRight = world(hipHalf + r * 0.08, r * 0.04);
      const torsoBottomLeft = world(-hipHalf - r * 0.08, r * 0.04);
      const torsoCenter = world(0, -torsoHeight * 0.48);
      const traceTorso = () => {
        ctx.beginPath();
        ctx.moveTo(torsoTopLeft.x, torsoTopLeft.y);
        ctx.quadraticCurveTo(
          torsoCenter.x,
          torsoCenter.y - r * 0.6,
          torsoTopRight.x,
          torsoTopRight.y,
        );
        ctx.lineTo(torsoBottomRight.x, torsoBottomRight.y);
        ctx.quadraticCurveTo(
          torsoCenter.x,
          torsoCenter.y + r * 0.62,
          torsoBottomLeft.x,
          torsoBottomLeft.y,
        );
        ctx.closePath();
      };

      const jerseyGrad = ctx.createLinearGradient(
        torsoTopLeft.x,
        torsoTopLeft.y,
        torsoBottomRight.x,
        torsoBottomRight.y,
      );
      jerseyGrad.addColorStop(0, rgba("#ffffff", 0.23));
      jerseyGrad.addColorStop(0.22, baseColor);
      jerseyGrad.addColorStop(1, rgba(baseColor, 0.69));
      ctx.save();
      ctx.fillStyle = jerseyGrad;
      traceTorso();
      ctx.fill();
      ctx.restore();

      if (kitStyle !== "solid") {
        const minX = Math.min(torsoTopLeft.x, torsoTopRight.x, torsoBottomLeft.x, torsoBottomRight.x);
        const maxX = Math.max(torsoTopLeft.x, torsoTopRight.x, torsoBottomLeft.x, torsoBottomRight.x);
        const minY = Math.min(torsoTopLeft.y, torsoTopRight.y, torsoBottomLeft.y, torsoBottomRight.y);
        const maxY = Math.max(torsoTopLeft.y, torsoTopRight.y, torsoBottomLeft.y, torsoBottomRight.y);
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);

        ctx.save();
        traceTorso();
        ctx.clip();
        ctx.fillStyle = rgba(secColor, 0.9);

        if (kitStyle === "vertical-stripes") {
          const stripeWidth = width / 5;
          for (let stripe = 0; stripe < 5; stripe += 2) {
            ctx.fillRect(minX + stripe * stripeWidth, minY - 2, stripeWidth, height + 4);
          }
        } else if (kitStyle === "horizontal-stripes") {
          const bandHeight = height / 5;
          for (let band = 1; band < 5; band += 2) {
            ctx.fillRect(minX - 2, minY + band * bandHeight, width + 4, bandHeight);
          }
        } else if (kitStyle === "diagonal-sash") {
          const sash = Math.max(r * 0.3, width * 0.28);
          ctx.translate(torsoCenter.x, torsoCenter.y);
          ctx.rotate(bodyAngle - 0.62);
          ctx.fillRect(-sash / 2, -height, sash, height * 2);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = isGK ? "#ffd700" : "rgba(0,0,0,.55)";
      ctx.lineWidth = isGK ? 2.2 : 1.25;
      traceTorso();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = secColor;
      ctx.strokeStyle = "rgba(0,0,0,.48)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(torsoBottomLeft.x, torsoBottomLeft.y - r * 0.06);
      ctx.lineTo(torsoBottomRight.x, torsoBottomRight.y - r * 0.06);
      ctx.lineTo(rightHip.x + r * 0.12, rightHip.y + r * 0.25);
      ctx.lineTo(hipOrigin.x, hipOrigin.y + r * 0.18);
      ctx.lineTo(leftHip.x - r * 0.12, leftHip.y + r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = skin;
      ctx.lineWidth = Math.max(2.5, r * 0.17);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(torsoCenter.x, torsoCenter.y - r * 0.42);
      ctx.lineTo(neck.x, neck.y);
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.strokeStyle = "rgba(0,0,0,.45)";
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p.appearance?.hairStyle !== "bald") {
        ctx.fillStyle = hair;
        ctx.beginPath();
        ctx.arc(head.x, head.y - headR * 0.18, headR * 0.92, Math.PI, Math.PI * 2);
        ctx.lineTo(head.x + headR * 0.82, head.y - headR * 0.02);
        ctx.quadraticCurveTo(head.x, head.y - headR * 0.62, head.x - headR * 0.82, head.y - headR * 0.02);
        ctx.closePath();
        ctx.fill();
      }
      // A tiny directional face mark keeps the head from reading as a blank circle.
      ctx.fillStyle = "rgba(50,29,22,0.62)";
      ctx.beginPath();
      ctx.arc(head.x + mirror * headR * 0.3, head.y - headR * 0.02, Math.max(0.7, headR * 0.07), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(torsoCenter.x, torsoCenter.y);
      ctx.rotate(bodyAngle);
      ctx.fillStyle = secColor;
      ctx.font = `900 ${Math.max(8, Math.round(r * 0.48))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.jerseyNumber), 0, 0);
      ctx.restore();

      const nameW = clamp(r * 3.2, 30, 56);
      const nameH = clamp(r * 0.68, 9, 13);
      const nameY = head.y - headR * 1.75;
      ctx.save();
      ctx.fillStyle = "rgba(4,8,15,.78)";
      roundedRectPath(ctx, head.x - nameW / 2, nameY, nameW, nameH, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.max(7, Math.round(nameH * 0.56))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.name.slice(0, 10), head.x, nameY + nameH / 2);
      ctx.restore();

      if (p.offside) {
        const fw = r * 1.05;
        const fh = r * 0.58;
        ctx.save();
        ctx.fillStyle = "#ff1744";
        roundedRectPath(ctx, head.x + r * 0.72, nameY, fw, fh, 3);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${Math.round(fh * 0.55)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("OS", head.x + r * 0.72 + fw / 2, nameY + fh / 2);
        ctx.restore();
      }
    }
    // Refined, text-free duel feedback. Effects stay compact and directional:
    // a soft compression wave for physical wins and a clean motion ribbon for
    // successful dribbles. No comic bursts, stars or floating labels.
    for (const effect of frame.duelEffects ?? []) {
      const origin = view.project(effect.position);
      const directionPoint = view.project({
        x: effect.position.x + effect.direction.x * TILE_W * 0.55,
        y: effect.position.y + effect.direction.y * TILE_H * 0.55,
      });
      const angle = Math.atan2(directionPoint.y - origin.y, directionPoint.x - origin.x);
      const progress = clamp(effect.progress, 0, 1);
      const easedOut = 1 - Math.pow(1 - progress, 3);
      const easedInOut = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const alpha = Math.pow(1 - progress, 1.8);
      const size = view.radius(8 + effect.intensity * 9, effect.position.y);

      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(angle);
      ctx.globalCompositeOperation = "lighter";

      if (effect.kind === "outmuscled") {
        // A compressed pair of curved pressure waves opens away from contact.
        // The blurred under-layer gives depth; the crisp inner line keeps it
        // readable without looking like a retro comic-book impact graphic.
        const opening = size * (0.18 + easedOut * 0.82);
        const waveHeight = size * (0.55 + effect.intensity * 0.18);
        const stroke = Math.max(1.2, size * 0.09);
        const waveGradient = ctx.createLinearGradient(-opening, 0, opening, 0);
        waveGradient.addColorStop(0, "rgba(255,118,70,0)");
        waveGradient.addColorStop(0.35, `rgba(255,151,84,${0.55 * alpha})`);
        waveGradient.addColorStop(0.68, `rgba(255,215,132,${0.8 * alpha})`);
        waveGradient.addColorStop(1, "rgba(255,238,190,0)");

        const drawPressureWave = (offset: number, blur: number, widthScale: number) => {
          ctx.save();
          ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
          ctx.strokeStyle = waveGradient;
          ctx.lineWidth = stroke * widthScale;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-opening * 0.9, offset);
          ctx.bezierCurveTo(
            -opening * 0.2,
            offset - waveHeight,
            opening * 0.55,
            offset - waveHeight * 0.38,
            opening,
            offset,
          );
          ctx.stroke();
          ctx.restore();
        };

        drawPressureWave(size * 0.13, 5, 2.4);
        drawPressureWave(size * 0.13, 0, 1);

        ctx.save();
        ctx.globalAlpha = alpha * 0.72;
        ctx.strokeStyle = "rgba(255,230,184,0.9)";
        ctx.lineWidth = Math.max(1, stroke * 0.7);
        ctx.beginPath();
        ctx.ellipse(
          -size * 0.03,
          size * 0.08,
          size * (0.18 + easedOut * 0.18),
          size * (0.08 + easedOut * 0.07),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();

        // A few tiny fading motes suggest turf/contact without becoming noisy.
        for (let mote = 0; mote < 3; mote += 1) {
          const phase = (mote + 1) / 4;
          const distance = size * (0.28 + easedOut * (0.45 + phase * 0.28));
          const y = size * (0.18 + (mote - 1) * 0.18);
          ctx.globalAlpha = alpha * (0.46 - mote * 0.08);
          ctx.fillStyle = mote === 1 ? "rgba(255,210,144,0.9)" : "rgba(255,139,82,0.85)";
          ctx.beginPath();
          ctx.arc(distance, y, Math.max(0.8, size * (0.045 - mote * 0.006)), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // A narrow ribbon follows the successful dribbler's exit line. The
        // effect moves forward as it fades, reading as footwork rather than an
        // explosion at the defender.
        const travel = size * easedOut * 0.72;
        ctx.translate(travel, 0);
        const ribbonLength = size * (1.05 + effect.intensity * 0.34);
        const ribbonHeight = size * (0.38 + effect.intensity * 0.12);
        const ribbonGradient = ctx.createLinearGradient(-ribbonLength, 0, ribbonLength, 0);
        ribbonGradient.addColorStop(0, "rgba(58,214,226,0)");
        ribbonGradient.addColorStop(0.35, `rgba(64,225,220,${0.38 * alpha})`);
        ribbonGradient.addColorStop(0.72, `rgba(154,250,239,${0.78 * alpha})`);
        ribbonGradient.addColorStop(1, "rgba(216,255,250,0)");

        const drawRibbon = (verticalOffset: number, blur: number, width: number) => {
          ctx.save();
          ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
          ctx.strokeStyle = ribbonGradient;
          ctx.lineWidth = width;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-ribbonLength * 0.72, verticalOffset + ribbonHeight * 0.28);
          ctx.bezierCurveTo(
            -ribbonLength * 0.26,
            verticalOffset - ribbonHeight,
            ribbonLength * 0.2,
            verticalOffset + ribbonHeight * 0.55,
            ribbonLength * 0.82,
            verticalOffset - ribbonHeight * 0.16,
          );
          ctx.stroke();
          ctx.restore();
        };

        drawRibbon(0, 5, Math.max(3, size * 0.24));
        drawRibbon(0, 0, Math.max(1.25, size * 0.09));
        drawRibbon(size * 0.24, 0, Math.max(0.8, size * 0.052));

        // Two restrained lens-like glints replace the old rotating stars.
        for (let glint = 0; glint < 2; glint += 1) {
          const gx = ribbonLength * (0.18 + glint * 0.38);
          const gy = ribbonHeight * (-0.45 + glint * 0.72);
          const glintRadius = size * (0.055 + (1 - easedInOut) * 0.025);
          ctx.globalAlpha = alpha * (0.7 - glint * 0.14);
          ctx.fillStyle = glint === 0 ? "rgba(201,255,249,0.95)" : "rgba(90,224,235,0.85)";
          ctx.beginPath();
          ctx.arc(gx, gy, glintRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    const visualBall = frame.ball as typeof frame.ball & {
      height?: number;
      passStyle?: string;
    };

    let ballGround = view.project(frame.ball.position);
    if (frame.ball.ownerId && phase === "simulating") {
      const owner = frame.players.find((player) => player.id === frame.ball.ownerId);
      const memory = playerAnimMemoryRef.current.get(frame.ball.ownerId);
      if (owner && memory) {
        const ownerGround = view.project(owner.position);
        const ownerRadius = view.radius(
          owner.role === "goalkeeper" ? PLAYER_RADIUS + 3 : PLAYER_RADIUS,
          owner.position.y,
        );
        const ownerSpeed = Math.hypot(owner.velocity.x, owner.velocity.y);
        const touchingBall =
          ownerSpeed > 4 &&
          (owner.state === "MOVING" || owner.state === "DRIBBLING");
        const cadence = animationTick * (0.22 + clamp(ownerSpeed / 190, 0, 1) * 0.16) + hashUnit(owner.id) * 5;
        const touch = touchingBall ? Math.sin(cadence * Math.PI) : 0;
        ballGround = {
          x:
            ownerGround.x +
            Math.cos(memory.facing) * ownerRadius * (0.56 + Math.max(0, touch) * 0.18) +
            Math.sin(memory.facing) * ownerRadius * 0.22 * touch,
          y:
            ownerGround.y +
            Math.sin(memory.facing) * ownerRadius * (0.34 + Math.max(0, touch) * 0.12) +
            ownerRadius * 0.42,
        };
      }
    }
    const bv = frame.ball.velocity;
    const spd = Math.sqrt(bv.x * bv.x + bv.y * bv.y);
    const ballHeight = visualBall.height ?? 0;
    const lift = view.radius(ballHeight * 1.15, frame.ball.position.y);
    const ballPos = {
      x: ballGround.x,
      y: ballGround.y - lift,
    };

    const isLongBall = visualBall.passStyle === "long" && ballHeight > 1;
    const br = view.radius(
      isLongBall ? BALL_RADIUS * 1.18 : BALL_RADIUS,
      frame.ball.position.y,
    );

    if (phase === "simulating" && spd > 25) {
      const trailGround = view.project({
        x: frame.ball.position.x - bv.x * 0.08,
        y: frame.ball.position.y - bv.y * 0.08,
      });

      ctx.save();
      ctx.globalAlpha = 0.85;

      const grad = ctx.createLinearGradient(
        trailGround.x,
        trailGround.y,
        ballPos.x,
        ballPos.y,
      );
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(
        1,
        isLongBall ? "rgba(0,229,255,0.62)" : "rgba(255,255,255,0.38)",
      );

      ctx.strokeStyle = grad;
      ctx.lineWidth = isLongBall ? br * 1.15 : br * 0.8;
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(trailGround.x, trailGround.y - lift * 0.45);
      ctx.lineTo(ballPos.x, ballPos.y);
      ctx.stroke();

      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = isLongBall ? 0.22 : 0.3;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(
      ballGround.x,
      ballGround.y + br * 0.55,
      br * 1.35,
      br * 0.45,
      -0.1,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = isLongBall ? "#00e5ff" : "#ffffff";
    ctx.shadowBlur = isLongBall ? 18 : 10;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = isLongBall ? "#00e5ff" : "#222";
    ctx.lineWidth = isLongBall ? 2.5 : 1.5;

    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, br * 0.58, 0.2, Math.PI * 1.25);
    ctx.stroke();

    ctx.restore();
  }, [
    frame,
    playerTeam,
    aiTeamColor,
    aiTeamSecondaryColor,
    aiTeamKitStyle,
    aiTeamSleeveStyle,
    pendingCommands,
    selectedPlayerId,
    passTargetMode,
    curveDraft,
    phase,
    isVertical,
    buildTileMap,
    animationTick,
  ]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      if (phase !== "planning") return;

      const pos = canvasToPitch(e.clientX, e.clientY);
      const selectableTeam = activePlanningTeam ?? "player";

      if (curveControlMode && selectedPlayerId && onCurvePointClick) {
        onCurvePointClick(pos);
        return;
      }

      if (frame) {
        for (const p of frame.players) {
          const isGK = p.role === "goalkeeper";
          const hitR = PLAYER_RADIUS + (isGK ? 4 : 2) + 8;
          const d = Math.sqrt(
            (p.position.x - pos.x) ** 2 + (p.position.y - pos.y) ** 2,
          );

          if (d < hitR && p.teamId === selectableTeam) {
            onPlayerClick(p.id, pos);
            return;
          }
        }
      }

      if (!selectedPlayerId || !frame) return;

      const selPlayer = frame.players.find((p) => p.id === selectedPlayerId);

      if (!selPlayer) return;
      if (selPlayer.teamId !== selectableTeam) return;

      // FTA_PASS_INTO_NET_V2
      const insideGoalDepth =
        (pos.x < 0 || pos.x > PITCH_WIDTH) &&
        pos.y >= GOAL_TOP_Y &&
        pos.y <= GOAL_TOP_Y + GOAL_WIDTH;

      if (passTargetMode && insideGoalDepth) {
        onTileClick(
          {
            x: clamp(pos.x, -GOAL_DEPTH + BALL_RADIUS, PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS),
            y: clamp(pos.y, GOAL_TOP_Y + BALL_RADIUS, GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS),
          },
          false,
        );
        return;
      }

      const clickedCol = clamp(Math.floor(pos.x / TILE_W), 0, GRID_COLS - 1);
      const clickedRow = clamp(Math.floor(pos.y / TILE_H), 0, GRID_ROWS - 1);
      const selTile = posToTile(selPlayer.position);

      if (clickedCol === selTile.col && clickedRow === selTile.row) return;

      if (!passTargetMode) {
        const isGK = selPlayer.role === "goalkeeper";
        const range = selPlayer.tileRange;
        const reachable = getReachableTiles(
          selTile.col,
          selTile.row,
          range,
          isGK,
          selPlayer.teamId,
        );
        const isReachable = reachable.some(
          (t) => t.col === clickedCol && t.row === clickedRow,
        );

        if (!isReachable) return;
      }

      const occupant = frame.players.find((p) => {
        const t = posToTile(p.position);
        return t.col === clickedCol && t.row === clickedRow;
      });

      if (occupant?.teamId === selectableTeam && occupant.id !== selectedPlayerId) {
        return;
      }

      const isEnemy =
        occupant?.teamId !== undefined && occupant.teamId !== selectableTeam;
      const tileCenter = tileToPos(clickedCol, clickedRow);

      onTileClick(tileCenter, isEnemy);
    },
    [
      phase,
      frame,
      selectedPlayerId,
      canvasToPitch,
      onPlayerClick,
      onTileClick,
      passTargetMode,
      curveControlMode,
      onCurvePointClick,
      activePlanningTeam,
    ],
  );

  return (
    <canvas
      ref={canvasRef}
      width={isVertical ? PITCH_HEIGHT : PITCH_WIDTH}
      height={isVertical ? PITCH_WIDTH : PITCH_HEIGHT}
      className="w-full h-full cursor-pointer rounded-none sm:rounded-lg"
      style={{
        imageRendering: "auto",
        background: "#255c33",
      }}
      onClick={handleClick}
    />
  );
}
