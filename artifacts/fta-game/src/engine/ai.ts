import type { SimPlayer, SimBall, Command, Vec2, TeamTactic } from "./types";
import { CommandType } from "./types";
import { posToTile, getReachableTiles, tileToPos, tileKey } from "./grid";
import type { TilePos } from "./types";
import { GRID_COLS, GRID_ROWS, speedToTiles, getLinearPixelSpeed, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX, GK_COLS_AI_MIN, GK_COLS_AI_MAX, PASS_SPEED, PITCH_WIDTH, PITCH_HEIGHT } from "./constants";

export type AiTier = 1 | 2 | 3;

const DEFAULT_TACTIC: TeamTactic = {
  id: "balanced_build_up",
  name: "Balanced Build-Up",
  description: "Default balanced AI tactic.",
  tempo: 5,
  risk: 5,
  pressIntensity: 5,
  defensiveLine: 6,
  longBallFrequency: 3,
  restDefenseDepth: 4,
  progression: "balanced",
};







// ─── Anti-loopback tracker ─────────────────────────────────────────────────
// Module-level state: records the last 3 commands per AI player so we can
// detect repetitive ping-pong passing and force deviation.
interface CmdLog { type: CommandType; targetId?: string | null }
const cmdHistory = new Map<string, CmdLog[]>();
const LOOP_LOOKBACK = 2; // how many consecutive identical passes triggers break

function logCommand(id: string, cmd: Command) {
  const list = cmdHistory.get(id) ?? [];
  const entry: CmdLog = {
    type: cmd.type,
    targetId: "targetPlayerId" in cmd ? (cmd.targetPlayerId ?? null) : null,
  };
  list.push(entry);
  if (list.length > 3) list.shift();
  cmdHistory.set(id, list);
}

/** Returns true if this player has passed to the same target for the last N turns. */
function isLoopingPass(id: string, cmd: Command): boolean {
  if (cmd.type !== CommandType.PASS) return false;
  const target = "targetPlayerId" in cmd ? (cmd.targetPlayerId ?? null) : null;
  if (!target) return false;
  const list = cmdHistory.get(id) ?? [];
  if (list.length < LOOP_LOOKBACK) return false;
  return list.slice(-LOOP_LOOKBACK).every(l => l.type === CommandType.PASS && l.targetId === target);
}

/**
 * Detect bilateral ping-pong: A→B, B→A, A→B …
 * Returns true if player `id` is about to pass to `targetId` AND `targetId`
 * has been passing back to `id` at least once recently.
 */
function isBilateralPingPong(id: string, targetId: string): boolean {
  // Check that targetId's recent history includes a pass back to id
  const targetHistory = cmdHistory.get(targetId) ?? [];
  const targetPassedBack = targetHistory.some(
    l => l.type === CommandType.PASS && l.targetId === id
  );
  if (!targetPassedBack) return false;
  // Also require that this player has already passed to targetId at least once
  const myHistory = cmdHistory.get(id) ?? [];
  return myHistory.some(l => l.type === CommandType.PASS && l.targetId === targetId);
}

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
  const targetTile = target.command?.targetPosition
    ? posToTile(target.command.targetPosition)
    : posToTile(target.position);

  return {
    type: CommandType.PASS,
    targetPlayerId: target.id,
    targetPosition: tileToPos(targetTile.col, targetTile.row),
  };
}

