import type { SimPlayer, SimBall, Command, Vec2 } from "./types";
import { CommandType } from "./types";
import { posToTile, getReachableTiles, tileToPos, tileKey } from "./grid";
import type { TilePos } from "./types";
import { GRID_COLS, speedToTiles } from "./constants";

export type AiTier = 1 | 2 | 3;

// ─── Low-level helpers ───────────────────────────────────────────────────────

function tileDist(a: TilePos, b: TilePos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function chebDist(a: TilePos, b: TilePos): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function eucDist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

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

// ─── Tactical assessment helpers ─────────────────────────────────────────────

// Is this tile directly threatened (opponent within 1 tile)?
function isThreatened(tile: TilePos, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return chebDist(ot, tile) <= 1;
  });
}

// Is the carrier being pressed hard (opponent adjacent)?
function isHardPressed(pt: TilePos, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return chebDist(ot, pt) <= 1;
  });
}

// Is the forward path (lower col) blocked by an opponent?
function isForwardBlocked(pt: TilePos, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return ot.col < pt.col &&        // they are ahead of me (lower col = toward player goal)
           ot.col >= pt.col - 3 &&   // within 3 tiles ahead
           Math.abs(ot.row - pt.row) <= 1; // in my row band
  });
}

// Best teammate for a forward pass (more advanced = lower col)
function bestForwardPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  maxDist: number = 8
): SimPlayer | null {
  const ct = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id && p.role !== "goalkeeper")
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => t.col < ct.col)            // strictly ahead of carrier
    .filter(({ t }) => tileDist(t, ct) <= maxDist) // within pass range
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .sort((a, b) => a.t.col - b.t.col);            // most advanced first
  return candidates[0]?.p ?? null;
}

// Best teammate for a lateral pass (same column band ±1)
function bestLateralPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  maxDist: number = 5
): SimPlayer | null {
  const ct = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id && p.role !== "goalkeeper")
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => Math.abs(t.col - ct.col) <= 1)       // same column band
    .filter(({ t }) => tileDist(t, ct) >= 1 && tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .sort((a, b) => tileDist(a.t, ct) - tileDist(b.t, ct)); // closest first
  return candidates[0]?.p ?? null;
}

// Best teammate for a backward/recycling pass (carrier's col or behind)
function bestBackwardPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  maxDist: number = 6
): SimPlayer | null {
  const ct = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id)
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => t.col > ct.col)               // behind carrier (closer to own goal)
    .filter(({ t }) => tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .sort((a, b) => tileDist(a.t, ct) - tileDist(b.t, ct));
  return candidates[0]?.p ?? null;
}

// Any open teammate in any direction
function bestAnyPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  maxDist: number = 8
): SimPlayer | null {
  const ct = posToTile(carrier.position);
  const candidates = aiPlayers
    .filter(p => p.id !== carrier.id)
    .map(p => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isThreatened(t, playerPlayers))
    .sort((a, b) => a.t.col - b.t.col); // prefer more advanced
  return candidates[0]?.p ?? null;
}

// ─── Off-ball positioning helpers ─────────────────────────────────────────────

// Get the ball-carrier tile (or ball tile if no carrier)
function getBallZone(aiPlayers: SimPlayer[], ball: SimBall | null, ballTile: TilePos): TilePos {
  const carrier = aiPlayers.find(p => p.command !== null);
  // Use ballTile as default
  return ballTile;
}

// For a player index (within role), compute the best run target
function computeRunTarget(
  player: SimPlayer,
  roleIdx: number,
  ballCarrierTile: TilePos,
  tier: AiTier
): TilePos {
  const role = player.role;
  // How far ahead to position (elite = much further, easy = barely)
  const fwdOffset = tier === 1 ? 3 : tier === 2 ? 2 : 1;

  if (role === "striker") {
    // Striker makes a direct run toward goal, staying in the danger zone
    return {
      col: Math.max(1, ballCarrierTile.col - fwdOffset),
      row: 3,
    };
  }
  if (role === "forward") {
    // Forwards run into channels (wide)
    const runRow = roleIdx === 0
      ? Math.max(0, ballCarrierTile.row - 2)
      : Math.min(6, ballCarrierTile.row + 2);
    return {
      col: Math.max(1, ballCarrierTile.col - fwdOffset),
      row: runRow,
    };
  }
  if (role === "midfielder") {
    // Midfielder provides a triangle — sits BEHIND carrier but open
    const supportOffset = tier === 1 ? 1 : tier === 2 ? 2 : 3;
    const supportRow = roleIdx === 0
      ? Math.max(1, ballCarrierTile.row - 1)
      : Math.min(5, ballCarrierTile.row + 1);
    return {
      col: Math.min(GRID_COLS - 2, ballCarrierTile.col + supportOffset),
      row: supportRow,
    };
  }
  if (role === "defender") {
    // Defender covers behind ball, ready for recycled pass
    const coverOffset = tier === 1 ? 2 : 3;
    return {
      col: Math.min(GRID_COLS - 2, ballCarrierTile.col + coverOffset),
      row: Math.max(1, Math.min(5, ballCarrierTile.row)),
    };
  }
  return ballCarrierTile;
}

