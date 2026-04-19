import type { SimPlayer, SimBall, Command, Vec2 } from "./types";
import { CommandType } from "./types";
import { posToTile, getReachableTiles, tileToPos, tileKey } from "./grid";
import type { TilePos } from "./types";
import { GRID_COLS, GRID_ROWS, speedToTiles, getLinearPixelSpeed, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX, GK_COLS_AI_MIN, GK_COLS_AI_MAX, PASS_SPEED, PITCH_WIDTH, PITCH_HEIGHT } from "./constants";

export type AiTier = 1 | 2 | 3;

/**
 * Carry the "pass-to-tile" decision from the carrier's tier function back to
 * the main loop, so the designated runner can be given a MOVE override that
 * sends them to the exact tile the ball is aimed at.
 */
interface PassTilePlan {
  runnerId: string;
  runTile: TilePos;
}

// ─── Adaptive AI ─────────────────────────────────────────────────────────────

// Tracks where the AI has conceded goals so it can adjust its defensive shape.
export interface AdaptiveAIState {
  concededRows: number[]; // pitch rows (0-8) where each goal was conceded, oldest first
  tier1Markings?: Record<string, string>; // aiPlayerId → playerPlayerId, set once at kickoff
}

interface Adaptation {
  dangerRow: number | null; // weighted average conceded row, null if nothing conceded
  urgency: number;          // 0-3: how many recent concessions (caps at 3 for calculations)
}

function computeAdaptation(state: AdaptiveAIState | undefined): Adaptation {
  if (!state || state.concededRows.length === 0) return { dangerRow: null, urgency: 0 };
  const rows = state.concededRows.slice(-3); // consider last 3 goals
  // Weighted average — most recent goal has highest weight
  let totalWeight = 0, weightedSum = 0;
  for (let i = 0; i < rows.length; i++) {
    const w = i + 1;
    weightedSum += rows[i] * w;
    totalWeight += w;
  }
  return {
    dangerRow: Math.round(weightedSum / totalWeight),
    urgency: Math.min(3, rows.length),
  };
}

