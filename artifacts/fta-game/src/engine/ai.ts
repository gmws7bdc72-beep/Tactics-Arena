import type { SimPlayer, SimBall, Command } from "./types";
import { CommandType } from "./types";
import { posToTile, getAdjacentTiles, tileToPos } from "./grid";

export type AiTier = 1 | 2 | 3;

function tileDist(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2);
}

function moveTowardTile(
  from: { col: number; row: number },
  to: { col: number; row: number }
): Command {
  if (from.col === to.col && from.row === to.row) {
    return { type: CommandType.MOVE, targetPosition: tileToPos(from.col, from.row) };
  }
  const adj = getAdjacentTiles(from.col, from.row);
  let best = from;
  let bestDist = tileDist(from, to);
  for (const c of adj) {
    const d = tileDist(c, to);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { type: CommandType.MOVE, targetPosition: tileToPos(best.col, best.row) };
}

function shoot(): Command {
  return { type: CommandType.SHOOT };
}

function passTo(target: SimPlayer): Command {
  return {
    type: CommandType.PASS,
    targetPosition: { ...target.position },
    targetPlayerId: target.id,
  };
}

function isMarkedByOpponent(tile: { col: number; row: number }, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return Math.abs(ot.col - tile.col) <= 1 && Math.abs(ot.row - tile.row) <= 1;
  });
}

function getAttackFormationTile(player: SimPlayer, aiPlayers: SimPlayer[]): { col: number; row: number } {
  const fwds = aiPlayers.filter(p => p.role === "forward" || p.role === "striker");
  switch (player.role) {
    case "goalkeeper": return { col: 9, row: 3 };
    case "defender":   return { col: 6, row: 3 };
    case "midfielder": return { col: 4, row: 3 };
    default: {
      const idx = fwds.findIndex(f => f.id === player.id);
      return { col: 2, row: idx === 0 ? 2 : 4 };
    }
  }
}

function getDefendFormationTile(
  player: SimPlayer,
  ballTile: { col: number; row: number },
  aiPlayers: SimPlayer[]
): { col: number; row: number } {
  const fwds = aiPlayers.filter(p => p.role === "forward" || p.role === "striker");
  switch (player.role) {
    case "goalkeeper": return { col: 9, row: Math.max(2, Math.min(4, ballTile.row)) };
    case "defender":   return { col: 8, row: 3 };
    case "midfielder": return { col: 6, row: 3 };
    default: {
      const idx = fwds.findIndex(f => f.id === player.id);
      return {
        col: Math.min(9, ballTile.col + 3),
        row: idx === 0 ? Math.max(0, ballTile.row - 1) : Math.min(6, ballTile.row + 1),
      };
    }
  }
}

// === Tier 1: Elite — formation rotations, relentless press, smart passing ===
function tier1Command(
  player: SimPlayer,
  pt: { col: number; row: number },
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: { col: number; row: number },
  hasBall: boolean,
  aiHasBall: boolean
): Command {
  if (player.role === "goalkeeper") {
    const targetRow = Math.max(1, Math.min(5, ballTile.row));
    return moveTowardTile(pt, { col: 9, row: targetRow });
  }

  if (hasBall) {
    if (pt.col <= 2) return shoot();
    const mates = aiPlayers.filter(p => p.id !== player.id && p.role !== "goalkeeper");
    const forward = mates
      .map(m => ({ m, t: posToTile(m.position) }))
      .filter(({ t }) => t.col < pt.col)
      .sort((a, b) => a.t.col - b.t.col);
    for (const { m, t } of forward) {
      if (!isMarkedByOpponent(t, playerPlayers)) return passTo(m);
    }
    const lateral = mates.map(m => ({ m, t: posToTile(m.position) })).filter(({ t }) => t.col === pt.col);
    for (const { m, t } of lateral) {
      if (!isMarkedByOpponent(t, playerPlayers)) return passTo(m);
    }
    return moveTowardTile(pt, { col: pt.col - 1, row: pt.row });
  }

  if (aiHasBall) {
    return moveTowardTile(pt, getAttackFormationTile(player, aiPlayers));
  }

  // Press or defensive shape (60/40)
  if (Math.random() < 0.6) return moveTowardTile(pt, ballTile);
  return moveTowardTile(pt, getDefendFormationTile(player, ballTile, aiPlayers));
}

