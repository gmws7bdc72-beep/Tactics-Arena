import type { SimPlayer, SimBall, Command, Vec2 } from "./types";
import { CommandType } from "./types";
import { posToTile, getReachableTiles, tileToPos, tileKey } from "./grid";
import type { TilePos } from "./types";
import { GRID_COLS, speedToTiles } from "./constants";

export type AiTier = 1 | 2 | 3;

function tileDist(a: TilePos, b: TilePos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function eucDist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Move toward a target using the player's speed-based tile range
function moveStep(
  player: SimPlayer,
  from: TilePos,
  to: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (from.col === to.col && from.row === to.row) {
    return { type: CommandType.MOVE, targetPosition: tileToPos(from.col, from.row) };
  }

  const isGK = player.role === "goalkeeper";
  const range = isGK ? 1 : speedToTiles(player.stats.speed);
  const reachable = getReachableTiles(from.col, from.row, range, isGK, player.teamId);

  let best: TilePos = from;
  let bestDist = tileDist(from, to);

  for (const c of reachable) {
    const k = tileKey(c.col, c.row);
    if (friendly.has(k)) continue;
    if (claimed.has(k)) continue;
    const d = tileDist(c, to);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  const k = tileKey(best.col, best.row);
  if (best !== from) claimed.add(k);
  return { type: CommandType.MOVE, targetPosition: tileToPos(best.col, best.row) };
}

function stayPut(tile: TilePos): Command {
  return { type: CommandType.MOVE, targetPosition: tileToPos(tile.col, tile.row) };
}

function shoot(): Command {
  return { type: CommandType.SHOOT };
}

function passTo(target: SimPlayer): Command {
  return { type: CommandType.PASS, targetPlayerId: target.id, targetPosition: { ...target.position } };
}

function isThreatened(tile: TilePos, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return tileDist(ot, tile) <= 1;
  });
}

function bestForwardPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[]
): SimPlayer | null {
  const carrierTile = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id && p.role !== "goalkeeper")
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => t.col < carrierTile.col)
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .sort((a, b) => a.t.col - b.t.col);
  return candidates[0]?.p ?? null;
}

function bestSupportPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[]
): SimPlayer | null {
  const carrierTile = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id && p.role !== "goalkeeper")
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .filter(({ t }) => tileDist(t, carrierTile) <= 3)
    .sort((a, b) => a.t.col - b.t.col);
  return candidates[0]?.p ?? null;
}

interface FormTile { col: number; row: number }

function getAttackShape(role: string, idx: number): FormTile {
  switch (role) {
    case "goalkeeper": return { col: 9, row: 3 };
    case "defender":   return { col: 7, row: 3 };
    case "midfielder": return { col: 5, row: 3 };
    case "forward":    return { col: 3, row: idx === 0 ? 1 : 5 };
    case "striker":    return { col: 2, row: 3 };
    default:           return { col: 5, row: 3 };
  }
}

function getCompactDefShape(role: string, idx: number, ballRow: number): FormTile {
  switch (role) {
    case "goalkeeper": return { col: 9, row: Math.max(1, Math.min(5, ballRow)) };
    case "defender":   return { col: 8, row: Math.max(1, Math.min(5, 2 + idx * 2)) };
    case "midfielder": return { col: 7, row: 3 };
    case "forward":    return { col: 6, row: idx === 0 ? 2 : 4 };
    case "striker":    return { col: 6, row: 3 };
    default:           return { col: 7, row: 3 };
  }
}

