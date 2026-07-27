import { useRef, useEffect, useCallback, useState } from "react";
import type { MouseEvent } from "react";
import type { FrameSnapshot, TeamConfig, Vec2, Command, KitStyle, SleeveStyle } from "../engine/types";
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
import {
  drawAnimatedPlayerSprite,
  getPossessionBallOffset,
} from "./render/AnimatedPlayerSprite";
import {
  deriveKitStyle,
  deriveSleeveStyle,
  normalizeKitStyle,
  normalizeSleeveStyle,
} from "../game/visuals";

const PLAYER_VISUAL_SCALE = 1.12;

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
  phase: "planning" | "simulating" | "finished";
  isVertical?: boolean;
  activePlanningTeam?: "player" | "ai";
  onPlayerClick: (playerId: string, pos: Vec2) => void;
  onTileClick: (pos: Vec2, isEnemyTile: boolean) => void;
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
  const baseH = isVertical ? PITCH_WIDTH : PITCH_HEIGHT;

  // Slightly zoomed out from the previous version.
  // Still angled, but not so close that the outside breaks.
  const CAMERA_ZOOM = isVertical ? 1.00 : 1.08;
  const CAMERA_SHIFT_X = 0;
  const CAMERA_SHIFT_Y = isVertical ? 0.1 : 0.0;

  // Mobile football angle: mostly top-down, slightly rotated.
  const skew = isVertical ? 0 : 0.0;
  const squash = isVertical ? 100 : 0.99;

  const base = (p: Vec2): ScreenPoint =>
    isVertical
      ? {
          x: p.y,
          y: PITCH_WIDTH - p.x,
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
    raw({ x: 0, y: 0 }),
    raw({ x: PITCH_WIDTH, y: 0 }),
    raw({ x: PITCH_WIDTH, y: PITCH_HEIGHT }),
    raw({ x: 0, y: PITCH_HEIGHT }),
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
          x: PITCH_WIDTH - by,
          y: bx,
        }
      : {
          x: bx,
          y: by,
        };

    return {
      x: clamp(pitch.x, 0, PITCH_WIDTH - 1),
      y: clamp(pitch.y, 0, PITCH_HEIGHT - 1),
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
  phase,
  isVertical = false,
  activePlanningTeam,
  onPlayerClick,
  onTileClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const facingByPlayerRef = useRef<Map<string, number>>(new Map());
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAnimationTick((tick) => (tick + 1) % 100000);
    }, 40);

    return () => window.clearInterval(timer);
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

        const from = view.project(pf.position);

        const drawArrow = (
          fromPos: ScreenPoint,
          toPitch: Vec2,
          color: string,
          dashed = true,
          arc = false,
        ) => {
          const to = view.project(toPitch);

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

          if (arc) {
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

          const ang = Math.atan2(to.y - fromPos.y, to.x - fromPos.x);

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
          drawArrow(from, cmd.targetPosition, "#00e676", true, false);

          if (
            cmd.followUp?.type === CommandType.PASS &&
            cmd.followUp.targetPosition
          ) {
            const to = view.project(cmd.targetPosition);
            drawArrow(to, cmd.followUp.targetPosition, "#ff1744", true, true);
          }
        } else if (cmd.type === CommandType.PASS && cmd.targetPosition) {
          drawArrow(from, cmd.targetPosition, "#ffeb3b", true, true);

          if (
            cmd.followUp?.type === CommandType.MOVE &&
            cmd.followUp.targetPosition
          ) {
            drawArrow(from, cmd.followUp.targetPosition, "#ff9800", true, false);
          }
        } else if (cmd.type === CommandType.SHOOT) {
          drawArrow(
            from,
            {
              x: pf.teamId === "player" ? PITCH_WIDTH : 0,
              y: PITCH_HEIGHT / 2,
            },
            "#ff6b35",
            true,
            true,
          );
        }
      });
    }

    const animationTime = animationTick * 0.04;
    const playerKitStyle = normalizeKitStyle(playerTeam.kitStyle);
    const playerSleeveStyle = normalizeSleeveStyle(playerTeam.sleeveStyle);
    const opponentKitStyle = normalizeKitStyle(
      aiTeamKitStyle ?? deriveKitStyle(`${aiTeamColor}:${aiTeamSecondaryColor}`),
    );
    const opponentSleeveStyle = normalizeSleeveStyle(
      aiTeamSleeveStyle ?? deriveSleeveStyle(`${aiTeamColor}:${aiTeamSecondaryColor}`),
    );

    const players = [...frame.players].sort(
      (a, b) => view.project(a.position).y - view.project(b.position).y,
    );

    for (const p of players) {
      const pos = view.project(p.position);
      const isPlayerTeam = p.teamId === "player";
      const isGK = p.role === "goalkeeper";
      const speed = Math.hypot(p.velocity.x, p.velocity.y);
      const baseColor = isPlayerTeam ? playerTeam.jerseyColor : aiTeamColor;
      const secondaryColor = isPlayerTeam
        ? playerTeam.secondaryColor
        : aiTeamSecondaryColor;
      const kitStyle = isPlayerTeam ? playerKitStyle : opponentKitStyle;
      const sleeveStyle = isPlayerTeam ? playerSleeveStyle : opponentSleeveStyle;
      const r = view.radius(
        (isGK ? PLAYER_RADIUS + 3 : PLAYER_RADIUS) * PLAYER_VISUAL_SCALE,
        p.position.y,
      );

      let facing = facingByPlayerRef.current.get(p.id);
      if (
        (p.state === "PASSING" || p.state === "SHOOTING") &&
        p.actionTarget
      ) {
        const targetPoint = view.project(p.actionTarget);
        const rawAngle = Math.atan2(
          targetPoint.y - pos.y,
          targetPoint.x - pos.x,
        );
        facing = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
        facingByPlayerRef.current.set(p.id, facing);
      } else if (speed > 0.55) {
        const directionPoint = view.project({
          x: p.position.x + p.velocity.x * 0.05,
          y: p.position.y + p.velocity.y * 0.05,
        });
        const rawAngle = Math.atan2(
          directionPoint.y - pos.y,
          directionPoint.x - pos.x,
        );
        facing = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
        facingByPlayerRef.current.set(p.id, facing);
      } else if (facing === undefined) {
        const attackDirection = p.teamId === "player" ? 1 : -1;
        const directionPoint = view.project({
          x: p.position.x + attackDirection * 10,
          y: p.position.y,
        });
        const rawAngle = Math.atan2(
          directionPoint.y - pos.y,
          directionPoint.x - pos.x,
        );
        facing = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
        facingByPlayerRef.current.set(p.id, facing);
      }

      drawAnimatedPlayerSprite({
        ctx,
        x: pos.x,
        y: pos.y,
        radius: r,
        id: p.id,
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        role: p.role,
        state: p.state,
        stateTimer: p.stateTimer,
        actionPassStyle: p.actionPassStyle,
        facing: facing ?? 0,
        time: animationTime,
        speed,
        primaryColor: baseColor,
        secondaryColor,
        kitStyle,
        sleeveStyle,
        appearance: p.appearance,
        selected: p.id === selectedPlayerId,
        ownsBall: frame.ball.ownerId === p.id,
        offside: p.offside,
      });
    }

    const visualBall = frame.ball as typeof frame.ball & {
      height?: number;
      passStyle?: string;
    };

    let ballGround = view.project(frame.ball.position);
    const bv = frame.ball.velocity;
    const spd = Math.sqrt(bv.x * bv.x + bv.y * bv.y);
    const owner = frame.ball.ownerId
      ? frame.players.find((player) => player.id === frame.ball.ownerId)
      : undefined;

    if (owner) {
      const ownerGround = view.project(owner.position);
      const ownerSpeed = Math.hypot(owner.velocity.x, owner.velocity.y);
      const ownerFacing = facingByPlayerRef.current.get(owner.id) ?? 0;
      const ownerRadius = view.radius(
        (owner.role === "goalkeeper" ? PLAYER_RADIUS + 3 : PLAYER_RADIUS) *
          PLAYER_VISUAL_SCALE,
        owner.position.y,
      );
      // Possession touches only animate while the owner is genuinely moving.
      const moving = ownerSpeed > 0.55;
      const offset = getPossessionBallOffset({
        radius: ownerRadius,
        facing: ownerFacing,
        time: animationTime,
        moving,
        dribbling: moving && frame.ball.ownerId === owner.id,
        seed: owner.id,
      });
      ballGround = {
        x: ownerGround.x + offset.x,
        y: ownerGround.y + offset.y,
      };
    }
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
    phase,
    isVertical,
    animationTick,
    buildTileMap,
  ]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      if (phase !== "planning") return;

      const pos = canvasToPitch(e.clientX, e.clientY);
      const selectableTeam = activePlanningTeam ?? "player";

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
      activePlanningTeam,
    ],
  );

  return (
    <canvas
      ref={canvasRef}
      width={isVertical ? PITCH_HEIGHT : PITCH_WIDTH}
      height={isVertical ? PITCH_WIDTH : PITCH_HEIGHT}
      className="w-full h-full cursor-pointer rounded-lg"
      style={{
        imageRendering: "auto",
        background: "#255c33",
      }}
      onClick={handleClick}
    />
  );
}