// Pass and immediately run into space after — a "pass and run" combo command.
// The carrier passes to `target` then moves to `runTile`.
function passAndRun(target: SimPlayer, runTile: TilePos, _ballPos?: Vec2): Command {
  const targetTile = target.command?.targetPosition
    ? posToTile(target.command.targetPosition)
    : posToTile(target.position);

  return {
    type: CommandType.PASS,
    targetPlayerId: target.id,
    targetPosition: tileToPos(targetTile.col, targetTile.row),
    followUp: {
      type: CommandType.MOVE,
      targetPosition: tileToPos(runTile.col, runTile.row),
    },
  };
}
// Move to `destTile` then immediately fire a pass to `target` — a "run and pass" combo.
// The simulation fires the pass instantly on arrival so the ball travels the full distance.
function moveAndPass(destTile: TilePos, target: SimPlayer): Command {
  const targetTile = target.command?.targetPosition
    ? posToTile(target.command.targetPosition)
    : posToTile(target.position);

  return {
    type: CommandType.MOVE,
    targetPosition: tileToPos(destTile.col, destTile.row),
    followUp: {
      type: CommandType.PASS,
      targetPlayerId: target.id,
      targetPosition: tileToPos(targetTile.col, targetTile.row),
    },
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

// Returns the x-coordinate of the offside line as seen by the AI's attackers.
// AI attacks leftward, so their offside line = 2nd-to-last player team player (sorted by x ASC).
function aiOffsideLineX(playerPlayers: SimPlayer[]): number {
  if (playerPlayers.length === 0) return 0;
  const sorted = [...playerPlayers].sort((a, b) => a.position.x - b.position.x);
  return sorted.length >= 2 ? sorted[1].position.x : sorted[0].position.x;
}

function isAIPlayerOffside(p: SimPlayer, playerPlayers: SimPlayer[]): boolean {
  if (p.role === "goalkeeper") return false;
  const lineX = aiOffsideLineX(playerPlayers);
  // Offside only in the attacking third (x < 1/3 pitch) — middle third is a free zone.
  return p.position.x < PITCH_WIDTH / 3 && p.position.x < lineX;
}

/**
 * Cap poachers to 1 per team and handle onside retreat.
 * The most-advanced poacher (lowest x, since AI attacks leftward) keeps the role.
 * Extra poachers are demoted to "dribbler".
 * If the designated poacher is caught offside they step back to the legal zone.
 */
function offBallMove(
  player: SimPlayer,
  pt: TilePos,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>
): Command {
  const baseStyle = getPlayerStyle(player);

  // Sort all poachers by most-advanced position (lowest x = deepest into opponent's half for AI).
  const poachersSorted = aiPlayers
    .filter(p => getPlayerStyle(p) === "poacher")
    .sort((a, b) => a.position.x - b.position.x);

  // Only the leading poacher keeps the role; extras become dribblers.
  const effectiveStyle: PlayerStyle =
    baseStyle === "poacher" && poachersSorted[0]?.id !== player.id ? "dribbler" : baseStyle;

  // Designated poacher retreats to get onside when beyond the attacking-third boundary.
  if (effectiveStyle === "poacher" && isAIPlayerOffside(player, playerPlayers)) {
    const halfRow = Math.floor(GRID_ROWS / 2);
    const retreatRow = pt.row >= halfRow
      ? Math.min(GRID_ROWS - 2, halfRow + 2)
      : Math.max(1, halfRow - 2);
    // col 5 ≈ just inside the legal zone (boundary at PITCH_WIDTH/3 ≈ col 5)
    return moveStep(player, pt, { col: Math.floor(GRID_COLS / 3), row: retreatRow }, claimed, friendly);
  }

  const roleIdx = effectiveStyle === "poacher"
    ? poachersSorted.findIndex(p => p.id === player.id)
    : aiPlayers.filter(p => p.role === player.role).findIndex(p => p.id === player.id);

  const runTarget = styleOffBallTarget(player, effectiveStyle, roleIdx, ballTile);
  return moveStep(player, pt, runTarget, claimed, friendly);
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
    .filter(({ p }) => !isAIPlayerOffside(p, playerPlayers))
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
    .filter(({ p }) => !isAIPlayerOffside(p, playerPlayers))
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
  // AI attacks toward col 0 (lower = deeper into opponent territory).
  // All tiers push aggressively — the uniform squad is now tier-1 everywhere.
  const fwdOffset = 7;        // how many cols ahead of the carrier
  const minAttackCol = 1;     // absolute deepest allowed

  if (role === "striker") {
    return {
      col: Math.max(minAttackCol, ballCarrierTile.col - fwdOffset),
      row: Math.floor(GRID_ROWS / 2),
    };
  }
  if (role === "forward") {
    const runRow = roleIdx === 0
      ? Math.max(0, ballCarrierTile.row - 2)
      : Math.min(GRID_ROWS - 1, ballCarrierTile.row + 2);
    return {
      col: Math.max(minAttackCol + 1, ballCarrierTile.col - fwdOffset),
      row: runRow,
    };
  }
  if (role === "midfielder") {
    // Midfielders now push well into the attacking half
    const supportRow = roleIdx === 0
      ? Math.max(1, ballCarrierTile.row - 1)
      : Math.min(GRID_ROWS - 2, ballCarrierTile.row + 1);
    return {
      col: Math.max(minAttackCol + 2, ballCarrierTile.col - 5),
      row: supportRow,
    };
  }
  if (role === "defender") {
    // Even the defender steps up — only 1 tile behind the carrier
    const coverOffset = 2;
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
  if ((role === "striker" || role === "forward") && speed >= 7) return "balanced";
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
      // Spread wide and ahead of the carrier — always in the attacking half
      const row = roleIdx === 0
        ? Math.max(0, ballTile.row - 2)
        : Math.min(GRID_ROWS - 1, ballTile.row + 2);
      return { col: Math.max(1, ballTile.col - 4), row };
    }
    case "dribbler": {
      // Dribblers now push into the attacking third alongside the carrier
      const row = roleIdx === 0
        ? Math.max(0, ballTile.row - 1)
        : Math.min(GRID_ROWS - 1, ballTile.row + 1);
      return { col: Math.max(1, ballTile.col - 3), row };
    }
    case "support": {
      // Support steps up — only 1 tile behind the ball
      const row = roleIdx === 0
        ? Math.max(1, ballTile.row - 1)
        : Math.min(GRID_ROWS - 2, ballTile.row + 1);
      return { col: Math.min(GRID_COLS - 2, ballTile.col + 1), row };
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
      // GK distributes — try progressively longer ranges so it never gets stuck
      const gkPassRanges = [4, 7, 12];
      for (const range of gkPassRanges) {
        const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, range);
        if (fwdTarget) {
          const runTile = posToTile(fwdTarget.position);
          if (planRef) {
            planRef.current = { runnerId: fwdTarget.id, runTile };
            return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
          }
          return passTo(fwdTarget, player.position);
        }
        const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, range);
        if (anyTarget) {
          const anyTile = posToTile(anyTarget.position);
          if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
          return passTo(anyTarget, player.position);
        }
      }
      // Absolutely no teammate reachable — GK dribbles forward to create a passing angle
      const dribCol = Math.max(GK_COLS_AI_MIN, pt.col - 2);
      return { type: CommandType.MOVE, targetPosition: tileToPos(dribCol, pt.row) };
    }
    // Off-ball: track ball row, stay in central 3 rows so corners remain scorable
    const gkRow = Math.max(3, Math.min(5, ballTile.row));
    return moveStep(player, pt, { col: GRID_COLS - 1, row: gkRow }, claimed, friendly);
  }

  if (hasBall) {
    const style = getPlayerStyle(player);
    const isAttacker = player.role === "striker" || player.role === "forward";
    const isDeepBuilder = player.role === "defender" || player.role === "midfielder";

    // 1. Shoot — poachers shoot from further out, everyone else from close range
    const shootCol = style === "poacher" ? 5 : 2;
    if (pt.col <= shootCol) return shoot();

    // 2. Assess pressure
    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked  = isForwardBlocked(pt, playerPlayers);

    // 3. PRESSED → Pass+Move (dump ball and escape into space)
    //    Used by everyone when under immediate pressure.
    if (hardPressed) {
      const escapeTarget = bestForwardPass(player, aiPlayers, playerPlayers, 7)
        ?? bestLateralPass(player, aiPlayers, playerPlayers, 5)
        ?? bestAnyPass(player, aiPlayers, playerPlayers, 7);
      if (escapeTarget) {
        const escapeTile = posToTile(escapeTarget.position);
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        if (planRef) planRef.current = { runnerId: escapeTarget.id, runTile: escapeTile };
        return passAndRun(escapeTarget, runTile, player.position);
      }
    }

    // 4. OPEN SPACE AHEAD — role-specific combo choice
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 7);

    if (!fwdBlocked && fwdTarget) {
      const fwdThreat = isThreatened(posToTile(fwdTarget.position), playerPlayers);

      // 4a. Deep builder (defender/midfielder) with open space → Move+Pass:
      //     advance 1-2 tiles to close distance, then release to a forward.
      //     Creates better angles and draws defenders before the pass.
      if (isDeepBuilder && !fwdThreat) {
        if (Math.random() < 0.65) {
          const dribRange = Math.min(2, speedToTiles(player.stats.speed));
          const destCol = Math.max(0, pt.col - dribRange);
          // Coordinate receiver to stay at their current tile
          const fwdMoveTile = posToTile(fwdTarget.position);
          if (planRef) planRef.current = { runnerId: fwdTarget.id, runTile: fwdMoveTile };
          return moveAndPass({ col: destCol, row: pt.row }, fwdTarget);
        }
      }

      // 4b. Attacker with an open forward target → Pass+Move:
      //     one-touch pass and immediately sprint into space for a return.
      if (isAttacker && !fwdThreat) {
        if (Math.random() < 0.60) {
          const fwdPMTile = posToTile(fwdTarget.position);
          const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
          if (planRef) planRef.current = { runnerId: fwdTarget.id, runTile: fwdPMTile };
          return passAndRun(fwdTarget, runTile, player.position);
        }
      }

      // 4c. Passer style → always quick release then run
      if (style === "passer") {
        const passerRunTile = pickRunAfterPassTile(player, pt, playerPlayers);
        const passerFwdTile = posToTile(fwdTarget.position);
        if (planRef) planRef.current = { runnerId: fwdTarget.id, runTile: passerFwdTile };
        return passAndRun(fwdTarget, passerRunTile, player.position);
      }

      // 4d. Dribbler style with space → Move+Pass at higher pace
      if (style === "dribbler") {
        if (Math.random() < 0.55) {
          const dribRange = speedToTiles(player.stats.speed);
          const destTile: TilePos = { col: Math.max(0, pt.col - dribRange), row: pt.row };
          const dribblerFwdTile = posToTile(fwdTarget.position);
          if (planRef) planRef.current = { runnerId: fwdTarget.id, runTile: dribblerFwdTile };
          return moveAndPass(destTile, fwdTarget);
        }
        // Otherwise just carry with a slight row juke
        const dribRange = speedToTiles(player.stats.speed);
        const dribRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 1 : pt.row - 1;
        return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: Math.max(0, Math.min(GRID_ROWS - 1, dribRow)) }, claimed, friendly);
      }

      // 4e. Balanced/support: plain through-ball pushed 1 tile ahead of receiver
      if (!fwdThreat || fwdBlocked) {
        const projTile = posToTile(fwdTarget.position);
        const runTile: TilePos = { col: Math.max(1, projTile.col - 1), row: projTile.row };
        if (planRef) {
          planRef.current = { runnerId: fwdTarget.id, runTile };
          return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
        }
      }
    }

    // 5. Forward blocked or no forward target: lateral / backward escape
    {
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 5);
      if (latTarget) {
        const latTile = posToTile(latTarget.position);
        if (fwdBlocked || Math.random() < 0.45) {
          // Pass+Move: escape sideways then reposition
          const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
          if (planRef) planRef.current = { runnerId: latTarget.id, runTile: latTile };
          return passAndRun(latTarget, runTile, player.position);
        }
        if (planRef) planRef.current = { runnerId: latTarget.id, runTile: latTile };
        return passTo(latTarget, player.position);
      }

      // Support style: recycle backward
      if (style === "support") {
        const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 6);
        if (bkTarget) {
          if (planRef) planRef.current = { runnerId: bkTarget.id, runTile: posToTile(bkTarget.position) };
          return passTo(bkTarget, player.position);
        }
      }
    }

    // 6. No pass: dribble forward with a row juke
    if (!fwdBlocked) {
      const dribRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 1 : pt.row - 1;
      const dribRange = speedToTiles(player.stats.speed);
      return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: Math.max(0, Math.min(GRID_ROWS - 1, dribRow)) }, claimed, friendly);
    }

    // 7. Truly stuck: any teammate in any direction
    const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 8);
    if (anyTarget) {
      const anyTile = posToTile(anyTarget.position);
      if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
      return passTo(anyTarget, player.position);
    }

    // Last resort: sidestep to break the deadlock
    const sideRow = pt.row < Math.floor(GRID_ROWS / 2) ? pt.row + 2 : pt.row - 2;
    return moveStep(player, pt, { col: pt.col, row: Math.max(0, Math.min(GRID_ROWS - 1, sideRow)) }, claimed, friendly);
  }

  // Off-ball: capped poacher logic + onside retreat handled in offBallMove.
  return offBallMove(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly);
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
      // GK distributes — try progressively longer ranges so it never gets stuck
      const gkPassRanges2 = [4, 7, 12];
      for (const range of gkPassRanges2) {
        const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, range);
        if (fwdTarget) {
          const runTile = posToTile(fwdTarget.position);
          if (planRef) {
            planRef.current = { runnerId: fwdTarget.id, runTile };
            return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: tileToPos(runTile.col, runTile.row), coordinated: true };
          }
          return passTo(fwdTarget, player.position);
        }
        const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, range);
        if (anyTarget) {
          const anyTile = posToTile(anyTarget.position);
          if (planRef) planRef.current = { runnerId: anyTarget.id, runTile: anyTile };
          return passTo(anyTarget, player.position);
        }
      }
      // Absolutely no teammate reachable — dribble forward to create passing angle
      const dribCol = Math.max(GK_COLS_AI_MIN, pt.col - 2);
      return { type: CommandType.MOVE, targetPosition: tileToPos(dribCol, pt.row) };
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
        const fwdP2Tile = posToTile(fwdP.position);
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        if (planRef) planRef.current = { runnerId: fwdP.id, runTile: fwdP2Tile };
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
        const latTile2 = posToTile(latTarget.position);
        if (Math.random() < 0.40) {
          const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
          if (planRef) planRef.current = { runnerId: latTarget.id, runTile: latTile2 };
          return passAndRun(latTarget, runTile, player.position);
        }
        if (planRef) planRef.current = { runnerId: latTarget.id, runTile: latTile2 };
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

  // Off-ball: capped poacher logic + onside retreat handled in offBallMove.
  return offBallMove(player, pt, aiPlayers, playerPlayers, ballTile, claimed, friendly);
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

  // Off-ball: capped poacher logic + onside retreat handled in offBallMove.
  return offBallMove(player, pt, aiPlayers, playerPlayers, _ballTile, claimed, friendly);
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
  adaptiveState?: AdaptiveAIState,
  tactic: TeamTactic = DEFAULT_TACTIC
): Map<string, Command> {
  const commands = new Map<string, Command>();

  const ballOwner =
    [...aiPlayers, ...playerPlayers].find((p) => p.id === ball.ownerId) ??
    null;

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

  const carrierTile =
    aiHasBall && ballOwner ? posToTile(ballOwner.position) : ballTile;

  const projectedAI: SimPlayer[] = aiHasBall
    ? aiPlayers.map((p) => {
        if (p.id === ball.ownerId) return p;
        if (p.role === "goalkeeper") return p;

        const currentTile = posToTile(p.position);

        if (currentTile.col >= carrierTile.col) return p;

        const roleIdx = aiPlayers
          .filter((q) => q.role === p.role)
          .findIndex((q) => q.id === p.id);

        const projTile = computeRunTarget(p, roleIdx, ballTile, tier);

        if (projTile.col >= currentTile.col) return p;

        return {
          ...p,
          position: tileToPos(projTile.col, projTile.row),
        };
      })
    : aiPlayers;

  const roleOrder = (p: SimPlayer) =>
    p.role === "goalkeeper"
      ? 0
      : p.role === "defender"
        ? 1
        : p.role === "midfielder"
          ? 2
          : 3;

  const sorted = [...aiPlayers].sort((a, b) => {
    if (a.id === ball.ownerId) return -1;
    if (b.id === ball.ownerId) return 1;
    return roleOrder(a) - roleOrder(b);
  });

  if (ballIsLoose) {
    const byProximity = [...sorted].sort(
      (a, b) =>
        eucDist(a.position, ball.position) -
        eucDist(b.position, ball.position),
    );

    for (const p of byProximity) {
      const pTile = posToTile(p.position);
      commands.set(
        p.id,
        chaseLooseBall(p, pTile, ballTile, claimed, friendly),
      );
    }

    return commands;
  }

  const planRef: { current: PassTilePlan | null } = { current: null };

  for (const player of sorted) {
    const pt = posToTile(player.position);
    const hasBall = player.id === ball.ownerId;

    if (!hasBall && planRef.current?.runnerId === player.id) {
      const { runTile } = planRef.current;

      commands.set(player.id, {
        type: CommandType.MOVE,
        targetPosition: tileToPos(runTile.col, runTile.row),
      });

      continue;
    }

    let cmd: Command;

    if (aiHasBall) {
      switch (tier) {
        case 1:
          cmd = tier1Possession(
            player,
            pt,
            hasBall,
            projectedAI,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            planRef,
          );
          break;

        case 2:
          cmd = tier2Possession(
            player,
            pt,
            hasBall,
            projectedAI,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            planRef,
          );
          break;

        default:
          cmd = tier3Possession(
            player,
            pt,
            hasBall,
            projectedAI,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            planRef,
          );
          break;
      }
    } else if (playerHasBall) {
      switch (tier) {
        case 1:
          cmd = tier1Defense(
            player,
            pt,
            aiPlayers,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            adaptiveState,
          );
          break;

        case 2:
          cmd = tier2Defense(
            player,
            pt,
            aiPlayers,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            adaptiveState,
          );
          break;

        default:
          cmd = tier3Defense(
            player,
            pt,
            aiPlayers,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            adaptiveState,
          );
          break;
      }
    } else {
      switch (tier) {
        case 1:
          cmd = tier1Defense(
            player,
            pt,
            aiPlayers,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            adaptiveState,
          );
          break;

        case 2:
          cmd = tier2Defense(
            player,
            pt,
            aiPlayers,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            adaptiveState,
          );
          break;

        default:
          cmd = tier3Defense(
            player,
            pt,
            aiPlayers,
            playerPlayers,
            ballTile,
            claimed,
            friendly,
            adaptiveState,
          );
          break;
      }
    }

    cmd = tacticBuffCommand(
      player,
      cmd,
      pt,
      hasBall,
      aiHasBall,
      playerHasBall,
      aiPlayers,
      playerPlayers,
      ballTile,
      claimed,
      friendly,
      tactic,
      planRef,
    );

    cmd = shootingBuffCommand(
      player,
      cmd,
      pt,
      hasBall,
      aiHasBall,
      playerPlayers,
      tactic,
    );

    cmd = creativeCarryBuffCommand(
      player,
      cmd,
      pt,
      hasBall,
      aiHasBall,
      aiPlayers,
      playerPlayers,
      claimed,
      tactic,
      planRef,
    );

    if (playerHasBall || (!aiHasBall && !ballIsLoose)) {
      cmd = defenseBuffCommand(
        player,
        cmd,
        pt,
        aiPlayers,
        playerPlayers,
        ball,
        ballTile,
        claimed,
        friendly,
      );
    }

    const cmdTargetId =
      cmd.type === CommandType.PASS
        ? "targetPlayerId" in cmd
          ? (cmd.targetPlayerId ?? null)
          : null
        : null;

    const isLooping =
      isLoopingPass(player.id, cmd) ||
      (cmdTargetId !== null &&
        isBilateralPingPong(player.id, cmdTargetId));

    if (isLooping && cmdTargetId) {
      const altTarget = bestAnyPass(player, aiPlayers, playerPlayers, 12);

      if (altTarget && altTarget.id !== cmdTargetId) {
        const altTile = posToTile(altTarget.position);

        cmd = {
          type: CommandType.PASS,
          targetPlayerId: altTarget.id,
          targetPosition: tileToPos(altTile.col, altTile.row),
          coordinated: false,
        };
      } else {
        const isGK = player.role === "goalkeeper";

        if (!isGK) {
          const fwd = Math.max(0, pt.col - speedToTiles(player.stats.speed));

          cmd = {
            type: CommandType.MOVE,
            targetPosition: tileToPos(fwd, pt.row),
          };
        }
      }
    }

    if (player.role !== "goalkeeper" && aiHasBall && hasBall) {
      cmd = possessionRiskBuffCommand(
        player,
        cmd,
        aiPlayers,
        playerPlayers,
      );
    }

    logCommand(player.id, cmd);
    commands.set(player.id, cmd);
  }

  for (const [id, cmd] of commands) {
    if (cmd.type === CommandType.PASS && cmd.targetPlayerId) {
      const receiverCmd = commands.get(cmd.targetPlayerId);
      const receiver = aiPlayers.find((p) => p.id === cmd.targetPlayerId);

      if (receiver) {
        const wantedTile =
          receiverCmd?.type === CommandType.MOVE &&
          receiverCmd.targetPosition
            ? posToTile(receiverCmd.targetPosition)
            : posToTile(receiver.position);

        const finalTile = receiverReachableTile(receiver, wantedTile);
        const finalTarget = tileToPos(finalTile.col, finalTile.row);

        commands.set(id, {
          ...cmd,
          targetPosition: finalTarget,
        });

        commands.set(cmd.targetPlayerId, {
          type: CommandType.MOVE,
          targetPosition: finalTarget,
        });
      }
    }

    if (
      cmd.type === CommandType.MOVE &&
      cmd.followUp?.type === CommandType.PASS &&
      cmd.followUp.targetPlayerId
    ) {
      const receiverCmd = commands.get(cmd.followUp.targetPlayerId);
      const receiver = aiPlayers.find(
        (p) => p.id === cmd.followUp!.targetPlayerId,
      );

      if (receiver) {
        const wantedTile =
          receiverCmd?.type === CommandType.MOVE &&
          receiverCmd.targetPosition
            ? posToTile(receiverCmd.targetPosition)
            : posToTile(receiver.position);

        const finalTile = receiverReachableTile(receiver, wantedTile);
        const finalTarget = tileToPos(finalTile.col, finalTile.row);

        commands.set(id, {
          ...cmd,
          followUp: {
            ...cmd.followUp,
            targetPosition: finalTarget,
          },
        });

        commands.set(cmd.followUp.targetPlayerId, {
          type: CommandType.MOVE,
          targetPosition: finalTarget,
        });
      }
    }
  }

  applyRestDefenseAnchor(
    commands,
    aiPlayers,
    ballTile,
    ballOwner?.teamId ?? null,
    ballOwner?.id ?? null,
    tactic,
  );

  return commands;
}
// ─── TACTIC BUFFS + LONG BALLS ──────────────────────────────────────────────

function statOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function passQuality(player: SimPlayer): number {
  return (
    statOr(player.stats.passing, 5) +
    statOr(player.stats.vision, statOr(player.stats.passing, 5)) +
    statOr(player.stats.longPassing, statOr(player.stats.passing, 5))
  ) / 3;
}

function longBallTo(target: SimPlayer, landingTile: TilePos): Command {
  return {
    type: CommandType.PASS,
    targetPlayerId: target.id,
    targetPosition: tileToPos(landingTile.col, landingTile.row),
    coordinated: true,
    passStyle: "long",
  };
}

function bestLongBallTarget(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  tactic: TeamTactic,
): { target: SimPlayer; landingTile: TilePos } | null {
  const ct = posToTile(carrier.position);
  const goalRow = Math.floor(GRID_ROWS / 2);

  const candidates = aiPlayers
    .filter((p) => p.id !== carrier.id && p.role !== "goalkeeper")
    .filter((p) => !isAIPlayerOffside(p, playerPlayers))
    .map((p) => {
      const t = posToTile(p.position);
      const distance = tileDist(ct, t);
      const forwardGain = ct.col - t.col;
      const aerial = statOr(p.stats.aerial, statOr(p.stats.attack, 5));
      const strength = statOr(p.stats.strength, 5);
      const speed = statOr(p.stats.speed, 5);
      const central = GRID_ROWS - Math.abs(t.row - goalRow);
      const wideBonus = tactic.id === "wide_crossing" && (t.row <= 2 || t.row >= GRID_ROWS - 3) ? 5 : 0;
      const targetManBonus = tactic.id === "long_ball_target" && (p.role === "striker" || p.role === "forward") ? 8 : 0;
      const counterBonus = tactic.progression === "counter" ? Math.max(0, forwardGain) * 1.3 : Math.max(0, forwardGain);
      const score = counterBonus + aerial * 1.1 + strength * 0.6 + speed * 0.35 + central * 0.4 + wideBonus + targetManBonus - Math.max(0, 4 - distance);
      return { p, t, distance, forwardGain, score };
    })
    .filter(({ distance, forwardGain }) => distance >= 4 && distance <= 13 && forwardGain >= 2)
    .sort((a, b) => b.score - a.score);

  const pick = candidates[0];
  if (!pick) return null;

  const runnerSpeed = statOr(pick.p.stats.speed, 6);
  const lead = tactic.progression === "counter" || tactic.id === "quick_counterattack" ? 2 : 1;
  const landingTile: TilePos = {
    col: Math.max(1, pick.t.col - Math.min(lead, Math.max(1, speedToTiles(runnerSpeed) - 1))),
    row: Math.max(0, Math.min(GRID_ROWS - 1, pick.t.row)),
  };

  return { target: pick.p, landingTile };
}