// Blend a ball-tracking row toward the danger zone proportional to urgency.
// urgency 1 = 20% shift, 2 = 40%, 3 = 60%.
function adaptRow(ballRow: number, { dangerRow, urgency }: Adaptation): number {
  if (dangerRow === null || urgency === 0) return ballRow;
  const weight = urgency * 0.2;
  return Math.max(1, Math.min(5, Math.round(ballRow * (1 - weight) + dangerRow * weight)));
}

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
  _friendly: Set<string>
): Command {
  if (from.col === to.col && from.row === to.row) {
    return { type: CommandType.MOVE, targetPosition: tileToPos(from.col, from.row) };
  }

  const isGK = player.role === "goalkeeper";
  // GK gets 2 tiles so they can quickly return to goal after chasing loose balls
  const range = isGK ? 2 : speedToTiles(player.stats.speed);
  const reachable = getReachableTiles(from.col, from.row, range, isGK, player.teamId);

  let best: TilePos = from;
  let bestDist = tileDist(from, to);

  for (const c of reachable) {
    const k = tileKey(c.col, c.row);
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

// Chase a loose ball at full speed. GK stays within their zone but moves at their real speed.
function chaseLooseBall(
  player: SimPlayer,
  pt: TilePos,
  ballTile: TilePos,
  claimed: Set<string>,
  _friendly: Set<string>
): Command {
  const isGK = player.role === "goalkeeper";
  const range = speedToTiles(player.stats.speed); // full speed — not the GK-limited 1
  const reachable = getReachableTiles(pt.col, pt.row, range, isGK, player.teamId);

  // GK targets ball clamped to their zone; outfield targets ball directly
  const gkMin = player.teamId === "ai" ? GK_COLS_AI_MIN : GK_COLS_PLAYER_MIN;
  const gkMax = player.teamId === "ai" ? GK_COLS_AI_MAX : GK_COLS_PLAYER_MAX;
  const target: TilePos = isGK
    ? { col: Math.max(gkMin, Math.min(gkMax, ballTile.col)), row: Math.max(0, Math.min(GRID_ROWS - 1, ballTile.row)) }
    : ballTile;

  let best: TilePos = pt;
  let bestDist = tileDist(pt, target);
  for (const c of reachable) {
    const k = tileKey(c.col, c.row);
    if (claimed.has(k)) continue;
    const d = tileDist(c, target);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  if (best !== pt) claimed.add(tileKey(best.col, best.row));
  return { type: CommandType.MOVE, targetPosition: tileToPos(best.col, best.row) };
}

function shoot(): Command {
  return { type: CommandType.SHOOT };
}

/**
 * Lead-pass intercept: find where to aim the ball so it meets a moving receiver.
 *
 * We solve for time t > 0 where the ball (starting at ballPos, speed S) reaches
 * the receiver's predicted position (targetPos + targetVel * t):
 *
 *   ||targetPos + targetVel·t − ballPos||² = (S·t)²
 *
 * Expanding with d = targetPos − ballPos:
 *   (|targetVel|² − S²)·t² + 2(d·targetVel)·t + |d|² = 0
 *
 * Since S >> |targetVel|, the coefficient a is negative so discriminant is always
 * positive and one root is always positive. We take the smallest positive root.
 * Falls back to current position on any degenerate case.
 */
function leadPassTarget(ballPos: Vec2, target: SimPlayer): Vec2 {
  const dx = target.position.x - ballPos.x;
  const dy = target.position.y - ballPos.y;
  const vx = target.velocity.x;
  const vy = target.velocity.y;
  const S  = PASS_SPEED;

  const a = vx * vx + vy * vy - S * S;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;

  // When target is stationary, skip the quadratic and use current pos
  if (Math.abs(a + S * S) < 1) return { ...target.position };

  const disc = b * b - 4 * a * c;
  if (disc < 0) return { ...target.position };

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b + sqrtDisc) / (2 * a);
  const t2 = (-b - sqrtDisc) / (2 * a);

  let t = Infinity;
  if (t1 > 0.01) t = Math.min(t, t1);
  if (t2 > 0.01) t = Math.min(t, t2);
  if (!isFinite(t)) return { ...target.position };

  return {
    x: Math.max(0, Math.min(PITCH_WIDTH,  target.position.x + vx * t)),
    y: Math.max(0, Math.min(PITCH_HEIGHT, target.position.y + vy * t)),
  };
}

function passTo(target: SimPlayer, _ballPos?: Vec2): Command {
  return { type: CommandType.PASS, targetPlayerId: target.id, targetPosition: { ...target.position } };
}

// Pass and immediately run into space after — a "pass and run" combo command.
// The carrier passes to `target` then moves to `runTile`.
function passAndRun(target: SimPlayer, runTile: TilePos, _ballPos?: Vec2): Command {
  return {
    type: CommandType.PASS,
    targetPlayerId: target.id,
    targetPosition: { ...target.position },
    followUp: { type: CommandType.MOVE, targetPosition: tileToPos(runTile.col, runTile.row) },
  };
}

// Move to `destTile` then immediately fire a pass to `target` — a "run and pass" combo.
// The simulation fires the pass instantly on arrival so the ball travels the full distance.
function moveAndPass(destTile: TilePos, target: SimPlayer): Command {
  return {
    type: CommandType.MOVE,
    targetPosition: tileToPos(destTile.col, destTile.row),
    followUp: { type: CommandType.PASS, targetPlayerId: target.id, targetPosition: { ...target.position } },
  };
}

// Pick a sensible "run into space" tile for the carrier after they pass.
// Tries to move into a gap 1-2 tiles ahead and to the side for a return pass.
function pickRunAfterPassTile(_carrier: SimPlayer, pt: TilePos, opponents: SimPlayer[]): TilePos {
  const candidates: TilePos[] = [
    { col: pt.col - 1, row: pt.row },
    { col: pt.col - 1, row: Math.max(0, pt.row - 1) },
    { col: pt.col - 1, row: Math.min(GRID_ROWS - 1, pt.row + 1) },
    { col: pt.col,     row: Math.max(0, pt.row - 1) },
    { col: pt.col,     row: Math.min(GRID_ROWS - 1, pt.row + 1) },
    { col: pt.col - 2, row: pt.row },
  ];
  // Prefer tiles not near opponents
  const safe = candidates.filter(t =>
    t.col >= 0 && t.col < GRID_COLS &&
    !isThreatened(t, opponents)
  );
  return (safe.length > 0 ? safe[0] : candidates[0]) ?? pt;
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

// Is the very next tile forward blocked by an opponent?
function isForwardBlocked(pt: TilePos, opponents: SimPlayer[]): boolean {
  return opponents.some(opp => {
    const ot = posToTile(opp.position);
    return ot.col === pt.col - 1 && Math.abs(ot.row - pt.row) <= 1;
  });
}

/**
 * Returns true if any opponent tile lies on an intermediate tile of the pass
 * lane from `fromTile` to `toTile` (endpoints excluded). Uses linear
 * interpolation (approximates Bresenham's line) so the check is purely
 * tile-based and scales naturally with pass distance.
 */
function isLaneBlocked(fromTile: TilePos, toTile: TilePos, opponents: SimPlayer[]): boolean {
  const steps = Math.max(
    Math.abs(toTile.col - fromTile.col),
    Math.abs(toTile.row - fromTile.row)
  );
  if (steps <= 1) return false; // Adjacent pass — no intermediate tiles to block

  const oppTiles = new Set(
    opponents.map(o => {
      const t = posToTile(o.position);
      return tileKey(t.col, t.row);
    })
  );

  for (let i = 1; i < steps; i++) {
    const frac = i / steps;
    const col = Math.round(fromTile.col + frac * (toTile.col - fromTile.col));
    const row = Math.round(fromTile.row + frac * (toTile.row - fromTile.row));
    if (oppTiles.has(tileKey(col, row))) return true;
  }
  return false;
}

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
    .filter(({ t }) => t.col < ct.col)
    .filter(({ t }) => tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isLaneBlocked(ct, t, playerPlayers))
    .sort((a, b) => {
      const aThreat = isThreatened(a.t, playerPlayers) ? 1 : 0;
      const bThreat = isThreatened(b.t, playerPlayers) ? 1 : 0;
      if (aThreat !== bThreat) return aThreat - bThreat;
      return a.t.col - b.t.col; // most advanced first
    });
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
    .filter(({ t }) => Math.abs(t.col - ct.col) <= 1)
    .filter(({ t }) => tileDist(t, ct) >= 1 && tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isLaneBlocked(ct, t, playerPlayers))
    .sort((a, b) => {
      const aThreat = isThreatened(a.t, playerPlayers) ? 1 : 0;
      const bThreat = isThreatened(b.t, playerPlayers) ? 1 : 0;
      if (aThreat !== bThreat) return aThreat - bThreat;
      return tileDist(a.t, ct) - tileDist(b.t, ct);
    });
  return candidates[0]?.p ?? null;
}

// Best teammate for a backward/recycling pass
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
    .filter(({ t }) => t.col > ct.col)
    .filter(({ t }) => tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isLaneBlocked(ct, t, playerPlayers))
    .sort((a, b) => {
      const aThreat = isThreatened(a.t, playerPlayers) ? 1 : 0;
      const bThreat = isThreatened(b.t, playerPlayers) ? 1 : 0;
      if (aThreat !== bThreat) return aThreat - bThreat;
      return tileDist(a.t, ct) - tileDist(b.t, ct);
    });
  return candidates[0]?.p ?? null;
}

// Any teammate in any direction (least threatened, most advanced)
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
    .filter(({ t }) => !isLaneBlocked(ct, t, playerPlayers))
    .sort((a, b) => {
      const aThreat = isThreatened(a.t, playerPlayers) ? 1 : 0;
      const bThreat = isThreatened(b.t, playerPlayers) ? 1 : 0;
      if (aThreat !== bThreat) return aThreat - bThreat;
      return a.t.col - b.t.col; // prefer more advanced
    });
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
  // How far ahead to position — must be large enough to push into the attacking half
  // on a 16-col grid (AI attacks toward col 0; carrier typically at cols 8-12)
  const fwdOffset = tier === 1 ? 6 : tier === 2 ? 5 : 2;
  // Minimum column targets: ensure attackers push deep into scoring positions
  const minAttackCol = tier === 1 ? 2 : tier === 2 ? 3 : 4;

  if (role === "striker") {
    // Striker makes a direct run into the goal-threat zone
    return {
      col: Math.max(minAttackCol, ballCarrierTile.col - fwdOffset),
      row: Math.floor(GRID_ROWS / 2),
    };
  }
  if (role === "forward") {
    // Forwards run into wide channels ahead of the carrier
    const runRow = roleIdx === 0
      ? Math.max(0, ballCarrierTile.row - 2)
      : Math.min(GRID_ROWS - 1, ballCarrierTile.row + 2);
    return {
      col: Math.max(minAttackCol + 1, ballCarrierTile.col - fwdOffset),
      row: runRow,
    };
  }
  if (role === "midfielder") {
    // Midfielders fan out ahead/level with carrier to create passing lanes
    const midFwdOffset = tier === 1 ? 4 : tier === 2 ? 3 : 1;
    const supportRow = roleIdx === 0
      ? Math.max(1, ballCarrierTile.row - 1)
      : Math.min(GRID_ROWS - 2, ballCarrierTile.row + 1);
    return {
      col: Math.max(minAttackCol + 2, ballCarrierTile.col - midFwdOffset),
      row: supportRow,
    };
  }
  if (role === "defender") {
    // Defender stays behind ball as recycling option
    const coverOffset = tier === 1 ? 3 : 4;
    const coverRow = roleIdx === 0
      ? Math.max(1, ballCarrierTile.row - 1)
      : Math.min(GRID_ROWS - 2, ballCarrierTile.row + 1);
    return {
      col: Math.min(GRID_COLS - 2, ballCarrierTile.col + coverOffset),
      row: coverRow,
    };
  }
  return ballCarrierTile;
}