// ─── Tier 1 — Elite: Possession football, structured triangles, pass-first ───

function tier1Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") {
    // GK tracks ball row, pushes up slightly when team has possession
    const gkRow = Math.max(1, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: 9, row: gkRow }, claimed, friendly);
  }

  if (hasBall) {
    // 1. Shoot if in goal-threat zone
    if (pt.col <= 2) return shoot();

    // 2. Assess situation
    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked = isForwardBlocked(pt, playerPlayers);

    // 3. Elite: pass-first philosophy
    // Forward pass — primary option (always look for it)
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 7);
    if (fwdTarget && !hardPressed) {
      return passTo(fwdTarget);
    }

    // Under pressure: lateral or backward pass (switch play)
    if (hardPressed || fwdBlocked) {
      // Lateral switch — spreads the play
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 5);
      if (latTarget) return passTo(latTarget);

      // Backward recycle — keep possession
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 6);
      if (bkTarget) return passTo(bkTarget);
    }

    // 4. Forward pass even from moderate distance when not blocked
    if (fwdTarget) return passTo(fwdTarget);

    // 5. Dribble only when route is clear
    if (!fwdBlocked && !hardPressed) {
      // Slightly diagonal run to avoid defenders
      const dribRow = pt.row < 3 ? pt.row + 1 : pt.row - 1; // move into space
      const dribTarget = { col: pt.col - 1, row: Math.max(0, Math.min(6, dribRow)) };
      return moveStep(player, pt, dribTarget, claimed, friendly);
    }

    // 6. Last resort: any open teammate
    const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 7);
    if (anyTarget) return passTo(anyTarget);

    // Sidestep to create angle
    const sideRow = pt.row < 3 ? pt.row + 2 : pt.row - 2;
    return moveStep(player, pt, { col: pt.col, row: Math.max(0, Math.min(6, sideRow)) }, claimed, friendly);
  }

  // Off-ball: elite positioning — create triangles and passing lanes
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const ballCarrierTile = ballTile;
  const runTarget = computeRunTarget(player, roleIdx, ballCarrierTile, 1);
  return moveStep(player, pt, runTarget, claimed, friendly);
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
    // Track ball row tightly, stay at col 9
    const targetRow = Math.max(1, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: 9, row: targetRow }, claimed, friendly);
  }

  // Elite defense: high press + man-marking
  // Sort opponents by threat (proximity to AI goal = higher col)
  const playerOutfield = playerPlayers
    .filter(p => p.role !== "goalkeeper")
    .sort((a, b) => eucDist(b.position, { x: 700, y: 230 }) - eucDist(a.position, { x: 700, y: 230 }));
    // NOTE: sorted descending by distance from AI goal — most threatening first

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

  // High press: move directly onto the ball carrier, intercept passing lanes otherwise
  const ballCarrier = playerPlayers.find(p => p.id !== undefined && chebDist(posToTile(p.position), ballTile) === 0);
  if (assignedOpponent === ballCarrier || chebDist(oppTile, ballTile) <= 1) {
    // Press the ball directly
    return moveStep(player, pt, oppTile, claimed, friendly);
  }

  // Cover the intercept position between assigned opponent and ball
  const interceptTile: TilePos = {
    col: Math.max(0, Math.min(GRID_COLS - 1, Math.round((oppTile.col + ballTile.col) / 2))),
    row: Math.max(0, Math.min(6, oppTile.row)),
  };
  return moveStep(player, pt, interceptTile, claimed, friendly);
}

// ─── Tier 2 — Mid: Balanced attack, pass when easy, dribble when open ────────

