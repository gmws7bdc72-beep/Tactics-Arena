import type { SimPlayer, SimBall, Command, Vec2 } from "./types";
import { CommandType } from "./types";
import { posToTile, getReachableTiles, tileToPos, tileKey } from "./grid";
import type { TilePos } from "./types";
import { GRID_COLS, speedToTiles, getLinearPixelSpeed, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX, GK_COLS_AI_MIN, GK_COLS_AI_MAX, PASS_SPEED, PITCH_WIDTH, PITCH_HEIGHT } from "./constants";

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
  concededRows: number[]; // pitch rows (0-6) where each goal was conceded, oldest first
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
    ? { col: Math.max(gkMin, Math.min(gkMax, ballTile.col)), row: Math.max(0, Math.min(6, ballTile.row)) }
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

function passTo(target: SimPlayer, ballPos?: Vec2): Command {
  const aimPos = ballPos ? leadPassTarget(ballPos, target) : { ...target.position };
  return { type: CommandType.PASS, targetPlayerId: target.id, targetPosition: aimPos };
}

/**
 * Compute the intercept point for a through-ball where the runner will move from
 * their current tile toward `runTile` this turn.
 *
 * At planning time all velocities are zero (they were reset after the previous
 * simulation), so we can't use `leadPassTarget` directly. Instead we build a
 * synthetic velocity for the runner — the direction and speed they *will* move —
 * and solve the intercept equation with that, then clamp to the run tile.
 */
function throughBallTarget(ballPos: Vec2, runner: SimPlayer, runTile: TilePos): Vec2 {
  const fromPos = tileToPos(posToTile(runner.position).col, posToTile(runner.position).row);
  const toPos   = tileToPos(runTile.col, runTile.row);

  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Runner is already at the destination — just aim there directly.
  if (dist < 1) return toPos;

  const runSpd = getLinearPixelSpeed(runner.stats.speed);
  const unitX  = dx / dist;
  const unitY  = dy / dist;

  // Synthetic runner: current tile centre with expected move velocity.
  const syntheticRunner: SimPlayer = {
    ...runner,
    position: fromPos,
    velocity: { x: unitX * runSpd, y: unitY * runSpd },
  };

  const intercept = leadPassTarget(ballPos, syntheticRunner);

  // Clamp the intercept so it does not overshoot the run tile.
  // Project the intercept onto the run direction and cap at t = 1.
  const ix = intercept.x - fromPos.x;
  const iy = intercept.y - fromPos.y;
  const t = (ix * dx + iy * dy) / (dx * dx + dy * dy);
  if (t >= 1) return toPos;

  return intercept;
}

// Pass and immediately run into space after — a "pass and run" combo command.
// The carrier passes to `target` then moves to `runTile`.
function passAndRun(target: SimPlayer, runTile: TilePos, ballPos?: Vec2): Command {
  const aimPos = ballPos ? leadPassTarget(ballPos, target) : { ...target.position };
  return {
    type: CommandType.PASS,
    targetPlayerId: target.id,
    targetPosition: aimPos,
    followUp: { type: CommandType.MOVE, targetPosition: tileToPos(runTile.col, runTile.row) },
  };
}