// ─── Player style system ─────────────────────────────────────────────────────

type PlayerStyle = "passer" | "dribbler" | "poacher" | "support" | "balanced";

/** Derive a player's possession style from their stats and role. */
function getPlayerStyle(player: SimPlayer): PlayerStyle {
  const { passing, attack, defense, speed } = player.stats;
  const { role } = player;
  // Fast attackers lurk in the danger zone waiting for the ball
  if ((role === "striker" || role === "forward") && speed >= 7) return "poacher";
  // High passing stat → always looking to distribute
  if (passing >= 7) return "passer";
  // High attack, low-ish passing → wants to carry the ball
  if (attack >= 7 && passing < 6) return "dribbler";
  // Defensive / recycling role
  if (role === "defender" || defense >= 7) return "support";
  return "balanced";
}

/** Off-ball movement target based on the player's style. */
function styleOffBallTarget(
  player: SimPlayer,
  style: PlayerStyle,
  roleIdx: number,
  ballTile: TilePos
): TilePos {
  switch (style) {
    case "poacher": {
      // Three spread zones so multiple poachers never stack on the same tile.
      // roleIdx here is a GLOBAL index across ALL poacher-style players (computed
      // in the caller), so two poachers with different roles won't share a zone.
      const halfRow = Math.floor(GRID_ROWS / 2);
      const zones: TilePos[] = [
        { col: 2, row: halfRow },                                     // centre striker
        { col: 3, row: Math.max(1, halfRow - 3) },                    // top wing
        { col: 2, row: Math.min(GRID_ROWS - 2, halfRow + 3) },        // bottom wing
      ];
      return zones[roleIdx % zones.length];
    }
    case "passer": {
      // Spread wide of the carrier to form passing triangles
      const row = roleIdx === 0
        ? Math.max(0, ballTile.row - 2)
        : Math.min(GRID_ROWS - 1, ballTile.row + 2);
      return { col: Math.max(1, ballTile.col - 2), row };
    }
    case "dribbler": {
      // Stay 1 tile behind the carrier — ready to receive then run
      const row = roleIdx === 0
        ? Math.max(0, ballTile.row - 1)
        : Math.min(GRID_ROWS - 1, ballTile.row + 1);
      return { col: Math.max(1, ballTile.col - 1), row };
    }
    case "support": {
      // Stay 3 tiles behind the ball as a safe backward-pass outlet
      const row = roleIdx === 0
        ? Math.max(1, ballTile.row - 1)
        : Math.min(GRID_ROWS - 2, ballTile.row + 1);
      return { col: Math.min(GRID_COLS - 2, ballTile.col + 3), row };
    }
    default: // "balanced"
      return computeRunTarget(player, roleIdx, ballTile, 1);
  }
}

