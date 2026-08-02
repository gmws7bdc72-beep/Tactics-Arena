import type {
  SimPlayer,
  SimBall,
  Command,
  FrameSnapshot,
  GameEvent,
  Vec2,
  PlayerStats,
  DuelEffectSnapshot,
} from "./types";
import { PlayerState, CommandType, GameEventType } from "./types";
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  DELTA,
  TICKS_PER_TURN,
  BALL_FRICTION,
  PASS_SPEED,
  SHOT_SPEED,
  PASS_WIND_UP,
  LONG_PASS_WIND_UP,
  PASS_RECOVERY,
  SHOT_WIND_UP,
  SHOT_RECOVERY,
  INTERCEPTION_RADIUS,
  GOAL_WIDTH,
  GOAL_TOP_Y,
  GOAL_BOTTOM_Y,
  GOAL_LEFT_X,
  GOAL_RIGHT_X,
  GOAL_DEPTH,
  PLAYER_RADIUS,
  TILE_W,
  TILE_H,
  GK_COLS_PLAYER_MIN,
  GK_COLS_PLAYER_MAX,
  GK_COLS_AI_MIN,
  GK_COLS_AI_MAX,
  GRID_COLS,
  GRID_ROWS,
  getLinearPixelSpeed,
  speedToTiles,
  BALL_RADIUS,
} from "./constants";
import { posToTile, tileToPos } from "./grid";
import {
  advanceCurveMotion,
  createCurveMotion,
  curveMotionProgress,
  curvePointLimitForCommand,
  sanitizeCurvePoints,
} from "./curve";

function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function vec2Scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}
function vec2Len(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}
function vec2Normalize(a: Vec2): Vec2 {
  const l = vec2Len(a);
  if (l === 0) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}
function vec2Dist(a: Vec2, b: Vec2): number {
  return vec2Len(vec2Sub(a, b));
}
function vec2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

type BallCurveKind = "ground" | "long" | "shot";

function sanitizeBallCurve(
  start: Vec2,
  rawPoints: Vec2[] | undefined,
  finalTarget: Vec2,
  curveStat: number,
  kind: BallCurveKind,
): Vec2[] | undefined {
  if (!rawPoints || rawPoints.length < 2) return undefined;

  const direct = vec2Sub(finalTarget, start);
  const directLength = vec2Len(direct);
  if (directLength < 8) return undefined;

  const forward = vec2Normalize(direct);
  const normal = { x: -forward.y, y: forward.x };
  const quality = clamp((curveStat - 1) / 9, 0, 1);
  const tile = Math.max(TILE_W, TILE_H);

  // Ball actions stay football-realistic. Movement and dribbling never call
  // this function, so their drawn routes remain unrestricted.
  const maxLateralTiles =
    kind === "ground"
      ? 0.35 + quality * 0.75
      : kind === "long"
        ? 0.45 + quality * 0.95
        : 0.25 + quality * 0.65;
  const maxRelativeBend = kind === "shot" ? 0.22 : kind === "ground" ? 0.28 : 0.32;
  const maxLateral = Math.min(
    maxLateralTiles * tile,
    directLength * maxRelativeBend,
  );

  const points = rawPoints.map((point) => ({ ...point }));

  const legal: Vec2[] = [];
  let bendSide = 0;
  let lastProgress = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const relative = vec2Sub(point, start);
    const expected = (index + 1) / (points.length + 1);
    const projected = vec2Dot(relative, forward);
    const minProgress = Math.min(
      directLength * 0.9,
      Math.max(lastProgress + 3, directLength * Math.max(0.06, expected - 0.13)),
    );
    const maxProgress = Math.max(
      minProgress,
      directLength * Math.min(0.94, expected + 0.13),
    );
    const progress = clamp(projected, minProgress, maxProgress);

    let lateral = clamp(vec2Dot(relative, normal), -maxLateral, maxLateral);
    const pointSide = Math.sign(lateral);
    if (bendSide === 0 && pointSide !== 0) bendSide = pointSide;
    if (bendSide !== 0 && pointSide !== 0 && pointSide !== bendSide) lateral = 0;

    legal.push({
      x: clamp(
        start.x + forward.x * progress + normal.x * lateral,
        -GOAL_DEPTH,
        PITCH_WIDTH + GOAL_DEPTH,
      ),
      y: clamp(
        start.y + forward.y * progress + normal.y * lateral,
        0,
        PITCH_HEIGHT,
      ),
    });
    lastProgress = progress;
  }

  if (legal.length < 2) return undefined;

  // A final route-length guard prevents giant hooks even when every individual
  // handle is technically forward-facing.
  let routeLength = 0;
  let previous = start;
  for (const point of legal) {
    routeLength += vec2Dist(previous, point);
    previous = point;
  }
  routeLength += vec2Dist(previous, finalTarget);
  const maxRatio = kind === "shot" ? 1.16 : kind === "ground" ? 1.22 : 1.28;
  if (routeLength > directLength * maxRatio) {
    const shrink = clamp((directLength * maxRatio) / routeLength, 0.35, 1);
    for (let index = 0; index < legal.length; index += 1) {
      const relative = vec2Sub(legal[index], start);
      const progress = vec2Dot(relative, forward);
      const lateral = vec2Dot(relative, normal) * shrink;
      legal[index] = {
        x: clamp(
          start.x + forward.x * progress + normal.x * lateral,
          -GOAL_DEPTH,
          PITCH_WIDTH + GOAL_DEPTH,
        ),
        y: clamp(
          start.y + forward.y * progress + normal.y * lateral,
          0,
          PITCH_HEIGHT,
        ),
      };
    }
  }

  return legal;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getOffsidePlayers(players: SimPlayer[]): Set<string> {
  const playerTeam = players.filter((p) => p.teamId === "player");
  const aiTeam = players.filter((p) => p.teamId === "ai");
  const offside = new Set<string>();

  // Baller-League attacking-third rule still applies. The defender now sets
  // the line at the GOAL-SIDE EDGE of their tile, not at their centre. An
  // attacker sharing that tile remains onside until their body crosses the
  // leading edge nearest the goal.
  const ATTACK_LINE = (PITCH_WIDTH * 2) / 3;
  const DEFEND_LINE = PITCH_WIDTH / 3;
  const EPSILON = 0.001;

  if (aiTeam.length > 0) {
    const sortedAI = [...aiTeam].sort((a, b) => b.position.x - a.position.x);
    const defender = sortedAI.length >= 2 ? sortedAI[1] : sortedAI[0];
    const defenderTile = posToTile(defender.position);
    const lineX = (defenderTile.col + 1) * TILE_W;
    for (const p of playerTeam) {
      if (
        p.role !== "goalkeeper" &&
        p.position.x > ATTACK_LINE &&
        p.position.x > lineX + EPSILON
      ) {
        offside.add(p.id);
      }
    }
  }

  if (playerTeam.length > 0) {
    const sortedPlayer = [...playerTeam].sort((a, b) => a.position.x - b.position.x);
    const defender = sortedPlayer.length >= 2 ? sortedPlayer[1] : sortedPlayer[0];
    const defenderTile = posToTile(defender.position);
    const lineX = defenderTile.col * TILE_W;
    for (const p of aiTeam) {
      if (
        p.role !== "goalkeeper" &&
        p.position.x < DEFEND_LINE &&
        p.position.x < lineX - EPSILON
      ) {
        offside.add(p.id);
      }
    }
  }

  return offside;
}

