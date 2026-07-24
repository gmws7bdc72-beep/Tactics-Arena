import type {
  SimPlayer,
  SimBall,
  Command,
  FrameSnapshot,
  GameEvent,
  Vec2,
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
} from "./constants";
import { posToTile, tileToPos } from "./grid";

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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getOffsidePlayers(players: SimPlayer[]): Set<string> {
  const playerTeam = players.filter((p) => p.teamId === "player");
  const aiTeam = players.filter((p) => p.teamId === "ai");
  const offside = new Set<string>();

  // Offside only applies inside the attacking third (Baller League rules):
  //   player team attacks rightward → offside zone: x > 2/3 of pitch
  //   AI team attacks leftward      → offside zone: x < 1/3 of pitch
  // The middle third is a free zone — no offside there.
  const ATTACK_LINE = (PITCH_WIDTH * 2) / 3;
  const DEFEND_LINE = PITCH_WIDTH / 3;

  // Player team: offside only when past the 2/3 line AND ahead of 2nd-to-last AI defender.
  if (aiTeam.length > 0) {
    const sortedAI = [...aiTeam].sort((a, b) => b.position.x - a.position.x);
    const lineX =
      sortedAI.length >= 2 ? sortedAI[1].position.x : sortedAI[0].position.x;
    for (const p of playerTeam) {
      if (
        p.role !== "goalkeeper" &&
        p.position.x > ATTACK_LINE &&
        p.position.x > lineX
      ) {
        offside.add(p.id);
      }
    }
  }

  // AI team: offside only when past the 1/3 line AND ahead of 2nd-to-last player defender.
  if (playerTeam.length > 0) {
    const sortedPlayer = [...playerTeam].sort(
      (a, b) => a.position.x - b.position.x,
    );
    const lineX =
      sortedPlayer.length >= 2
        ? sortedPlayer[1].position.x
        : sortedPlayer[0].position.x;
    for (const p of aiTeam) {
      if (
        p.role !== "goalkeeper" &&
        p.position.x < DEFEND_LINE &&
        p.position.x < lineX
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
  type: "pass" | "long_pass" | "shot" | null;
  teamId: "player" | "ai" | null;
  playerId: string | null;
  name: string | null;
  /** Player IDs that were in an offside position at the moment the pass was kicked. */
  offsideIds: Set<string>;
}

export function speedToTiles(speed: number): number {
  return Math.ceil(Math.max(1, Math.min(10, speed)) / 2);
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

  const simPlayers: SimPlayer[] = players.map((p) => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
    command: p.command
      ? {
          ...p.command,
          targetPosition: p.command.targetPosition
            ? { ...p.command.targetPosition }
            : undefined,
          followUp: p.command.followUp
            ? {
                ...p.command.followUp,
                targetPosition: p.command.followUp.targetPosition
                  ? { ...p.command.followUp.targetPosition }
                  : undefined,
              }
            : undefined,
        }
      : null,
  }));

  const simBall: SimBall = {
    position: { ...ball.position },
    velocity: { ...ball.velocity },
    ownerId: ball.ownerId,
    // Carry forward any mid-flight pass from the previous turn so it completes.
    passTarget: ball.passTarget ? { ...ball.passTarget } : undefined,
    height: ball.height ?? 0,
    passStyle: ball.passStyle,
    passStart: ball.passStart ? { ...ball.passStart } : undefined,
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
  const ABSOLUTE_MAX_TICKS = TICKS_PER_TURN * 5;
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
    separateOverlapping(simPlayers, simBall, rng);

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
      frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents));
      break;
    }

    allEvents.push(...tickEvents);
    frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents));

    // End the turn once the normal budget is spent AND no pass is in flight.
    // If a pass is still travelling, keep ticking until it resolves.
    if (tick >= TICKS_PER_TURN - 1 && !simBall.passTarget) {
      break;
    }
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
          const nc = clamp(t.col + dc, 0, GRID_COLS - 1);
          const nr = clamp(t.row + dr, 0, GRID_ROWS - 1);
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
): void {
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
      const overlap = dist > 0.01 ? minDist - dist : minDist;
      const nx = dist > 0.01 ? dx / dist : 0;
      const ny = dist > 0.01 ? dy / dist : 1;

      // Cross-team collisions involving the carrier are handled entirely by the
      // tackle system — skip separation physics so opponents can actually enter
      // the carrier's tile and trigger the tackle check.
      if (
        (aOwns && b.teamId !== a.teamId) ||
        (bOwns && a.teamId !== b.teamId)
      ) {
        continue;
      }

      if (aOwns) {
        // Same-team: carrier pushes friendly out of the way
        b.position.x += nx * overlap;
        b.position.y += ny * overlap;
      } else if (bOwns) {
        a.position.x -= nx * overlap;
        a.position.y -= ny * overlap;
      } else if (a.teamId === b.teamId) {
        // Same team, no ball: share equally
        a.position.x -= nx * overlap * 0.5;
        a.position.y -= ny * overlap * 0.5;
        b.position.x += nx * overlap * 0.5;
        b.position.y += ny * overlap * 0.5;
      } else {
        // Cross-team physical contest — faster mover is "the pusher"
        const aSpeed = Math.sqrt(a.velocity.x ** 2 + a.velocity.y ** 2);
        const bSpeed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
        const isPusherA = aSpeed >= bSpeed;
        const pusher = isPusherA ? a : b;
        const blocker = isPusherA ? b : a;
        // Attacker stat for the pusher (trying to force through), defense for blocker
        let pusherScore = pusher.stats.attack / 10 + rng() * 0.35;
        let blockerScore = blocker.stats.defense / 10 + rng() * 0.35;
        if (blocker.ability === "iron_tackle") blockerScore += 0.25;
        if (blocker.ability === "powerhouse") blockerScore += 0.15;
        if (pusher.ability === "ghost_run") pusherScore += 0.2;
        if (pusher.ability === "powerhouse") pusherScore += 0.15;
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

function snapshotFrame(
  tick: number,
  players: SimPlayer[],
  ball: SimBall,
  events: GameEvent[],
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
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      role: p.role,
      tileRange: speedToTiles(p.stats.speed),
      offside: offsidePlayers.has(p.id),
    })),
    ball: {
      position: { ...ball.position },
      velocity: { ...ball.velocity },
      ownerId: ball.ownerId,
      passTarget: ball.passTarget ? { ...ball.passTarget } : undefined,
      height: ball.height ?? 0,
      passStyle: ball.passStyle,
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
  player.velocity = {
    x: (dx / dist) * pixelSpeed,
    y: (dy / dist) * pixelSpeed,
  };
  return false;
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
        player.stateTimer = PASS_WIND_UP;
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
} else if (cmd.type === CommandType.MOVE) {
  const target = cmd.targetPosition!;
  const arrived = moveLinear(player, target, dt);

  if (arrived) {
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
    const longPassing = typeof player.stats.longPassing === "number" ? player.stats.longPassing : player.stats.passing;
    const vision = typeof player.stats.vision === "number" ? player.stats.vision : player.stats.passing;
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

  let passSpd = PASS_SPEED;
  if (player.ability === "bullet_pass") passSpd *= 1.5;
  if (isLongBall) passSpd *= 1.12;

  const dir = vec2Normalize(vec2Sub(targetPos, ball.position));
  ball.velocity = vec2Scale(dir, passSpd);
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
  const goalX = player.teamId === "player" ? GOAL_RIGHT_X : GOAL_LEFT_X;

  const goalMid = PITCH_HEIGHT / 2;
  const halfGoal = GOAL_WIDTH / 2;
  const targetY = goalMid + (rng() * 2 - 1) * halfGoal * 0.85;

  let shotSpd = SHOT_SPEED;
  if (player.ability === "eagle_eye") shotSpd *= 1.15;

  const dir = vec2Normalize(vec2Sub({ x: goalX, y: targetY }, ball.position));
  ball.velocity = vec2Scale(dir, shotSpd);
  ball.ownerId = null;
  ball.height = 0;
  ball.passStyle = undefined;
  ball.passStart = undefined;
}

function updateBallPhysics(ball: SimBall, dt: number): void {
  if (ball.ownerId !== null) {
    ball.height = 0;
    ball.passStyle = undefined;
    ball.passStart = undefined;
    return;
  }

  if (ball.passTarget) {
    const distBefore = vec2Dist(ball.position, ball.passTarget);

    ball.velocity = vec2Scale(ball.velocity, BALL_FRICTION);
    ball.position = vec2Add(ball.position, vec2Scale(ball.velocity, dt));

    if (ball.passStyle === "long" && ball.passStart) {
      const totalDist = Math.max(1, vec2Dist(ball.passStart, ball.passTarget));
      const travelled = vec2Dist(ball.passStart, ball.position);
      const progress = clamp(travelled / totalDist, 0, 1);
      ball.height = Math.sin(progress * Math.PI) * 34;
    } else {
      ball.height = 0;
    }

    const distAfter = vec2Dist(ball.position, ball.passTarget);

    if (
      distAfter >= distBefore ||
      distAfter < 4 ||
      vec2Len(ball.velocity) < 2
    ) {
      ball.position = { ...ball.passTarget };
      ball.velocity = { x: 0, y: 0 };
      ball.passTarget = undefined;
      ball.height = 0;
      ball.passStyle = undefined;
      ball.passStart = undefined;
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

  const startTile = posToTile(ball.passStart);
  const targetTile = posToTile(ball.passTarget);
  const dc = signTileDelta(targetTile.col - startTile.col);
  const dr = signTileDelta(targetTile.row - startTile.row);

  if (dc === 0 && dr === 0) return true;

  const playerTile = posToTile(player.position);
  const launchBlockTile = {
    col: clamp(startTile.col + dc, 0, GRID_COLS - 1),
    row: clamp(startTile.row + dr, 0, GRID_ROWS - 1),
  };
  const receiverBlockTile = {
    col: clamp(targetTile.col - dc, 0, GRID_COLS - 1),
    row: clamp(targetTile.row - dr, 0, GRID_ROWS - 1),
  };

  const totalDist = Math.max(1, vec2Dist(ball.passStart, ball.passTarget));
  const travelled = vec2Dist(ball.passStart, ball.position);
  const progress = clamp(travelled / totalDist, 0, 1);

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
      if (defSpeed < 15) continue; // must be actively moving

      // The tackler must be moving TOWARD the carrier (not already past them).
      const toOwner = vec2Normalize(vec2Sub(owner.position, other.position));
      if (vec2Dot(vec2Normalize(other.velocity), toOwner) < 0.25) continue;

      // CHECK 1 passed — tackler entered the carrier's tile.
      // They must retreat regardless of what happens next.

      // CHECK 2 — is the planned target BEYOND the carrier's tile?
      // Simple tile-based test: if the tackler's command destination is a
      // DIFFERENT tile than the carrier's current tile, the carrier's tile is
      // just a waypoint and the tackler was passing through.
      // If the destination IS the carrier's tile they were merely stepping in —
      // no contest.  We skip the commandExecuted guard so a player that just
      // arrived at their target this same tick can still be caught.
      const target = other.command?.targetPosition;
      let passingThrough = false;
      if (target) {
        const targetTile = posToTile(target);
        const ownerTile = posToTile(owner.position);
        passingThrough =
          targetTile.col !== ownerTile.col || targetTile.row !== ownerTile.row;
      }

      if (!passingThrough) {
        // Tackler only entered the tile — bounce them back, no contest.
        retreatFrom(other, owner);
        other.command = null;
        other.commandExecuted = false;
        break;
      }

      // CHECK 2 passed — full tackle contest.
      let keepScore = owner.stats.attack / 10 - other.stats.defense / 10; // -1 … +1
      if (owner.ability === "ghost_run" || owner.ability === "powerhouse")
        keepScore += 0.2;
      if (other.ability === "iron_tackle" || other.ability === "powerhouse")
        keepScore -= 0.2;
      // Carrier bonus: dribbling actively through gives slight edge
      const carrierSpeed = vec2Len(owner.velocity);
      if (carrierSpeed > defSpeed) keepScore += 0.1;

      const keepChance = Math.max(0.05, Math.min(0.9, 0.3 + keepScore * 0.4));
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
          teamId: owner.teamId,
          message: `${owner.name} holds off ${other.name}`,
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