/**
 * Press a ball carrier by targeting the tile ONE step AHEAD of them in their
 * attack direction (player team attacks toward higher col = rightward).
 * This guarantees:
 *   • the command target is never the carrier's exact tile, so the
 *     simulation's passingThrough check triggers and a tackle is attempted
 *   • defenders never press BEHIND the carrier (toward the carrier's own goal)
 */
function pressCarrier(
  player: SimPlayer,
  from: TilePos,
  carrierTile: TilePos,
  claimed: Set<string>,
  _friendly: Set<string>
): Command {
  const interceptTile: TilePos = {
    col: Math.min(GRID_COLS - 1, carrierTile.col + 1),
    row: carrierTile.row,
  };

  const isGK = player.role === "goalkeeper";
  const range = isGK ? 2 : speedToTiles(player.stats.speed);
  const reachable = getReachableTiles(from.col, from.row, range, isGK, player.teamId);

  let best: TilePos = from;
  let bestDist = tileDist(from, interceptTile);

  for (const c of reachable) {
    // Never land exactly on the carrier — that fails the passingThrough check
    if (c.col === carrierTile.col && c.row === carrierTile.row) continue;
    const k = tileKey(c.col, c.row);
    if (claimed.has(k)) continue;
    const d = tileDist(c, interceptTile);
    if (d < bestDist) { bestDist = d; best = c; }
  }

  if (best !== from) claimed.add(tileKey(best.col, best.row));
  return { type: CommandType.MOVE, targetPosition: tileToPos(best.col, best.row) };
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
  friendly: Set<string>,
  planRef?: { current: PassTilePlan | null }
): Command {
  if (player.role === "goalkeeper") {
    if (hasBall) {
      // GK distributes: pass to the closest open forward teammate
      const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 4);
      if (fwdTarget) {
        const runTile = posToTile(fwdTarget.position);
        if (planRef) {
          planRef.current = { runnerId: fwdTarget.id, runTile };
          return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
        }
        return passTo(fwdTarget, player.position);
      }
      const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 4);
      if (anyTarget) {
        const anyTile = posToTile(anyTarget.position);
        if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
        return passTo(anyTarget, player.position);
      }
    }
    // Off-ball: track ball row, stay in central 3 rows so corners remain scorable
    const gkRow = Math.max(3, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: GRID_COLS - 1, row: gkRow }, claimed, friendly);
  }

  if (hasBall) {
    const style = getPlayerStyle(player);

    // 1. Shoot — poachers shoot from further out, everyone else from close range
    const shootCol = style === "poacher" ? 5 : 2;
    if (pt.col <= shootCol) return shoot();

    // 2. Dribbler: move into space then release — or carry when the path is open
    if (style === "dribbler") {
      const hardPressedD = isHardPressed(pt, playerPlayers);
      const fwdBlockedD  = isForwardBlocked(pt, playerPlayers);
      if (!hardPressedD && !fwdBlockedD) {
        // Move+Pass: drive one tile forward then whip it to the most advanced teammate
        const advTarget = bestForwardPass(player, aiPlayers, playerPlayers, 7)
          ?? bestLateralPass(player, aiPlayers, playerPlayers, 5);
        if (advTarget && Math.random() < 0.55) {
          const dribRange = speedToTiles(player.stats.speed);
          const destTile: TilePos = { col: Math.max(0, pt.col - dribRange), row: pt.row };
          return moveAndPass(destTile, advTarget);
        }
        // Otherwise just carry
        const dribRange = speedToTiles(player.stats.speed);
        const dribRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 1 : pt.row - 1;
        return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: Math.max(0, Math.min(GRID_ROWS - 1, dribRow)) }, claimed, friendly);
      }
      // Pressed — Pass+Move to escape: pass and immediately reposition
      const dumpTarget = bestAnyPass(player, aiPlayers, playerPlayers, 7);
      if (dumpTarget) {
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        return passAndRun(dumpTarget, runTile, player.position);
      }
    }

    // 2b. Passer style: quick release then run — always prefer Pass+Move
    if (style === "passer") {
      const fwdP = bestForwardPass(player, aiPlayers, playerPlayers, 7);
      if (fwdP) {
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        return passAndRun(fwdP, runTile, player.position);
      }
      const latP = bestLateralPass(player, aiPlayers, playerPlayers, 5);
      if (latP) {
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        return passAndRun(latP, runTile, player.position);
      }
    }

    // 3. Assess situation
    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked = isForwardBlocked(pt, playerPlayers);

    // 4. Forward pass — best forward target (already sorted by least threatened).
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 7);
    if (fwdTarget) {
      const fwdThreat = isThreatened(posToTile(fwdTarget.position), playerPlayers);
      if (!fwdThreat || hardPressed || fwdBlocked) {
        const projTile = posToTile(fwdTarget.position);
        // Push pass target 1 tile more advanced so receiver must sprint → visible through-ball
        const runTile: TilePos = { col: Math.max(1, projTile.col - 1), row: projTile.row };
        if (planRef) {
          planRef.current = { runnerId: fwdTarget.id, runTile };
          return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
        }
        return passTo(fwdTarget, player.position);
      }
    }

    // 5. Under pressure or forward blocked: escape with Pass+Move or plain pass.
    if (hardPressed || fwdBlocked) {
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 5);
      if (latTarget) {
        // All styles: prefer Pass+Move when pressed — get the ball away and find space
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        if (Math.random() < 0.55) return passAndRun(latTarget, runTile, player.position);
        const latTile = posToTile(latTarget.position);
        if (planRef) planRef.current = { runnerId: latTarget.id, runTile: latTile };
        return passTo(latTarget, player.position);
      }
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 6);
      if (bkTarget) {
        const bkTile = posToTile(bkTarget.position);
        if (planRef) planRef.current = { runnerId: bkTarget.id, runTile: bkTile };
        return passTo(bkTarget, player.position);
      }
    }

    // 5b. Support style: recycle safely and reposition with Pass+Move
    if (style === "support" && !hardPressed) {
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 5);
      if (latTarget) {
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        if (Math.random() < 0.40) return passAndRun(latTarget, runTile, player.position);
        if (planRef) planRef.current = { runnerId: latTarget.id, runTile: posToTile(latTarget.position) };
        return passTo(latTarget, player.position);
      }
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 5);
      if (bkTarget) {
        if (planRef) planRef.current = { runnerId: bkTarget.id, runTile: posToTile(bkTarget.position) };
        return passTo(bkTarget, player.position);
      }
    }

    // 5. No pass available and not blocked: dribble forward.
    if (!fwdBlocked) {
      const dribRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 1 : pt.row - 1;
      const dribRange = speedToTiles(player.stats.speed);
      return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: Math.max(0, Math.min(GRID_ROWS - 1, dribRow)) }, claimed, friendly);
    }

    // 6. Truly stuck: any open teammate in any direction.
    const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 7);
    if (anyTarget) {
      const anyTile = posToTile(anyTarget.position);
      if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
      return passTo(anyTarget, player.position);
    }

    // Sidestep to create a new passing angle.
    const sideRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 2 : pt.row - 2;
    return moveStep(player, pt, { col: pt.col, row: Math.max(0, Math.min(GRID_ROWS - 1, sideRow)) }, claimed, friendly);
  }

  // Off-ball: style-based positioning.
  // For poachers use a GLOBAL style index so two poachers with different
  // roles (e.g. striker + forward) still get different spread zones.
  const style = getPlayerStyle(player);
  const roleIdx = style === "poacher"
    ? aiPlayers.filter(p => getPlayerStyle(p) === "poacher").findIndex(p => p.id === player.id)
    : aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const runTarget = styleOffBallTarget(player, style, roleIdx, ballTile);
  return moveStep(player, pt, runTarget, claimed, friendly);
}