// === Tier 2: Mid — moderate press, occasional passing ===
function tier2Command(
  player: SimPlayer,
  pt: { col: number; row: number },
  aiPlayers: SimPlayer[],
  ballTile: { col: number; row: number },
  hasBall: boolean,
  aiHasBall: boolean
): Command {
  if (player.role === "goalkeeper") {
    if (ballTile.col >= 6) {
      return moveTowardTile(pt, { col: 9, row: Math.max(2, Math.min(4, ballTile.row)) });
    }
    return { type: CommandType.MOVE, targetPosition: tileToPos(9, 3) };
  }

  if (hasBall) {
    if (pt.col <= 3) return shoot();
    if (Math.random() < 0.4) {
      const fwd = aiPlayers.filter(p => p.id !== player.id && p.role !== "goalkeeper")
        .find(m => posToTile(m.position).col < pt.col);
      if (fwd) return passTo(fwd);
    }
    return moveTowardTile(pt, { col: pt.col - 1, row: pt.row });
  }

  if (aiHasBall) {
    if (Math.random() < 0.55) {
      return moveTowardTile(pt, { col: Math.max(2, pt.col - 1), row: pt.row });
    }
    return { type: CommandType.MOVE, targetPosition: tileToPos(pt.col, pt.row) };
  }

  if (tileDist(pt, ballTile) <= 3) return moveTowardTile(pt, ballTile);
  return { type: CommandType.MOVE, targetPosition: tileToPos(pt.col, pt.row) };
}

// === Tier 3: Easy — slow, reactive, rarely passes ===
function tier3Command(
  player: SimPlayer,
  pt: { col: number; row: number },
  aiPlayers: SimPlayer[],
  ballTile: { col: number; row: number },
  hasBall: boolean,
  aiHasBall: boolean
): Command {
  if (player.role === "goalkeeper") {
    return { type: CommandType.MOVE, targetPosition: tileToPos(9, 3) };
  }

  if (hasBall) {
    if (pt.col <= 4) return shoot();
    if (Math.random() < 0.15) {
      const fwd = aiPlayers.filter(p => p.id !== player.id && p.role !== "goalkeeper")
        .find(m => posToTile(m.position).col < pt.col);
      if (fwd) return passTo(fwd);
    }
    return moveTowardTile(pt, { col: pt.col - 1, row: pt.row });
  }

  if (aiHasBall) {
    if (Math.random() < 0.35) {
      return moveTowardTile(pt, { col: pt.col - 1, row: pt.row });
    }
    return { type: CommandType.MOVE, targetPosition: tileToPos(pt.col, pt.row) };
  }

  if (Math.random() < 0.45) return moveTowardTile(pt, ballTile);
  return { type: CommandType.MOVE, targetPosition: tileToPos(pt.col, pt.row) };
}

export function generateAICommands(
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ball: SimBall,
  tier: AiTier = 2
): Map<string, Command> {
  const commands = new Map<string, Command>();
  const allPlayers = [...aiPlayers, ...playerPlayers];
  const ballOwner = allPlayers.find(p => p.id === ball.ownerId) ?? null;
  const aiHasBall = ballOwner?.teamId === "ai" ?? false;
  const ballTile = posToTile(ball.position);

  for (const player of aiPlayers) {
    const pt = posToTile(player.position);
    const hasBall = player.id === ball.ownerId;

    let cmd: Command;
    switch (tier) {
      case 1:
        cmd = tier1Command(player, pt, aiPlayers, playerPlayers, ballTile, hasBall, aiHasBall);
        break;
      case 2:
        cmd = tier2Command(player, pt, aiPlayers, ballTile, hasBall, aiHasBall);
        break;
      default:
        cmd = tier3Command(player, pt, aiPlayers, ballTile, hasBall, aiHasBall);
        break;
    }
    commands.set(player.id, cmd);
  }

  return commands;
}