function shouldAttemptLongBall(player: SimPlayer, pt: TilePos, tactic: TeamTactic, hardPressed: boolean): boolean {
  if (player.role === "goalkeeper" && tactic.longBallFrequency >= 6) return true;
  if (tactic.longBallFrequency <= 2) return false;

  const quality = passQuality(player);
  const threshold = 11 - tactic.longBallFrequency;
  if (quality < threshold) return false;

  if (hardPressed && tactic.longBallFrequency >= 5) return true;
  if (tactic.id === "quick_counterattack" && pt.col >= 6) return true;
  if (tactic.id === "direct_play" && pt.col >= 5) return true;
  if (tactic.id === "wide_crossing" && (pt.row <= 2 || pt.row >= GRID_ROWS - 3)) return true;
  if (tactic.id === "long_ball_target" && pt.col >= 4) return true;

  return Math.random() < tactic.longBallFrequency / 18;
}


function isShotLaneOpenForAI(fromTile: TilePos, playerPlayers: SimPlayer[]): boolean {
  const goalRow = Math.floor(GRID_ROWS / 2);
  return !playerPlayers.some((opp) => {
    const ot = posToTile(opp.position);
    const betweenCarrierAndGoal = ot.col < fromTile.col && ot.col >= 0;
    const nearGoalLane = Math.abs(ot.row - fromTile.row) <= 1 || Math.abs(ot.row - goalRow) <= 1;
    return betweenCarrierAndGoal && nearGoalLane && tileDist(ot, fromTile) <= 4;
  });
}