// Builds a fixed 1-to-1 man-marking map for Tier 1 at game start.
// Defensive roles (defender, midfielder) greedily claim the closest unassigned
// player opponent (who are most advanced at kickoff = most dangerous).
// Attacking roles (forward, striker) randomly claim whoever remains —
// ensuring no two AI players ever shadow the same opponent.
function computeTier1Markings(
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[]
): Record<string, string> {
  const markings: Record<string, string> = {};
  const roleOrder: Record<string, number> = { defender: 0, midfielder: 1, forward: 2, striker: 3 };

  const aiOutfield = [...aiPlayers]
    .filter(p => p.role !== "goalkeeper")
    .sort((a, b) => (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2));

  const unassigned = [...playerPlayers].filter(p => p.role !== "goalkeeper");

  for (const aiPlayer of aiOutfield) {
    if (unassigned.length === 0) break;

    let pickIdx: number;
    if (aiPlayer.role === "forward" || aiPlayer.role === "striker") {
      // Attacking roles: random pick from whatever opponents are left
      pickIdx = Math.floor(Math.random() * unassigned.length);
    } else {
      // Defensive roles: greedy — claim the closest unassigned opponent
      pickIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < unassigned.length; i++) {
        const d = eucDist(aiPlayer.position, unassigned[i].position);
        if (d < bestDist) { bestDist = d; pickIdx = i; }
      }
    }

    markings[aiPlayer.id] = unassigned[pickIdx].id;
    unassigned.splice(pickIdx, 1);
  }

  return markings;
}

