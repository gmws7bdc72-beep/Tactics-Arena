import type { SimPlayer, SimBall, Command, FrameSnapshot, GameEvent, Vec2 } from "./types";
import { PlayerState, CommandType, GameEventType } from "./types";
import {
  PITCH_WIDTH, PITCH_HEIGHT, DELTA, TICKS_PER_TURN,
  BALL_FRICTION, PASS_SPEED, SHOT_SPEED,
  PASS_WIND_UP, PASS_RECOVERY, SHOT_WIND_UP, SHOT_RECOVERY,
  BASE_PLAYER_SPEED, SPEED_STAT_MULTIPLIER, ACCELERATION, TURNING_COST,
  PLAYER_CONTROL_RADIUS, INTERCEPTION_RADIUS, CONTEST_RADIUS,
  GOAL_TOP_Y, GOAL_BOTTOM_Y, GOAL_LEFT_X, GOAL_RIGHT_X, GOAL_DEPTH,
  PLAYER_RADIUS
} from "./constants";

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

function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function runSimulation(
  players: SimPlayer[],
  ball: SimBall,
  seedValue: number
): { frames: FrameSnapshot[]; events: GameEvent[] } {
  const rng = seededRandom(seedValue);
  const frames: FrameSnapshot[] = [];
  const allEvents: GameEvent[] = [];

  const simPlayers: SimPlayer[] = players.map(p => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
    command: p.command ? { ...p.command, targetPosition: p.command.targetPosition ? { ...p.command.targetPosition } : undefined } : null,
  }));

  const simBall: SimBall = {
    position: { ...ball.position },
    velocity: { ...ball.velocity },
    ownerId: ball.ownerId,
  };

  for (let tick = 0; tick < TICKS_PER_TURN; tick++) {
    const tickEvents: GameEvent[] = [];
    const time = tick * DELTA;

    updatePlayerMovement(simPlayers, simBall, DELTA);
    updateBallPhysics(simBall, DELTA);
    detectAndResolveEvents(simPlayers, simBall, tick, time, tickEvents, rng);
    constrainToField(simPlayers, simBall);

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

  return { frames, events: allEvents };
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
    })),
    ball: {
      position: { ...ball.position },
      velocity: { ...ball.velocity },
      ownerId: ball.ownerId,
    },
    events: [...events],
  };
}

function getPlayerSpeed(player: SimPlayer): number {
  let speed = BASE_PLAYER_SPEED + player.stats.speed * SPEED_STAT_MULTIPLIER;
  if (player.ability === "ghost_run") speed *= 1.3;
  if (player.ability === "powerhouse") speed *= 1.2;
  return speed;
}

