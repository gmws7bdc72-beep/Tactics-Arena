import fs from "node:fs";
import path from "node:path";

const game = path.resolve("artifacts/fta-game");
const simulationFile = path.join(game, "src/engine/simulation.ts");
const constantsFile = path.join(game, "src/engine/constants.ts");

function fail(message) {
  throw new Error(message);
}

for (const file of [simulationFile, constantsFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`);
}

function replaceFunction(source, name, next, followingName) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) fail(`Could not find ${name}`);
  const plainEnd = source.indexOf(`\nfunction ${followingName}(`, start);
  const exportEnd = source.indexOf(`\nexport function ${followingName}(`, start);
  const candidates = [plainEnd, exportEnd].filter((value) => value >= 0);
  const end = candidates.length ? Math.min(...candidates) : -1;
  if (end < 0) fail(`Could not find end of ${name}`);
  return source.slice(0, start) + next.trimEnd() + "\n" + source.slice(end + 1);
}

function replaceCurveImport(source) {
  const pattern = /import\s*\{[^}]*\}\s*from\s*["']\.\/curve["'];/m;
  if (!pattern.test(source)) fail("Could not find curve import");
  return source.replace(
    pattern,
    `import {
  advanceCurveMotion,
  createCurveMotion,
  curveMotionProgress,
  curvePointLimitForCommand,
  sanitizeCurvePoints,
} from "./curve";`,
  );
}

function ensureConstantImport(source, name) {
  const pattern = /import\s*\{([^}]*)\}\s*from\s*["']\.\/constants["'];/m;
  const match = source.match(pattern);
  if (!match) fail("Could not find constants import");
  const names = match[1].split(",").map((value) => value.trim()).filter(Boolean);
  if (!names.includes(name)) names.push(name);
  return source.replace(
    pattern,
    `import {\n  ${names.join(",\n  ")},\n} from "./constants";`,
  );
}

let constants = fs.readFileSync(constantsFile, "utf8");
if (!/export const GOAL_DEPTH\s*=/.test(constants)) fail("Could not find GOAL_DEPTH");
constants = constants.replace(
  /export const GOAL_DEPTH\s*=\s*[^;]+;/,
  "export const GOAL_DEPTH = TILE_W; // exactly one full grid square",
);
fs.writeFileSync(constantsFile, constants);

let source = fs.readFileSync(simulationFile, "utf8");
source = replaceCurveImport(source);
source = ensureConstantImport(source, "BALL_RADIUS");
source = source.replace(/type BallCurveKind = "ground" \| "long" \| "shot";\n\n(?=function sanitizeBallCurve)/g, "");

source = replaceFunction(
  source,
  "sanitizeBallCurve",
  `type BallCurveKind = "ground" | "long" | "shot";

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
}`,
  "clamp",
);

source = replaceFunction(
  source,
  "normalizeSimulationCommand",
  `function normalizeSimulationCommand(
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
}`,
  "runSimulation",
);

source = replaceFunction(
  source,
  "noBallTileWinChance",
  `function noBallTileWinChance(a: SimPlayer, b: SimPlayer): number {
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
`,
  "clampGKTarget",
);

// Replace phase-loop setup, whether the previous project has the old five-turn
// ceiling or the later wait-for-every-command version.
{
  const constIndex = source.indexOf("  const ABSOLUTE_MAX_TICKS =", source.indexOf("export function runSimulation"));
  if (constIndex < 0) fail("Could not find phase tick ceiling");
  const markerIndex = source.lastIndexOf("  // FTA_PHASE_RESOLUTION_V3", constIndex);
  const setupStart = markerIndex >= 0 ? markerIndex : constIndex;
  const forIndex = source.indexOf("  for (let tick = 0; tick < ABSOLUTE_MAX_TICKS; tick++) {", constIndex);
  if (forIndex < 0) fail("Could not find phase loop");
  const setupEnd = forIndex + "  for (let tick = 0; tick < ABSOLUTE_MAX_TICKS; tick++) {".length;
  const setup = `  // FTA_PHASE_RESOLUTION_V3
  const ABSOLUTE_MAX_TICKS = TICKS_PER_TURN * 12;
  let stalledTicks = 0;
  let previousPositions = new Map(
    simPlayers.map((player) => [player.id, { ...player.position }]),
  );
  for (let tick = 0; tick < ABSOLUTE_MAX_TICKS; tick++) {`;
  source = source.slice(0, setupStart) + setup + source.slice(setupEnd);
}

// Insert or replace stalled-action resolution immediately after collision work.
{
  const collisionAnchor = "    separateOverlapping(simPlayers, simBall, rng);";
  const collisionIndex = source.indexOf(collisionAnchor, source.indexOf("export function runSimulation"));
  if (collisionIndex < 0) fail("Could not find collision update in phase loop");
  const afterCollision = collisionIndex + collisionAnchor.length;
  const goalIndex = source.indexOf("\n\n    const goalResult = checkGoal(simBall);", afterCollision);
  if (goalIndex < 0) fail("Could not find goal check after collisions");
  const existingMarker = source.indexOf("\n\n    // FTA_STALL_RESOLUTION_V3", afterCollision);
  const replaceStart = existingMarker >= 0 && existingMarker < goalIndex ? existingMarker : afterCollision;
  const stallBlock = `

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
        simBall.position = { ...simBall.passTarget };
        simBall.velocity = { x: 0, y: 0 };
        simBall.passTarget = undefined;
        simBall.passStart = undefined;
        simBall.passStyle = undefined;
        simBall.height = 0;
        simBall.curveMotion = undefined;
      }
    }

    previousPositions = new Map(
      simPlayers.map((player) => [player.id, { ...player.position }]),
    );`;
  source = source.slice(0, replaceStart) + stallBlock + source.slice(goalIndex);
}

// Replace the loop tail with one authoritative completion test.
{
  const runStart = source.indexOf("export function runSimulation");
  const normalFrameAnchor = `    allEvents.push(...tickEvents);\n    frames.push(snapshotFrame(tick, simPlayers, simBall, tickEvents));`;
  const frameIndex = source.indexOf(normalFrameAnchor, runStart);
  if (frameIndex < 0) fail("Could not find normal frame write");
  const tailStart = frameIndex + normalFrameAnchor.length;
  const loopEnd = source.indexOf("\n  }\n\n  // Snap all players", tailStart);
  if (loopEnd < 0) fail("Could not find end of phase loop");
  const completion = `

    const actionsResolved = simPlayers.every((player) => {
      const activeAction =
        player.state === PlayerState.PASSING ||
        player.state === PlayerState.SHOOTING ||
        player.state === PlayerState.DIVING;
      return !activeAction && (!player.command || player.commandExecuted);
    });
    const ballResolved =
      simBall.passTarget === undefined && vec2Len(simBall.velocity) < 2;
    if (tick >= TICKS_PER_TURN - 1 && actionsResolved && ballResolved) break;`;
  source = source.slice(0, tailStart) + completion + source.slice(loopEnd);
}

// Scale final tile ownership by the actual strength gap, then end the loser's turn.
source = source.replace(/\n\s*if \(loser\.teamId !== winner\.teamId\) endPlannedContribution\(loser\);/g, "");
source = source.replace(
  /\n\s*pushToFreeTile\(loser, winner\);\n/g,
  `\n      pushToFreeTile(loser, winner);\n      if (loser.teamId !== winner.teamId) endPlannedContribution(loser);\n`,
);

source = replaceFunction(
  source,
  "separateOverlapping",
  `function separateOverlapping(
  players: SimPlayer[],
  ball: SimBall,
  rng: () => number,
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

      // Opposing paths are decided primarily by Strength/physicality. Every
      // point of difference changes the odds, while equal players are 50/50.
      const aWins = rng() < noBallTileWinChance(a, b);
      const winner = aWins ? a : b;
      const loser = aWins ? b : a;
      const awayX = aWins ? nx : -nx;
      const awayY = aWins ? ny : -ny;

      winner.position.x -= awayX * overlap * 0.08;
      winner.position.y -= awayY * overlap * 0.08;
      loser.position.x += awayX * (overlap * 0.92 + 3);
      loser.position.y += awayY * (overlap * 0.92 + 3);
      endPlannedContribution(loser);
    }
  }
}`,
  "snapshotFrame",
);

source = replaceFunction(
  source,
  "executePass",
  `function executePass(
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
  const passSpeed = PASS_SPEED * abilityMultiplier * (isLongBall ? 0.58 : 1);
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
  const firstTarget = ball.curveMotion?.points[0] ?? targetPos;
  const direction = vec2Normalize(vec2Sub(firstTarget, ball.position));
  ball.velocity = vec2Scale(direction, passSpeed);
  ball.passTarget = { ...targetPos };
  ball.passStart = { ...ball.position };
  ball.passStyle = isLongBall ? "long" : "ground";
  ball.height = isLongBall ? 1 : 0;
  ball.ownerId = null;
}`,
  "executeShot",
);

source = replaceFunction(
  source,
  "executeShot",
  `function executeShot(
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
  ball.passTarget = target;
  ball.passStart = { ...ball.position };
  ball.ownerId = null;
  ball.height = 0;
  ball.passStyle = undefined;
}`,
  "updateBallPhysics",
);

fs.writeFileSync(simulationFile, source);
console.log("SUCCESS: realistic ball curves, strength pushing, soft-lock protection, and one-tile goal depth applied.");
