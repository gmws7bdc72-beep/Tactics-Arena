import type { SimPlayer, SimBall, Command, Vec2 } from "./types";
import { CommandType } from "./types";
import { posToTile, getAdjacentTiles, tileToPos, tileKey } from "./grid";
import type { TilePos } from "./types";

export type AiTier = 1 | 2 | 3;

// ─── helpers ────────────────────────────────────────────────────────────────

function tileDist(a: TilePos, b: TilePos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row); // Manhattan
}

function eucDist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function moveStep(from: TilePos, to: TilePos, claimed: Set<string>, friendly: Set<string>): Command {
  if (from.col === to.col && from.row === to.row) {
    return { type: CommandType.MOVE, targetPosition: tileToPos(from.col, from.row) };
  }
  const adj = getAdjacentTiles(from.col, from.row);
  // Pick best adjacent that is not friendly-occupied
  let best: TilePos = from;
  let bestDist = tileDist(from, to);
  for (const c of adj) {
    const k = tileKey(c.col, c.row);
    if (friendly.has(k)) continue; // can't share tile with friendly
    if (claimed.has(k)) continue;  // another AI already moving here
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

// Is the tile threatened by a nearby opponent?
function isThreatened(tile: TilePos, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return tileDist(ot, tile) <= 1;
  });
}

// Find the most advanced (lowest col) free AI teammate that isn't threatened
function bestForwardPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[]
): SimPlayer | null {
  const carrierTile = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id && p.role !== "goalkeeper")
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => t.col < carrierTile.col) // more advanced toward goal
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .sort((a, b) => a.t.col - b.t.col); // most advanced first
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

// ─── Attack formation positions (in AI coordinates, col 9=GK side, col 0=player goal) ───

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

// ─── Tier 1 — Elite: structured possession + man-marking defense ─────────────

function tier1Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") {
    return stayPut({ col: 9, row: 3 });
  }

  if (hasBall) {
    // Shoot if close to goal (col 0-2)
    if (pt.col <= 2) return shoot();

    // Look for a clean forward pass first
    const fwdPass = bestForwardPass(player, aiPlayers, playerPlayers);
    if (fwdPass) return passTo(fwdPass);

    // Try a support pass to recycle if pressed
    if (isThreatened(pt, playerPlayers)) {
      const sup = bestSupportPass(player, aiPlayers, playerPlayers);
      if (sup) return passTo(sup);
    }

    // Dribble forward
    return moveStep(pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  // Off-ball: move into attack shape positions
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const target = getAttackShape(player.role, roleIdx);
  // Forwards make runs — try to get into col 1-3, vary row
  if (player.role === "forward" || player.role === "striker") {
    const ballCarrier = aiPlayers.find(p => p.id !== player.id);
    const ballRow = ballCarrier ? posToTile(ballCarrier.position).row : 3;
    const runTarget = {
      col: Math.max(1, target.col),
      row: roleIdx === 0
        ? Math.max(0, ballRow - 2)
        : Math.min(6, ballRow + 2),
    };
    return moveStep(pt, runTarget, claimed, friendly);
  }
  return moveStep(pt, target, claimed, friendly);
}

function tier1Defense(
  player: SimPlayer,
  pt: TilePos,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") {
    // Track ball row, stay at col 9
    const targetRow = Math.max(1, Math.min(5, ballTile.row));
    return moveStep(pt, { col: 9, row: targetRow }, claimed, friendly);
  }

  // Man-marking: assign each outfield player to mark an opponent
  // Sort player-team outfield by threat (distance from AI goal = lower x)
  const playerOutfield = playerPlayers
    .filter(p => p.role !== "goalkeeper")
    .sort((a, b) => eucDist(a.position, { x: 700, y: 230 }) - eucDist(b.position, { x: 700, y: 230 }));

  const aiOutfield = aiPlayers
    .filter(p => p.role !== "goalkeeper")
    .sort((a, b) => {
      // Most defensive AI marks most dangerous opponent
      const roleOrder: Record<string, number> = { defender: 0, midfielder: 1, forward: 2, striker: 3 };
      return (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2);
    });

  const myIdx = aiOutfield.findIndex(p => p.id === player.id);
  const assignedOpponent = playerOutfield[myIdx] ?? playerOutfield[0];

  if (!assignedOpponent) return stayPut(pt);

  const oppTile = posToTile(assignedOpponent.position);

  // Move to intercept between opponent and ball
  const interceptTile: TilePos = {
    col: Math.max(0, Math.min(9, Math.round((oppTile.col + ballTile.col) / 2))),
    row: Math.max(0, Math.min(6, oppTile.row)),
  };

  // If very close to opponent, move directly onto them (tackle)
  if (tileDist(pt, oppTile) <= 1) {
    return moveStep(pt, oppTile, claimed, friendly);
  }

  return moveStep(pt, interceptTile, claimed, friendly);
}

// ─── Tier 2 — Mid: structured build-up + zonal defense ──────────────────────

