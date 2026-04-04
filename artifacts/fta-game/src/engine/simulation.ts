import type { SimPlayer, SimBall, Command, FrameSnapshot, GameEvent, Vec2 } from "./types";
import { PlayerState, CommandType, GameEventType } from "./types";
import {
  PITCH_WIDTH, PITCH_HEIGHT, DELTA, TICKS_PER_TURN,
  BALL_FRICTION, PASS_SPEED, SHOT_SPEED,
  PASS_WIND_UP, PASS_RECOVERY, SHOT_WIND_UP, SHOT_RECOVERY,
  INTERCEPTION_RADIUS,
  GOAL_WIDTH, GOAL_TOP_Y, GOAL_BOTTOM_Y, GOAL_LEFT_X, GOAL_RIGHT_X, GOAL_DEPTH,
  PLAYER_RADIUS, TILE_W, TILE_H,
  GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX, GK_COLS_AI_MIN, GK_COLS_AI_MAX,
  getLinearPixelSpeed,
} from "./constants";
import { posToTile, tileToPos } from "./grid";

function vec2Add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function vec2Sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function vec2Scale(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
function vec2Len(a: Vec2): number { return Math.sqrt(a.x * a.x + a.y * a.y); }
function vec2Normalize(a: Vec2): Vec2 {
  const l = vec2Len(a);
  if (l === 0) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}
function vec2Dist(a: Vec2, b: Vec2): number { return vec2Len(vec2Sub(a, b)); }
function vec2Dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

  let retreatCol = clamp(lt.col + rdc, 0, 9);
  const retreatRow = clamp(lt.row + rdr, 0, 6);

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

// Clamp target tile for GK role
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
  type: "pass" | "shot" | null;
  teamId: "player" | "ai" | null;
  playerId: string | null;
  name: string | null;
}

export function speedToTiles(speed: number): number {
  return Math.ceil(Math.max(1, Math.min(10, speed)) / 2);
}