function tier1Defense(
  player: SimPlayer,
  pt: TilePos,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
  adaptiveState?: AdaptiveAIState
): Command {
  if (player.role === "goalkeeper") {
    // Track ball row, stay at AI goal col, central 3 rows so corners remain scorable
    const ballRow = Math.max(3, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: GRID_COLS - 1, row: ballRow }, claimed, friendly);
  }

  // Initialise marking assignments once at game start
  if (adaptiveState && !adaptiveState.tier1Markings) {
    adaptiveState.tier1Markings = computeTier1Markings(aiPlayers, playerPlayers);
  }

  const assignedId = adaptiveState?.tier1Markings?.[player.id];
  const assignedOpponent = assignedId
    ? (playerPlayers.find(p => p.id === assignedId) ?? null)
    : null;

  // Fallback: no mark assigned (e.g. more AI players than opponents) — press ball
  if (!assignedOpponent) {
    return pressCarrier(player, pt, ballTile, claimed, friendly);
  }

  const oppTile = posToTile(assignedOpponent.position);
  const oppDistFromBall = chebDist(oppTile, ballTile);

  // ── Ball carrier (opponent HAS the ball) ──────────────────────────────────
  // If this player is the closest AI outfield player to the ball carrier, press
  // directly through their tile. Otherwise cut their most likely forward outlet.
  if (oppDistFromBall === 0) {
    const aiOutfield = aiPlayers.filter(p => p.role !== "goalkeeper");
    const myDist = chebDist(pt, oppTile);
    const isClosest = aiOutfield.every(p => {
      if (p.id === player.id) return true;
      return chebDist(posToTile(p.position), oppTile) >= myDist;
    });

    if (isClosest) {
      // Closest player intercepts ahead of the carrier (never exact tile → tackle triggers)
      return pressCarrier(player, pt, oppTile, claimed, friendly);
    }

    // Farther players: intercept the most dangerous (most-advanced = lowest col) run outlet
    const teammates = playerPlayers.filter(
      p => p.role !== "goalkeeper" && p.id !== assignedOpponent.id
    );
    if (teammates.length > 0) {
      // Lowest col = most advanced for the attacking player team (attacking right→left)
      const danger = teammates.reduce((best, p) =>
        posToTile(p.position).col < posToTile(best.position).col ? p : best
      );
      const tgt = posToTile(danger.position);
      const laneCol = Math.max(0, Math.min(GRID_COLS - 1,
        Math.round(oppTile.col * 0.4 + tgt.col * 0.6)
      ));
      const laneRow = Math.max(0, Math.min(GRID_ROWS - 1,
        Math.round(oppTile.row * 0.4 + tgt.row * 0.6)
      ));
      return moveStep(player, pt, { col: laneCol, row: laneRow }, claimed, friendly);
    }
    // No outfield target: step 1 tile goal-side to cut the dribble path
    return moveStep(player, pt,
      { col: Math.min(GRID_COLS - 1, oppTile.col + 1), row: oppTile.row },
      claimed, friendly
    );
  }

  // ── Adjacent to ball (likely imminent receiver) ───────────────────────────
  // Press through their tile — if they receive the ball next turn the path
  // already plans to go THROUGH them (checkers-style tackle).
  if (oppDistFromBall === 1) {
    return pressCarrier(player, pt, oppTile, claimed, friendly);
  }

  // ── Loose marking: only attacking AI roles drift, and only rarely ─────────
  // Defensive/midfield AI roles always hold their mark.
  const looseRole = player.role === "forward" || player.role === "striker";
  const isLoose = looseRole && oppDistFromBall >= 5 && Math.random() < 0.20;

  if (isLoose) {
    // Zonal hold: 2 tiles goal-side of opponent, row blended toward ball row
    const looseCol = Math.min(GRID_COLS - 1, oppTile.col + 2);
    const looseRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.round((oppTile.row + ballTile.row) / 2)));
    return moveStep(player, pt, { col: looseCol, row: looseRow }, claimed, friendly);
  }

  // ── Tight shadow: goal-side shadow one tile from receiver ────────────────
  // Sit exactly 1 tile on the AI-goal side of the marked opponent (higher col).
  // This blocks the pass lane: if the ball arrives the marker is already between
  // receiver and the AI goal. Much tighter than a midpoint formula.
  const shadowCol = Math.min(GRID_COLS - 1, oppTile.col + 1);
  const shadowRow = oppTile.row;
  return moveStep(player, pt, { col: shadowCol, row: shadowRow }, claimed, friendly);
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
  friendly: Set<string>,
  planRef?: { current: PassTilePlan | null }
): Command {
  if (player.role === "goalkeeper") {
    if (hasBall) {
      const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 4);
      if (fwdTarget) {
        const runTile = posToTile(fwdTarget.position);
        if (planRef) {
          planRef.current = { runnerId: fwdTarget.id, runTile };
          return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
        }
        return passTo(fwdTarget, player.position);
      }
      const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 4);
      if (anyTarget) {
        const anyTile = posToTile(anyTarget.position);
        if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
        return passTo(anyTarget, player.position);
      }
    }
    return stayPut({ col: GRID_COLS - 1, row: Math.floor(GRID_ROWS / 2) });
  }

  if (hasBall) {
    // Shoot from closer range than tier 1
    if (pt.col <= 3) return shoot();

    const style2 = getPlayerStyle(player);
    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked = isForwardBlocked(pt, playerPlayers);

    // Dribbler: Move+Pass — advance then release
    if (style2 === "dribbler" && !hardPressed && !fwdBlocked) {
      const advTarget = bestForwardPass(player, aiPlayers, playerPlayers, 6)
        ?? bestLateralPass(player, aiPlayers, playerPlayers, 4);
      if (advTarget && Math.random() < 0.45) {
        const dribRange = speedToTiles(player.stats.speed);
        const destTile: TilePos = { col: Math.max(0, pt.col - dribRange), row: pt.row };
        return moveAndPass(destTile, advTarget);
      }
    }

    // Passer: Pass+Move when a forward target exists
    if (style2 === "passer") {
      const fwdP = bestForwardPass(player, aiPlayers, playerPlayers, 6);
      if (fwdP && Math.random() < 0.50) {
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        return passAndRun(fwdP, runTile, player.position);
      }
    }

    // Forward pass — bestForwardPass already ranks by least threatened, so trust it.
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 6);
    if (fwdTarget) {
      const runTile = posToTile(fwdTarget.position);
      if (planRef) {
        planRef.current = { runnerId: fwdTarget.id, runTile };
        return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
      }
      return passTo(fwdTarget, player.position);
    }

    // Under pressure or forward lane blocked: Pass+Move or plain pass to escape.
    if (hardPressed || fwdBlocked) {
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 4);
      if (latTarget) {
        if (Math.random() < 0.40) {
          const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
          return passAndRun(latTarget, runTile, player.position);
        }
        const latTile = posToTile(latTarget.position);
        if (planRef) planRef.current = { runnerId: latTarget.id, runTile: latTile };
        return passTo(latTarget, player.position);
      }
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 4);
      if (bkTarget && Math.random() < 0.5) {
        const bkTile = posToTile(bkTarget.position);
        if (planRef) planRef.current = { runnerId: bkTarget.id, runTile: bkTile };
        return passTo(bkTarget, player.position);
      }
    }

    // Dribble forward with a row juke to sidestep defenders.
    if (!fwdBlocked) {
      const dribRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 1 : pt.row - 1;
      const dribRange = speedToTiles(player.stats.speed);
      return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: Math.max(0, Math.min(GRID_ROWS - 1, dribRow)) }, claimed, friendly);
    }

    // Truly blocked: any open teammate.
    const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 5);
    if (anyTarget) {
      const anyTile = posToTile(anyTarget.position);
      if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
      return passTo(anyTarget, player.position);
    }
    const sideRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 1 : pt.row - 1;
    return moveStep(player, pt, { col: pt.col, row: Math.max(0, Math.min(GRID_ROWS - 1, sideRow)) }, claimed, friendly);
  }

  // Off-ball: style-based positioning (global poacher index to prevent stacking)
  const style2Off = getPlayerStyle(player);
  const roleIdx2 = style2Off === "poacher"
    ? aiPlayers.filter(p => getPlayerStyle(p) === "poacher").findIndex(p => p.id === player.id)
    : aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const runTarget = styleOffBallTarget(player, style2Off, roleIdx2, ballTile);
  return moveStep(player, pt, runTarget, claimed, friendly);
}