function shouldLetItRip(player: SimPlayer, pt: TilePos, playerPlayers: SimPlayer[], tactic: TeamTactic): boolean {
  if (player.role === "goalkeeper") return false;

  const goalRow = Math.floor(GRID_ROWS / 2);
  const shooting = statOr(player.stats.shooting, statOr(player.stats.attack, 5));
  const attack = statOr(player.stats.attack, shooting);
  const centralBonus = Math.max(0, 3 - Math.abs(pt.row - goalRow)) * 0.08;
  const openLane = isShotLaneOpenForAI(pt, playerPlayers);
  const pressure = isHardPressed(pt, playerPlayers);

  if (pt.col <= 2) return true;
  if (pt.col <= 3 && shooting >= 5) return Math.random() < 0.88;
  if (pt.col <= 4 && openLane) return Math.random() < Math.min(0.82, 0.46 + shooting * 0.045 + centralBonus);
  if (pt.col <= 5 && openLane && shooting >= 7) return Math.random() < Math.min(0.62, 0.26 + shooting * 0.035 + centralBonus);
  if (pt.col <= 6 && openLane && !pressure && shooting >= 8 && attack >= 8) {
    const tacticBonus = tactic.id === "quick_counterattack" || tactic.id === "direct_play" ? 0.08 : 0;
    return Math.random() < 0.22 + tacticBonus + centralBonus;
  }

  return false;
}

function shootingBuffCommand(
  player: SimPlayer,
  currentCmd: Command,
  pt: TilePos,
  hasBall: boolean,
  aiHasBall: boolean,
  playerPlayers: SimPlayer[],
  tactic: TeamTactic,
): Command {
  if (!aiHasBall || !hasBall) return currentCmd;
  if (currentCmd.type === CommandType.SHOOT) return currentCmd;
  if (shouldLetItRip(player, pt, playerPlayers, tactic)) return shoot();
  return currentCmd;
}

function tacticBuffCommand(
  player: SimPlayer,
  currentCmd: Command,
  pt: TilePos,
  hasBall: boolean,
  aiHasBall: boolean,
  playerHasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
  tactic: TeamTactic,
  planRef?: { current: PassTilePlan | null },
): Command {
  if (player.role === "goalkeeper" && !hasBall) return currentCmd;

  if (aiHasBall && hasBall) {
    const hardPressed = isHardPressed(pt, playerPlayers);

    if (shouldAttemptLongBall(player, pt, tactic, hardPressed)) {
      const longTarget = bestLongBallTarget(player, aiPlayers, playerPlayers, tactic);
      if (longTarget) {
        if (planRef) planRef.current = { runnerId: longTarget.target.id, runTile: longTarget.landingTile };
        return longBallTo(longTarget.target, longTarget.landingTile);
      }
    }

    if (tactic.id === "slow_possession") {
      if (currentCmd.type === CommandType.MOVE && pt.col > 4) {
        const safeShort = bestLateralPass(player, aiPlayers, playerPlayers, 4)
          ?? bestBackwardPass(player, aiPlayers, playerPlayers, 5)
          ?? bestForwardPass(player, aiPlayers, playerPlayers, 4);
        if (safeShort) {
          const tile = posToTile(safeShort.position);
          if (planRef) planRef.current = { runnerId: safeShort.id, runTile: tile };
          return { type: CommandType.PASS, targetPlayerId: safeShort.id, targetPosition: tileToPos(tile.col, tile.row), coordinated: false };
        }
        const stepCol = Math.max(0, pt.col - 1);
        return moveStep(player, pt, { col: stepCol, row: pt.row }, claimed, friendly);
      }
    }

    if (tactic.id === "quick_counterattack" || tactic.progression === "counter") {
      const direct = bestForwardPass(player, aiPlayers, playerPlayers, 10);
      if (direct && currentCmd.type !== CommandType.PASS) {
        const tile = posToTile(direct.position);
        const landing = { col: Math.max(1, tile.col - 1), row: tile.row };
        if (planRef) planRef.current = { runnerId: direct.id, runTile: landing };
        return { type: CommandType.PASS, targetPlayerId: direct.id, targetPosition: tileToPos(landing.col, landing.row), coordinated: true };
      }
    }

    if (tactic.id === "wide_crossing" && pt.col <= 6) {
      const farPost = aiPlayers
        .filter((p) => p.id !== player.id && p.role !== "goalkeeper")
        .sort((a, b) => statOr(b.stats.aerial, b.stats.attack) - statOr(a.stats.aerial, a.stats.attack))[0];
      if (farPost) {
        const targetRow = pt.row <= 3 ? GRID_ROWS - 2 : 1;
        const landing = { col: Math.max(1, posToTile(farPost.position).col - 1), row: targetRow };
        if (planRef) planRef.current = { runnerId: farPost.id, runTile: landing };
        return longBallTo(farPost, landing);
      }
    }
  }

  if (playerHasBall && tactic.pressIntensity >= 8 && player.role !== "defender") {
    const dist = tileDist(pt, ballTile);
    if (dist <= tactic.pressIntensity - 4) {
      return pressCarrier(player, pt, ballTile, claimed, friendly);
    }
  }

  if (playerHasBall && tactic.id === "low_block_counter" && player.role !== "goalkeeper") {
    const safeCol = player.role === "defender" ? 12 : player.role === "midfielder" ? 10 : 8;
    if (pt.col < safeCol - 1 && tileDist(pt, ballTile) > 3) {
      const row = Math.max(1, Math.min(GRID_ROWS - 2, Math.round((pt.row + ballTile.row) / 2)));
      return moveStep(player, pt, { col: safeCol, row }, claimed, friendly);
    }
  }

  return currentCmd;
}

function getAnchorDefender(aiPlayers: SimPlayer[], ballOwnerId: string | null): SimPlayer | null {
  const defenders = aiPlayers
    .filter((p) => p.role === "defender" && p.id !== ballOwnerId)
    .sort((a, b) => posToTile(b.position).col - posToTile(a.position).col);
  if (defenders.length > 0) return defenders[0];

  return aiPlayers
    .filter((p) => p.role === "midfielder" && p.id !== ballOwnerId)
    .sort((a, b) => statOr(b.stats.defense, 5) - statOr(a.stats.defense, 5))[0] ?? null;
}

function applyRestDefenseAnchor(
  commands: Map<string, Command>,
  aiPlayers: SimPlayer[],
  ballTile: TilePos,
  ballOwnerTeam: "player" | "ai" | null,
  ballOwnerId: string | null,
  tactic: TeamTactic,
): void {
  // This is the permanent "sweeper" rule: every AI team keeps one defender
  // clearly behind the rest of the outfield, even while attacking.
  // If the normal defender has the ball, use the best defensive midfielder instead.
  const passTargets = new Set<string>();
  for (const cmd of commands.values()) {
    if (cmd.type === CommandType.PASS && cmd.targetPlayerId) passTargets.add(cmd.targetPlayerId);
    if (cmd.followUp?.type === CommandType.PASS && cmd.followUp.targetPlayerId) passTargets.add(cmd.followUp.targetPlayerId);
  }

  const anchorPool = aiPlayers.filter((p) => {
    if (p.role === "goalkeeper") return false;
    if (p.id === ballOwnerId) return false;
    if (passTargets.has(p.id)) return false;
    const cmd = commands.get(p.id);
    return !(cmd?.type === CommandType.PASS || cmd?.type === CommandType.SHOOT);
  });

  const anchor = getAnchorDefender(anchorPool, ballOwnerId);
  if (!anchor) return;

  const otherOutfield = aiPlayers.filter((p) => p.id !== anchor.id && p.role !== "goalkeeper");
  const mostBackOtherCol = otherOutfield.length > 0
    ? Math.max(...otherOutfield.map((p) => posToTile(p.position).col))
    : ballTile.col;

  const minimumGap = 3;
  const depth = tactic.restDefenseDepth;
  const baseCol = ballOwnerTeam === "ai"
    ? Math.max(ballTile.col + depth, mostBackOtherCol + minimumGap, 9)
    : Math.max(ballTile.col + 2, 10);

  const targetCol = Math.min(GRID_COLS - 2, baseCol);
  const targetRow = Math.max(1, Math.min(GRID_ROWS - 2, Math.round((ballTile.row + Math.floor(GRID_ROWS / 2)) / 2)));

  commands.set(anchor.id, {
    type: CommandType.MOVE,
    targetPosition: tileToPos(targetCol, targetRow),
  });
}

// ─── END-SCRIPT DEFENSE BUFF V3 ─────────────────────────────────────────────