function tier2Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    // Shoot from closer range than tier 1
    if (pt.col <= 3) return shoot();

    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked = isForwardBlocked(pt, playerPlayers);

    // Pass forward if good opportunity (slightly less eager than Tier 1)
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 5);
    if (fwdTarget && !hardPressed) return passTo(fwdTarget);

    // If pressed, look for any lateral/forward release
    if (hardPressed) {
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 4);
      if (latTarget) return passTo(latTarget);
      // Rarely goes backward — prefers to hold
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 4);
      if (bkTarget && Math.random() < 0.5) return passTo(bkTarget);
    }

    // Dribble forward if route is clear
    if (!fwdBlocked) {
      return moveStep(player, pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
    }

    // Blocked: try to pass or sidestep
    if (fwdTarget) return passTo(fwdTarget);
    const sideRow = pt.row < 3 ? pt.row + 1 : pt.row - 1;
    return moveStep(player, pt, { col: pt.col, row: Math.max(0, Math.min(6, sideRow)) }, claimed, friendly);
  }

  // Off-ball: moderate positioning
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const runTarget = computeRunTarget(player, roleIdx, ballTile, 2);
  return moveStep(player, pt, runTarget, claimed, friendly);
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
    return moveStep(player, pt, { col: 9, row: targetRow }, claimed, friendly);
  }

  // Zonal mid-block: defend column bands, press if ball enters zone
  const zoneColMap: Record<string, number> = {
    defender: 8, midfielder: 7, forward: 6, striker: 6,
  };
  const baseCol = zoneColMap[player.role] ?? 7;
  const targetRow = Math.max(1, Math.min(5, ballTile.row));

  // Check if ball is in this player's zone
  const ballInZone = ballTile.col >= baseCol - 1 && ballTile.col <= baseCol + 1;

  if (ballInZone || tileDist(pt, ballTile) <= 2) {
    // Press toward ball
    return moveStep(player, pt, ballTile, claimed, friendly);
  }

  // Check for opponent in zone to mark
  const zoneOpponent = playerPlayers.find(opp => {
    if (opp.role === "goalkeeper") return false;
    const ot = posToTile(opp.position);
    return ot.col >= baseCol - 1 && ot.col <= baseCol + 1 && Math.abs(ot.row - pt.row) <= 2;
  });

  if (zoneOpponent) {
    const oppTile = posToTile(zoneOpponent.position);
    return moveStep(player, pt, { col: Math.min(GRID_COLS - 1, oppTile.col + 1), row: oppTile.row }, claimed, friendly);
  }

  // Shift toward ball (compact mid-block)
  const shiftedCol = Math.min(baseCol, Math.max(baseCol - 1, ballTile.col + 2));
  return moveStep(player, pt, { col: shiftedCol, row: targetRow }, claimed, friendly);
}

// ─── Tier 3 — Easy: Kick and rush, dribble-heavy, loose organization ─────────

function tier3Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  _playerPlayers: SimPlayer[],
  _ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  if (player.role === "goalkeeper") return stayPut({ col: 9, row: 3 });

  if (hasBall) {
    // Shoot from very early (they are not sophisticated)
    if (pt.col <= 4) return shoot();

    // Rarely pass — only to very close teammate
    const closeTeammate = aiPlayers.find(p =>
      p.id !== player.id &&
      p.role !== "goalkeeper" &&
      tileDist(posToTile(p.position), pt) <= 2
    );
    if (closeTeammate && Math.random() < 0.15) return passTo(closeTeammate);

    // Just dribble forward — very predictable
    return moveStep(player, pt, { col: pt.col - 1, row: pt.row }, claimed, friendly);
  }

  // Off-ball: barely move, loose shape
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const runTarget = computeRunTarget(player, roleIdx, pt, 3);
  return moveStep(player, pt, runTarget, claimed, friendly);
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

  // Passive: sit in own half, only press if ball is very close
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const compactCol: Record<string, number> = { defender: 8, midfielder: 7, forward: 6, striker: 6 };
  const col = compactCol[player.role] ?? 7;
  const compactRow = roleIdx === 0 ? Math.max(1, ballTile.row - 1) : Math.min(5, ballTile.row + 1);

  if (tileDist(pt, ballTile) <= 2) {
    return moveStep(player, pt, ballTile, claimed, friendly);
  }
  return moveStep(player, pt, { col, row: compactRow }, claimed, friendly);
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
  const claimed = new Set<string>();
  const friendly = new Set<string>();
  for (const p of aiPlayers) {
    const t = posToTile(p.position);
    friendly.add(tileKey(t.col, t.row));
  }

  // Process in priority order: GK → defenders → midfielders → attackers
  const sorted = [
    ...aiPlayers.filter(p => p.role === "goalkeeper"),
    ...aiPlayers.filter(p => p.role === "defender"),
    ...aiPlayers.filter(p => p.role === "midfielder"),
    ...aiPlayers.filter(p => p.role === "forward" || p.role === "striker"),
  ];

  for (const player of sorted) {
    const pt = posToTile(player.position);
    const hasBall = player.id === ball.ownerId;

    // Loose ball: chase it
    if (ballIsLoose) {
      const cmd = moveStep(player, pt, ballTile, claimed, friendly);
      commands.set(player.id, cmd);
      continue;
    }

    let cmd: Command;

    if (aiHasBall) {
      switch (tier) {
        case 1: cmd = tier1Possession(player, pt, hasBall, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        case 2: cmd = tier2Possession(player, pt, hasBall, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        default: cmd = tier3Possession(player, pt, hasBall, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
      }
    } else if (playerHasBall) {
      switch (tier) {
        case 1: cmd = tier1Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        case 2: cmd = tier2Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
        default: cmd = tier3Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly); break;
      }
    } else {
      // Transition — treat as defensive
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
