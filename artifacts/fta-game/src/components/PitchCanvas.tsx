import { useRef, useEffect, useCallback } from "react";
import type { FrameSnapshot, TeamConfig, Vec2, Command } from "../engine/types";
import { CommandType } from "../engine/types";
import {
  PITCH_WIDTH, PITCH_HEIGHT,
  GOAL_WIDTH, GOAL_DEPTH,
  GOAL_TOP_Y,
  PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT,
  PLAYER_RADIUS, BALL_RADIUS,
  TILE_W, TILE_H, GRID_COLS, GRID_ROWS,
} from "../engine/constants";
import { posToTile, getReachableTiles, tileToPos } from "../engine/grid";

interface Props {
  frame: FrameSnapshot | null;
  playerTeam: TeamConfig;
  aiTeamColor?: string;
  aiTeamSecondaryColor?: string;
  pendingCommands: Map<string, Command>;
  selectedPlayerId: string | null;
  passTargetMode: boolean;
  phase: "planning" | "simulating" | "finished";
  onPlayerClick: (playerId: string, pos: Vec2) => void;
  onTileClick: (pos: Vec2, isEnemyTile: boolean) => void;
}

type TileState = "reachable" | "reachable-enemy" | "reachable-friendly" | "current" | "none";

export default function PitchCanvas({
  frame,
  playerTeam,
  aiTeamColor = "#e53935",
  aiTeamSecondaryColor = "#ffffff",
  pendingCommands,
  selectedPlayerId,
  passTargetMode,
  phase,
  onPlayerClick,
  onTileClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const canvasToPitch = useCallback((cx: number, cy: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = PITCH_WIDTH / rect.width;
    const sy = PITCH_HEIGHT / rect.height;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  }, []);

  // Build tile state map for the selected player
  const buildTileMap = useCallback((): Map<string, TileState> => {
    const map = new Map<string, TileState>();
    if (!frame || !selectedPlayerId) return map;

    const selPlayer = frame.players.find(p => p.id === selectedPlayerId);
    if (!selPlayer) return map;

    const pt = posToTile(selPlayer.position);
    const isGK = selPlayer.role === "goalkeeper";
    const range = selPlayer.tileRange;

    // Mark current tile
    map.set(`${pt.col},${pt.row}`, "current");

    // Build occupancy for other players
    const occupancy = new Map<string, "friendly" | "enemy">();
    for (const p of frame.players) {
      if (p.id === selectedPlayerId) continue;
      const t = posToTile(p.position);
      occupancy.set(`${t.col},${t.row}`, p.teamId === "player" ? "friendly" : "enemy");
    }

    // Get all reachable tiles
    const reachable = getReachableTiles(pt.col, pt.row, range, isGK, "player");
    for (const t of reachable) {
      const key = `${t.col},${t.row}`;
      const occ = occupancy.get(key);
      if (occ === "friendly") {
        map.set(key, "reachable-friendly");
      } else if (occ === "enemy") {
        map.set(key, "reachable-enemy");
      } else {
        map.set(key, "reachable");
      }
    }

    return map;
  }, [frame, selectedPlayerId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const sx = W / PITCH_WIDTH;
    const sy = H / PITCH_HEIGHT;
    const tp = (p: Vec2) => ({ x: p.x * sx, y: p.y * sy });
    const tr = (r: number) => r * Math.min(sx, sy);

    ctx.clearRect(0, 0, W, H);

    // Pitch background
    const pitchGrad = ctx.createLinearGradient(0, 0, 0, H);
    pitchGrad.addColorStop(0, "#17422a");
    pitchGrad.addColorStop(0.5, "#1a4d30");
    pitchGrad.addColorStop(1, "#17422a");
    ctx.fillStyle = pitchGrad;
    ctx.fillRect(0, 0, W, H);

    // Stripes
    ctx.globalAlpha = 0.04;
    const stripeW = W / 8;
    for (let i = 0; i < 8; i += 2) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(i * stripeW, 0, stripeW, H);
    }
    ctx.globalAlpha = 1;

    // Field lines
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(55), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(3), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();

    const paW = PENALTY_AREA_WIDTH * sx;
    const paH = PENALTY_AREA_HEIGHT * sy;
    const paY = (H - paH) / 2;
    ctx.strokeRect(0, paY, paW, paH);
    ctx.strokeRect(W - paW, paY, paW, paH);

    // Goals
    const goalW = GOAL_WIDTH * sy;
    const goalD = GOAL_DEPTH * sx;
    const goalY = GOAL_TOP_Y * sy;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.fillRect(0, goalY, goalD, goalW); ctx.strokeRect(0, goalY, goalD, goalW);
    ctx.fillRect(W - goalD, goalY, goalD, goalW); ctx.strokeRect(W - goalD, goalY, goalD, goalW);

    // Tile grid
    const selPlayer = selectedPlayerId ? frame.players.find(p => p.id === selectedPlayerId) : null;
    if (phase === "planning" && selPlayer) {
      const tileMap = buildTileMap();

      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          const tx = col * TILE_W * sx;
          const ty = row * TILE_H * sy;
          const tw = TILE_W * sx;
          const th = TILE_H * sy;
          const key = `${col},${row}`;
          const state = tileMap.get(key) ?? "none";

          if (state === "current") {
            ctx.fillStyle = "rgba(255,220,0,0.22)";
            ctx.fillRect(tx, ty, tw, th);
            ctx.strokeStyle = "rgba(255,220,0,0.7)";
            ctx.lineWidth = 1.5;
          } else if (state === "reachable") {
            ctx.fillStyle = "rgba(0,230,118,0.18)";
            ctx.fillRect(tx, ty, tw, th);
            ctx.strokeStyle = "rgba(0,230,118,0.65)";
            ctx.lineWidth = 1.5;
          } else if (state === "reachable-enemy") {
            ctx.fillStyle = "rgba(255,100,0,0.22)";
            ctx.fillRect(tx, ty, tw, th);
            ctx.strokeStyle = "rgba(255,100,0,0.7)";
            ctx.lineWidth = 1.5;
          } else if (state === "reachable-friendly") {
            ctx.fillStyle = "rgba(120,120,120,0.12)";
            ctx.fillRect(tx, ty, tw, th);
            ctx.strokeStyle = "rgba(120,120,120,0.4)";
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.06)";
            ctx.lineWidth = 0.5;
          }
          ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

          if (state === "reachable-enemy") {
            ctx.fillStyle = "rgba(255,100,0,0.9)";
            ctx.font = `bold ${Math.round(tr(6))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("⚔", tx + tw / 2, ty + 3);
          }
          if (state === "reachable-friendly") {
            ctx.fillStyle = "rgba(160,160,160,0.9)";
            ctx.font = `bold ${Math.round(tr(6))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("✕", tx + tw / 2, ty + 3);
          }
        }
      }
    } else if (phase === "planning" && !selPlayer) {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.5;
      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          ctx.strokeRect(col * TILE_W * sx + 0.5, row * TILE_H * sy + 0.5, TILE_W * sx - 1, TILE_H * sy - 1);
        }
      }
    }

    // Pass mode: show range ring
    if (passTargetMode && selPlayer) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ffeb3b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(tp(selPlayer.position).x, tp(selPlayer.position).y, tr(180), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Pending command arrows
    if (phase === "planning") {
      pendingCommands.forEach((cmd, playerId) => {
        const pf = frame.players.find(p => p.id === playerId);
        if (!pf) return;
        const from = tp(pf.position);

        if (cmd.type === CommandType.MOVE && cmd.targetPosition) {
          const to = tp(cmd.targetPosition);
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = "#00e676";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.55;
          ctx.beginPath(); ctx.arc(to.x, to.y, tr(PLAYER_RADIUS), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (cmd.type === CommandType.PASS && cmd.targetPosition) {
          const to = tp(cmd.targetPosition);
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#ffeb3b";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([7, 4]);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else if (cmd.type === CommandType.SHOOT) {
          const goalX = W;
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#ff6b35";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(goalX, H / 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      });
    }

    // Players
    for (const p of frame.players) {
      const pos = tp(p.position);
      const isPlayerTeam = p.teamId === "player";
      const isSelected = p.id === selectedPlayerId;
      const isGK = p.role === "goalkeeper";

      const baseColor = isPlayerTeam ? playerTeam.jerseyColor : aiTeamColor;
      const secColor  = isPlayerTeam ? playerTeam.secondaryColor : aiTeamSecondaryColor;

      if (isSelected) {
        ctx.shadowColor = "#00e676";
        ctx.shadowBlur = 20;
      }

      const radius = isGK ? tr(PLAYER_RADIUS + 3) : tr(PLAYER_RADIUS);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#00e676" : isGK ? "#ffd700" : secColor;
      ctx.lineWidth = isSelected ? 3 : isGK ? 2.5 : 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = secColor;
      ctx.font = `bold ${Math.round(tr(7.5))}px 'Inter', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.jerseyNumber), pos.x, pos.y);

      const nameW = tr(30);
      const nameH = tr(9);
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(pos.x - nameW / 2, pos.y + radius + tr(2), nameW, nameH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.round(tr(5.5))}px 'Inter', sans-serif`;
      ctx.fillText(p.name, pos.x, pos.y + radius + tr(2) + nameH / 2);

      if (frame.ball.ownerId === p.id) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + tr(5), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ball
    const bp = tp(frame.ball.position);
    const bv = frame.ball.velocity;
    const spd = Math.sqrt(bv.x * bv.x + bv.y * bv.y);

    if (phase === "simulating" && spd > 25) {
      const trailEnd = tp({
        x: frame.ball.position.x - bv.x * 0.06,
        y: frame.ball.position.y - bv.y * 0.06,
      });
      const grad = ctx.createLinearGradient(trailEnd.x, trailEnd.y, bp.x, bp.y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,0.35)");
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = tr(BALL_RADIUS * 0.9);
      ctx.lineCap = "round";
      ctx.moveTo(trailEnd.x, trailEnd.y);
      ctx.lineTo(bp.x, bp.y);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, tr(BALL_RADIUS), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [frame, playerTeam, aiTeamColor, aiTeamSecondaryColor, pendingCommands, selectedPlayerId, passTargetMode, phase, buildTileMap]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== "planning") return;
    const pos = canvasToPitch(e.clientX, e.clientY);

    // Check player clicks first
    if (frame) {
      for (const p of frame.players) {
        const isGK = p.role === "goalkeeper";
        const hitR = PLAYER_RADIUS + (isGK ? 4 : 2) + 6;
        const d = Math.sqrt((p.position.x - pos.x) ** 2 + (p.position.y - pos.y) ** 2);
        if (d < hitR) {
          if (p.teamId === "player") {
            onPlayerClick(p.id, pos);
            return;
          }
        }
      }
    }

    if (!selectedPlayerId || !frame) return;
    const selPlayer = frame.players.find(p => p.id === selectedPlayerId);
    if (!selPlayer) return;

    const clickedCol = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(pos.x / TILE_W)));
    const clickedRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(pos.y / TILE_H)));
    const selTile = posToTile(selPlayer.position);

    // Same tile — deselect
    if (clickedCol === selTile.col && clickedRow === selTile.row) return;

    // Check if tile is reachable
    const isGK = selPlayer.role === "goalkeeper";
    const range = selPlayer.tileRange;
    const reachable = getReachableTiles(selTile.col, selTile.row, range, isGK, "player");
    const isReachable = reachable.some(t => t.col === clickedCol && t.row === clickedRow);
    if (!isReachable) return;

    // Check occupant
    const occupant = frame.players.find(p => {
      const t = posToTile(p.position);
      return t.col === clickedCol && t.row === clickedRow;
    });

    // Can't move to a friendly tile
    if (occupant?.teamId === "player" && occupant.id !== selectedPlayerId) return;

    const isEnemy = occupant?.teamId === "ai";
    const tileCenter = tileToPos(clickedCol, clickedRow);

    onTileClick(tileCenter, isEnemy);
  }, [phase, frame, selectedPlayerId, canvasToPitch, onPlayerClick, onTileClick, passTargetMode]);

  return (
    <canvas
      ref={canvasRef}
      width={PITCH_WIDTH}
      height={PITCH_HEIGHT}
      className="w-full h-full cursor-pointer rounded-lg"
      style={{ imageRendering: "crisp-edges" }}
      onClick={handleClick}
    />
  );
}