// Tier 1 — Elite
function tier1Possession(
  player: SimPlayer, pt: TilePos, hasBall: boolean,
  aiPlayers: SimPlayer[], playerPlayers: SimPlayer[],
  claimed: Set<string>, friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    if (pt.col <= 2) return shoot();
    const fwdPass = bestForwardPass(player, aiPlayers, playerPlayers);
    if (fwdPass) return passTo(fwdPass);
    if (isThreatened(pt, playerPlayers)) {
      const sup = bestSupportPass(player, aiPlayers, playerPlayers);
      if (sup) return passTo(sup);
    }
    return moveStep(player, pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const target = getAttackShape(player.role, roleIdx);
  if (player.role === "forward" || player.role === "striker") {
    const ballCarrier = aiPlayers.find(p => p.id !== player.id);
    const ballRow = ballCarrier ? posToTile(ballCarrier.position).row : 3;
    const runTarget = {
      col: Math.max(1, target.col),
      row: roleIdx === 0 ? Math.max(0, ballRow - 2) : Math.min(6, ballRow + 2),
    };
    return moveStep(player, pt, runTarget, claimed, friendly);
  }
  return moveStep(player, pt, target, claimed, friendly);
}

function tier1Defense(
  player: SimPlayer, pt: TilePos,
  aiPlayers: SimPlayer[], playerPlayers: SimPlayer[],
  ballTile: TilePos, claimed: Set<string>, friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") {
    const targetRow = Math.max(1, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: 9, row: targetRow }, claimed, friendly);
  }

  const playerOutfield = playerPlayers
    .filter(p => p.role !== "goalkeeper")
    .sort((a, b) => eucDist(a.position, { x: 700, y: 230 }) - eucDist(b.position, { x: 700, y: 230 }));

  const aiOutfield = aiPlayers
    .filter(p => p.role !== "goalkeeper")
    .sort((a, b) => {
      const roleOrder: Record<string, number> = { defender: 0, midfielder: 1, forward: 2, striker: 3 };
      return (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2);
    });

  const myIdx = aiOutfield.findIndex(p => p.id === player.id);
  const assignedOpponent = playerOutfield[myIdx] ?? playerOutfield[0];
  if (!assignedOpponent) return stayPut(pt);

  const oppTile = posToTile(assignedOpponent.position);
  const interceptTile: TilePos = {
    col: Math.max(0, Math.min(9, Math.round((oppTile.col + ballTile.col) / 2))),
    row: Math.max(0, Math.min(6, oppTile.row)),
  };

  if (tileDist(pt, oppTile) <= 1) {
    return moveStep(player, pt, oppTile, claimed, friendly);
  }
  return moveStep(player, pt, interceptTile, claimed, friendly);
}

// Tier 2 — Mid
function tier2Possession(
  player: SimPlayer, pt: TilePos, hasBall: boolean,
  aiPlayers: SimPlayer[], playerPlayers: SimPlayer[],
  claimed: Set<string>, friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    if (pt.col <= 3) return shoot();
    const fwdPass = bestForwardPass(player, aiPlayers, playerPlayers);
    if (fwdPass && tileDist(posToTile(fwdPass.position), pt) <= 4) return passTo(fwdPass);
    return moveStep(player, pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const target = getAttackShape(player.role, roleIdx);
  const loosened = { col: Math.min(GRID_COLS - 1, target.col + 1), row: target.row };
  return moveStep(player, pt, loosened, claimed, friendly);
}

function tier2Defense(
  player: SimPlayer, pt: TilePos,
  _aiPlayers: SimPlayer[], playerPlayers: SimPlayer[],
  ballTile: TilePos, claimed: Set<string>, friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") {
    const targetRow = Math.max(1, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: 9, row: targetRow }, claimed, friendly);
  }

  const zoneColMap: Record<string, number> = {
    defender: 8, midfielder: 7, forward: 6, striker: 6,
  };
  const baseCol = zoneColMap[player.role] ?? 7;
  const targetRow = Math.max(1, Math.min(5, ballTile.row));

  const zoneOpponent = playerPlayers.find(opp => {
    const ot = posToTile(opp.position);
    return ot.col >= baseCol - 1 && ot.col <= baseCol + 1 && Math.abs(ot.row - pt.row) <= 1;
  });

  if (zoneOpponent) {
    const oppTile = posToTile(zoneOpponent.position);
    return moveStep(player, pt, { col: Math.min(9, oppTile.col + 1), row: oppTile.row }, claimed, friendly);
  }

  const shiftedCol = Math.min(baseCol, Math.max(baseCol - 1, ballTile.col + 2));
  return moveStep(player, pt, { col: shiftedCol, row: targetRow }, claimed, friendly);
}