function defenseBuffCommand(
  player: SimPlayer,
  currentCmd: Command,
  pt: TilePos,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ball: SimBall,
  ballTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
): Command {
  const carrier = playerPlayers.find((p) => p.id === ball.ownerId);

  // Even when AI has the ball, defenders still stay back and mark danger.
  if (!carrier) {
    if (player.role === "defender") {
      const highestThreat = getHighestManThreat(playerPlayers);

      if (highestThreat) {
        const laneTile = getPassLaneBlockTile(highestThreat.tile, highestThreat.tile);
        return moveStep(player, pt, laneTile, claimed, friendly);
      }
    }

    return currentCmd;
  }

  const futureBallTile = predictFutureBallTile(carrier, playerPlayers, ballTile);
  const threats = getDangerousAttackers(playerPlayers, carrier, futureBallTile);

  if (player.role === "goalkeeper") return currentCmd;

  if (player.role === "defender") {
    const assignedThreat = assignThreatToPlayer(player, aiPlayers, threats, "defender");

    if (assignedThreat) {
      const laneTile = getPassLaneBlockTile(assignedThreat.tile, futureBallTile);
      return moveStep(player, pt, laneTile, claimed, friendly);
    }

    return currentCmd;
  }

  if (player.role === "midfielder") {
    const closestPresser = getClosestPresser(aiPlayers, futureBallTile);

    if (closestPresser?.id === player.id) {
      return interceptFutureBallTile(player, pt, futureBallTile, claimed, friendly);
    }

    const assignedThreat = assignThreatToPlayer(player, aiPlayers, threats, "midfielder");

    if (assignedThreat) {
      const laneTile = getPassLaneBlockTile(assignedThreat.tile, futureBallTile);
      return moveStep(player, pt, laneTile, claimed, friendly);
    }

    return currentCmd;
  }

  if (player.role === "forward" || player.role === "striker") {
    const closestPresser = getClosestPresser(aiPlayers, futureBallTile);

    if (closestPresser?.id === player.id) {
      return interceptFutureBallTile(player, pt, futureBallTile, claimed, friendly);
    }

    return moveStep(
      player,
      pt,
      {
        col: Math.max(0, futureBallTile.col - 1),
        row: futureBallTile.row,
      },
      claimed,
      friendly,
    );
  }

  return currentCmd;
}

interface ThreatInfo {
  player: SimPlayer;
  tile: TilePos;
  score: number;
}

function getDangerousAttackers(
  playerPlayers: SimPlayer[],
  carrier: SimPlayer,
  futureBallTile: TilePos,
): ThreatInfo[] {
  const goalRow = Math.floor(GRID_ROWS / 2);

  return playerPlayers
    .filter((p) => p.role !== "goalkeeper" && p.id !== carrier.id)
    .map((p) => {
      const tile = posToTile(p.position);

      const advance = tile.col * 2.2;
      const centrality = (GRID_ROWS - Math.abs(tile.row - goalRow)) * 1.6;
      const nearFutureBall = (GRID_COLS - chebDist(tile, futureBallTile)) * 1.4;
      const boxDanger = tile.col >= GRID_COLS - 5 ? 10 : 0;
      const receiverIntent =
        p.command?.type === CommandType.MOVE && p.command.targetPosition ? 4 : 0;

      const score =
        advance +
        centrality +
        nearFutureBall +
        boxDanger +
        receiverIntent;

      return { player: p, tile, score };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.tile.col !== b.tile.col) return b.tile.col - a.tile.col;
      return a.tile.row - b.tile.row;
    });
}

function assignThreatToPlayer(
  player: SimPlayer,
  aiPlayers: SimPlayer[],
  threats: ThreatInfo[],
  role: "defender" | "midfielder",
): ThreatInfo | null {
  if (threats.length === 0) return null;

  const group = aiPlayers
    .filter((p) => p.role === role)
    .sort(
      (a, b) =>
        posToTile(a.position).row - posToTile(b.position).row,
    );

  const idx = group.findIndex((p) => p.id === player.id);
  if (idx < 0) return null;

  const sortedThreats = [...threats].sort((a, b) => {
    const colGap = Math.abs(a.tile.col - b.tile.col);

    // If attackers are basically equally high, split by row.
    if (colGap <= 1) {
      return a.tile.row - b.tile.row;
    }

    // Otherwise prioritize actual danger score.
    if (a.score !== b.score) return b.score - a.score;

    return a.tile.row - b.tile.row;
  });

  return sortedThreats[idx] ?? sortedThreats[sortedThreats.length - 1] ?? null;
}

function getPassLaneBlockTile(
  attackerTile: TilePos,
  futureBallTile: TilePos,
): TilePos {
  const goalRow = Math.floor(GRID_ROWS / 2);

  return {
    col: Math.min(
      GRID_COLS - 1,
      Math.round(
        attackerTile.col * 0.5 +
        futureBallTile.col * 0.3 +
        (GRID_COLS - 1) * 0.2,
      ),
    ),
    row: Math.max(
      0,
      Math.min(
        GRID_ROWS - 1,
        Math.round(
          attackerTile.row * 0.6 +
          futureBallTile.row * 0.2 +
          goalRow * 0.2,
        ),
      ),
    ),
  };
}

function getClosestPresser(
  aiPlayers: SimPlayer[],
  futureBallTile: TilePos,
): SimPlayer | null {
  return (
    aiPlayers
      .filter((p) => p.role !== "goalkeeper" && p.role !== "defender")
      .sort(
        (a, b) =>
          chebDist(posToTile(a.position), futureBallTile) -
          chebDist(posToTile(b.position), futureBallTile),
      )[0] ?? null
  );
}

function predictFutureBallTile(
  carrier: SimPlayer,
  playerPlayers: SimPlayer[],
  ballTile: TilePos,
): TilePos {
  const carrierTile = posToTile(carrier.position);
  const cmd = carrier.command;

  if (cmd?.type === CommandType.PASS) {
    if (cmd.targetPlayerId) {
      const receiver = playerPlayers.find((p) => p.id === cmd.targetPlayerId);

      if (receiver?.command?.targetPosition) {
        return receiverReachableTile(
          receiver,
          posToTile(receiver.command.targetPosition),
        );
      }

      if (receiver) return posToTile(receiver.position);
    }

    if (cmd.targetPosition) return posToTile(cmd.targetPosition);
  }

  if (cmd?.type === CommandType.MOVE && cmd.targetPosition) {
    return receiverReachableTile(carrier, posToTile(cmd.targetPosition));
  }

  return {
    col: Math.min(GRID_COLS - 1, carrierTile.col + 1),
    row: carrierTile.row,
  };
}

function interceptFutureBallTile(
  player: SimPlayer,
  from: TilePos,
  futureBallTile: TilePos,
  claimed: Set<string>,
  friendly: Set<string>,
): Command {
  const interceptTile = {
    col: Math.min(GRID_COLS - 1, futureBallTile.col + 1),
    row: futureBallTile.row,
  };

  return moveStep(player, from, interceptTile, claimed, friendly);
}

function receiverReachableTile(receiver: SimPlayer, wantedTile: TilePos): TilePos {
  const from = posToTile(receiver.position);
  const maxStep = speedToTiles(receiver.stats.speed);

  const dc = Math.sign(wantedTile.col - from.col);
  const dr = Math.sign(wantedTile.row - from.row);

  return {
    col: Math.max(
      0,
      Math.min(
        GRID_COLS - 1,
        from.col + dc * Math.min(maxStep, Math.abs(wantedTile.col - from.col)),
      ),
    ),
    row: Math.max(
      0,
      Math.min(
        GRID_ROWS - 1,
        from.row + dr * Math.min(maxStep, Math.abs(wantedTile.row - from.row)),
      ),
    ),
  };
}

// ─── END-SCRIPT POSSESSION RISK BUFF V1 ─────────────────────────────────────