// Pick a sensible "run into space" tile for the carrier after they pass.
// Tries to move into a gap 1-2 tiles ahead and to the side for a return pass.
function pickRunAfterPassTile(_carrier: SimPlayer, pt: TilePos, opponents: SimPlayer[]): TilePos {
  const candidates: TilePos[] = [
    { col: pt.col - 1, row: pt.row },
    { col: pt.col - 1, row: Math.max(0, pt.row - 1) },
    { col: pt.col - 1, row: Math.min(6, pt.row + 1) },
    { col: pt.col,     row: Math.max(0, pt.row - 1) },
    { col: pt.col,     row: Math.min(6, pt.row + 1) },
    { col: pt.col - 2, row: pt.row },
  ];
  // Prefer tiles not near opponents
  const safe = candidates.filter(t =>
    t.col >= 0 && t.col <= 9 &&
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

// Best teammate for a forward pass (more advanced = lower col).
// Prefers un-threatened targets but does NOT exclude threatened ones.
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
    // Midfielders fan out ahead/level with carrier to create passing lanes
    const fwdOffset = tier === 1 ? 2 : tier === 2 ? 1 : 0;
    const supportRow = roleIdx === 0
      ? Math.max(1, ballCarrierTile.row - 1)
      : Math.min(5, ballCarrierTile.row + 1);
    return {
      col: Math.max(2, ballCarrierTile.col - fwdOffset),
      row: supportRow,
    };
  }
  if (role === "defender") {
    // Defender stays 2 tiles behind ball — recycling option
    const coverOffset = tier === 1 ? 2 : 3;
    const coverRow = roleIdx === 0
      ? Math.max(1, ballCarrierTile.row - 1)
      : Math.min(5, ballCarrierTile.row + 1);
    return {
      col: Math.min(GRID_COLS - 2, ballCarrierTile.col + coverOffset),
      row: coverRow,
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
  friendly: Set<string>,
  planRef?: { current: PassTilePlan | null }
): Command {
  if (player.role === "goalkeeper") {
    if (hasBall) {
      // GK distributes with pass-to-tile
      const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 9);
      if (fwdTarget) {
        const rTile = posToTile(fwdTarget.position);
        const fTile: TilePos = { col: Math.max(0, rTile.col - speedToTiles(fwdTarget.stats.speed)), row: rTile.row };
        if (planRef && fTile.col < rTile.col) {
          planRef.current = { runnerId: fwdTarget.id, runTile: fTile };
          return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: throughBallTarget(player.position, fwdTarget, fTile), coordinated: true };
        }
        return passTo(fwdTarget, player.position);
      }
      const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 9);
      if (anyTarget) return passTo(anyTarget, player.position);
    }
    // Off-ball: track ball row, stay in central 3 rows so corners remain scorable
    const gkRow = Math.max(2, Math.min(4, ballTile.row));
    return moveStep(player, pt, { col: 9, row: gkRow }, claimed, friendly);
  }

  if (hasBall) {
    // 1. Shoot if in goal-threat zone
    if (pt.col <= 2) return shoot();

    // 2. Assess situation
    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked = isForwardBlocked(pt, playerPlayers);

    // 3. Elite: pass-first philosophy
    // Forward pass — primary option (always look for it).
    // Pass forward if target exists and EITHER: carrier isn't pressed, OR target is open.
    // Both being threatened simultaneously is the only case we hold off.
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 9);
    const fwdTargetOpen = fwdTarget && !isThreatened(posToTile(fwdTarget.position), playerPlayers);
    if (fwdTarget && (!hardPressed || fwdTargetOpen)) {
      // 50% chance: "pass-to-tile" — aim at the tile the runner is headed to,
      // and simultaneously move the runner there (coordinated run).
      const runnerTile = posToTile(fwdTarget.position);
      const runnerReach = speedToTiles(fwdTarget.stats.speed);
      const runTile: TilePos = {
        col: Math.max(0, runnerTile.col - runnerReach),
        row: runnerTile.row,
      };
      if (planRef && runTile.col < runnerTile.col) {
        planRef.current = { runnerId: fwdTarget.id, runTile };
        return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: throughBallTarget(player.position, fwdTarget, runTile), coordinated: true };
      }
      return passTo(fwdTarget, player.position);
    }

    // Under pressure: lateral or backward pass (switch play)
    if (hardPressed || fwdBlocked) {
      // Lateral switch — spreads the play
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 5);
      if (latTarget) {
        if (Math.random() < 0.3) {
          const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
          return passAndRun(latTarget, runTile, player.position);
        }
        return passTo(latTarget, player.position);
      }

      // Backward recycle — keep possession
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 6);
      if (bkTarget) return passTo(bkTarget, player.position);
    }

    // 4. Forward pass even from moderate distance when not blocked
    if (fwdTarget) {
      const runnerTile2 = posToTile(fwdTarget.position);
      const runTile2: TilePos = { col: Math.max(0, runnerTile2.col - speedToTiles(fwdTarget.stats.speed)), row: runnerTile2.row };
      if (planRef && runTile2.col < runnerTile2.col) {
        planRef.current = { runnerId: fwdTarget.id, runTile: runTile2 };
        return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: throughBallTarget(player.position, fwdTarget, runTile2), coordinated: true };
      }
      return passTo(fwdTarget, player.position);
    }

    // 5. Dribble only when route is clear
    if (!fwdBlocked && !hardPressed) {
      // Slightly diagonal run to avoid defenders; distance scales with player speed
      const dribRow = pt.row < 3 ? pt.row + 1 : pt.row - 1; // move into space
      const dribRange = speedToTiles(player.stats.speed);
      const dribTarget = { col: Math.max(0, pt.col - dribRange), row: Math.max(0, Math.min(6, dribRow)) };
      return moveStep(player, pt, dribTarget, claimed, friendly);
    }

    // 6. Last resort: any open teammate
    const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 7);
    if (anyTarget) return passTo(anyTarget, player.position);

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
    // Track ball row, stay in col 9, central 3 rows so corners remain scorable
    const ballRow = Math.max(2, Math.min(4, ballTile.row));
    return moveStep(player, pt, { col: 9, row: ballRow }, claimed, friendly);
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
    return moveStep(player, pt, ballTile, claimed, friendly);
  }

  const oppTile = posToTile(assignedOpponent.position);
  const oppDistFromBall = chebDist(oppTile, ballTile);

  // ── Ball carrier (opponent HAS the ball) ──────────────────────────────────
  // Never crowd their current tile. Instead, cut their most likely exit:
  // find their most advanced outfield teammate and intercept ~60% along that lane.
  if (oppDistFromBall === 0) {
    const teammates = playerPlayers.filter(
      p => p.role !== "goalkeeper" && p.id !== assignedOpponent.id
    );
    if (teammates.length > 0) {
      const danger = teammates.reduce((best, p) =>
        posToTile(p.position).col > posToTile(best.position).col ? p : best
      );
      const tgt = posToTile(danger.position);
      const laneCol = Math.max(0, Math.min(GRID_COLS - 1,
        Math.round(oppTile.col * 0.4 + tgt.col * 0.6)
      ));
      const laneRow = Math.max(0, Math.min(6,
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
  // Press their tile directly — fine to target since they don't have possession.
  if (oppDistFromBall === 1) {
    return moveStep(player, pt, oppTile, claimed, friendly);
  }

  // ── Loose marking: off-ball opponent safely away from play ────────────────
  // Attacking roles drift into a zonal hold more often than defensive roles.
  const looseRole = player.role === "forward" || player.role === "striker";
  const isLoose = oppDistFromBall >= 3 && Math.random() < (looseRole ? 0.45 : 0.18);

  if (isLoose) {
    // Zonal hold: 2 tiles goal-side of opponent, row blended toward ball row
    const looseCol = Math.min(GRID_COLS - 1, oppTile.col + 2);
    const looseRow = Math.max(0, Math.min(6, Math.round((oppTile.row + ballTile.row) / 2)));
    return moveStep(player, pt, { col: looseCol, row: looseRow }, claimed, friendly);
  }

  // ── Tight shadow: intercept the pass lane ────────────────────────────────
  // Position on the line between opponent and ball, shifted 1 tile goal-side.
  // Targets where a pass would arrive, not where the opponent currently is.
  const interceptCol = Math.min(GRID_COLS - 1, Math.round((oppTile.col + ballTile.col) / 2) + 1);
  const interceptRow = Math.max(0, Math.min(6, Math.round((oppTile.row + ballTile.row) / 2)));
  return moveStep(player, pt, { col: interceptCol, row: interceptRow }, claimed, friendly);
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
      const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 9);
      if (fwdTarget) {
        const rTile = posToTile(fwdTarget.position);
        const fTile: TilePos = { col: Math.max(0, rTile.col - speedToTiles(fwdTarget.stats.speed)), row: rTile.row };
        if (planRef && fTile.col < rTile.col) {
          planRef.current = { runnerId: fwdTarget.id, runTile: fTile };
          return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: throughBallTarget(player.position, fwdTarget, fTile), coordinated: true };
        }
        return passTo(fwdTarget, player.position);
      }
      const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 9);
      if (anyTarget) return passTo(anyTarget, player.position);
    }
    return stayPut({ col: 9, row: 3 });
  }

  if (hasBall) {
    // Shoot from closer range than tier 1
    if (pt.col <= 3) return shoot();

    const hardPressed = isHardPressed(pt, playerPlayers);
    const fwdBlocked = isForwardBlocked(pt, playerPlayers);

    // Pass forward if good opportunity.
    // Same rule as Tier 1: press doesn't block a forward pass if the target is open.
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 9);
    const fwdTargetOpen = fwdTarget && !isThreatened(posToTile(fwdTarget.position), playerPlayers);
    if (fwdTarget && (!hardPressed || fwdTargetOpen)) {
      // Always pass-to-tile — coordinate runner + aimed pass
      const runnerTile = posToTile(fwdTarget.position);
      const runnerReach = speedToTiles(fwdTarget.stats.speed);
      const runTile: TilePos = { col: Math.max(0, runnerTile.col - runnerReach), row: runnerTile.row };
      if (planRef && runTile.col < runnerTile.col) {
        planRef.current = { runnerId: fwdTarget.id, runTile };
        return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: throughBallTarget(player.position, fwdTarget, runTile), coordinated: true };
      }
      return passTo(fwdTarget, player.position);
    }

    // If pressed, look for any lateral/forward release
    if (hardPressed) {
      const latTarget = bestLateralPass(player, aiPlayers, playerPlayers, 4);
      if (latTarget) return passTo(latTarget, player.position);
      // Rarely goes backward — prefers to hold
      const bkTarget = bestBackwardPass(player, aiPlayers, playerPlayers, 4);
      if (bkTarget && Math.random() < 0.5) return passTo(bkTarget, player.position);
    }

    // Dribble forward if route is clear; distance scales with player speed
    if (!fwdBlocked) {
      const dribRange = speedToTiles(player.stats.speed);
      return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: pt.row }, claimed, friendly);
    }

    // Blocked: try to pass or sidestep
    if (fwdTarget) {
      if (Math.random() < 0.2) {
        const runTile = pickRunAfterPassTile(player, pt, playerPlayers);
        return passAndRun(fwdTarget, runTile, player.position);
      }
      return passTo(fwdTarget, player.position);
    }
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
  friendly: Set<string>,
  adaptiveState?: AdaptiveAIState
): Command {
  const adapt = computeAdaptation(adaptiveState);

  if (player.role === "goalkeeper") {
    // Track ball row, stay in central 3 rows so corners remain scorable
    const ballRow = Math.max(2, Math.min(4, ballTile.row));
    const targetRow = adaptRow(ballRow, adapt);
    return moveStep(player, pt, { col: 9, row: targetRow }, claimed, friendly);
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
    return moveStep(player, pt, ballTile, claimed, friendly);
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
      // Tier 3 GK boots it forward — always pass-to-tile
      const anyTarget = bestAnyPass(player, aiPlayers, playerPlayers, 9);
      if (anyTarget) {
        const rTile = posToTile(anyTarget.position);
        const fTile: TilePos = { col: Math.max(0, rTile.col - speedToTiles(anyTarget.stats.speed)), row: rTile.row };
        if (planRef && fTile.col < rTile.col) {
          planRef.current = { runnerId: anyTarget.id, runTile: fTile };
          return { type: CommandType.PASS, targetPlayerId: anyTarget.id, targetPosition: throughBallTarget(player.position, anyTarget, fTile), coordinated: true };
        }
        return passTo(anyTarget, player.position);
      }
    }
    return stayPut({ col: 9, row: 3 });
  }

  if (hasBall) {
    // Shoot from close range (slightly less trigger-happy than before)
    if (pt.col <= 3) return shoot();

    // Rarely pass — 28% chance; when passing always use pass-to-tile
    const fwdTarget = bestForwardPass(player, aiPlayers, playerPlayers, 9);
    if (fwdTarget && Math.random() < 0.28) {
      const rTile = posToTile(fwdTarget.position);
      const fTile: TilePos = { col: Math.max(0, rTile.col - speedToTiles(fwdTarget.stats.speed)), row: rTile.row };
      if (planRef && fTile.col < rTile.col) {
        planRef.current = { runnerId: fwdTarget.id, runTile: fTile };
        return { type: CommandType.PASS, targetPlayerId: fwdTarget.id, targetPosition: throughBallTarget(player.position, fwdTarget, fTile), coordinated: true };
      }
      return passTo(fwdTarget, player.position);
    }

    // Just dribble forward — very predictable; still uses player's speed range
    const dribRange = speedToTiles(player.stats.speed);
    return moveStep(player, pt, { col: Math.max(0, pt.col - dribRange), row: pt.row }, claimed, friendly);
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
  friendly: Set<string>,
  adaptiveState?: AdaptiveAIState
): Command {
  const adapt = computeAdaptation(adaptiveState);

  if (player.role === "goalkeeper") {
    // Tier 3 GK normally stays fixed — but after conceding, starts tracking the danger row
    if (adapt.urgency > 0 && adapt.dangerRow !== null) {
      const gkRow = Math.max(1, Math.min(5, adapt.dangerRow));
      return moveStep(player, pt, { col: 9, row: gkRow }, claimed, friendly);
    }
    return stayPut({ col: 9, row: 3 });
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
    return moveStep(player, pt, ballTile, claimed, friendly);
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
        case 1: cmd = tier1Possession(player, pt, hasBall, aiPlayers, playerPlayers, ballTile, claimed, friendly, planRef); break;
        case 2: cmd = tier2Possession(player, pt, hasBall, aiPlayers, playerPlayers, ballTile, claimed, friendly, planRef); break;
        default: cmd = tier3Possession(player, pt, hasBall, aiPlayers, playerPlayers, ballTile, claimed, friendly, planRef); break;
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