function updatePlayerMovement(players: SimPlayer[], ball: SimBall, dt: number): void {
  for (const player of players) {
    if (player.state === PlayerState.RECOVERING) {
      player.recoveryTimer -= dt;
      if (player.recoveryTimer <= 0) {
        player.state = PlayerState.IDLE;
        player.recoveryTimer = 0;
      }
      player.velocity = vec2Scale(player.velocity, 0.85);
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      continue;
    }

    if (player.state === PlayerState.PASSING || player.state === PlayerState.SHOOTING) {
      player.stateTimer -= dt;
      if (player.stateTimer <= 0) {
        if (player.state === PlayerState.PASSING) {
          executePas(player, ball);
          player.state = PlayerState.RECOVERING;
          player.recoveryTimer = PASS_RECOVERY;
        } else if (player.state === PlayerState.SHOOTING) {
          executeShot(player, ball);
          player.state = PlayerState.RECOVERING;
          player.recoveryTimer = SHOT_RECOVERY;
        }
      }
      player.velocity = vec2Scale(player.velocity, 0.9);
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      continue;
    }

    if (player.state === PlayerState.CONTESTING) {
      player.stateTimer -= dt;
      if (player.stateTimer <= 0) {
        player.state = PlayerState.IDLE;
      }
      player.velocity = vec2Scale(player.velocity, 0.8);
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      continue;
    }

    const hasBall = ball.ownerId === player.id;
    const cmd = player.command;

    if (!cmd || player.commandExecuted) {
      player.velocity = vec2Scale(player.velocity, 0.85);
      player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));
      if (vec2Len(player.velocity) < 1) {
        player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
      }
      continue;
    }

    if (cmd.type === CommandType.PASS) {
      if (hasBall) {
        player.state = PlayerState.PASSING;
        player.stateTimer = PASS_WIND_UP;
        player.commandExecuted = true;
      } else {
        const target = cmd.targetPosition ?? { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };
        moveToward(player, target, dt);
      }
    } else if (cmd.type === CommandType.SHOOT) {
      if (hasBall) {
        player.state = PlayerState.SHOOTING;
        player.stateTimer = SHOT_WIND_UP;
        player.commandExecuted = true;
      } else {
        moveToward(player, cmd.targetPosition ?? ball.position, dt);
      }
    } else if (cmd.type === CommandType.MOVE) {
      const target = cmd.targetPosition!;
      const dist = vec2Dist(player.position, target);
      if (dist < 5) {
        player.velocity = vec2Scale(player.velocity, 0.7);
        player.commandExecuted = true;
        player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.IDLE;
      } else {
        moveToward(player, target, dt);
        player.state = hasBall ? PlayerState.DRIBBLING : PlayerState.MOVING;
      }
    }

    player.position = vec2Add(player.position, vec2Scale(player.velocity, dt));

    if (hasBall && (player.state === PlayerState.MOVING || player.state === PlayerState.DRIBBLING)) {
      const offset = vec2Scale(vec2Normalize(player.velocity), PLAYER_RADIUS + 4);
      if (vec2Len(player.velocity) > 10) {
        ball.position = vec2Add(player.position, offset);
      } else {
        ball.position = { ...player.position };
      }
      ball.velocity = { x: 0, y: 0 };
    }
  }
}

function moveToward(player: SimPlayer, target: Vec2, dt: number): void {
  const desired = vec2Normalize(vec2Sub(target, player.position));
  const speed = getPlayerSpeed(player);

  const currentDir = vec2Normalize(player.velocity);
  const turnFactor = player.ability === "ghost_run" ? TURNING_COST * 0.5 : TURNING_COST;
  const blended = vec2Normalize({
    x: currentDir.x + desired.x * (1 + turnFactor) * dt * 10,
    y: currentDir.y + desired.y * (1 + turnFactor) * dt * 10,
  });

  const accel = vec2Scale(blended, ACCELERATION * dt);
  player.velocity = vec2Add(player.velocity, accel);
  const maxSpeed = speed;
  const currentSpeed = vec2Len(player.velocity);
  if (currentSpeed > maxSpeed) {
    player.velocity = vec2Scale(vec2Normalize(player.velocity), maxSpeed);
  }
}

function executePas(player: SimPlayer, ball: SimBall): void {
  const cmd = player.command;
  if (!cmd || cmd.type !== CommandType.PASS) return;
  let targetPos = cmd.targetPosition ?? { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };

  let passSpd = PASS_SPEED;
  if (player.ability === "bullet_pass") passSpd *= 1.5;

  const dir = vec2Normalize(vec2Sub(targetPos, ball.position));
  ball.velocity = vec2Scale(dir, passSpd);
  ball.ownerId = null;
}