export function runSimulation(
  players: SimPlayer[],
  ball: SimBall,
  seedValue: number
): { frames: FrameSnapshot[]; events: GameEvent[] } {
  const rng = seededRandom(seedValue);
  const frames: FrameSnapshot[] = [];
  const allEvents: GameEvent[] = [];
  const passTracker: BallTracker = { type: null, teamId: null, playerId: null, name: null };

  const simPlayers: SimPlayer[] = players.map(p => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
    command: p.command
      ? { ...p.command, targetPosition: p.command.targetPosition ? { ...p.command.targetPosition } : undefined }
      : null,
  }));

  const simBall: SimBall = {
    position: { ...ball.position },
    velocity: { ...ball.velocity },
    ownerId: ball.ownerId,
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
    if (p.role === "goalkeeper" && p.command?.type === CommandType.MOVE && p.command.targetPosition) {
      p.command = {
        ...p.command,
        targetPosition: clampGKTarget(p.command.targetPosition, p.teamId),
      };
    }
  }

  for (let tick = 0; tick < TICKS_PER_TURN; tick++) {
    const tickEvents: GameEvent[] = [];

    updatePlayerMovement(simPlayers, simBall, DELTA, tickEvents, tick, passTracker, rng);
    updateBallPhysics(simBall, DELTA);
    detectAndResolveEvents(simPlayers, simBall, tick, tickEvents, rng, passTracker);
    constrainToField(simPlayers, simBall);
    separateOverlapping(simPlayers, simBall, rng);

    const goalResult = checkGoal(simBall);
    if (goalResult) {
      tickEvents.push({
        type: GameEventType.GOAL,
        tick,
        teamId: goalResult,
        message: goalResult === "player" ? "GOAL! Player scores!" : "GOAL! Opponent scores!",
      });
      allEvents.push(...tickEvents);
      frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents));
      break;
    }

    allEvents.push(...tickEvents);
    frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents));
  }

  // Snap all players to tile centers at end of turn
  for (const p of simPlayers) {
    p.position = snapToTile(p.position);
  }

  // Direction-aware tile separation: push each player back toward where they came from.
  // Run 3 passes to resolve cascading overlaps.
  for (let iter = 0; iter < 3; iter++) {
    const occupied = new Map<string, string>(); // "col,row" → playerId
    // Ball owner claims their tile first — they always win
    for (const p of simPlayers) {
      if (p.id === simBall.ownerId) {
        const t = posToTile(p.position);
        occupied.set(`${t.col},${t.row}`, p.id);
      }
    }
    for (const p of simPlayers) {
      if (p.id === simBall.ownerId) continue;
      const t = posToTile(p.position);
      const key = `${t.col},${t.row}`;
      if (occupied.has(key)) {
        // Compute retreat direction: from current tile back toward start tile
        const st = startTile.get(p.id) ?? t;
        const ddc = st.col - t.col; // direction toward start
        const ddr = st.row - t.row;
        // Normalise to ±1 steps, prefer the axis with larger movement
        const preferCol = Math.abs(ddc) >= Math.abs(ddr);
        // Build ordered list of retreat offsets (most natural direction first)
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
        // Fall back to cardinal directions if player didn't move
        retreatOffsets.push([0, 1], [0, -1], [1, 0], [-1, 0]);

        let pushed = false;
        for (const [dc, dr] of retreatOffsets) {
          if (dc === 0 && dr === 0) continue;
          const nc = clamp(t.col + dc, 0, 9);
          const nr = clamp(t.row + dr, 0, 6);
          const ak = `${nc},${nr}`;
          if (!occupied.has(ak)) {
            p.position = tileToPos(nc, nr);
            occupied.set(ak, p.id);
            pushed = true;
            break;
          }
        }
        if (!pushed) occupied.set(key, p.id); // No free tile found; stay put
      } else {
        occupied.set(key, p.id);
      }
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

  // CRITICAL: Patch the last frame so the next turn inherits post-separation positions.
  // Without this, finishSimulation() reads pre-separation positions from the last frame
  // and two players start the next turn on the same tile despite all separation work.
  if (frames.length > 0) {
    const lastF = frames[frames.length - 1];
    frames[frames.length - 1] = {
      ...lastF,
      players: lastF.players.map(fp => {
        const sp = simPlayers.find(p => p.id === fp.id);
        return sp ? { ...fp, position: { ...sp.position } } : fp;
      }),
    };
  }

  return { frames, events: allEvents };
}

// Push overlapping players apart at the pixel level every tick.
// Ball owner is never displaced; the other player takes the full push.
// For cross-team non-ball collisions a probabilistic contest determines who yields.
function separateOverlapping(players: SimPlayer[], ball: SimBall, rng: () => number): void {
  const minDist = PLAYER_RADIUS * 2.4;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= minDist) continue;
      const aOwns = a.id === ball.ownerId;
      const bOwns = b.id === ball.ownerId;
      const overlap = dist > 0.01 ? (minDist - dist) : minDist;
      const nx = dist > 0.01 ? dx / dist : 0;
      const ny = dist > 0.01 ? dy / dist : 1;
      if (aOwns) {
        // Ball carrier always pushes non-carrier aside
        b.position.x += nx * overlap;
        b.position.y += ny * overlap;
      } else if (bOwns) {
        a.position.x -= nx * overlap;
        a.position.y -= ny * overlap;
      } else if (a.teamId === b.teamId) {
        // Same team: share equally, no contest needed
        a.position.x -= nx * overlap * 0.5;
        a.position.y -= ny * overlap * 0.5;
        b.position.x += nx * overlap * 0.5;
        b.position.y += ny * overlap * 0.5;
      } else {
        // Cross-team physical contest — faster mover is "the pusher"
        const aSpeed = Math.sqrt(a.velocity.x ** 2 + a.velocity.y ** 2);
        const bSpeed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
        const isPusherA = aSpeed >= bSpeed;
        const pusher  = isPusherA ? a : b;
        const blocker = isPusherA ? b : a;
        // Attacker stat for the pusher (trying to force through), defense for blocker
        let pusherScore  = pusher.stats.attack  / 10 + rng() * 0.35;
        let blockerScore = blocker.stats.defense / 10 + rng() * 0.35;
        if (blocker.ability === "iron_tackle")  blockerScore += 0.25;
        if (blocker.ability === "powerhouse")   blockerScore += 0.15;
        if (pusher.ability  === "ghost_run")    pusherScore  += 0.2;
        if (pusher.ability  === "powerhouse")   pusherScore  += 0.15;
        if (pusherScore > blockerScore) {
          // Pusher wins: mostly pushes blocker aside, small self slowdown
          a.position.x -= nx * overlap * (isPusherA ? 0.2 : 0.8);
          a.position.y -= ny * overlap * (isPusherA ? 0.2 : 0.8);
          b.position.x += nx * overlap * (isPusherA ? 0.8 : 0.2);
          b.position.y += ny * overlap * (isPusherA ? 0.8 : 0.2);
        } else {
          // Blocker wins: pusher bounces back, blocker barely moves
          a.position.x -= nx * overlap * (isPusherA ? 0.8 : 0.2);
          a.position.y -= ny * overlap * (isPusherA ? 0.8 : 0.2);
          b.position.x += nx * overlap * (isPusherA ? 0.2 : 0.8);
          b.position.y += ny * overlap * (isPusherA ? 0.2 : 0.8);
        }
      }
    }
  }
}

