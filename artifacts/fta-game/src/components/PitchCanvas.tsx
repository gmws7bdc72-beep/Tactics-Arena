import { useRef, useEffect, useCallback } from "react";
import type { FrameSnapshot, TeamConfig, Vec2, Command } from "../engine/types";
import { CommandType } from "../engine/types";
import {
  PITCH_WIDTH, PITCH_HEIGHT,
  GOAL_WIDTH, GOAL_DEPTH,
  GOAL_TOP_Y, GOAL_LEFT_X, GOAL_RIGHT_X,
  PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT,
  PLAYER_RADIUS, BALL_RADIUS,
} from "../engine/constants";

interface PendingCommand {
  playerId: string;
  command: Command;
}

interface Props {
  frame: FrameSnapshot | null;
  playerTeam: TeamConfig;
  pendingCommands: Map<string, Command>;
  selectedPlayerId: string | null;
  phase: "planning" | "simulating" | "finished";
  onPlayerClick: (playerId: string, pos: Vec2) => void;
  onPitchClick: (pos: Vec2) => void;
  showPressure?: boolean;
  aiPositions?: Vec2[];
}

export default function PitchCanvas({
  frame,
  playerTeam,
  pendingCommands,
  selectedPlayerId,
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
    if (!canvas) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / PITCH_WIDTH;
    const sy = rect.height / PITCH_HEIGHT;
    return { sx, sy, ox: 0, oy: 0 };
  }, []);

  const pitchToCanvas = useCallback((pos: Vec2): Vec2 => {
    const { sx, sy } = getScale();
    return { x: pos.x * sx, y: pos.y * sy };
  }, [getScale]);

  const canvasToPitch = useCallback((cx: number, cy: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { sx, sy } = getScale();
    return {
      x: (cx - rect.left) / sx,
      y: (cy - rect.top) / sy,
    };
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

    // Outer boundary
    ctx.strokeRect(0, 0, W, H);

    // Center line
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, tr(55), 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, tr(3), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();

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
    ctx.fillRect(0, goalY, goalD, goalW);
    ctx.strokeRect(0, goalY, goalD, goalW);
    ctx.fillRect(W - goalD, goalY, goalD, goalW);
    ctx.strokeRect(W - goalD, goalY, goalD, goalW);

    // Pressure map overlay
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

    // Command arrows & ghost positions
    if (phase === "planning") {
      pendingCommands.forEach((cmd, playerId) => {
        const playerFrame = frame.players.find(p => p.id === playerId);
        if (!playerFrame) return;
        const from = tp(playerFrame.position);

        if (cmd.type === CommandType.MOVE && cmd.targetPosition) {
          const to = tp(cmd.targetPosition);
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = playerFrame.teamId === "player" ? "#00e676" : "#ff5252";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = playerFrame.teamId === "player" ? "#00e676" : "#ff5252";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(to.x, to.y, tr(PLAYER_RADIUS), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (cmd.type === CommandType.PASS && cmd.targetPosition) {
          const to = tp(cmd.targetPosition);
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = "#ffeb3b";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else if (cmd.type === CommandType.SHOOT) {
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#ff6b35";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(W, H / 2);
          ctx.stroke();
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

      const baseColor = isPlayerTeam ? playerTeam.jerseyColor : "#e53935";
      const secondaryColor = isPlayerTeam ? playerTeam.secondaryColor : "#ffffff";

      // Glow for selected
      if (isSelected && phase === "planning") {
        ctx.shadowColor = "#00e676";
        ctx.shadowBlur = 16;
      }

      // Player circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, tr(PLAYER_RADIUS), 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();

      // Stroke
      ctx.strokeStyle = isSelected ? "#00e676" : secondaryColor;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Jersey number
      ctx.fillStyle = secondaryColor;
      ctx.font = `bold ${Math.round(tr(8))}px 'Inter', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.jerseyNumber), pos.x, pos.y);

      // Name tag
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      const nameW = tr(28);
      const nameH = tr(9);
      ctx.fillRect(pos.x - nameW / 2, pos.y + tr(PLAYER_RADIUS) + tr(2), nameW, nameH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.round(tr(6))}px 'Inter', sans-serif`;
      ctx.fillText(p.name, pos.x, pos.y + tr(PLAYER_RADIUS) + tr(2) + nameH / 2);

      // Ball control indicator
      if (frame.ball.ownerId === p.id) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, tr(PLAYER_RADIUS + 4), 0, Math.PI * 2);
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

    // Ball velocity trail
    if (phase === "simulating" && (Math.abs(frame.ball.velocity.x) > 20 || Math.abs(frame.ball.velocity.y) > 20)) {
      const trail = tp({ x: frame.ball.position.x - frame.ball.velocity.x * 0.05, y: frame.ball.position.y - frame.ball.velocity.y * 0.05 });
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
  }, [frame, playerTeam, pendingCommands, selectedPlayerId, phase, showPressure, aiPositions, pitchToCanvas]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== "planning") return;
    const pos = canvasToPitch(e.clientX, e.clientY);

    if (frame) {
      for (const p of frame.players) {
        if (p.teamId !== "player") continue;
        const d = Math.sqrt((p.position.x - pos.x) ** 2 + (p.position.y - pos.y) ** 2);
        if (d < PLAYER_RADIUS + 6) {
          onPlayerClick(p.id, pos);
          return;
        }
      }
    }
    onPitchClick(pos);
  }, [phase, frame, canvasToPitch, onPlayerClick, onPitchClick]);

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