// Tier 3 — Easy
function tier3Possession(
  player: SimPlayer, pt: TilePos, hasBall: boolean,
  aiPlayers: SimPlayer[], _playerPlayers: SimPlayer[],
  claimed: Set<string>, friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    if (pt.col <= 4) return shoot();
    const fwd = aiPlayers.find(p => p.id !== player.id && p.role !== "goalkeeper" && posToTile(p.position).col < pt.col);
    if (fwd && Math.random() < 0.2) return passTo(fwd);
    return moveStep(player, pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const target = getAttackShape(player.role, roleIdx);
  const relaxed = { col: Math.min(GRID_COLS - 1, target.col + 2), row: target.row };
  return moveStep(player, pt, relaxed, claimed, friendly);
}

function tier3Defense(
  player: SimPlayer, pt: TilePos,
  aiPlayers: SimPlayer[], _playerPlayers: SimPlayer[],
  ballTile: TilePos, claimed: Set<string>, friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const compactTile = getCompactDefShape(player.role, roleIdx, ballTile.row);
  if (tileDist(pt, ballTile) <= 2 && player.role !== "defender") {
    return moveStep(player, pt, ballTile, claimed, friendly);
  }
  return moveStep(player, pt, compactTile, claimed, friendly);
}

export function generateAICommands(
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ball: SimBall,
  tier: AiTier = 2
): Map<string, Command> {
  const commands = new Map<string, Command>();

  const ballOwner = [...aiPlayers, ...playerPlayers].find(p => p.id === ball.ownerId) ?? null;
  const aiHasBall = ballOwner?.teamId === "ai";
  const playerHasBall = ballOwner?.teamId === "player";
  const ballIsLoose = ball.ownerId === null;
  const ballTile = posToTile(ball.position);

  const claimed = new Set<string>();
  const friendly = new Set<string>();
  for (const p of aiPlayers) {
    const t = posToTile(p.position);
    friendly.add(tileKey(t.col, t.row));
  }

  const sorted = [
    ...aiPlayers.filter(p => p.role === "goalkeeper"),
    ...aiPlayers.filter(p => p.role === "defender"),
    ...aiPlayers.filter(p => p.role === "midfielder"),
    ...aiPlayers.filter(p => p.role === "forward" || p.role === "striker"),
  ];

  for (const player of sorted) {
    const pt = posToTile(player.position);
    const hasBall = player.id === ball.ownerId;

    if (ballIsLoose) {
      const cmd = moveStep(player, pt, ballTile, claimed, friendly);
      commands.set(player.id, cmd);
      continue;
    }

    let cmd: Command;

    if (aiHasBall) {
      switch (tier) {
        case 1: cmd = tier1Possession(player, pt, hasBall, aiPlayers, playerPlayers, claimed, friendly); break;
        case 2: cmd = tier2Possession(player, pt, hasBall, aiPlayers, playerPlayers, claimed, friendly); break;
        default: cmd = tier3Possession(player, pt, hasBall, aiPlayers, playerPlayers, claimed, friendly); break;
      }
    } else if (playerHasBall) {
      switch (tier) {
        case 1: cmd = tier1Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        case 2: cmd = tier2Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        default: cmd = tier3Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
      }
    } else {
      switch (tier) {
        case 1: cmd = tier1Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        case 2: cmd = tier2Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        default: cmd = tier3Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
      }
    }

    commands.set(player.id, cmd);
  }

  return commands;
}