function retreatFrom(loser: SimPlayer, winner: SimPlayer): void {
  const lt = posToTile(loser.position);
  const wt = posToTile(winner.position);
  const dc = lt.col - wt.col;
  const dr = lt.row - wt.row;

  let rdc: number, rdr: number;
  if (dc !== 0 || dr !== 0) {
    rdc = Math.sign(dc);
    rdr = Math.sign(dr);
  } else {
    rdc = loser.teamId === "player" ? -1 : 1;
    rdr = 0;
  }

  let retreatCol = clamp(lt.col + rdc, 0, GRID_COLS - 1);
  const retreatRow = clamp(lt.row + rdr, 0, GRID_ROWS - 1);

  // GK must stay in their zone even when retreating
  if (loser.role === "goalkeeper") {
    if (loser.teamId === "player") {
      retreatCol = clamp(retreatCol, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX);
    } else {
      retreatCol = clamp(retreatCol, GK_COLS_AI_MIN, GK_COLS_AI_MAX);
    }
  }

  loser.position = tileToPos(retreatCol, retreatRow);
  loser.velocity = { x: 0, y: 0 };
  loser.command = null;
  loser.commandExecuted = false;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Snap position to nearest tile center
function snapToTile(pos: Vec2): Vec2 {
  const t = posToTile(pos);
  return tileToPos(t.col, t.row);
}


function statValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function physiqueStat(player: SimPlayer): number {
  return statValue(player.stats.strength, statValue(player.stats.defense, 5));
}

function defenderBallWinStat(player: SimPlayer): number {
  return (
    statValue(player.stats.defense, 5) +
    statValue(player.stats.tackling, statValue(player.stats.defense, 5)) +
    statValue(player.stats.marking, statValue(player.stats.defense, 5))
  ) / 3;
}

function carrierKeepChance(carrier: SimPlayer, defender: SimPlayer): number {
  const dribbling = statValue(carrier.stats.dribbling, statValue(carrier.stats.attack, 5));
  const strength = statValue(carrier.stats.strength, 5);
  const defense = defenderBallWinStat(defender);
  let chance = 0.58 + (dribbling - defense) * 0.055 + (strength - statValue(defender.stats.strength, 5)) * 0.018;

  if (carrier.ability === "ghost_run") chance += 0.08;
  if (carrier.ability === "powerhouse") chance += 0.05;
  if (defender.ability === "iron_tackle") chance -= 0.08;
  if (defender.ability === "powerhouse") chance -= 0.04;
  if (defender.ability === "shadow_mark") chance -= 0.05;

  return clamp(chance, 0.14, 0.92);
}

function noBallTileWinChance(a: SimPlayer, b: SimPlayer): number {
  const difference = physiqueStat(a) - physiqueStat(b);
  let chance = 0.5 + difference * 0.075;
  if (a.ability === "powerhouse") chance += 0.07;
  if (b.ability === "powerhouse") chance -= 0.07;
  return clamp(chance, 0.05, 0.95);
}

function endPlannedContribution(player: SimPlayer): void {
  player.command = null;
  player.commandExecuted = true;
  player.curveMotion = undefined;
  player.velocity = { x: 0, y: 0 };
  player.state = PlayerState.RECOVERING;
  player.recoveryTimer = Math.max(player.recoveryTimer, 0.45);
}
function clampGKTarget(target: Vec2, teamId: "player" | "ai"): Vec2 {
  const t = posToTile(target);
  let col = t.col;
  if (teamId === "player") {
    col = clamp(col, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX);
  } else {
    col = clamp(col, GK_COLS_AI_MIN, GK_COLS_AI_MAX);
  }
  return tileToPos(col, t.row);
}

interface BallTracker {
  type: "pass" | "long_pass" | "shot" | null;
  teamId: "player" | "ai" | null;
  playerId: string | null;
  name: string | null;
  /** Player IDs that were in an offside position at the moment the pass was kicked. */
  offsideIds: Set<string>;
}

interface ActiveDuelEffect extends Omit<DuelEffectSnapshot, "progress"> {
  startTick: number;
  durationTicks: number;
}

function duelDirection(from: Vec2, to: Vec2): Vec2 {
  const direction = vec2Normalize(vec2Sub(to, from));
  return vec2Len(direction) > 0 ? direction : { x: 1, y: 0 };
}

function normalizeSimulationCommand(
  player: SimPlayer,
  command: Command | null,
): Command | null {
  if (!command) return null;
  const targetPosition = command.targetPosition
    ? { ...command.targetPosition }
    : undefined;

  // Do not tame MOVE curves here. This preserves intentionally wild dribbles
  // and off-ball movement. Passes, long balls and shots are constrained only
  // when the ball is actually kicked.
  const curvePoints = sanitizeCurvePoints(
    command.curvePoints,
    curvePointLimitForCommand(player.stats, command),
  );

  return {
    ...command,
    targetPosition,
    curvePoints: curvePoints.length >= 2 ? curvePoints : undefined,
    followUp: command.followUp
      ? (normalizeSimulationCommand(player, command.followUp) ?? undefined)
      : undefined,
  };
}
export function runSimulation(
  players: SimPlayer[],
  ball: SimBall,
  seedValue: number,
): { frames: FrameSnapshot[]; events: GameEvent[] } {
  const rng = seededRandom(seedValue);
  const frames: FrameSnapshot[] = [];
  const allEvents: GameEvent[] = [];
  const passTracker: BallTracker = {
    type: null,
    teamId: null,
    playerId: null,
    name: null,
    offsideIds: new Set(),
  };

  const simPlayers: SimPlayer[] = players.map((source) => {
    const legacyLuck = (source.stats as PlayerStats & { luck?: number }).luck;
    const player: SimPlayer = {
      ...source,
      stats: {
        ...source.stats,
        movement: statValue(source.stats.movement, statValue(legacyLuck, 5)),
      },
      position: { ...source.position },
      velocity: { ...source.velocity },
      command: null,
      curveMotion: undefined,
      diveMotion: undefined,
    };
    player.command = normalizeSimulationCommand(player, source.command);
    return player;
  });

  const simBall: SimBall = {
    position: { ...ball.position },
    velocity: { ...ball.velocity },
    ownerId: ball.ownerId,
    // Carry forward any mid-flight pass from the previous turn so it completes.
    passTarget: ball.passTarget ? { ...ball.passTarget } : undefined,
    height: ball.height ?? 0,
    passStyle: ball.passStyle,
    passStart: ball.passStart ? { ...ball.passStart } : undefined,
    curveMotion: ball.curveMotion
      ? {
          ...ball.curveMotion,
          points: ball.curveMotion.points.map((point) => ({ ...point })),
        }
      : undefined,
    travelSpeed: ball.travelSpeed,
    flightPeakHeight: ball.flightPeakHeight,
  };

  // Snap all players to tile centers at start of turn
  for (const p of simPlayers) {
    p.position = snapToTile(p.position);
  }

  // Record start-of-turn tiles for direction-aware separation later
  const startTile = new Map<string, { col: number; row: number }>();
  for (const p of simPlayers) {
    startTile.set(p.id, posToTile(p.position));
  }

  // Clamp GK target positions to their zone
  for (const p of simPlayers) {
    if (
      p.role === "goalkeeper" &&
      p.command?.type === CommandType.MOVE &&
      p.command.targetPosition
    ) {
      p.command = {
        ...p.command,
        targetPosition: clampGKTarget(p.command.targetPosition, p.teamId),
      };
    }
  }

  // Run for TICKS_PER_TURN, but extend while a pass is still in flight so the
  // ball always reaches its destination within the same turn. Safety ceiling at
  // 5× the normal budget to prevent runaway loops.
  // FTA_PHASE_RESOLUTION_V3
  const ABSOLUTE_MAX_TICKS = TICKS_PER_TURN * 12;
  let stalledTicks = 0;
  let previousPositions = new Map(
    simPlayers.map((player) => [player.id, { ...player.position }]),
  );
  const activeDuelEffects: ActiveDuelEffect[] = [];
  const lastDuelEffectTick = new Map<string, number>();
  let duelEffectSerial = 0;
  for (let tick = 0; tick < ABSOLUTE_MAX_TICKS; tick++) {
    const tickEvents: GameEvent[] = [];

    updatePlayerMovement(
      simPlayers,
      simBall,
      DELTA,
      tickEvents,
      tick,
      passTracker,
      rng,
    );
    updateBallPhysics(simBall, DELTA);
    detectAndResolveEvents(
      simPlayers,
      simBall,
      tick,
      tickEvents,
      rng,
      passTracker,
    );
    constrainToField(simPlayers, simBall);
    separateOverlapping(simPlayers, simBall, rng, tickEvents, tick);

    for (const event of tickEvents) {
      if (!event.visualEffect || !event.effectPosition || !event.effectDirection) continue;
      const pair = [event.playerId ?? "", event.targetId ?? ""].sort().join(":");
      const cooldownKey = `${event.visualEffect}:${pair}`;
      const durationTicks = event.visualEffect === "outmuscled" ? 9 : 11;
      const previousTick = lastDuelEffectTick.get(cooldownKey) ?? -999;
      if (tick - previousTick < durationTicks) continue;
      lastDuelEffectTick.set(cooldownKey, tick);
      activeDuelEffects.push({
        id: `duel-${tick}-${duelEffectSerial++}`,
        kind: event.visualEffect,
        position: { ...event.effectPosition },
        direction: { ...event.effectDirection },
        intensity: clamp(event.effectIntensity ?? 0.5, 0.2, 1),
        startTick: tick,
        durationTicks,
      });
    }
    for (let index = activeDuelEffects.length - 1; index >= 0; index -= 1) {
      const effect = activeDuelEffects[index];
      if (tick - effect.startTick >= effect.durationTicks) activeDuelEffects.splice(index, 1);
    }

    // FTA_STALL_RESOLUTION_V3
    const pendingPlayers = simPlayers.filter(
      (player) => player.command !== null && !player.commandExecuted,
    );
    const activeTimedAction = simPlayers.some(
      (player) =>
        (player.state === PlayerState.PASSING ||
          player.state === PlayerState.SHOOTING ||
          player.state === PlayerState.DIVING) &&
        player.stateTimer > 0,
    );
    let positionalProgress = 0;
    for (const player of simPlayers) {
      const previous = previousPositions.get(player.id) ?? player.position;
      positionalProgress += vec2Dist(previous, player.position);
    }
    const ballProgressing = vec2Len(simBall.velocity) >= 0.5;

    if (
      pendingPlayers.length > 0 &&
      !activeTimedAction &&
      !ballProgressing &&
      positionalProgress < 0.2
    ) {
      stalledTicks += 1;
    } else {
      stalledTicks = 0;
    }

    // A physically blocked command is resolved instead of keeping the phase
    // alive forever. Its contribution for this turn is simply over.
    if (stalledTicks >= Math.max(12, Math.round(0.75 / DELTA))) {
      for (const player of pendingPlayers) endPlannedContribution(player);
      stalledTicks = 0;
    }

    // Absolute emergency exit: finish every unresolved contribution and any
    // remaining ball flight before the safety ceiling can soft-lock the match.
    if (tick === ABSOLUTE_MAX_TICKS - 1) {
      for (const player of simPlayers) {
        if (player.command && !player.commandExecuted) endPlannedContribution(player);
      }
      if (simBall.passTarget) {
        // Never spawn a stalled ball at its destination. If the absolute safety
        // ceiling is ever reached, settle it where it physically is.
        simBall.velocity = { x: 0, y: 0 };
        simBall.passTarget = undefined;
        simBall.passStart = undefined;
        simBall.passStyle = undefined;
        simBall.height = 0;
        simBall.curveMotion = undefined;
        simBall.travelSpeed = undefined;
        simBall.flightPeakHeight = undefined;
      }
    }

    previousPositions = new Map(
      simPlayers.map((player) => [player.id, { ...player.position }]),
    );

    const goalResult = checkGoal(simBall);
    if (goalResult) {
      tickEvents.push({
        type: GameEventType.GOAL,
        tick,
        teamId: goalResult,
        message:
          goalResult === "player"
            ? "GOAL! Player scores!"
            : "GOAL! Opponent scores!",
      });
      allEvents.push(...tickEvents);
      frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents, activeDuelEffects));
      break;
    }

    allEvents.push(...tickEvents);
    frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents, activeDuelEffects));

    const actionsResolved = simPlayers.every((player) => {
      const activeAction =
        player.state === PlayerState.PASSING ||
        player.state === PlayerState.SHOOTING ||
        player.state === PlayerState.DIVING;
      return !activeAction && (!player.command || player.commandExecuted);
    });
    const ballResolved =
      simBall.passTarget === undefined && vec2Len(simBall.velocity) < 2;
    if (tick >= TICKS_PER_TURN - 1 && actionsResolved && ballResolved) break;
  }

  // Snap all players to tile centers at end of turn
  for (const p of simPlayers) {
    p.position = snapToTile(p.position);
  }

  // Direction-aware tile separation with stat-based tile ownership.
  // - No ball: higher physique/strength keeps the tile 85% of the time.
  // - Ball carrier involved: dribbling vs defense decides whether the carry survives.
  // Losers are displaced using the same retreat-to-start logic as before.
  for (let iter = 0; iter < 3; iter++) {
    const occupied = new Map<string, SimPlayer>();

    const pushToFreeTile = (loser: SimPlayer, winner: SimPlayer): void => {
      const t = posToTile(loser.position);
      const st = startTile.get(loser.id) ?? t;
      const ddc = st.col - t.col;
      const ddr = st.row - t.row;
      const preferCol = Math.abs(ddc) >= Math.abs(ddr);
      const retreatOffsets: [number, number][] = [];

      if (ddc !== 0 || ddr !== 0) {
        const sc = ddc !== 0 ? Math.sign(ddc) : 0;
        const sr = ddr !== 0 ? Math.sign(ddr) : 0;
        if (preferCol) {
          retreatOffsets.push([sc, sr], [sc, 0], [0, sr], [-sc, 0], [0, -sr]);
        } else {
          retreatOffsets.push([sc, sr], [0, sr], [sc, 0], [0, -sr], [-sc, 0]);
        }
      }

      retreatOffsets.push([0, 1], [0, -1], [1, 0], [-1, 0]);

      for (const [dc, dr] of retreatOffsets) {
        if (dc === 0 && dr === 0) continue;
        let nc = clamp(t.col + dc, 0, GRID_COLS - 1);
        const nr = clamp(t.row + dr, 0, GRID_ROWS - 1);

        if (loser.role === "goalkeeper") {
          nc = loser.teamId === "player"
            ? clamp(nc, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX)
            : clamp(nc, GK_COLS_AI_MIN, GK_COLS_AI_MAX);
        }

        const ak = `${nc},${nr}`;
        if (!occupied.has(ak)) {
          loser.position = tileToPos(nc, nr);
          loser.velocity = { x: 0, y: 0 };
          occupied.set(ak, loser);
          return;
        }
      }

      // No free tile found; fall back to the old physical retreat helper.
      retreatFrom(loser, winner);
    };

    const chooseWinner = (a: SimPlayer, b: SimPlayer): SimPlayer => {
      // Preserve an in-turn physical-duel result during end-of-turn snapping.
      // The recovering player already lost and must yield the tile.
      if (a.state === PlayerState.RECOVERING && b.state !== PlayerState.RECOVERING) return b;
      if (b.state === PlayerState.RECOVERING && a.state !== PlayerState.RECOVERING) return a;

      const aOwns = a.id === simBall.ownerId;
      const bOwns = b.id === simBall.ownerId;

      if (aOwns && !bOwns && a.teamId !== b.teamId) {
        return rng() < carrierKeepChance(a, b) ? a : b;
      }
      if (bOwns && !aOwns && a.teamId !== b.teamId) {
        return rng() < carrierKeepChance(b, a) ? b : a;
      }

      if (aOwns && !bOwns) return a;
      if (bOwns && !aOwns) return b;

      if (a.teamId !== b.teamId) {
        return rng() < noBallTileWinChance(a, b) ? a : b;
      }

      // Same-team overlap: let the stronger player keep the tile, but without
      // causing a turnover or tackle-style recovery state.
      return physiqueStat(a) >= physiqueStat(b) ? a : b;
    };

    for (const p of simPlayers) {
      const t = posToTile(p.position);
      const key = `${t.col},${t.row}`;
      const incumbent = occupied.get(key);

      if (!incumbent) {
        occupied.set(key, p);
        continue;
      }

      const winner = chooseWinner(incumbent, p);
      const loser = winner.id === incumbent.id ? p : incumbent;

      if (winner.id !== incumbent.id) {
        occupied.set(key, winner);
      }

      // Ball-carrier losing a same-tile duel becomes a real turnover.
      if (loser.id === simBall.ownerId && winner.teamId !== loser.teamId) {
        simBall.ownerId = winner.id;
        simBall.velocity = { x: 0, y: 0 };
        simBall.passTarget = undefined;
        simBall.height = 0;
        simBall.passStyle = undefined;
        simBall.passStart = undefined;
        simBall.curveMotion = undefined;
        winner.state = PlayerState.DRIBBLING;
        winner.command = null;
        winner.commandExecuted = false;
        loser.state = PlayerState.RECOVERING;
        loser.recoveryTimer = Math.max(loser.recoveryTimer, 0.7);
      }
      pushToFreeTile(loser, winner);
      if (loser.teamId !== winner.teamId) endPlannedContribution(loser);
    }
  }

  // Clamp GK positions back to their zone after tile separation (separation can push GK out of zone).
  for (const p of simPlayers) {
    if (p.role === "goalkeeper") {
      const t = posToTile(p.position);
      let col = t.col;
      if (p.teamId === "player") {
        col = clamp(col, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX);
      } else {
        col = clamp(col, GK_COLS_AI_MIN, GK_COLS_AI_MAX);
      }
      if (col !== t.col) p.position = tileToPos(col, t.row);
    }
  }

  const finalOwner = simBall.ownerId ? simPlayers.find((p) => p.id === simBall.ownerId) : null;
  if (finalOwner) {
    simBall.position = { ...finalOwner.position };
    simBall.velocity = { x: 0, y: 0 };
  }

  // CRITICAL: Patch the last frame so the next turn inherits post-separation positions.
  // Without this, finishSimulation() reads pre-separation positions from the last frame
  // and two players start the next turn on the same tile despite all separation work.
  if (frames.length > 0) {
    const lastF = frames[frames.length - 1];
    frames[frames.length - 1] = {
      ...lastF,
      ball: {
        ...lastF.ball,
        position: { ...simBall.position },
        velocity: { ...simBall.velocity },
        ownerId: simBall.ownerId,
        passTarget: simBall.passTarget ? { ...simBall.passTarget } : undefined,
        passStart: simBall.passStart ? { ...simBall.passStart } : undefined,
        height: simBall.height ?? 0,
        passStyle: simBall.passStyle,
        travelSpeed: simBall.travelSpeed,
        flightPeakHeight: simBall.flightPeakHeight,
      },
      players: lastF.players.map((fp) => {
        const sp = simPlayers.find((p) => p.id === fp.id);
        return sp ? { ...fp, position: { ...sp.position } } : fp;
      }),
    };
  }

  return { frames, events: allEvents };
}