function tier2Defense(
  player: SimPlayer,
  pt: TilePos,
  _aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
  adaptiveState?: AdaptiveAIState
): Command {
  const adapt = computeAdaptation(adaptiveState);

  if (player.role === "goalkeeper") {
    // Track ball row, stay in central 3 rows so corners remain scorable
    const ballRow = Math.max(3, Math.min(5, ballTile.row));
    const targetRow = adaptRow(ballRow, adapt);
    return moveStep(player, pt, { col: GRID_COLS - 1, row: targetRow }, claimed, friendly);
  }

  // Zonal mid-block: defend column bands, press if ball enters zone.
  // After concessions, widen the press radius and shift block row toward danger.
  const zoneColMap: Record<string, number> = {
    defender: 8, midfielder: 7, forward: 6, striker: 6,
  };
  const baseCol = zoneColMap[player.role] ?? 7;

  // Danger-aware target row: blend ball row and conceded row
  const ballRow = Math.max(1, Math.min(5, ballTile.row));
  const targetRow = adaptRow(ballRow, adapt);

  // Press threshold expands by 1 per concession (base 2, max 4)
  const pressThreshold = Math.min(4, 2 + adapt.urgency);
  const ballInZone = ballTile.col >= baseCol - 1 && ballTile.col <= baseCol + 1;

  if (ballInZone || tileDist(pt, ballTile) <= pressThreshold) {
    return pressCarrier(player, pt, ballTile, claimed, friendly);
  }

  // Check for opponent in zone to mark (also consider danger row vicinity when adapted)
  const dangerRowWindow = adapt.dangerRow !== null ? 3 : 2;
  const zoneOpponent = playerPlayers.find(opp => {
    if (opp.role === "goalkeeper") return false;
    const ot = posToTile(opp.position);
    return ot.col >= baseCol - 1 && ot.col <= baseCol + 1 && Math.abs(ot.row - pt.row) <= dangerRowWindow;
  });

  if (zoneOpponent) {
    const oppTile = posToTile(zoneOpponent.position);
    return moveStep(player, pt, { col: Math.min(GRID_COLS - 1, oppTile.col + 1), row: oppTile.row }, claimed, friendly);
  }

  // Compact block, shifted toward danger row
  const shiftedCol = Math.min(baseCol, Math.max(baseCol - 1, ballTile.col + 2));
  return moveStep(player, pt, { col: shiftedCol, row: targetRow }, claimed, friendly);
}

// ─── Tier 3 — Easy: Kick and rush, dribble-heavy, loose organization ─────────

function tier3Possession(
  player: SimPlayer,
  pt: TilePos,
  hasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  _ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
  planRef?: { current: PassTilePlan | null }
): Command {
  if (player.role === "goalkeeper") {
    if (hasBall) {
      const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 4);
      if (anyTarget) {
        const runTile = posToTile(anyTarget.position);
        if (planRef) {
          planRef.current = { runnerId: anyTarget.id, runTile };
          return { type: CommandType.PASS, targetPlayerId: anyTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
        }
        return passTo(anyTarget, player.position);
      }
    }
    return stayPut({ col: GRID_COLS - 1, row: Math.floor(GRID_ROWS / 2) });
  }

  if (hasBall) {
    // Shoot from close range (slightly less trigger-happy than before)
    if (pt.col <= 3) return shoot();

    // Rarely pass — 28% chance; when passing always coordinate the run
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 6);
    if (fwdTarget && Math.random() < 0.28) {
      const runTile = posToTile(fwdTarget.position);
      if (planRef) {
        planRef.current = { runnerId: fwdTarget.id, runTile };
        return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
      }
      return passTo(fwdTarget, player.position);
    }

    // Just dribble forward — very predictable; still uses player's speed range
    const dribRange = speedToTiles(player.stats.speed);
    return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: pt.row }, claimed, friendly);
  }

  // Off-ball: style-based positioning (global poacher index to prevent stacking)
  const style3 = getPlayerStyle(player);
  const roleIdx3 = style3 === "poacher"
    ? aiPlayers.filter(p => getPlayerStyle(p) === "poacher").findIndex(p => p.id === player.id)
    : aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const runTarget = styleOffBallTarget(player, style3, roleIdx3, _ballTile);
  return moveStep(player, pt, runTarget, claimed, friendly);
}