function tier2Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    if (pt.col <= 3) return shoot();
    // Occasionally pass to a free forward
    const fwdPass = bestForwardPass(player, aiPlayers, playerPlayers);
    if (fwdPass && tileDist(posToTile(fwdPass.position), pt) <= 4) return passTo(fwdPass);
    // Carry forward
    return moveStep(pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  // Off-ball: loose support shape (one step toward attack)
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const target = getAttackShape(player.role, roleIdx);
  const loosened = { col: target.col + 1, row: target.row }; // slightly deeper than elite
  return moveStep(pt, loosened, claimed, friendly);
}

function tier2Defense(
  player: SimPlayer,
  pt: TilePos,
  _aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") {
    const targetRow = Math.max(1, Math.min(5, ballTile.row));
    return moveStep(pt, { col: 9, row: targetRow }, claimed, friendly);
  }

  // Zonal marking: defend column bands, shift toward ball side
  const zoneColMap: Record<string, number> = {
    defender: 8,
    midfielder: 7,
    forward: 6,
    striker: 6,
  };
  const baseCol = zoneColMap[player.role] ?? 7;

  // Shift toward ball row
  const targetRow = Math.max(1, Math.min(5, ballTile.row));

  // Check if an opponent is in this player's zone
  const zoneOpponent = playerPlayers.find(opp => {
    const ot = posToTile(opp.position);
    return ot.col >= baseCol - 1 && ot.col <= baseCol + 1 && Math.abs(ot.row - pt.row) <= 1;
  });

  if (zoneOpponent) {
    // Track the opponent in the zone
    const oppTile = posToTile(zoneOpponent.position);
    return moveStep(pt, { col: Math.min(9, oppTile.col + 1), row: oppTile.row }, claimed, friendly);
  }

  // Shift toward ball column (compact mid-block)
  const shiftedCol = Math.min(baseCol, Math.max(baseCol - 1, ballTile.col + 2));
  return moveStep(pt, { col: shiftedCol, row: targetRow }, claimed, friendly);
}

// ─── Tier 3 — Easy: passive/compact ─────────────────────────────────────────

function tier3Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  _playerPlayers: SimPlayer[],
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    if (pt.col <= 4) return shoot();
    // Rarely pass
    const fwd = aiPlayers.find(p => p.id !== player.id && p.role !== "goalkeeper" && posToTile(p.position).col < pt.col);
    if (fwd && Math.random() < 0.2) return passTo(fwd);
    return moveStep(pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  // Passive support — barely move
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const target = getAttackShape(player.role, roleIdx);
  const relaxed = { col: target.col + 2, row: target.row }; // stay well back
  return moveStep(pt, relaxed, claimed, friendly);
}

function tier3Defense(
  player: SimPlayer,
  pt: TilePos,
  aiPlayers: SimPlayer[],
  _playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  // Passive: sit in own half (cols 6-9), keep basic defensive shape
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const compactTile = getCompactDefShape(player.role, roleIdx, ballTile.row);
  // Don't press — only track ball if it's very close (within 2 tiles)
  if (tileDist(pt, ballTile) <= 2 && player.role !== "defender") {
    return moveStep(pt, ballTile, claimed, friendly);
  }
  return moveStep(pt, compactTile, claimed, friendly);
}

// ─── Main export ─────────────────────────────────────────────────────────────

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

  // Build occupancy sets
  // claimed: tiles already assigned to an AI player this turn (to avoid double-booking)
  const claimed = new Set<string>();
  // friendly: tiles currently occupied by AI players (start-of-turn positions)
  const friendly = new Set<string>();
  for (const p of aiPlayers) {
    friendly.add(tileKey(...Object.values(posToTile(p.position)) as [number, number]));
  }

  // Process GK first, then outfield in priority order
  const sorted = [
    ...aiPlayers.filter(p => p.role === "goalkeeper"),
    ...aiPlayers.filter(p => p.role === "defender"),
    ...aiPlayers.filter(p => p.role === "midfielder"),
    ...aiPlayers.filter(p => p.role === "forward" || p.role === "striker"),
  ];

  for (const player of sorted) {
    const pt = posToTile(player.position);
    const hasBall = player.id === ball.ownerId;

    // Loose ball: everyone chases it
    if (ballIsLoose) {
      const cmd = moveStep(pt, ballTile, claimed, friendly);
      commands.set(player.id, cmd);
      continue;
    }

    let cmd: Command;

    if (aiHasBall) {
      // Possession mode
      switch (tier) {
        case 1: cmd = tier1Possession(player, pt, hasBall, aiPlayers, playerPlayers, claimed, friendly); break;
        case 2: cmd = tier2Possession(player, pt, hasBall, aiPlayers, playerPlayers, claimed, friendly); break;
        default: cmd = tier3Possession(player, pt, hasBall, aiPlayers, playerPlayers, claimed, friendly); break;
      }
    } else if (playerHasBall) {
      // Defensive mode
      switch (tier) {
        case 1: cmd = tier1Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        case 2: cmd = tier2Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        default: cmd = tier3Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
      }
    } else {
      // Transition: fallback to defensive shape
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