// Push overlapping players apart at the pixel level every tick.
// Ball owner is never displaced; the other player takes the full push.
// For cross-team non-ball collisions a probabilistic contest determines who yields.
function separateOverlapping(
  players: SimPlayer[],
  ball: SimBall,
  rng: () => number,
  events: GameEvent[],
  tick: number,
): void {
  const minDist = PLAYER_RADIUS * 2.4;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= minDist) continue;

      const aOwns = a.id === ball.ownerId;
      const bOwns = b.id === ball.ownerId;
      const overlap = distance > 0.01 ? minDist - distance : minDist;
      const nx = distance > 0.01 ? dx / distance : 0;
      const ny = distance > 0.01 ? dy / distance : 1;

      // Cross-team carrier collisions continue through the tackle system, which
      // already compares dribbling, defending and strength.
      if (
        (aOwns && b.teamId !== a.teamId) ||
        (bOwns && a.teamId !== b.teamId)
      ) {
        continue;
      }

      if (aOwns) {
        b.position.x += nx * overlap;
        b.position.y += ny * overlap;
        continue;
      }
      if (bOwns) {
        a.position.x -= nx * overlap;
        a.position.y -= ny * overlap;
        continue;
      }

      if (a.teamId === b.teamId) {
        a.position.x -= nx * overlap * 0.5;
        a.position.y -= ny * overlap * 0.5;
        b.position.x += nx * overlap * 0.5;
        b.position.y += ny * overlap * 0.5;
        continue;
      }

      // One player wins the lane and continues their planned movement. The
      // loser yields sideways and their contribution ends. A player already
      // recovering from this duel can never immediately re-win it on a later
      // tick, which previously caused both players to stop.
      const aRecovering = a.state === PlayerState.RECOVERING;
      const bRecovering = b.state === PlayerState.RECOVERING;
      const aWins = aRecovering !== bRecovering
        ? !aRecovering
        : rng() < noBallTileWinChance(a, b);
      const winner = aWins ? a : b;
      const loser = aWins ? b : a;

      const collisionPoint = {
        x: (winner.position.x + loser.position.x) / 2,
        y: (winner.position.y + loser.position.y) / 2,
      };
      const strengthDifference = Math.abs(physiqueStat(winner) - physiqueStat(loser));
      const wasAlreadyRecovering = loser.state === PlayerState.RECOVERING;

      const winnerTravel = vec2Len(winner.velocity) > 1
        ? vec2Normalize(winner.velocity)
        : duelDirection(loser.position, winner.position);
      const side = { x: -winnerTravel.y, y: winnerTravel.x };
      const loserRelative = vec2Sub(loser.position, winner.position);
      const sideSign = loserRelative.x * side.x + loserRelative.y * side.y >= 0 ? 1 : -1;
      const radial = vec2Len(loserRelative) > 0.01
        ? vec2Normalize(loserRelative)
        : { x: side.x * sideSign, y: side.y * sideSign };
      const yieldDirection = vec2Normalize({
        x: side.x * sideSign * 0.82 + radial.x * 0.18,
        y: side.y * sideSign * 0.82 + radial.y * 0.18,
      });
      const yieldDistance = overlap + PLAYER_RADIUS * (0.65 + strengthDifference * 0.035);

      // Winner is deliberately untouched: they keep their exact position,
      // velocity, curve and destination. Only the loser is pushed aside.
      loser.position.x += yieldDirection.x * yieldDistance;
      loser.position.y += yieldDirection.y * yieldDistance;
      endPlannedContribution(loser);

      if (!wasAlreadyRecovering) {
        events.push({
          type: GameEventType.LOOSE_BALL,
          tick,
          playerId: winner.id,
          targetId: loser.id,
          teamId: winner.teamId,
          message: `${winner.name} outmuscles ${loser.name}`,
          visualEffect: "outmuscled",
          effectPosition: collisionPoint,
          effectDirection: duelDirection(winner.position, loser.position),
          effectIntensity: clamp(0.28 + strengthDifference / 9, 0.28, 1),
        });
      }
    }
  }
}
function snapshotFrame(
  tick: number,
  players: SimPlayer[],
  ball: SimBall,
  events: GameEvent[],
  activeDuelEffects: ActiveDuelEffect[],
): FrameSnapshot {
  const offsidePlayers = getOffsidePlayers(players);
  return {
    tick,
    players: players.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      position: { ...p.position },
      velocity: { ...p.velocity },
      state: p.state,
      stateTimer: p.stateTimer,
      actionPassStyle:
        p.command?.type === CommandType.PASS ? p.command.passStyle : undefined,
      actionTarget: p.command?.targetPosition
        ? { ...p.command.targetPosition }
        : undefined,
      actionKind:
        p.state === PlayerState.PASSING
          ? p.command?.passStyle === "long"
            ? "longPass"
            : "pass"
          : p.state === PlayerState.SHOOTING
            ? "shot"
            : undefined,
      actionProgress:
        p.state === PlayerState.PASSING
          ? clamp(
              1 -
                p.stateTimer /
                  (p.command?.passStyle === "long"
                    ? LONG_PASS_WIND_UP
                    : PASS_WIND_UP),
              0,
              1,
            )
          : p.state === PlayerState.SHOOTING
            ? clamp(1 - p.stateTimer / SHOT_WIND_UP, 0, 1)
            : undefined,
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      role: p.role,
      appearance: p.appearance,
      tileRange: speedToTiles(p.stats.speed),
      offside: offsidePlayers.has(p.id),
    })),
    ball: {
      position: { ...ball.position },
      velocity: { ...ball.velocity },
      ownerId: ball.ownerId,
      passTarget: ball.passTarget ? { ...ball.passTarget } : undefined,
      passStart: ball.passStart ? { ...ball.passStart } : undefined,
      height: ball.height ?? 0,
      passStyle: ball.passStyle,
      travelSpeed: ball.travelSpeed,
      flightPeakHeight: ball.flightPeakHeight,
    },
    events: [...events],
    duelEffects: activeDuelEffects.map((effect) => ({
      id: effect.id,
      kind: effect.kind,
      position: { ...effect.position },
      direction: { ...effect.direction },
      intensity: effect.intensity,
      progress: clamp(
        (tick - effect.startTick) / Math.max(1, effect.durationTicks - 1),
        0,
        1,
      ),
    })),
  };
}

