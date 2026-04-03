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
import { posToTile, getAdjacentTiles, isAdjacentOrSame, tileToPos } from "../engine/grid";

interface Props {
  frame: FrameSnapshot | null;
  playerTeam: TeamConfig;
  aiTeamColor?: string;
  aiTeamSecondaryColor?: string;
  pendingCommands: Map<string, Command>;
  selectedPlayerId: string | null;
  selectedAction: "move" | "pass" | "shoot" | null;
  phase: "planning" | "simulating" | "finished";
  onPlayerClick: (playerId: string, pos: Vec2) => void;
  onPitchClick: (pos: Vec2) => void;
  showPressure?: boolean;
  aiPositions?: Vec2[];
}

export default function PitchCanvas({
  frame,
  playerTeam,
  aiTeamColor = "#e53935",
  aiTeamSecondaryColor = "#ffffff",
  pendingCommands,
  selectedPlayerId,
  selectedAction,
  phase,
  onPlayerClick,
  onPitchClick,
  showPressure = false,
  aiPositions,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 1, sy: 1 };
    const rect = canvas.getBoundingClientRect();
    return { sx: rect.width / PITCH_WIDTH, sy: rect.height / PITCH_HEIGHT };
  }, []);

  const canvasToPitch = useCallback((cx: number, cy: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { sx, sy } = getScale();
    return { x: (cx - rect.left) / sx, y: (cy - rect.top) / sy };
  }, [getScale]);

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
    pitchGrad.addColorStop(0, "#1a4a2e");
    pitchGrad.addColorStop(0.5, "#1e5233");
    pitchGrad.addColorStop(1, "#1a4a2e");
    ctx.fillStyle = pitchGrad;
    ctx.fillRect(0, 0, W, H);

    // Pitch stripes
    ctx.globalAlpha = 0.04;
    const stripeW = W / 8;
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(i * stripeW, 0, stripeW, H);
      }
    }
    ctx.globalAlpha = 1;

    // Field lines
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(55), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(3), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill();

    // Penalty areas
    const paW = PENALTY_AREA_WIDTH * sx;
    const paH = PENALTY_AREA_HEIGHT * sy;
    const paY = (H - paH) / 2;
    ctx.strokeRect(0, paY, paW, paH);
    ctx.strokeRect(W - paW, paY, paW, paH);

    // Goals
    const goalW = GOAL_WIDTH * sy;
    const goalD = GOAL_DEPTH * sx;
    const goalY = GOAL_TOP_Y * sy;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.fillRect(0, goalY, goalD, goalW); ctx.strokeRect(0, goalY, goalD, goalW);
    ctx.fillRect(W - goalD, goalY, goalD, goalW); ctx.strokeRect(W - goalD, goalY, goalD, goalW);

    // Pressure heatmap
    if (showPressure && aiPositions) {
      for (let ix = 0; ix < W; ix += 12) {
        for (let iy = 0; iy < H; iy += 12) {
          let pressure = 0;
          for (const pos of aiPositions) {
            const d = Math.sqrt((ix - pos.x * sx) ** 2 + (iy - pos.y * sy) ** 2);
            pressure += 2000 / (d * d + 100);
          }
          const alpha = Math.min(0.35, pressure * 0.05);
          ctx.fillStyle = `rgba(220, 50, 50, ${alpha})`;
          ctx.fillRect(ix, iy, 12, 12);
        }
      }
    }

    // TILE GRID — only in move mode
    const selectedPlayer = selectedPlayerId ? frame.players.find(p => p.id === selectedPlayerId) : null;
    if (phase === "planning" && selectedAction === "move" && selectedPlayer) {
      const pt = posToTile(selectedPlayer.position);
      const adjTiles = getAdjacentTiles(pt.col, pt.row);
      const adjSet = new Set(adjTiles.map(t => `${t.col},${t.row}`));

      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          const tx = col * TILE_W * sx;
          const ty = row * TILE_H * sy;
          const tw = TILE_W * sx;
          const th = TILE_H * sy;
          const key = `${col},${row}`;
          const isAdj = adjSet.has(key);
          const isCurrent = col === pt.col && row === pt.row;

          if (isCurrent) {
            ctx.fillStyle = "rgba(255,220,0,0.25)";
            ctx.fillRect(tx, ty, tw, th);
          } else if (isAdj) {
            ctx.fillStyle = "rgba(0,230,118,0.22)";
            ctx.fillRect(tx, ty, tw, th);
          }

          ctx.strokeStyle = isAdj
            ? "rgba(0,230,118,0.6)"
            : isCurrent
            ? "rgba(255,220,0,0.7)"
            : "rgba(255,255,255,0.08)";
          ctx.lineWidth = isAdj || isCurrent ? 1.5 : 0.5;
          ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
        }
      }
    }

    // Command arrows & ghost positions
    if (phase === "planning") {
      pendingCommands.forEach((cmd, playerId) => {
        const playerFrame = frame.players.find(p => p.id === playerId);
        if (!playerFrame) return;
        const from = tp(playerFrame.position);

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
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else if (cmd.type === CommandType.SHOOT) {
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#ff6b35";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(W, H / 2); ctx.stroke();
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
      const secColor = isPlayerTeam ? playerTeam.secondaryColor : aiTeamSecondaryColor;

      if (isSelected && phase === "planning") {
        ctx.shadowColor = "#00e676";
        ctx.shadowBlur = 18;
      }

      // GK gets a slightly larger circle with a different border
      const radius = isGK ? tr(PLAYER_RADIUS + 2) : tr(PLAYER_RADIUS);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();

      ctx.strokeStyle = isSelected ? "#00e676" : isGK ? "#ffd700" : secColor;
      ctx.lineWidth = isSelected ? 3 : isGK ? 2.5 : 1.5;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Jersey number
      ctx.fillStyle = secColor;
      ctx.font = `bold ${Math.round(tr(7.5))}px 'Inter', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.jerseyNumber), pos.x, pos.y);

      // Name tag
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      const nameW = tr(28);
      const nameH = tr(9);
      ctx.fillRect(pos.x - nameW / 2, pos.y + radius + tr(2), nameW, nameH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.round(tr(5.5))}px 'Inter', sans-serif`;
      ctx.fillText(p.name, pos.x, pos.y + radius + tr(2) + nameH / 2);

      // Ball ownership ring
      if (frame.ball.ownerId === p.id) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + tr(4), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ball
    const ballPos = tp(frame.ball.position);
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(ballPos.x, ballPos.y, tr(BALL_RADIUS), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // Ball trail
    if (phase === "simulating" && (Math.abs(frame.ball.velocity.x) > 20 || Math.abs(frame.ball.velocity.y) > 20)) {
      const trail = tp({
        x: frame.ball.position.x - frame.ball.velocity.x * 0.05,
        y: frame.ball.position.y - frame.ball.velocity.y * 0.05,
      });
      const grad = ctx.createLinearGradient(trail.x, trail.y, ballPos.x, ballPos.y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,0.4)");
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = tr(BALL_RADIUS * 0.8);
      ctx.lineCap = "round";
      ctx.moveTo(trail.x, trail.y);
      ctx.lineTo(ballPos.x, ballPos.y);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
  }, [frame, playerTeam, aiTeamColor, aiTeamSecondaryColor, pendingCommands, selectedPlayerId, selectedAction, phase, showPressure, aiPositions]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== "planning") return;
    const pos = canvasToPitch(e.clientX, e.clientY);

    // Player click detection
    if (frame) {
      for (const p of frame.players) {
        if (p.teamId !== "player") continue;
        const isGK = p.role === "goalkeeper";
        const hitRadius = PLAYER_RADIUS + (isGK ? 4 : 2);
        const d = Math.sqrt((p.position.x - pos.x) ** 2 + (p.position.y - pos.y) ** 2);
        if (d < hitRadius + 6) {
          onPlayerClick(p.id, pos);
          return;
        }
      }
    }

    // Move mode: snap to tile
    if (selectedAction === "move" && selectedPlayerId && frame) {
      const selPlayer = frame.players.find(p => p.id === selectedPlayerId);
      if (selPlayer) {
        const selTile = posToTile(selPlayer.position);
        const clickedCol = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(pos.x / TILE_W)));
        const clickedRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(pos.y / TILE_H)));
        if (isAdjacentOrSame(clickedCol, clickedRow, selTile.col, selTile.row) &&
            !(clickedCol === selTile.col && clickedRow === selTile.row)) {
          onPitchClick(tileToPos(clickedCol, clickedRow));
          return;
        }
      }
    } else {
      onPitchClick(pos);
    }
  }, [phase, frame, selectedAction, selectedPlayerId, canvasToPitch, onPlayerClick, onPitchClick]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        width={PITCH_WIDTH}
        height={PITCH_HEIGHT}
        className="w-full h-full cursor-pointer rounded-lg"
        style={{ imageRendering: "crisp-edges" }}
        onClick={handleClick}
      />
    </div>
  );
}