function tier3Defense(
  player: SimPlayer,
  pt: TilePos,
  aiPlayers: SimPlayer[],
  _playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
  adaptiveState?: AdaptiveAIState
): Command {
  const adapt = computeAdaptation(adaptiveState);

  if (player.role === "goalkeeper") {
    // Tier 3 GK normally stays fixed — but after conceding, starts tracking the danger row
    if (adapt.urgency > 0 && adapt.dangerRow !== null) {
      const gkRow = Math.max(1, Math.min(GRID_ROWS - 2, adapt.dangerRow));
      return moveStep(player, pt, { col: GRID_COLS - 1, row: gkRow }, claimed, friendly);
    }
    return stayPut({ col: GRID_COLS - 1, row: Math.floor(GRID_ROWS / 2) });
  }

  // Passive: sit in own half, only press if ball is very close.
  // After concessions, press threshold and shape row shift toward danger.
  const roleIdx = aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);
  const compactCol: Record<string, number> = { defender: 7, midfielder: 6, forward: 5, striker: 5 };
  const col = compactCol[player.role] ?? 6;

  const ballRow = roleIdx === 0 ? Math.max(1, ballTile.row - 1) : Math.min(5, ballTile.row + 1);
  const compactRow = adaptRow(ballRow, adapt);
  const pressThreshold = Math.min(5, 3 + adapt.urgency);

  if (tileDist(pt, ballTile) <= pressThreshold) {
    return pressCarrier(player, pt, ballTile, claimed, friendly);
  }
  return moveStep(player, pt, { col, row: compactRow }, claimed, friendly);
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateAICommands(
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ball: SimBall,
  tier: AiTier = 2,
  adaptiveState?: AdaptiveAIState
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

  // Phase 1 – Project off-ball AI players to their run destinations so the
  // carrier can pass to those tiles directly (no intercept maths needed).
  // Only players that are already ahead of the carrier (lower col) get
  // projected, and only to a lower col than their current position.
  const carrierTile = aiHasBall && ballOwner ? posToTile(ballOwner.position) : ballTile;
  const projectedAI: SimPlayer[] = aiHasBall
    ? aiPlayers.map(p => {
        if (p.id === ball.ownerId) return p;     // carrier: unchanged
        if (p.role === 'goalkeeper') return p;   // GK: unchanged
        const currentTile = posToTile(p.position);
        // Players behind or level with the carrier stay put
        if (currentTile.col >= carrierTile.col) return p;
        const roleIdx = aiPlayers.filter(q => q.role === p.role).findIndex(q => q.id === p.id);
        const projTile = computeRunTarget(p, roleIdx, ballTile, tier);
        // Only project forward (lower col); never pull a player backward
        if (projTile.col >= currentTile.col) return p;
        return { ...p, position: tileToPos(projTile.col, projTile.row) };
      })
    : aiPlayers;

  // Process in priority order: GK → defenders → midfielders → attackers
  // BUT the ball-carrier always goes first so the pass-to-tile plan is
  // committed before the designated runner's command is generated.
  const roleOrder = (p: SimPlayer) =>
    p.role === "goalkeeper" ? 0
    : p.role === "defender" ? 1
    : p.role === "midfielder" ? 2
    : 3;

  const sorted = [...aiPlayers].sort((a, b) => {
    if (a.id === ball.ownerId) return -1;
    if (b.id === ball.ownerId) return 1;
    return roleOrder(a) - roleOrder(b);
  });

  // Loose ball: all players chase at full speed, closest gets first pick of the ball tile
  if (ballIsLoose) {
    const byProximity = [...sorted].sort(
      (a, b) => eucDist(a.position, ball.position) - eucDist(b.position, ball.position)
    );
    for (const p of byProximity) {
      const pTile = posToTile(p.position);
      commands.set(p.id, chaseLooseBall(p, pTile, ballTile, claimed, friendly));
    }
    return commands;
  }

  // Pass-to-tile plan: carrier tier function fills this; runner gets MOVE override.
  const planRef: { current: PassTilePlan | null } = { current: null };

  for (const player of sorted) {
    const pt = posToTile(player.position);
    const hasBall = player.id === ball.ownerId;

    // Runner override: if this player was designated as the "run-to-tile" receiver,
    // send them straight to that tile instead of their normal off-ball movement.
    if (!hasBall && planRef.current?.runnerId === player.id) {
      const { runTile } = planRef.current;
      commands.set(player.id, { type: CommandType.MOVE, targetPosition: tileToPos(runTile.col, runTile.row) });
      continue;
    }

    let cmd: Command;

    if (aiHasBall) {
      switch (tier) {
        case 1: cmd = tier1Possession(player, pt, hasBall, projectedAI, playerPlayers, ballTile, claimed, friendly, planRef); break;
        case 2: cmd = tier2Possession(player, pt, hasBall, projectedAI, playerPlayers, ballTile, claimed, friendly, planRef); break;
        default: cmd = tier3Possession(player, pt, hasBall, projectedAI, playerPlayers, ballTile, claimed, friendly, planRef); break;
      }
    } else if (playerHasBall) {
      switch (tier) {
        case 1: cmd = tier1Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly, adaptiveState); break;
        case 2: cmd = tier2Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly, adaptiveState); break;
        default: cmd = tier3Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly, adaptiveState); break;
      }
    } else {
      // Transition — treat as defensive
      switch (tier) {
        case 1: cmd = tier1Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly, adaptiveState); break;
        case 2: cmd = tier2Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly, adaptiveState); break;
        default: cmd = tier3Defense(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly, adaptiveState); break;
      }
    }

    commands.set(player.id, cmd);
  }

  return commands;
}