// Linear movement — player moves at constant speed directly toward target, no overshoot
function moveLinear(player: SimPlayer, target: Vec2, dt: number): boolean {
  const dx = target.x - player.position.x;
  const dy = target.y - player.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const pixelSpeed = getLinearPixelSpeed(player.stats.speed);
  const step = pixelSpeed * dt;

  if (dist <= step || dist < 0.5) {
    // Arrived — snap exactly
    player.position.x = target.x;
    player.position.y = target.y;
    player.velocity = { x: 0, y: 0 };
    return true; // arrived
  }

  const scale = step / dist;
  player.position.x += dx * scale;
  player.position.y += dy * scale;
  player.velocity = {
    x: (dx / dist) * pixelSpeed,
    y: (dy / dist) * pixelSpeed,
  };
  return false;
}

function moveCommand(
  player: SimPlayer,
  command: Command,
  target: Vec2,
  dt: number,
): boolean {
  if (!command.curvePoints || command.curvePoints.length < 2) {
    player.curveMotion = undefined;
    return moveLinear(player, target, dt);
  }

  if (!player.curveMotion) {
    player.curveMotion = createCurveMotion(
      player.position,
      command.curvePoints,
      target,
    );
  }
  const pixelSpeed = getLinearPixelSpeed(player.stats.speed);
  const advanced = advanceCurveMotion(
    player.position,
    player.curveMotion,
    pixelSpeed * dt,
  );
  player.position = advanced.position;
  player.velocity = advanced.arrived
    ? { x: 0, y: 0 }
    : vec2Scale(advanced.direction, pixelSpeed);
  if (advanced.arrived) player.curveMotion = undefined;
  return advanced.arrived;
}