function snapshotFrame(tick: number, players: SimPlayer[], ball: SimBall, events: GameEvent[]): FrameSnapshot {
  return {
    tick,
    players: players.map(p => ({
      id: p.id,
      teamId: p.teamId,
      position: { ...p.position },
      velocity: { ...p.velocity },
      state: p.state,
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      role: p.role,
      tileRange: speedToTiles(p.stats.speed),
    })),
    ball: {
      position: { ...ball.position },
      velocity: { ...ball.velocity },
      ownerId: ball.ownerId,
    },
    events: [...events],
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
  player.velocity = { x: (dx / dist) * pixelSpeed, y: (dy / dist) * pixelSpeed };
  return false;
}

function updatePlayerMovement(
  players: SimPlayer[],
  ball: SimBall,
  dt: number,
  events: GameEvent[],
  tick: number,
  passTracker: BallTracker,
  rng: () => number
): void {
  for (const player of players) {
    if (player.state === PlayerState.RECOVERING) {
      player.recoveryTimer -= dt;
      if (player.recoveryTimer <= 0) {
        player.state = PlayerState.IDLE;
        player.recoveryTimer = 0;
      }
      // Damp any leftover velocity
      player.velocity = vec2Scale(player.velocity, 0.7);
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      continue;
    }

    if (player.state === PlayerState.PASSING || player.state === PlayerState.SHOOTING) {
      player.stateTimer -= dt;
      if (player.stateTimer <= 0) {
        if (player.state === PlayerState.PASSING) {
          passTracker.type = "pass";
          passTracker.teamId = player.teamId;
          passTracker.playerId = player.id;
          passTracker.name = player.name;
          executePass(player, ball, rng);
          const passFollowUp = player.command?.followUp;
          if (passFollowUp) {
            player.command = passFollowUp;
            player.commandExecuted = false;
            // Brief recovery so the ball travels past interception radius before
            // the player is eligible to re-intercept it (would wipe their followUp)
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
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      continue;
    }

    if (player.state === PlayerState.CONTESTING) {
      player.stateTimer -= dt;
      if (player.stateTimer <= 0) {
        player.state = PlayerState.IDLE;
      }
      player.velocity = vec2Scale(player.velocity, 0.7);
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      continue;
    }

    const hasBall = ball.ownerId === player.id;
    const cmd = player.command;

    if (!cmd || player.commandExecuted) {
      // No command — stay still
      player.velocity = { x: 0, y: 0 };
      player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
      continue;
    }

    if (cmd.type === CommandType.PASS) {
      if (hasBall) {
        player.state = PlayerState.PASSING;
        player.stateTimer = PASS_WIND_UP;
        player.commandExecuted = true;
        player.velocity = { x: 0, y: 0 };
      } else {
        // Move toward ball to gain possession first
        const target = cmd.targetPosition ?? { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };
        const arrived = moveLinear(player, ball.position, dt);
        if (arrived) {
          // Near ball — now pass
          player.state = PlayerState.PASSING;
          player.stateTimer = PASS_WIND_UP;
          player.commandExecuted = true;
          if (cmd.targetPosition) {
            // Restore the target
            player.command = { ...cmd };
          }
        }
        void target;
        player.state = PlayerState.MOVING;
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
    } else if (cmd.type === CommandType.MOVE) {
      const target = cmd.targetPosition!;
      const arrived = moveLinear(player, target, dt);
      if (arrived) {
        if (cmd.followUp) {
          player.command = cmd.followUp;
          player.commandExecuted = false;
          player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
        } else {
          player.commandExecuted = true;
          player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
        }
      } else {
        player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.MOVING;
      }

      // Drag ball along when dribbling
      if (hasBall && player.state === PlayerState.DRIBBLING) {
        const offset = vec2Len(player.velocity) > 5
          ? vec2Scale(vec2Normalize(player.velocity), PLAYER_RADIUS + 4)
          : { x: 0, y: 0 };
        ball.position = vec2Add(player.position, offset);
        ball.velocity = { x: 0, y: 0 };
      }
    }
  }
}

// Pass accuracy: short passes always accurate; long passes need high passing stat
function computePassAccuracy(player: SimPlayer, distTiles: number): number {
  const base = 0.95; // Everyone is accurate at short range
  const passStat = player.stats.passing / 10;
  // Per-tile penalty decreases as passing stat increases
  const penaltyPerTile = (1.0 - passStat) * 0.09;
  const rawPenalty = Math.max(0, distTiles - 1) * penaltyPerTile;
  const penalty = player.ability === "bullet_pass" ? rawPenalty * 0.35 : rawPenalty;
  return Math.max(0.05, Math.min(1.0, base - penalty));
}

function executePass(player: SimPlayer, ball: SimBall, rng: () => number): void {
  const cmd = player.command;
  if (!cmd || cmd.type !== CommandType.PASS) return;
  const targetPos = cmd.targetPosition ?? { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };

  let passSpd = PASS_SPEED;
  if (player.ability === "bullet_pass") passSpd *= 1.5;

  const rawDir = vec2Normalize(vec2Sub(targetPos, ball.position));
  const distPx = vec2Dist(ball.position, targetPos);
  const distTiles = distPx / TILE_W;

  const accuracy = computePassAccuracy(player, distTiles);
  let dir = rawDir;

  if (rng() > accuracy) {
    // Inaccurate pass: deviate the direction by a random angle
    const maxDeviation = Math.PI * 0.35 * (1 - accuracy);
    const angle = (rng() * 2 - 1) * maxDeviation;
    const cos_a = Math.cos(angle);
    const sin_a = Math.sin(angle);
    dir = {
      x: dir.x * cos_a - dir.y * sin_a,
      y: dir.x * sin_a + dir.y * cos_a,
    };
  }

  ball.velocity = vec2Scale(dir, passSpd);
  ball.ownerId = null;
}

function executeShot(player: SimPlayer, ball: SimBall, rng: () => number): void {
  const goalX = player.teamId === "player" ? GOAL_RIGHT_X : GOAL_LEFT_X;

  // Aim at a random point within the goal opening so the GK can't simply
  // pre-park at the centre. 85% of half-width keeps shots inside the post.
  const goalMid = PITCH_HEIGHT / 2;
  const halfGoal = GOAL_WIDTH / 2;
  const targetY = goalMid + (rng() * 2 - 1) * halfGoal * 0.85;

  let shotSpd = SHOT_SPEED;
  if (player.ability === "eagle_eye") shotSpd *= 1.15;

  const dir = vec2Normalize(vec2Sub({ x: goalX, y: targetY }, ball.position));
  ball.velocity = vec2Scale(dir, shotSpd);
  ball.ownerId = null;
}

function updateBallPhysics(ball: SimBall, dt: number): void {
  if (ball.ownerId !== null) return;
  ball.velocity = vec2Scale(ball.velocity, BALL_FRICTION);
  ball.position = vec2Add(ball.position, vec2Scale(ball.velocity, dt));
  if (vec2Len(ball.velocity) < 2) ball.velocity = { x: 0, y: 0 };
}

function detectAndResolveEvents(
  players: SimPlayer[],
  ball: SimBall,
  tick: number,
  events: GameEvent[],
  rng: () => number,
  passTracker: BallTracker
): void {
  if (ball.ownerId === null) {
    const candidates: { player: SimPlayer; score: number }[] = [];
    for (const player of players) {
      const dist = vec2Dist(player.position, ball.position);
      if (dist < INTERCEPTION_RADIUS && player.state !== PlayerState.RECOVERING) {
        const velTowardBall = vec2Len(player.velocity) > 0
          ? vec2Dot(
            vec2Normalize(player.velocity),
            vec2Normalize(vec2Sub(ball.position, player.position))
          )
          : 0;
        let score = (INTERCEPTION_RADIUS - dist) / INTERCEPTION_RADIUS;
        score += Math.max(0, velTowardBall) * 0.3;
        score += (player.stats.defense / 10) * 0.2;
        score += rng() * (player.stats.luck / 10) * 0.2;
        if (player.ability === "iron_tackle") score += 0.15;
        if (player.ability === "goalkeeper") score += 0.35;
        candidates.push({ player, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const winner = candidates[0].player;
      const loser = candidates.length > 1 ? candidates[1].player : null;

      winner.command = null;
      winner.commandExecuted = false;

      if (loser && loser.teamId !== winner.teamId) {
        // Momentum bonus: running toward the ball helps claim it
        const winnerMomentum = Math.min(0.12, vec2Len(winner.velocity) / 350 * 0.12);
        const loserMomentum  = Math.min(0.12, vec2Len(loser.velocity)  / 350 * 0.12);
        const winnerScore = winner.stats.defense / 10 + rng() * 0.3 + winnerMomentum;
        const loserScore  = loser.stats.defense  / 10 + rng() * 0.3 + loserMomentum;

        if (loserScore > winnerScore) {
          loser.command = null;
          loser.commandExecuted = false;
          ball.ownerId = loser.id;
          ball.velocity = { x: 0, y: 0 };
          loser.state = PlayerState.DRIBBLING;
          winner.state = PlayerState.RECOVERING;
          winner.recoveryTimer = 1.0;
          retreatFrom(winner, loser);

          if (passTracker.teamId !== null && passTracker.teamId !== loser.teamId) {
            if (passTracker.type === "shot" && loser.ability === "goalkeeper") {
              events.push({ type: GameEventType.SAVE, tick, playerId: loser.id, targetId: passTracker.playerId ?? undefined, teamId: loser.teamId, message: `${loser.name} saves the shot!` });
            } else {
              events.push({ type: GameEventType.PASS_INTERCEPTED, tick, playerId: loser.id, targetId: passTracker.playerId ?? undefined, teamId: loser.teamId, message: `${loser.name} intercepts the pass!` });
            }
          } else {
            events.push({ type: GameEventType.TACKLE, tick, playerId: loser.id, targetId: winner.id, teamId: loser.teamId, message: `${loser.name} wins the ball!` });
          }
          passTracker.type = null; passTracker.teamId = null; passTracker.playerId = null; passTracker.name = null;
          return;
        }
      }

      ball.ownerId = winner.id;
      ball.velocity = { x: 0, y: 0 };
      winner.state = PlayerState.DRIBBLING;

      if (loser && loser.teamId !== winner.teamId) {
        loser.state = PlayerState.RECOVERING;
        loser.recoveryTimer = 1.0;
        retreatFrom(loser, winner);
      }

      if (passTracker.teamId !== null) {
        if (passTracker.teamId === winner.teamId) {
          events.push({ type: GameEventType.PASS_COMPLETE, tick, playerId: winner.id, targetId: passTracker.playerId ?? undefined, teamId: winner.teamId, message: `${passTracker.name} → ${winner.name}` });
        } else if (passTracker.type === "shot" && winner.ability === "goalkeeper") {
          events.push({ type: GameEventType.SAVE, tick, playerId: winner.id, targetId: passTracker.playerId ?? undefined, teamId: winner.teamId, message: `${winner.name} saves the shot!` });
        } else {
          events.push({ type: GameEventType.PASS_INTERCEPTED, tick, playerId: winner.id, targetId: passTracker.playerId ?? undefined, teamId: winner.teamId, message: `${winner.name} intercepts!` });
        }
        passTracker.type = null; passTracker.teamId = null; passTracker.playerId = null; passTracker.name = null;
      } else if (candidates.length > 1 && candidates[1].player.teamId !== winner.teamId) {
        events.push({ type: GameEventType.TACKLE, tick, playerId: winner.id, teamId: winner.teamId, message: `${winner.name} picks up the ball!` });
      }
      return;
    }
  }

  if (ball.ownerId !== null) {
    passTracker.type = null; passTracker.teamId = null; passTracker.playerId = null; passTracker.name = null;

    const owner = players.find(p => p.id === ball.ownerId)!;
    const ownerTileX = Math.floor(owner.position.x / TILE_W);
    const ownerTileY = Math.floor(owner.position.y / TILE_H);

    for (const other of players) {
      if (other.id === owner.id || other.teamId === owner.teamId) continue;
      if (other.state === PlayerState.RECOVERING || other.state === PlayerState.CONTESTING) continue;

      // Tackle only fires when the defender physically crosses through the carrier's tile
      const defTileX = Math.floor(other.position.x / TILE_W);
      const defTileY = Math.floor(other.position.y / TILE_H);
      if (defTileX !== ownerTileX || defTileY !== ownerTileY) continue;
      // Must be actively running through — not just standing in the same tile
      if (vec2Len(other.velocity) < 50) continue;

      // Retention chance: carrier's defense stat vs their own attack stat.
      // score <= 0 → defender takes ball automatically.
      // score > 0  → carrier keeps ball with (score × 20%) chance, capped at 100%.
      const score = owner.stats.defense - owner.stats.attack;
      const keepChance = score > 0 ? Math.min(1.0, score * 0.20) : 0;
      const carrierKeepsBall = rng() < keepChance;

      if (carrierKeepsBall) {
        other.state = PlayerState.CONTESTING;
        other.stateTimer = 0.3;
        events.push({ type: GameEventType.LOOSE_BALL, tick, playerId: owner.id, teamId: owner.teamId, message: `${owner.name} holds off ${other.name}` });
      } else {
        ball.ownerId = other.id;
        ball.velocity = { x: 0, y: 0 };
        other.state = PlayerState.DRIBBLING;
        other.command = null;
        other.commandExecuted = false;
        owner.state = PlayerState.RECOVERING;
        owner.recoveryTimer = 1.0;
        retreatFrom(owner, other);
        events.push({ type: GameEventType.TACKLE, tick, playerId: other.id, targetId: owner.id, teamId: other.teamId, message: `${other.name} tackles ${owner.name}!` });
      }
      break;
    }
  }
}

function constrainToField(players: SimPlayer[], ball: SimBall): void {
  for (const player of players) {
    player.position.x = clamp(player.position.x, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS);
    player.position.y = clamp(player.position.y, PLAYER_RADIUS, PITCH_HEIGHT - PLAYER_RADIUS);
  }

  if (ball.ownerId !== null) return;

  const inGoalYRange = ball.position.y >= GOAL_TOP_Y && ball.position.y <= GOAL_BOTTOM_Y;

  if (ball.position.y < 0) {
    ball.velocity.y = Math.abs(ball.velocity.y) * 0.4;
    ball.position.y = 1;
  } else if (ball.position.y > PITCH_HEIGHT) {
    ball.velocity.y = -Math.abs(ball.velocity.y) * 0.4;
    ball.position.y = PITCH_HEIGHT - 1;
  }

  if (!inGoalYRange) {
    if (ball.position.x < GOAL_LEFT_X) {
      ball.position.x = GOAL_LEFT_X + GOAL_DEPTH + 5;
      ball.velocity.x = Math.abs(ball.velocity.x) * 0.3;
      ball.velocity.y *= 0.3;
    } else if (ball.position.x > GOAL_RIGHT_X) {
      ball.position.x = GOAL_RIGHT_X - GOAL_DEPTH - 5;
      ball.velocity.x = -Math.abs(ball.velocity.x) * 0.3;
      ball.velocity.y *= 0.3;
    }
  }
}

function checkGoal(ball: SimBall): "player" | "ai" | null {
  if (ball.ownerId !== null) return null;

  if (
    ball.position.x >= GOAL_RIGHT_X - GOAL_DEPTH &&
    ball.position.y >= GOAL_TOP_Y &&
    ball.position.y <= GOAL_BOTTOM_Y
  ) {
    return "player";
  }

  if (
    ball.position.x <= GOAL_LEFT_X + GOAL_DEPTH &&
    ball.position.y >= GOAL_TOP_Y &&
    ball.position.y <= GOAL_BOTTOM_Y
  ) {
    return "ai";
  }

  return null;
}