function executeShot(player: SimPlayer, ball: SimBall): void {
  const goalCenter: Vec2 = player.teamId === "player"
    ? { x: GOAL_RIGHT_X, y: PITCH_HEIGHT / 2 }
    : { x: GOAL_LEFT_X, y: PITCH_HEIGHT / 2 };

  let shotSpd = SHOT_SPEED;
  if (player.ability === "eagle_eye") shotSpd *= 1.15;

  const dir = vec2Normalize(vec2Sub(goalCenter, ball.position));
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
  _time: number,
  events: GameEvent[],
  rng: () => number
): void {
  if (ball.ownerId === null) {
    const candidates: { player: SimPlayer; score: number }[] = [];
    for (const player of players) {
      const dist = vec2Dist(player.position, ball.position);
      if (dist < INTERCEPTION_RADIUS && player.state !== PlayerState.RECOVERING) {
        const velTowardBall = vec2Dot(
          vec2Normalize(player.velocity),
          vec2Normalize(vec2Sub(ball.position, player.position))
        );
        let score = (INTERCEPTION_RADIUS - dist) / INTERCEPTION_RADIUS;
        score += Math.max(0, velTowardBall) * 0.3;
        score += (player.stats.defense / 10) * 0.2;
        score += rng() * (player.stats.luck / 10) * 0.2;
        if (player.ability === "iron_tackle") score += 0.15;
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
        const winnerScore = winner.stats.defense / 10 + rng() * 0.3;
        const loserScore = loser.stats.defense / 10 + rng() * 0.3;

        if (loserScore > winnerScore + 0.1) {
          loser.command = null;
          loser.commandExecuted = false;
          ball.ownerId = loser.id;
          ball.velocity = { x: 0, y: 0 };
          loser.state = PlayerState.DRIBBLING;
          events.push({ type: GameEventType.TACKLE, tick, playerId: loser.id, targetId: winner.id, teamId: loser.teamId, message: `${loser.name} wins the ball!` });
          return;
        }
      }

      ball.ownerId = winner.id;
      ball.velocity = { x: 0, y: 0 };
      winner.state = PlayerState.DRIBBLING;

      if (candidates.length > 1 && candidates[1].player.teamId !== winner.teamId) {
        events.push({ type: GameEventType.TACKLE, tick, playerId: winner.id, teamId: winner.teamId, message: `${winner.name} picks up the ball!` });
      }
      return;
    }
  }

  if (ball.ownerId !== null) {
    const owner = players.find(p => p.id === ball.ownerId)!;
    for (const other of players) {
      if (other.id === owner.id || other.teamId === owner.teamId) continue;
      const dist = vec2Dist(other.position, ball.position);
      if (dist < CONTEST_RADIUS && other.state !== PlayerState.RECOVERING && other.state !== PlayerState.CONTESTING) {
        const attackerScore = owner.stats.attack / 10 + rng() * 0.25;
        let defenderScore = other.stats.defense / 10 + rng() * 0.25;
        if (other.ability === "iron_tackle") defenderScore += 0.2;
        if (other.ability === "shadow_mark") {
          defenderScore += 0.1;
          owner.velocity = vec2Scale(owner.velocity, 0.8);
        }

        if (defenderScore > attackerScore) {
          ball.ownerId = other.id;
          ball.velocity = { x: 0, y: 0 };
          other.state = PlayerState.DRIBBLING;
          other.command = null;
          other.commandExecuted = false;
          owner.state = PlayerState.RECOVERING;
          owner.recoveryTimer = 0.4;
          events.push({ type: GameEventType.TACKLE, tick, playerId: other.id, targetId: owner.id, teamId: other.teamId, message: `${other.name} tackles ${owner.name}!` });
        } else {
          other.state = PlayerState.CONTESTING;
          other.stateTimer = 0.3;
          events.push({ type: GameEventType.LOOSE_BALL, tick, playerId: owner.id, teamId: owner.teamId, message: `${owner.name} holds off ${other.name}` });
        }
        break;
      }
    }
  }
}

function constrainToField(players: SimPlayer[], ball: SimBall): void {
  for (const player of players) {
    player.position.x = clamp(player.position.x, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS);
    player.position.y = clamp(player.position.y, PLAYER_RADIUS, PITCH_HEIGHT - PLAYER_RADIUS);
  }

  if (ball.ownerId === null) {
    if (ball.position.y < 0 || ball.position.y > PITCH_HEIGHT) {
      ball.velocity.y *= -0.5;
      ball.position.y = clamp(ball.position.y, 0, PITCH_HEIGHT);
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