function updatePlayerMovement(
  players: SimPlayer[],
  ball: SimBall,
  dt: number,
  events: GameEvent[],
  tick: number,
  passTracker: BallTracker,
  rng: () => number,
): void {
  for (const player of players) {
    if (player.state === PlayerState.DIVING && player.diveMotion) {
      const motion = player.diveMotion;
      motion.elapsed = Math.min(motion.duration, motion.elapsed + dt);
      const t = Math.min(1, motion.elapsed / Math.max(0.001, motion.duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const previous = { ...player.position };
      player.position = {
        x: motion.start.x + (motion.target.x - motion.start.x) * eased,
        y: motion.start.y + (motion.target.y - motion.start.y) * eased,
      };
      player.velocity = {
        x: (player.position.x - previous.x) / Math.max(dt, 0.001),
        y: (player.position.y - previous.y) / Math.max(dt, 0.001),
      };
      player.stateTimer = Math.max(0, motion.duration - motion.elapsed);

      if (t >= 1) {
        player.position = { ...motion.target };
        player.velocity = { x: 0, y: 0 };
        player.diveMotion = undefined;
        player.state = PlayerState.RECOVERING;
        player.recoveryTimer = 0.3;
      }
      continue;
    }

    if (player.state === PlayerState.RECOVERING) {
      player.recoveryTimer -= dt;
      if (player.recoveryTimer <= 0) {
        player.state = PlayerState.IDLE;
        player.recoveryTimer = 0;
      }
      player.velocity = vec2Scale(player.velocity, 0.7);
      player.position = vec2Add(
        player.position,
        vec2Scale(player.velocity, dt),
      );
      continue;
    }

    if (
      player.state === PlayerState.PASSING ||
      player.state === PlayerState.SHOOTING
    ) {
      player.stateTimer -= dt;

      if (player.stateTimer <= 0) {
        if (player.state === PlayerState.PASSING) {
          passTracker.type = player.command?.passStyle === "long" ? "long_pass" : "pass";
          passTracker.teamId = player.teamId;
          passTracker.playerId = player.id;
          passTracker.name = player.name;
          passTracker.offsideIds = getOffsidePlayers(players);
          passTracker.offsideIds.delete(player.id);

          // FIXED PASS TARGET LOGIC
          // A = passer
          // B = receiver
          // receiverDestinationTile = where B is going
          // passEndTile = where the pass will end
          if (player.command?.targetPlayerId) {
            const passer = player;
            const receiver = players.find(
              (p) => p.id === passer.command!.targetPlayerId,
            );

            if (receiver) {
              const receiverCurrentTile = snapToTile(receiver.position);

              const receiverDestinationTile =
                receiver.command?.targetPosition
                  ? snapToTile(receiver.command.targetPosition)
                  : receiverCurrentTile;

              const passEndTile = receiverDestinationTile;

              player.command = {
                ...passer.command!,
                targetPosition: passEndTile,
              };
            }
          }

          executePass(player, ball, rng);

          const passFollowUp = player.command?.followUp;
          if (passFollowUp) {
            player.command = passFollowUp;
            player.commandExecuted = false;
            player.state = PlayerState.RECOVERING;
            player.recoveryTimer = 0.15;
          } else {
            player.state = PlayerState.RECOVERING;
            player.recoveryTimer = PASS_RECOVERY;
          }
        } else if (player.state === PlayerState.SHOOTING) {
          passTracker.type = "shot";
          passTracker.teamId = player.teamId;
          passTracker.playerId = player.id;
          passTracker.name = player.name;

          executeShot(player, ball, rng);

          player.state = PlayerState.RECOVERING;
          player.recoveryTimer = SHOT_RECOVERY;

          events.push({
            type: GameEventType.SHOT_ON_GOAL,
            tick,
            playerId: player.id,
            teamId: player.teamId,
            message: `${player.name} shoots at goal!`,
          });
        }
      }

      player.velocity = vec2Scale(player.velocity, 0.8);
      player.position = vec2Add(
        player.position,
        vec2Scale(player.velocity, dt),
      );
      continue;
    }

    if (player.state === PlayerState.CONTESTING) {
      player.stateTimer -= dt;
      if (player.stateTimer <= 0) {
        player.state = PlayerState.IDLE;
      }
      player.velocity = vec2Scale(player.velocity, 0.7);
      player.position = vec2Add(
        player.position,
        vec2Scale(player.velocity, dt),
      );
      continue;
    }

    const hasBall = ball.ownerId === player.id;
    const cmd = player.command;

    if (!cmd || player.commandExecuted) {
      player.velocity = { x: 0, y: 0 };
      player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
      continue;
    }

    if (cmd.type === CommandType.PASS) {
      if (hasBall) {
        player.state = PlayerState.PASSING;
        player.stateTimer =
          player.command?.passStyle === "long"
            ? LONG_PASS_WIND_UP
            : PASS_WIND_UP;
        player.commandExecuted = true;
        player.velocity = { x: 0, y: 0 };
      } else {
        player.commandExecuted = true;
        player.velocity = { x: 0, y: 0 };
        player.state = PlayerState.IDLE;
      }
    } else if (cmd.type === CommandType.SHOOT) {
      if (hasBall) {
        player.state = PlayerState.SHOOTING;
        player.stateTimer = SHOT_WIND_UP;
        player.commandExecuted = true;
        player.velocity = { x: 0, y: 0 };
      } else {
        moveLinear(player, ball.position, dt);
        player.state = PlayerState.MOVING;
      }
} else if (cmd.type === CommandType.DIVE) {
      if (player.role === "goalkeeper" && ball.ownerId !== player.id && cmd.targetPosition) {
        const from = posToTile(player.position);
        const wanted = posToTile(cmd.targetPosition);
        const maxTiles = Math.max(player.stats.defense, player.stats.speed) >= 9 ? 2 : 1;
        const rawDc = wanted.col - from.col;
        const rawDr = wanted.row - from.row;
        const rawLength = Math.hypot(rawDc, rawDr);
        const scale = rawLength > maxTiles ? maxTiles / rawLength : 1;
        let bestCol = from.col;
        let bestRow = from.row;
        let bestError = Number.POSITIVE_INFINITY;
        for (let dc = -maxTiles; dc <= maxTiles; dc++) {
          for (let dr = -maxTiles; dr <= maxTiles; dr++) {
            if (Math.hypot(dc, dr) > maxTiles + 0.001) continue;
            const candidateCol = player.teamId === "player"
              ? clamp(from.col + dc, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX)
              : clamp(from.col + dc, GK_COLS_AI_MIN, GK_COLS_AI_MAX);
            const candidateRow = clamp(from.row + dr, 0, GRID_ROWS - 1);
            const idealCol = from.col + rawDc * scale;
            const idealRow = from.row + rawDr * scale;
            const error = Math.hypot(candidateCol - idealCol, candidateRow - idealRow);
            if (error < bestError) { bestError = error; bestCol = candidateCol; bestRow = candidateRow; }
          }
        }
        const target = tileToPos(bestCol, bestRow);
        const start = { ...player.position };
        const distance = Math.max(1, Math.hypot(target.x - start.x, target.y - start.y));
        const duration = Math.max(0.28, Math.min(0.46, distance / (getLinearPixelSpeed(10) * 2.1)));
        player.velocity = vec2Scale(vec2Normalize(vec2Sub(target, start)), distance / duration);
        player.state = PlayerState.DIVING;
        player.stateTimer = duration;
        player.recoveryTimer = 0;
        player.diveMotion = { start, target, duration, elapsed: 0 };
        player.commandExecuted = true;
      }
    } else if (cmd.type === CommandType.MOVE) {
  const target = cmd.targetPosition!;
  const arrived = moveCommand(player, cmd, target, dt);

  if (arrived) {
    player.curveMotion = undefined;
    if (cmd.followUp) {
      const followUp = { ...cmd.followUp };

      if (followUp.type === CommandType.PASS && hasBall) {
        player.command = followUp;

        if (followUp.targetPlayerId) {
          const receiver = players.find(
            (p) => p.id === followUp.targetPlayerId,
          );

          if (receiver) {
            const receiverCurrentTile = snapToTile(receiver.position);

            const receiverDestinationTile =
              receiver.command?.targetPosition
                ? snapToTile(receiver.command.targetPosition)
                : receiverCurrentTile;

            const passEndTile = receiverDestinationTile;

            player.command = {
              ...followUp,
              targetPosition: passEndTile,
            };
          }
        }

        player.commandExecuted = true;

        passTracker.type = player.command?.passStyle === "long" ? "long_pass" : "pass";
        passTracker.teamId = player.teamId;
        passTracker.playerId = player.id;
        passTracker.name = player.name;
        passTracker.offsideIds = getOffsidePlayers(players);
        passTracker.offsideIds.delete(player.id);

        executePass(player, ball, rng);

        player.state = PlayerState.RECOVERING;
        player.recoveryTimer = PASS_RECOVERY;
      } else {
        player.command = followUp;
        player.commandExecuted = false;
        player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
      }
    } else {
      player.commandExecuted = true;

      if (hasBall) {
        events.push({
          type: GameEventType.DRIBBLE,
          tick,
          playerId: player.id,
          teamId: player.teamId,
          message: player.name,
        });
      }

      player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
    }
  } else {
    player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.MOVING;
  }

  if (hasBall && player.state === PlayerState.DRIBBLING) {
    const offset =
      vec2Len(player.velocity) > 5
        ? vec2Scale(vec2Normalize(player.velocity), PLAYER_RADIUS + 4)
        : { x: 0, y: 0 };

    ball.position = vec2Add(player.position, offset);
    ball.velocity = { x: 0, y: 0 };
  }
}
  }
}
// Pass accuracy: short passes always accurate; long passes need high passing stat



function executePass(
  player: SimPlayer,
  ball: SimBall,
  rng: () => number,
): void {
  const cmd = player.command;
  if (!cmd || cmd.type !== CommandType.PASS) return;

  const isLongBall = cmd.passStyle === "long";
  let targetPos = cmd.targetPosition ?? {
    x: PITCH_WIDTH / 2,
    y: PITCH_HEIGHT / 2,
  };

  if (isLongBall && !cmd.coordinated) {
    const longPassing =
      typeof player.stats.longPassing === "number"
        ? player.stats.longPassing
        : player.stats.passing;
    const vision =
      typeof player.stats.vision === "number"
        ? player.stats.vision
        : player.stats.passing;
    const errorTiles = Math.max(0, 3 - Math.floor((longPassing + vision) / 5));
    if (errorTiles > 0) {
      const targetTile = posToTile(targetPos);
      const dc = Math.floor(rng() * (errorTiles * 2 + 1)) - errorTiles;
      const dr = Math.floor(rng() * (errorTiles * 2 + 1)) - errorTiles;
      targetPos = tileToPos(
        clamp(targetTile.col + dc, 0, GRID_COLS - 1),
        clamp(targetTile.row + dr, 0, GRID_ROWS - 1),
      );
    }
  }

  const abilityMultiplier = player.ability === "bullet_pass" ? 1.5 : 1;
  const curveStat = isLongBall
    ? player.stats.longPassing
    : player.stats.passing;
  const legalCurve = sanitizeBallCurve(
    ball.position,
    cmd.curvePoints,
    targetPos,
    curveStat,
    isLongBall ? "long" : "ground",
  );

  ball.curveMotion = legalCurve
    ? createCurveMotion(ball.position, legalCurve, targetPos)
    : undefined;
  const routeDistance = ball.curveMotion?.totalLength ?? vec2Dist(ball.position, targetPos);
  const distanceTiles = routeDistance / Math.max(TILE_W, TILE_H);
  const groundPassSpeed = PASS_SPEED * abilityMultiplier;
  // Long balls scale up with distance so very long deliveries never stall, but
  // remain slower than the same player's ground pass at every distance.
  const longBallRatio = clamp(0.70 + distanceTiles * 0.016, 0.72, 0.94);
  const passSpeed = isLongBall
    ? groundPassSpeed * longBallRatio
    : groundPassSpeed;
  const firstTarget = ball.curveMotion?.points[0] ?? targetPos;
  const direction = vec2Normalize(vec2Sub(firstTarget, ball.position));
  ball.velocity = vec2Scale(direction, passSpeed);
  ball.travelSpeed = passSpeed;
  ball.flightPeakHeight = isLongBall
    ? clamp(22 + distanceTiles * 2.15, 28, 58)
    : 0;
  ball.passTarget = { ...targetPos };
  ball.passStart = { ...ball.position };
  ball.passStyle = isLongBall ? "long" : "ground";
  ball.height = isLongBall ? 1 : 0;
  ball.ownerId = null;
}
function executeShot(
  player: SimPlayer,
  ball: SimBall,
  rng: () => number,
): void {
  const cmd = player.command;
  const attackingRight = player.teamId === "player";
  const fallbackX = attackingRight
    ? GOAL_RIGHT_X + GOAL_DEPTH * 0.65
    : GOAL_LEFT_X - GOAL_DEPTH * 0.65;
  const desired = cmd?.targetPosition ?? {
    x: fallbackX,
    y: PITCH_HEIGHT / 2,
  };

  const targetX = attackingRight
    ? clamp(
        desired.x,
        GOAL_RIGHT_X + BALL_RADIUS,
        GOAL_RIGHT_X + GOAL_DEPTH - BALL_RADIUS,
      )
    : clamp(
        desired.x,
        GOAL_LEFT_X - GOAL_DEPTH + BALL_RADIUS,
        GOAL_LEFT_X - BALL_RADIUS,
      );
  const distanceTiles =
    vec2Dist(player.position, desired) / Math.max(TILE_W, TILE_H);
  const shooting = Math.max(1, Math.min(10, player.stats.shooting));
  const rangePressure = Math.max(0, distanceTiles - 3) * 0.12;
  const skillError = (11 - shooting) * 0.08;
  const maxErrorTiles = Math.min(2.25, rangePressure + skillError);
  const errorY =
    (rng() * 2 - 1) * maxErrorTiles * Math.max(TILE_W, TILE_H);

  const target = {
    x: targetX,
    y: clamp(desired.y + errorY, BALL_RADIUS, PITCH_HEIGHT - BALL_RADIUS),
  };

  let shotSpeed = SHOT_SPEED * (0.72 + shooting * 0.045);
  if (player.ability === "eagle_eye") shotSpeed *= 1.08;

  const legalCurve = sanitizeBallCurve(
    ball.position,
    cmd?.curvePoints,
    target,
    shooting,
    "shot",
  );
  ball.curveMotion = legalCurve
    ? createCurveMotion(ball.position, legalCurve, target)
    : undefined;
  const firstTarget = ball.curveMotion?.points[0] ?? target;
  const direction = vec2Normalize(vec2Sub(firstTarget, ball.position));
  ball.velocity = vec2Scale(direction, shotSpeed);
  ball.travelSpeed = shotSpeed;
  ball.flightPeakHeight = 0;
  ball.passTarget = target;
  ball.passStart = { ...ball.position };
  ball.ownerId = null;
  ball.height = 0;
  ball.passStyle = undefined;
}
function updateBallPhysics(ball: SimBall, dt: number): void {
  if (ball.ownerId !== null) {
    ball.height = 0;
    ball.passStyle = undefined;
    ball.passStart = undefined;
    ball.curveMotion = undefined;
    ball.travelSpeed = undefined;
    ball.flightPeakHeight = undefined;
    return;
  }

  if (ball.passTarget) {
    // A targeted kick keeps a constant, distance-aware travel speed. Friction
    // only applies after a kick becomes loose; it can no longer freeze a long
    // ball mid-flight and force a destination teleport.
    const speed = Math.max(1, ball.travelSpeed ?? vec2Len(ball.velocity));
    let arrived = false;

    if (ball.curveMotion) {
      const advanced = advanceCurveMotion(
        ball.position,
        ball.curveMotion,
        speed * dt,
      );
      ball.position = advanced.position;
      ball.velocity = advanced.arrived
        ? { x: 0, y: 0 }
        : vec2Scale(advanced.direction, speed);
      arrived = advanced.arrived;
    } else {
      const toTarget = vec2Sub(ball.passTarget, ball.position);
      const distance = vec2Len(toTarget);
      const step = speed * dt;
      if (distance <= step || distance < 0.5) {
        ball.position = { ...ball.passTarget };
        ball.velocity = { x: 0, y: 0 };
        arrived = true;
      } else {
        const direction = vec2Normalize(toTarget);
        ball.velocity = vec2Scale(direction, speed);
        ball.position = vec2Add(ball.position, vec2Scale(direction, step));
      }
    }

    if (ball.passStyle === "long" && ball.passStart) {
      const progress = ball.curveMotion
        ? curveMotionProgress(ball.curveMotion)
        : clamp(
            vec2Dist(ball.passStart, ball.position) /
              Math.max(1, vec2Dist(ball.passStart, ball.passTarget)),
            0,
            1,
          );
      ball.height = Math.sin(progress * Math.PI) * (ball.flightPeakHeight ?? 34);
    } else {
      ball.height = 0;
    }

    if (arrived) {
      ball.position = { ...ball.passTarget };
      ball.velocity = { x: 0, y: 0 };
      ball.passTarget = undefined;
      ball.height = 0;
      ball.passStyle = undefined;
      ball.passStart = undefined;
      ball.curveMotion = undefined;
      ball.travelSpeed = undefined;
      ball.flightPeakHeight = undefined;
    }
  } else {
    ball.velocity = vec2Scale(ball.velocity, BALL_FRICTION);
    ball.position = vec2Add(ball.position, vec2Scale(ball.velocity, dt));
    ball.height = Math.max(0, (ball.height ?? 0) * 0.88);

    if (vec2Len(ball.velocity) < 2) {
      ball.velocity = { x: 0, y: 0 };
      ball.passStyle = undefined;
      ball.passStart = undefined;
      ball.height = 0;
      ball.curveMotion = undefined;
      ball.travelSpeed = undefined;
      ball.flightPeakHeight = undefined;
    }
  }
}


function signTileDelta(v: number): number {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function sameTile(a: { col: number; row: number }, b: { col: number; row: number }): boolean {
  return a.col === b.col && a.row === b.row;
}

function longBallDirectionalContestAllowed(player: SimPlayer, ball: SimBall, distToBall: number): boolean {
  if (ball.passStyle !== "long") return true;
  if (!ball.passStart || !ball.passTarget) return true;

  // A curved delivery cannot be collected from the floor while it is still
  // high in the air. Better aerial players gain a slightly larger playable
  // window, but nobody can touch the ball near the top of its arc.
  const aerial = statValue(player.stats.aerial, statValue(player.stats.attack, 5));
  const playableHeight = 10 + aerial * 0.75;
  if ((ball.height ?? 0) > playableHeight) return false;

  const startTile = posToTile(ball.passStart);
  const targetTile = posToTile(ball.passTarget);
  const launchToward = ball.curveMotion?.points[0] ?? ball.passTarget;
  const receiverFrom =
    ball.curveMotion?.points[Math.max(0, ball.curveMotion.points.length - 2)] ??
    ball.passStart;
  const launchTowardTile = posToTile(launchToward);
  const receiverFromTile = posToTile(receiverFrom);
  const launchDc = signTileDelta(launchTowardTile.col - startTile.col);
  const launchDr = signTileDelta(launchTowardTile.row - startTile.row);
  const receiverDc = signTileDelta(targetTile.col - receiverFromTile.col);
  const receiverDr = signTileDelta(targetTile.row - receiverFromTile.row);

  if (
    launchDc === 0 &&
    launchDr === 0 &&
    receiverDc === 0 &&
    receiverDr === 0
  ) return true;

  const playerTile = posToTile(player.position);
  const launchBlockTile = {
    col: clamp(startTile.col + launchDc, 0, GRID_COLS - 1),
    row: clamp(startTile.row + launchDr, 0, GRID_ROWS - 1),
  };
  const receiverBlockTile = {
    col: clamp(targetTile.col - receiverDc, 0, GRID_COLS - 1),
    row: clamp(targetTile.row - receiverDr, 0, GRID_ROWS - 1),
  };

  const progress = ball.curveMotion
    ? curveMotionProgress(ball.curveMotion)
    : clamp(
        vec2Dist(ball.passStart, ball.position) /
          Math.max(1, vec2Dist(ball.passStart, ball.passTarget)),
        0,
        1,
      );

  // Long balls are not normal floor passes. They can only be blocked during
  // the takeoff square in the direction of the kick, or during the landing
  // square on the incoming side of the receiver. Example: a defender directly
  // in front of the passer cannot block a long ball launched to the right.
  const inLaunchWindow =
    progress <= 0.28 &&
    sameTile(playerTile, launchBlockTile) &&
    distToBall < INTERCEPTION_RADIUS * 1.2;

  const inReceiverWindow =
    progress >= 0.72 &&
    sameTile(playerTile, receiverBlockTile) &&
    distToBall < INTERCEPTION_RADIUS * 1.4;

  // The receiver, or anyone exactly on the landing tile, can still contest the
  // aerial ball once it drops.
  const onLandingTile =
    progress >= 0.78 &&
    sameTile(playerTile, targetTile) &&
    vec2Dist(player.position, ball.passTarget) < INTERCEPTION_RADIUS * 1.35;

  return inLaunchWindow || inReceiverWindow || onLandingTile;
}

function detectAndResolveEvents(
  players: SimPlayer[],
  ball: SimBall,
  tick: number,
  events: GameEvent[],
  rng: () => number,
  passTracker: BallTracker,
): void {
  if (ball.ownerId === null) {
    const candidates: { player: SimPlayer; score: number }[] = [];
    for (const player of players) {
      const dist = vec2Dist(player.position, ball.position);
      const canContestLongBall = longBallDirectionalContestAllowed(player, ball, dist);
      if (
        dist < INTERCEPTION_RADIUS &&
        canContestLongBall &&
        player.state !== PlayerState.RECOVERING
      ) {
        const velTowardBall =
          vec2Len(player.velocity) > 0
            ? vec2Dot(
                vec2Normalize(player.velocity),
                vec2Normalize(vec2Sub(ball.position, player.position)),
              )
            : 0;
        let score = (INTERCEPTION_RADIUS - dist) / INTERCEPTION_RADIUS;
        score += Math.max(0, velTowardBall) * 0.3;
        if (ball.passStyle === "long") {
          const aerial = typeof player.stats.aerial === "number" ? player.stats.aerial : player.stats.attack;
          const strength = typeof player.stats.strength === "number" ? player.stats.strength : 5;
          score += (aerial / 10) * 0.35;
          score += (strength / 10) * 0.15;
        } else {
          score += (player.stats.defense / 10) * 0.2;
        }
        // Movement is positioning/control, not renamed Luck: reward it
        // deterministically when two players arrive at the same loose ball.
        score += (player.stats.movement / 10) * 0.12;
        if (player.ability === "iron_tackle") score += 0.15;
        if (player.ability === "goalkeeper") score += 0.35;
        candidates.push({ player, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const winner = candidates[0].player;
      const loser = candidates.length > 1 ? candidates[1].player : null;

      // Preserve an incomplete MOVE command so the player keeps running to their
      // planned destination while dribbling (don't stop them the moment the ball
      // arrives). Non-MOVE commands (PASS/SHOOT) relied on not yet having the
      // ball, so those are cleared as before.
      if (winner.command?.type !== CommandType.MOVE || winner.commandExecuted) {
        winner.command = null;
        winner.commandExecuted = false;
      }

      if (loser && loser.teamId !== winner.teamId) {
        // Momentum bonus: running toward the ball helps claim it
        const winnerMomentum = Math.min(
          0.12,
          (vec2Len(winner.velocity) / 350) * 0.12,
        );
        const loserMomentum = Math.min(
          0.12,
          (vec2Len(loser.velocity) / 350) * 0.12,
        );
        const winnerScore =
          winner.stats.defense / 10 + rng() * 0.3 + winnerMomentum;
        const loserScore =
          loser.stats.defense / 10 + rng() * 0.3 + loserMomentum;

        if (loserScore > winnerScore) {
          if (
            loser.command?.type !== CommandType.MOVE ||
            loser.commandExecuted
          ) {
            loser.command = null;
            loser.commandExecuted = false;
          }
          ball.ownerId = loser.id;
          ball.velocity = { x: 0, y: 0 };
          ball.passTarget = undefined;
          ball.height = 0;
          ball.passStyle = undefined;
          ball.passStart = undefined;
          ball.curveMotion = undefined;
          loser.state = PlayerState.DRIBBLING;
          winner.state = PlayerState.RECOVERING;
          winner.recoveryTimer = 1.0;
          retreatFrom(winner, loser);

          if (
            passTracker.teamId !== null &&
            passTracker.teamId !== loser.teamId
          ) {
            if (passTracker.type === "shot" && loser.ability === "goalkeeper") {
              events.push({
                type: GameEventType.SAVE,
                tick,
                playerId: loser.id,
                targetId: passTracker.playerId ?? undefined,
                teamId: loser.teamId,
                message: `${loser.name} saves the shot!`,
              });
            } else {
              events.push({
                type: GameEventType.PASS_INTERCEPTED,
                tick,
                playerId: loser.id,
                targetId: passTracker.playerId ?? undefined,
                teamId: loser.teamId,
                message: passTracker.type === "long_pass" ? `${loser.name} wins the aerial ball!` : `${loser.name} intercepts the pass!`,
              });
            }
          } else {
            events.push({
              type: GameEventType.TACKLE,
              tick,
              playerId: loser.id,
              targetId: winner.id,
              teamId: loser.teamId,
              message: `${loser.name} wins the ball!`,
            });
          }
          passTracker.type = null;
          passTracker.teamId = null;
          passTracker.playerId = null;
          passTracker.name = null;
          passTracker.offsideIds = new Set();
          return;
        }
      }

      // Offside check: use snapshot taken at the moment the pass was kicked.
      // Players who were onside when the pass was played can always receive it.
      if ((passTracker.type === "pass" || passTracker.type === "long_pass") && passTracker.teamId === winner.teamId) {
        if (passTracker.offsideIds.has(winner.id)) {
          // Capture the exact tile where the offside player received the ball
          const receptionPos = { ...winner.position };

          events.push({
            type: GameEventType.OFFSIDE,
            tick,
            playerId: winner.id,
            teamId: winner.teamId,
            message: `Offside! ${winner.name} caught offside — free kick awarded!`,
          });

          // Pick a random outfield defender from the opposing team
          const defendingTeamId = winner.teamId === "player" ? "ai" : "player";
          const defCandidates = players.filter(
            (p) => p.teamId === defendingTeamId && p.role !== "goalkeeper",
          );
          const fkTaker =
            defCandidates.length > 0
              ? defCandidates[Math.floor(rng() * defCandidates.length)]
              : players.find((p) => p.teamId === defendingTeamId)!;

          // Teleport the free-kick taker to exactly where the offside player was
          fkTaker.position = { ...receptionPos };
          fkTaker.velocity = { x: 0, y: 0 };
          fkTaker.command = null;
          fkTaker.commandExecuted = false;
          fkTaker.state = PlayerState.DRIBBLING;

          // Snap ball to that same spot
          ball.position = { ...receptionPos };
          ball.ownerId = fkTaker.id;
          ball.velocity = { x: 0, y: 0 };
          ball.passTarget = undefined;
          ball.height = 0;
          ball.passStyle = undefined;
          ball.passStart = undefined;
          ball.curveMotion = undefined;

          // Return the offside player to their match-start position
          winner.position = { ...winner.startPosition };
          winner.velocity = { x: 0, y: 0 };
          winner.state = PlayerState.IDLE;
          winner.command = null;
          winner.commandExecuted = false;

          passTracker.type = null;
          passTracker.teamId = null;
          passTracker.playerId = null;
          passTracker.name = null;
          passTracker.offsideIds = new Set();
          return;
        }
      }

      ball.ownerId = winner.id;
      ball.velocity = { x: 0, y: 0 };
      ball.passTarget = undefined;
      ball.height = 0;
      ball.passStyle = undefined;
      ball.passStart = undefined;
      ball.curveMotion = undefined;
      winner.state = PlayerState.DRIBBLING;

      if (loser && loser.teamId !== winner.teamId) {
        loser.state = PlayerState.RECOVERING;
        loser.recoveryTimer = 1.0;
        retreatFrom(loser, winner);
      }

      if (passTracker.teamId !== null) {
        if (passTracker.teamId === winner.teamId) {
          events.push({
            type: GameEventType.PASS_COMPLETE,
            tick,
            playerId: winner.id,
            targetId: passTracker.playerId ?? undefined,
            teamId: winner.teamId,
            message: passTracker.type === "long_pass" ? `${passTracker.name} launches it → ${winner.name}` : `${passTracker.name} → ${winner.name}`,
          });
        } else if (
          passTracker.type === "shot" &&
          winner.ability === "goalkeeper"
        ) {
          events.push({
            type: GameEventType.SAVE,
            tick,
            playerId: winner.id,
            targetId: passTracker.playerId ?? undefined,
            teamId: winner.teamId,
            message: `${winner.name} saves the shot!`,
          });
        } else {
          events.push({
            type: GameEventType.PASS_INTERCEPTED,
            tick,
            playerId: winner.id,
            targetId: passTracker.playerId ?? undefined,
            teamId: winner.teamId,
            message: passTracker.type === "long_pass" ? `${winner.name} wins the aerial ball!` : `${winner.name} intercepts!`,
          });
        }
        passTracker.type = null;
        passTracker.teamId = null;
        passTracker.playerId = null;
        passTracker.name = null;
        passTracker.offsideIds = new Set();
      } else if (
        candidates.length > 1 &&
        candidates[1].player.teamId !== winner.teamId
      ) {
        events.push({
          type: GameEventType.TACKLE,
          tick,
          playerId: winner.id,
          teamId: winner.teamId,
          message: `${winner.name} picks up the ball!`,
        });
      }
      // No return — fall through to the tackle block so a player already in
      // contact range can immediately contest the freshly-received ball.
    }
  }

  if (ball.ownerId !== null) {
    passTracker.type = null;
    passTracker.teamId = null;
    passTracker.playerId = null;
    passTracker.name = null;
    passTracker.offsideIds = new Set();

    const owner = players.find((p) => p.id === ball.ownerId)!;

    // Two-check checkers-style tackle system:
    //
    // CHECK 1 — Enter tile: did an opponent move INTO the carrier's tile this
    //   tick?  "In the tile" = within TILE_W/2 of the carrier's centre and
    //   moving toward them (velocity direction ≈ toward carrier).
    //   Result: tackler ALWAYS retreats to the tile they came from.
    //
    // CHECK 2 — Pass through: did the tackler's PLANNED command target lie
    //   BEYOND the carrier (carrier is between tackler and destination)?
    //   Determined purely by command.targetPosition, not velocity.
    //   Result: if true → run keepChance contest for the ball.
    //           if false → retreat only, no contest.

    const ENTER_DIST = TILE_W * 0.55; // ≈ 24 px — "same tile" threshold

    for (const other of players) {
      if (other.id === owner.id || other.teamId === owner.teamId) continue;
      if (
        other.state === PlayerState.RECOVERING ||
        other.state === PlayerState.CONTESTING
      )
        continue;

      const dist = vec2Dist(other.position, owner.position);
      if (dist > ENTER_DIST) continue;

      const defSpeed = vec2Len(other.velocity);
      const carrierSpeed = vec2Len(owner.velocity);

      const toOwner = vec2Normalize(vec2Sub(owner.position, other.position));
      const defenderMovingTowardCarrier =
        defSpeed >= 15 && vec2Dot(vec2Normalize(other.velocity), toOwner) >= 0.25;

      const toDefender = vec2Normalize(vec2Sub(other.position, owner.position));
      const carrierRunningIntoDefender =
        carrierSpeed >= 15 && vec2Dot(vec2Normalize(owner.velocity), toDefender) >= 0.15;

      // New rule: a stationary defender still exists. If the carrier runs
      // through that defender's tile, the defender gets a real ball challenge.
      if (!defenderMovingTowardCarrier && !carrierRunningIntoDefender) continue;

      const target = other.command?.targetPosition;
      let passingThrough = carrierRunningIntoDefender;
      if (target) {
        const targetTile = posToTile(target);
        const ownerTile = posToTile(owner.position);
        passingThrough =
          passingThrough ||
          targetTile.col !== ownerTile.col ||
          targetTile.row !== ownerTile.row;
      }

      if (!passingThrough) {
        retreatFrom(other, owner);
        other.command = null;
        other.commandExecuted = false;
        break;
      }

      const keepChance = carrierKeepChance(owner, other);
      const carrierKeepsBall = rng() < keepChance;

      if (carrierKeepsBall) {
        // Tackler fails — retreat and brief contest cool-down.
        retreatFrom(other, owner);
        other.command = null;
        other.commandExecuted = false;
        other.state = PlayerState.CONTESTING;
        other.stateTimer = 0.3;
        events.push({
          type: GameEventType.LOOSE_BALL,
          tick,
          playerId: owner.id,
          targetId: other.id,
          teamId: owner.teamId,
          message: `${owner.name} dribbles past ${other.name}`,
          visualEffect: "dribbled",
          effectPosition: {
            x: (owner.position.x + other.position.x) / 2,
            y: (owner.position.y + other.position.y) / 2,
          },
          effectDirection:
            vec2Len(owner.velocity) > 5
              ? vec2Normalize(owner.velocity)
              : duelDirection(other.position, owner.position),
          effectIntensity: clamp(
            0.3 +
              Math.max(
                0,
                statValue(owner.stats.dribbling, owner.stats.attack) -
                  defenderBallWinStat(other),
              ) /
                8,
            0.3,
            1,
          ),
        });
      } else {
        // Tackler wins the ball.
        ball.ownerId = other.id;
        ball.velocity = { x: 0, y: 0 };
        ball.height = 0;
        ball.passStyle = undefined;
        ball.passStart = undefined;
        other.state = PlayerState.DRIBBLING;
        other.command = null;
        other.commandExecuted = false;
        owner.state = PlayerState.RECOVERING;
        owner.recoveryTimer = 1.0;
        retreatFrom(owner, other);
        events.push({
          type: GameEventType.TACKLE,
          tick,
          playerId: other.id,
          targetId: owner.id,
          teamId: other.teamId,
          message: `${other.name} tackles ${owner.name}!`,
        });
      }
      break;
    }
  }
}

function constrainToField(players: SimPlayer[], ball: SimBall): void {
  for (const player of players) {
    player.position.x = clamp(
      player.position.x,
      PLAYER_RADIUS,
      PITCH_WIDTH - PLAYER_RADIUS,
    );
    player.position.y = clamp(
      player.position.y,
      PLAYER_RADIUS,
      PITCH_HEIGHT - PLAYER_RADIUS,
    );
  }

  if (ball.ownerId !== null) return;

  const inGoalYRange =
    ball.position.y >= GOAL_TOP_Y && ball.position.y <= GOAL_BOTTOM_Y;

  if (ball.position.y < 0) {
    ball.velocity.y = Math.abs(ball.velocity.y) * 0.4;
    ball.position.y = BALL_RADIUS;
  } else if (ball.position.y > PITCH_HEIGHT) {
    ball.velocity.y = -Math.abs(ball.velocity.y) * 0.4;
    ball.position.y = PITCH_HEIGHT - BALL_RADIUS;
  }

  if (inGoalYRange) {
    const leftBack = GOAL_LEFT_X - GOAL_DEPTH + BALL_RADIUS;
    const rightBack = GOAL_RIGHT_X + GOAL_DEPTH - BALL_RADIUS;
    if (ball.position.x < leftBack) {
      ball.position.x = leftBack;
      ball.velocity.x = Math.abs(ball.velocity.x) * 0.25;
    } else if (ball.position.x > rightBack) {
      ball.position.x = rightBack;
      ball.velocity.x = -Math.abs(ball.velocity.x) * 0.25;
    }
  } else if (ball.position.x < GOAL_LEFT_X) {
    ball.position.x = GOAL_LEFT_X + BALL_RADIUS;
    ball.velocity.x = Math.abs(ball.velocity.x) * 0.3;
    ball.velocity.y *= 0.3;
  } else if (ball.position.x > GOAL_RIGHT_X) {
    ball.position.x = GOAL_RIGHT_X - BALL_RADIUS;
    ball.velocity.x = -Math.abs(ball.velocity.x) * 0.3;
    ball.velocity.y *= 0.3;
  }
}

function checkGoal(ball: SimBall): "player" | "ai" | null {
  if (ball.ownerId !== null) return null;

  const completelyBetweenPosts =
    ball.position.y - BALL_RADIUS >= GOAL_TOP_Y &&
    ball.position.y + BALL_RADIUS <= GOAL_BOTTOM_Y;
  if (!completelyBetweenPosts) return null;

  const fullyInsideRightNet =
    ball.position.x - BALL_RADIUS > GOAL_RIGHT_X &&
    ball.position.x <= GOAL_RIGHT_X + GOAL_DEPTH;
  if (fullyInsideRightNet) return "player";

  const fullyInsideLeftNet =
    ball.position.x + BALL_RADIUS < GOAL_LEFT_X &&
    ball.position.x >= GOAL_LEFT_X - GOAL_DEPTH;
  if (fullyInsideLeftNet) return "ai";

  return null;
}