function predictPlayerReachTiles(playerPlayers: SimPlayer[]): Set<string> {
  const danger = new Set<string>();

  for (const p of playerPlayers) {
    const t = posToTile(p.position);
    const range = speedToTiles(p.stats.speed);
    const reachable = getReachableTiles(t.col, t.row, range, p.role === "goalkeeper", p.teamId);

    for (const r of reachable) {
      danger.add(tileKey(r.col, r.row));
    }
  }

  return danger;
}

function isPassRiskyNextTurn(
  fromTile: TilePos,
  toTile: TilePos,
  playerPlayers: SimPlayer[],
): boolean {
  const playerReach = predictPlayerReachTiles(playerPlayers);

  if (playerReach.has(tileKey(toTile.col, toTile.row))) {
    return true;
  }

  const steps = Math.max(
    Math.abs(toTile.col - fromTile.col),
    Math.abs(toTile.row - fromTile.row),
  );

  for (let i = 1; i < steps; i++) {
    const frac = i / steps;
    const col = Math.round(fromTile.col + frac * (toTile.col - fromTile.col));
    const row = Math.round(fromTile.row + frac * (toTile.row - fromTile.row));

    if (playerReach.has(tileKey(col, row))) {
      return true;
    }
  }

  return false;
}

function isReceiverTrapRisk(
  receiverTile: TilePos,
  playerPlayers: SimPlayer[],
): boolean {
  let nearby = 0;

  for (const p of playerPlayers) {
    const pt = posToTile(p.position);

    if (chebDist(pt, receiverTile) <= 2) {
      nearby++;
    }
  }

  return nearby >= 2;
}

function bestSafeForwardPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  maxDist: number = 8,
): SimPlayer | null {
  const ct = posToTile(carrier.position);

  const candidates = aiPlayers
    .filter((p) => p.id !== carrier.id && p.role !== "goalkeeper")
    .map((p) => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => t.col < ct.col)
    .filter(({ t }) => tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isLaneBlocked(ct, t, playerPlayers))
    .filter(({ p }) => !isAIPlayerOffside(p, playerPlayers))
    .filter(({ t }) => !isPassRiskyNextTurn(ct, t, playerPlayers))
    .filter(({ t }) => !isReceiverTrapRisk(t, playerPlayers))
    .sort((a, b) => {
      return a.t.col - b.t.col;
    });

  return candidates[0]?.p ?? null;
}

function bestSafeAnyPass(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  maxDist: number = 8,
): SimPlayer | null {
  const ct = posToTile(carrier.position);

  const candidates = aiPlayers
    .filter((p) => p.id !== carrier.id)
    .map((p) => ({ p, t: posToTile(p.position) }))
    .filter(({ t }) => tileDist(t, ct) <= maxDist)
    .filter(({ t }) => !isLaneBlocked(ct, t, playerPlayers))
    .filter(({ t }) => !isPassRiskyNextTurn(ct, t, playerPlayers))
    .filter(({ t }) => !isReceiverTrapRisk(t, playerPlayers))
    .sort((a, b) => {
      const aForward = a.t.col < ct.col ? 0 : 1;
      const bForward = b.t.col < ct.col ? 0 : 1;

      if (aForward !== bForward) return aForward - bForward;

      return a.t.col - b.t.col;
    });

  return candidates[0]?.p ?? null;
}

function possessionRiskBuffCommand(
  player: SimPlayer,
  currentCmd: Command,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
): Command {
  if (currentCmd.type !== CommandType.PASS) return currentCmd;
  if (currentCmd.passStyle === "long") return currentCmd;
  if (!currentCmd.targetPosition) return currentCmd;

  const fromTile = posToTile(player.position);
  const targetTile = posToTile(currentCmd.targetPosition);

  const risky =
    isPassRiskyNextTurn(fromTile, targetTile, playerPlayers) ||
    isReceiverTrapRisk(targetTile, playerPlayers);

  if (!risky) return currentCmd;

  const saferTarget =
    bestSafeForwardPass(player, aiPlayers, playerPlayers, 8) ??
    bestSafeAnyPass(player, aiPlayers, playerPlayers, 10);

  if (saferTarget) {
    const safeTile = posToTile(saferTarget.position);

    return {
      type: CommandType.PASS,
      targetPlayerId: saferTarget.id,
      targetPosition: tileToPos(safeTile.col, safeTile.row),
      coordinated: false,
    };
  }

  const pt = posToTile(player.position);

  return {
    type: CommandType.MOVE,
    targetPosition: tileToPos(
      Math.max(0, pt.col - speedToTiles(player.stats.speed)),
      pt.row,
    ),
  };
}


function getHighestManThreat(playerPlayers: SimPlayer[]): ThreatInfo | null {
  const goalRow = Math.floor(GRID_ROWS / 2);

  const highest = playerPlayers
    .filter((p) => p.role !== "goalkeeper")
    .map((p) => {
      const tile = posToTile(p.position);

      const centrality = GRID_ROWS - Math.abs(tile.row - goalRow);
      const score = tile.col * 3 + centrality;

      return { player: p, tile, score };
    })
    .sort((a, b) => {
      if (a.tile.col !== b.tile.col) return b.tile.col - a.tile.col;
      return a.tile.row - b.tile.row;
    })[0];

  return highest ?? null;
}

// ─── Creative AI Carry Buff ────────────────────────────────────────────────
// Gives the AI more options when carrying:
// forward, further forward, diagonal, left/right, backward, or pass.
// It especially breaks the boring pattern where the carrier only dribbles
// directly forward 1-2 tiles every turn.

function creativePassCommand(
  carrier: SimPlayer,
  target: SimPlayer,
  planRef?: { current: PassTilePlan | null },
): Command {
  const targetTile = posToTile(target.position);

  if (planRef) {
    planRef.current = {
      runnerId: target.id,
      runTile: targetTile,
    };
  }

  return {
    type: CommandType.PASS,
    targetPlayerId: target.id,
    targetPosition: tileToPos(targetTile.col, targetTile.row),
    coordinated: false,
  };
}

