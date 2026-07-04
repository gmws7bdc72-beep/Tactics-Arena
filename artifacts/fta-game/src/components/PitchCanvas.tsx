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
  /** Where to anchor the pass-range ring. Differs from the player's real position
   *  when doing a Move→Pass combo (ring should centre on the move destination). */
  passOriginPos?: Vec2;
  phase: "planning" | "simulating" | "finished";
  isVertical?: boolean;
  /** In 2-player mode: which team is currently allowed to plan. Undefined = 1P (player only). */
  activePlanningTeam?: "player" | "ai";
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
  passOriginPos,
  phase,
  isVertical = false,
  activePlanningTeam,
  onPlayerClick,
  onTileClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const canvasToPitch = useCallback((cx: number, cy: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (isVertical) {
      const nx = (cx - rect.left) / rect.width;
      const ny = (cy - rect.top) / rect.height;
      return {
        x: (1 - ny) * PITCH_WIDTH,
        y: nx * PITCH_HEIGHT,
      };
    }
    const sx = PITCH_WIDTH / rect.width;
    const sy = PITCH_HEIGHT / rect.height;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  }, [isVertical]);

  const buildTileMap = useCallback((): Map<string, TileState> => {
    const map = new Map<string, TileState>();
    if (!frame || !selectedPlayerId) return map;
    // In pass-target mode the ring is the visual guide — don't show movement tiles.
    if (passTargetMode) return map;

    const selPlayer = frame.players.find(p => p.id === selectedPlayerId);
    if (!selPlayer) return map;

    const pt = posToTile(selPlayer.position);
    const isGK = selPlayer.role === "goalkeeper";
    const range = selPlayer.tileRange;

    map.set(`${pt.col},${pt.row}`, "current");

    const occupancy = new Map<string, "friendly" | "enemy">();
    for (const p of frame.players) {
      if (p.id === selectedPlayerId) continue;
      const t = posToTile(p.position);
      occupancy.set(`${t.col},${t.row}`, p.teamId === selPlayer.teamId ? "friendly" : "enemy");
    }

    const reachable = getReachableTiles(pt.col, pt.row, range, isGK, selPlayer.teamId);
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
  }, [frame, selectedPlayerId, passTargetMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    let tp: (p: Vec2) => { x: number; y: number };
    let tr: (r: number) => number;

    if (isVertical) {
      const scx = W / PITCH_HEIGHT;
      const scy = H / PITCH_WIDTH;
      tp = (p: Vec2) => ({ x: p.y * scx, y: (1 - p.x / PITCH_WIDTH) * H });
      tr = (r: number) => r * Math.min(scx, scy);
    } else {
      const scx = W / PITCH_WIDTH;
      const scy = H / PITCH_HEIGHT;
      tp = (p: Vec2) => ({ x: p.x * scx, y: p.y * scy });
      tr = (r: number) => r * Math.min(scx, scy);
    }

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
    ctx.fillStyle = "#ffffff";
    if (isVertical) {
      const stripeH = H / 8;
      for (let i = 0; i < 8; i += 2) ctx.fillRect(0, i * stripeH, W, stripeH);
    } else {
      const stripeW = W / 8;
      for (let i = 0; i < 8; i += 2) ctx.fillRect(i * stripeW, 0, stripeW, H);
    }
    ctx.globalAlpha = 1;

    // Field lines
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    if (isVertical) {
      const scx = W / PITCH_HEIGHT;
      const scy = H / PITCH_WIDTH;

      // Halfway line: horizontal
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(55), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(3), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();

      // Penalty areas: horizontal bands at top (AI) and bottom (player)
      const paDepth = PENALTY_AREA_WIDTH * scy;
      const paWidth = PENALTY_AREA_HEIGHT * scx;
      const paX = (W - paWidth) / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(paX, 0, paWidth, paDepth);
      ctx.strokeRect(paX, H - paDepth, paWidth, paDepth);

      // Goals: at top (AI) and bottom (player)
      const gWidth = GOAL_WIDTH * scx;
      const gDepth = GOAL_DEPTH * scy;
      const gX = (W - gWidth) / 2;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2;
      ctx.fillRect(gX, 0, gWidth, gDepth); ctx.strokeRect(gX, 0, gWidth, gDepth);
      ctx.fillRect(gX, H - gDepth, gWidth, gDepth); ctx.strokeRect(gX, H - gDepth, gWidth, gDepth);

      // Offside zone lines (attacking-third only rule).
      // In vertical mode: high pitch x → low canvas y → top of screen (player attacks up).
      // Player's offside zone: pitch x > 2/3 → canvas y < H/3 (top third).
      // AI's offside zone:     pitch x < 1/3 → canvas y > 2H/3 (bottom third).
      const offsideTop = H / 3;
      const offsideBot = (2 * H) / 3;
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, offsideTop);
      ctx.fillRect(0, offsideBot, W, H - offsideBot);
      ctx.globalAlpha = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, offsideTop); ctx.lineTo(W, offsideTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, offsideBot); ctx.lineTo(W, offsideBot); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const scx = W / PITCH_WIDTH;
      const scy = H / PITCH_HEIGHT;

      // Halfway line: vertical
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(55), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, tr(3), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();

      const paW = PENALTY_AREA_WIDTH * scx;
      const paH = PENALTY_AREA_HEIGHT * scy;
      const paY = (H - paH) / 2;
      ctx.strokeRect(0, paY, paW, paH);
      ctx.strokeRect(W - paW, paY, paW, paH);

      const goalW = GOAL_WIDTH * scy;
      const goalD = GOAL_DEPTH * scx;
      const goalY = GOAL_TOP_Y * scy;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2;
      ctx.fillRect(0, goalY, goalD, goalW); ctx.strokeRect(0, goalY, goalD, goalW);
      ctx.fillRect(W - goalD, goalY, goalD, goalW); ctx.strokeRect(W - goalD, goalY, goalD, goalW);

      // Offside zone lines (attacking-third only rule).
      // Player attacks right → offside zone: right third (x > 2W/3).
      // AI attacks left     → offside zone: left third  (x < W/3).
      const offsideLeft  = W / 3;
      const offsideRight = (2 * W) / 3;
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, offsideLeft, H);
      ctx.fillRect(offsideRight, 0, W - offsideRight, H);
      ctx.globalAlpha = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(offsideLeft, 0); ctx.lineTo(offsideLeft, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(offsideRight, 0); ctx.lineTo(offsideRight, H); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Tile grid
    const selPlayer = selectedPlayerId ? frame.players.find(p => p.id === selectedPlayerId) : null;

    if (isVertical) {
      const tw_v = W / GRID_ROWS;
      const th_v = H / GRID_COLS;

      if (phase === "planning" && selPlayer) {
        const tileMap = buildTileMap();
        for (let col = 0; col < GRID_COLS; col++) {
          for (let row = 0; row < GRID_ROWS; row++) {
            const tx = row * tw_v;
            const ty = (GRID_COLS - 1 - col) * th_v;
            const key = `${col},${row}`;
            const state = tileMap.get(key) ?? "none";

            if (state === "current") {
              ctx.fillStyle = "rgba(255,220,0,0.22)";
              ctx.fillRect(tx, ty, tw_v, th_v);
              ctx.strokeStyle = "rgba(255,220,0,0.7)";
              ctx.lineWidth = 1.5;
            } else if (state === "reachable") {
              ctx.fillStyle = "rgba(0,230,118,0.18)";
              ctx.fillRect(tx, ty, tw_v, th_v);
              ctx.strokeStyle = "rgba(0,230,118,0.65)";
              ctx.lineWidth = 1.5;
            } else if (state === "reachable-enemy") {
              ctx.fillStyle = "rgba(255,100,0,0.22)";
              ctx.fillRect(tx, ty, tw_v, th_v);
              ctx.strokeStyle = "rgba(255,100,0,0.7)";
              ctx.lineWidth = 1.5;
            } else if (state === "reachable-friendly") {
              ctx.fillStyle = "rgba(120,120,120,0.12)";
              ctx.fillRect(tx, ty, tw_v, th_v);
              ctx.strokeStyle = "rgba(120,120,120,0.4)";
              ctx.lineWidth = 1.5;
            } else {
              ctx.strokeStyle = "rgba(255,255,255,0.06)";
              ctx.lineWidth = 0.5;
            }
            ctx.strokeRect(tx + 0.5, ty + 0.5, tw_v - 1, th_v - 1);

            if (state === "reachable-enemy") {
              ctx.fillStyle = "rgba(255,100,0,0.9)";
              ctx.font = `bold ${Math.round(tr(6))}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText("⚔", tx + tw_v / 2, ty + 3);
            }
            if (state === "reachable-friendly") {
              ctx.fillStyle = "rgba(160,160,160,0.9)";
              ctx.font = `bold ${Math.round(tr(6))}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText("✕", tx + tw_v / 2, ty + 3);
            }
          }
        }
      } else if (phase === "planning" && !selPlayer) {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 0.5;
        for (let col = 0; col < GRID_COLS; col++) {
          for (let row = 0; row < GRID_ROWS; row++) {
            ctx.strokeRect(row * tw_v + 0.5, (GRID_COLS - 1 - col) * th_v + 0.5, tw_v - 1, th_v - 1);
          }
        }
      }
    } else {
      const scx = W / PITCH_WIDTH;
      const scy = H / PITCH_HEIGHT;

      if (phase === "planning" && selPlayer) {
        const tileMap = buildTileMap();
        for (let col = 0; col < GRID_COLS; col++) {
          for (let row = 0; row < GRID_ROWS; row++) {
            const tx = col * TILE_W * scx;
            const ty = row * TILE_H * scy;
            const tw = TILE_W * scx;
            const th = TILE_H * scy;
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
            ctx.strokeRect(col * TILE_W * scx + 0.5, row * TILE_H * scy + 0.5, TILE_W * scx - 1, TILE_H * scy - 1);
          }
        }
      }
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
          // Move+Pass combo: draw the pass arrow in red
          if (cmd.followUp?.type === CommandType.PASS && cmd.followUp.targetPosition) {
            const passTo = tp(cmd.followUp.targetPosition);
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = "#ff1744";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([7, 4]);
            ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(passTo.x, passTo.y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.55;
            ctx.beginPath(); ctx.arc(passTo.x, passTo.y, tr(PLAYER_RADIUS), 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        } else if (cmd.type === CommandType.PASS && cmd.targetPosition) {
          const to = tp(cmd.targetPosition);
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#ffeb3b";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([7, 4]);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          // Pass+Move combo: draw the move arrow in orange
          if (cmd.followUp?.type === CommandType.MOVE && cmd.followUp.targetPosition) {
            const moveTo = tp(cmd.followUp.targetPosition);
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = "#ff9800";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(moveTo.x, moveTo.y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.55;
            ctx.beginPath(); ctx.arc(moveTo.x, moveTo.y, tr(PLAYER_RADIUS), 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        } else if (cmd.type === CommandType.SHOOT) {
          // "player" team attacks right; "ai" team attacks left
          const attacksRight = pf.teamId === "player";
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#ff6b35";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          if (isVertical) {
            // vertical: right=top (y=0), left=bottom (y=H)
            ctx.lineTo(W / 2, attacksRight ? 0 : H);
          } else {
            ctx.lineTo(attacksRight ? W : 0, H / 2);
          }
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

      if (p.offside) {
        const flagX = pos.x + radius + tr(2);
        const flagY = pos.y - radius - tr(12);
        const fw = tr(14);
        const fh = tr(9);
        ctx.fillStyle = "#ff1744";
        ctx.fillRect(flagX, flagY, fw, fh);
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(tr(5.5))}px 'Inter', sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("OS", flagX + tr(1.5), flagY + fh / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "#ff1744";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(flagX, flagY + fh);
        ctx.lineTo(flagX, flagY + fh + tr(7));
        ctx.stroke();
      }

      if (frame.ball.ownerId === p.id) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + tr(5), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ball
    const bpGround = tp(frame.ball.position);
    const bv = frame.ball.velocity;
    const spd = Math.sqrt(bv.x * bv.x + bv.y * bv.y);
    const ballHeight = frame.ball.height ?? 0;
    const heightOffset = tr(ballHeight);
    const bp = { x: bpGround.x, y: bpGround.y - heightOffset };
    const isLongBall = frame.ball.passStyle === "long" && ballHeight > 1;

    if (phase === "simulating" && spd > 25) {
      const trailEndGround = tp({
        x: frame.ball.position.x - bv.x * 0.06,
        y: frame.ball.position.y - bv.y * 0.06,
      });
      const trailEnd = { x: trailEndGround.x, y: trailEndGround.y - heightOffset * 0.65 };
      const grad = ctx.createLinearGradient(trailEnd.x, trailEnd.y, bp.x, bp.y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, isLongBall ? "rgba(255,235,59,0.48)" : "rgba(255,255,255,0.35)");
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = tr(isLongBall ? BALL_RADIUS * 1.25 : BALL_RADIUS * 0.9);
      ctx.lineCap = "round";
      ctx.moveTo(trailEnd.x, trailEnd.y);
      ctx.lineTo(bp.x, bp.y);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    if (isLongBall) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(bpGround.x, bpGround.y + tr(3), tr(BALL_RADIUS * 1.7), tr(BALL_RADIUS * 0.7), 0, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.shadowColor = isLongBall ? "#ffeb3b" : "#ffffff";
    ctx.shadowBlur = isLongBall ? 14 : 8;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, tr(isLongBall ? BALL_RADIUS * 1.15 : BALL_RADIUS), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = isLongBall ? "#ffeb3b" : "#999";
    ctx.lineWidth = isLongBall ? 2 : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [frame, playerTeam, aiTeamColor, aiTeamSecondaryColor, pendingCommands, selectedPlayerId, passTargetMode, passOriginPos, phase, isVertical, buildTileMap]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== "planning") return;
    const pos = canvasToPitch(e.clientX, e.clientY);

    // Which team is selectable: in 2P mode use activePlanningTeam, otherwise "player" only
    const selectableTeam = activePlanningTeam ?? "player";

    if (frame) {
      for (const p of frame.players) {
        const isGK = p.role === "goalkeeper";
        const hitR = PLAYER_RADIUS + (isGK ? 4 : 2) + 6;
        const d = Math.sqrt((p.position.x - pos.x) ** 2 + (p.position.y - pos.y) ** 2);
        if (d < hitR) {
          if (p.teamId === selectableTeam) {
            onPlayerClick(p.id, pos);
            return;
          }
        }
      }
    }

    if (!selectedPlayerId || !frame) return;
    const selPlayer = frame.players.find(p => p.id === selectedPlayerId);
    if (!selPlayer) return;

    // Make sure the selected player belongs to the active planning team
    if (selPlayer.teamId !== selectableTeam) return;

    const clickedCol = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(pos.x / TILE_W)));
    const clickedRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(pos.y / TILE_H)));
    const selTile = posToTile(selPlayer.position);

    if (clickedCol === selTile.col && clickedRow === selTile.row) return;

    // In pass-target mode any tile on the pitch is a valid target — the ring is
    // informational only. Movement tiles are only gated in normal move mode.
    if (!passTargetMode) {
      const isGK = selPlayer.role === "goalkeeper";
      const range = selPlayer.tileRange;
      // Use the selected player's actual team for movement range calculation
      const reachable = getReachableTiles(selTile.col, selTile.row, range, isGK, selPlayer.teamId);
      const isReachable = reachable.some(t => t.col === clickedCol && t.row === clickedRow);
      if (!isReachable) return;
    }

    const occupant = frame.players.find(p => {
      const t = posToTile(p.position);
      return t.col === clickedCol && t.row === clickedRow;
    });

    if (occupant?.teamId === selectableTeam && occupant.id !== selectedPlayerId) return;

    const isEnemy = occupant?.teamId === "ai";
    const tileCenter = tileToPos(clickedCol, clickedRow);

    onTileClick(tileCenter, isEnemy);
  }, [phase, frame, selectedPlayerId, canvasToPitch, onPlayerClick, onTileClick, passTargetMode, activePlanningTeam]);

  return (
    <canvas
      ref={canvasRef}
      width={isVertical ? PITCH_HEIGHT : PITCH_WIDTH}
      height={isVertical ? PITCH_WIDTH : PITCH_HEIGHT}
      className="w-full h-full cursor-pointer rounded-lg"
      style={{ imageRendering: "crisp-edges" }}
      onClick={handleClick}
    />
  );
}