function pickCreativePassOption(
  carrier: SimPlayer,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  tactic: TeamTactic,
  hardPressed: boolean,
): SimPlayer | null {
  const forward = bestForwardPass(carrier, aiPlayers, playerPlayers, 9);
  const lateral = bestLateralPass(carrier, aiPlayers, playerPlayers, 6);
  const backward = bestBackwardPass(carrier, aiPlayers, playerPlayers, 7);
  const any = bestAnyPass(carrier, aiPlayers, playerPlayers, 9);

  const options = [forward, lateral, backward, any].filter(
    (p, index, arr): p is SimPlayer =>
      !!p && arr.findIndex((x) => x?.id === p.id) === index,
  );

  if (options.length === 0) return null;

  const carrierTile = posToTile(carrier.position);

  const scored = options.map((target) => {
    const t = posToTile(target.position);
    const forwardGain = carrierTile.col - t.col;
    const sideways = Math.abs(t.row - carrierTile.row);
    const backwardGain = t.col - carrierTile.col;
    const threatened = isThreatened(t, playerPlayers);
    const dist = tileDist(carrierTile, t);

    let score = 0;

    score += statOr(target.stats.passing, 5) * 0.15;
    score += statOr(target.stats.vision, statOr(target.stats.passing, 5)) * 0.25;

    if (forwardGain > 0) {
      score += forwardGain * 1.4;
    }

    if (sideways > 0) {
      score += 1.5;
    }

    if (backwardGain > 0) {
      score += hardPressed ? 4.5 : 0.5;
    }

    if (tactic.progression === "counter" || tactic.id === "quick_counterattack") {
      score += Math.max(0, forwardGain) * 1.5;
    }

    if (tactic.id === "slow_possession") {
      score += backwardGain > 0 || sideways > 0 ? 3 : 0;
      score -= Math.max(0, forwardGain - 3) * 0.8;
    }

    if (tactic.id === "wide_crossing") {
      score += t.row <= 2 || t.row >= GRID_ROWS - 3 ? 2.5 : 0;
    }

    if (threatened) {
      score -= 5;
    }

    score -= Math.max(0, dist - 8) * 0.25;

    return {
      target,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.target ?? null;
}

function nearestOpponentDistance(tile: TilePos, opponents: SimPlayer[]): number {
  if (opponents.length === 0) return 99;

  return Math.min(
    ...opponents.map((opp) => {
      const ot = posToTile(opp.position);
      return tileDist(tile, ot);
    }),
  );
}

function isAnyOtherPlayerOnTile(
  tile: TilePos,
  allPlayers: SimPlayer[],
  currentPlayerId: string,
): boolean {
  return allPlayers.some((other) => {
    if (other.id === currentPlayerId) return false;

    const otherTile = posToTile(other.position);

    return otherTile.col === tile.col && otherTile.row === tile.row;
  });
}

function scoreCreativeCarryTile(
  from: TilePos,
  tile: TilePos,
  currentTarget: TilePos,
  player: SimPlayer,
  opponents: SimPlayer[],
  tactic: TeamTactic,
  hardPressed: boolean,
): number {
  const progress = from.col - tile.col; // AI attacks left, so lower col = forward.
  const backward = tile.col - from.col;
  const lateral = Math.abs(tile.row - from.row);
  const space = nearestOpponentDistance(tile, opponents);
  const threatened = isThreatened(tile, opponents);

  const isSameAsCurrent =
    tile.col === currentTarget.col && tile.row === currentTarget.row;

  const isStraightForward =
    tile.row === from.row && tile.col < from.col;

  const isShortStraightForward =
    isStraightForward && progress <= 2;

  let score = 0;

  // Space still matters, but not enough to make the AI dribble constantly.
  score += space * 1.45;

  // Forward dribbling is still allowed, just toned down.
  if (progress > 0) {
    const directness =
      tactic.progression === "counter" || tactic.id === "quick_counterattack"
        ? 2.05
        : tactic.progression === "direct"
          ? 1.7
          : 1.0;

    score += progress * directness;
  }

  // Sideways and diagonal movement should be a real alternative.
  if (lateral > 0) {
    score += 2.9;
  }

  // Backward movement becomes a normal recycle option when pressed.
  if (backward > 0) {
    score += hardPressed ? 6.2 : -0.4;
  }

  // Slow possession should pass/recycle instead of carrying forward.
  if (tactic.id === "slow_possession") {
    score += lateral > 0 ? 3.2 : 0;
    score += backward > 0 ? 3.4 : 0;
    score -= Math.max(0, progress - 1) * 1.65;
  }

  // Counter teams may still drive forward, but not every possession.
  if (tactic.progression === "counter" || tactic.id === "quick_counterattack") {
    score += progress > 0 ? 0.9 : 0;
  }

  // Wide teams should be willing to go around instead of straight ahead.
  if (tactic.id === "wide_crossing") {
    score += tile.row <= 2 || tile.row >= GRID_ROWS - 3 ? 3.1 : 0;
  }

  // Main nerf: stop the repeated 1-2 tile straight-forward carry.
  if (isShortStraightForward) {
    score -= 6.2;
  }

  // Also nerf direct forward carries in general a bit.
  if (isStraightForward) {
    score -= 2.1;
  }

  // If it was already the chosen move, give it only a tiny loyalty bonus.
  if (isSameAsCurrent) {
    score += 0.25;
  }

  // Avoid threatened tiles unless desperate.
  if (threatened) {
    score -= hardPressed ? 4.5 : 7.2;
  }

  // Avoid hugging the top/bottom edge too hard.
  if (tile.row === 0 || tile.row === GRID_ROWS - 1) {
    score -= 1.8;
  }

  // Shooting territory: prefer central lanes.
  if (tile.col <= 5) {
    const goalRow = Math.floor(GRID_ROWS / 2);
    score -= Math.abs(tile.row - goalRow) * 0.5;
  }

  // Better dribblers still get some freedom, but less than before.
  const dribbling = statOr(
    player.stats.dribbling,
    statOr(player.stats.attack, 5),
  );

  score += dribbling * 0.1;

  return score;
}

function creativeCarryBuffCommand(
  player: SimPlayer,
  currentCmd: Command,
  pt: TilePos,
  hasBall: boolean,
  aiHasBall: boolean,
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  claimed: Set<string>,
  tactic: TeamTactic,
  planRef?: { current: PassTilePlan | null },
): Command {
  if (!aiHasBall || !hasBall) return currentCmd;
  if (player.role === "goalkeeper") return currentCmd;
  if (currentCmd.type !== CommandType.MOVE) return currentCmd;
  if (!currentCmd.targetPosition) return currentCmd;

  const allPlayers = [...aiPlayers, ...playerPlayers];
  const targetTile = posToTile(currentCmd.targetPosition);

  const currentTargetOccupied = isAnyOtherPlayerOnTile(
    targetTile,
    allPlayers,
    player.id,
  );

  const straightForwardCarry =
    targetTile.row === pt.row && targetTile.col < pt.col;

  const shortStraightForwardCarry =
    straightForwardCarry && pt.col - targetTile.col <= 2;

  const hardPressed = isHardPressed(pt, playerPlayers);

  const passOption = pickCreativePassOption(
    player,
    aiPlayers,
    playerPlayers,
    tactic,
    hardPressed || currentTargetOccupied || shortStraightForwardCarry,
  );

  // Absolute rule: never dribble into an occupied tile.
  if (passOption && currentTargetOccupied) {
    return creativePassCommand(player, passOption, planRef);
  }

  // New pass bias:
  // AI now looks for a pass more often, especially if it was about to do
  // that boring straight-forward dribble.
  // Hard cap: if a pass exists, AI should dribble less than 20% of the time.
  const passChance = currentTargetOccupied
    ? 1
    : shortStraightForwardCarry
      ? 0.9
      : straightForwardCarry
        ? 0.86
        : hardPressed
          ? 0.88
          : 0.82;

  if (passOption && Math.random() < passChance) {
    return creativePassCommand(player, passOption, planRef);
  }

  const range = speedToTiles(player.stats.speed);

  const reachable = getReachableTiles(
    pt.col,
    pt.row,
    range,
    false,
    player.teamId,
  );

  const candidates = reachable
    .filter((tile) => !(tile.col === pt.col && tile.row === pt.row))
    .filter((tile) => !claimed.has(tileKey(tile.col, tile.row)))
    .filter(
      (tile) =>
        !isAnyOtherPlayerOnTile(
          tile,
          allPlayers,
          player.id,
        ),
    )
    .map((tile) => ({
      tile,
      score: scoreCreativeCarryTile(
        pt,
        tile,
        targetTile,
        player,
        playerPlayers,
        tactic,
        hardPressed,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];

  // If every possible carry tile is occupied/bad, do not dribble into someone.
  if (!best) {
    return {
      type: CommandType.MOVE,
      targetPosition: tileToPos(pt.col, pt.row),
    };
  }

  const currentScore = currentTargetOccupied
    ? -999
    : scoreCreativeCarryTile(
        pt,
        targetTile,
        targetTile,
        player,
        playerPlayers,
        tactic,
        hardPressed,
      );

  // Dribble less in general:
  // Before, the AI replaced carries too easily.
  // Now it only changes to a carry if the new tile is clearly better.
  const shouldReplace =
    currentTargetOccupied ||
    hardPressed ||
    shortStraightForwardCarry ||
    best.score > currentScore + 3.2;

  if (!shouldReplace) {
    return currentCmd;
  }

  // Extra anti-direct-forward rule:
  // If the best option is still straight forward, require it to be really good.
  const bestIsStraightForward =
    best.tile.row === pt.row && best.tile.col < pt.col;

  if (
    bestIsStraightForward &&
    !hardPressed &&
    !currentTargetOccupied &&
    best.score < currentScore + 5.2
  ) {
    if (passOption) {
      return creativePassCommand(player, passOption, planRef);
    }

    return currentCmd;
  }

  claimed.add(tileKey(best.tile.col, best.tile.row));

  return {
    type: CommandType.MOVE,
    targetPosition: tileToPos(best.tile.col, best.tile.row),
  };
}