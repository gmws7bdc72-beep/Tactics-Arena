import assert from "node:assert/strict";
import {
  curvePointLimit,
  curvePointLimitForMechanic,
  planTacticalCurve,
  sampleChainedCurve,
  sanitizeCurvePoints,
} from "./artifacts/fta-game/src/engine/curve";
import { generateAICommands } from "./artifacts/fta-game/src/engine/ai";
import { runSimulation } from "./artifacts/fta-game/src/engine/simulation";
import {
  CommandType,
  GameEventType,
  PlayerState,
  type Command,
  type PlayerStats,
  type SimBall,
  type SimPlayer,
  type Vec2,
} from "./artifacts/fta-game/src/engine/types";
import { PITCH_HEIGHT, PITCH_WIDTH } from "./artifacts/fta-game/src/engine/constants";

const stats: PlayerStats = {
  attack: 8,
  defense: 7,
  passing: 9,
  speed: 10,
  movement: 9,
  shooting: 9,
  dribbling: 9,
  tackling: 7,
  marking: 7,
  stamina: 8,
  strength: 7,
  vision: 9,
  longPassing: 9,
  aerial: 8,
};

function player(
  id: string,
  teamId: "player" | "ai",
  position: Vec2,
  command: Command | null = null,
  overrides: Partial<PlayerStats> = {},
): SimPlayer {
  return {
    id,
    teamId,
    cardId: id,
    position: { ...position },
    startPosition: { ...position },
    velocity: { x: 0, y: 0 },
    state: PlayerState.IDLE,
    stats: { ...stats, ...overrides },
    ability: "none",
    command,
    commandExecuted: false,
    stateTimer: 0,
    recoveryTimer: 0,
    name: id,
    jerseyNumber: 1,
    role: "midfielder",
  };
}

function ownedBall(owner: SimPlayer): SimBall {
  return {
    position: { ...owner.position },
    velocity: { x: 0, y: 0 },
    ownerId: owner.id,
    height: 0,
  };
}

assert.deepEqual(
  [1, 4, 5, 6, 7, 8, 9, 10].map(curvePointLimit),
  [2, 2, 3, 3, 4, 4, 5, 5],
);
assert.equal(curvePointLimitForMechanic({ ...stats, movement: 4 }, "move"), 2);
assert.equal(curvePointLimitForMechanic({ ...stats, passing: 6 }, "groundPass"), 3);
assert.equal(curvePointLimitForMechanic({ ...stats, longPassing: 8 }, "longPass"), 4);
assert.equal(curvePointLimitForMechanic({ ...stats, shooting: 10 }, "shot"), 5);

const start = { x: 100, y: 230 };
const target = { x: 250, y: 230 };
const controls = [
  { x: 145, y: 165 },
  { x: 205, y: 165 },
];
const sampled = sampleChainedCurve(start, controls, target);
assert.deepEqual(sampled.at(-1), target);
assert.ok(sampled.some((point) => point.y < 200), "curve should leave the direct lane");
assert.equal(
  sanitizeCurvePoints([...controls, { x: 220, y: 190 }], 2).length,
  2,
);

const tacticalA = planTacticalCurve(
  start,
  target,
  [{ x: 175, y: 230 }],
  { mechanic: "groundPass", maxPoints: 5 },
);
const tacticalB = planTacticalCurve(
  start,
  target,
  [{ x: 175, y: 230 }],
  { mechanic: "groundPass", maxPoints: 5 },
);
assert.ok(tacticalA && tacticalA.length >= 2, "blocked lane should produce a curve");
assert.deepEqual(tacticalA, tacticalB, "AI curve planning must be deterministic");
assert.equal(
  planTacticalCurve(start, target, [{ x: 175, y: 330 }], {
    mechanic: "groundPass",
    maxPoints: 5,
  }),
  undefined,
  "an open lane should stay straight",
);

{
  const dribbler = player("p_dribble", "player", start, {
    type: CommandType.MOVE,
    targetPosition: { x: 210, y: 230 },
    curvePoints: [
      { x: 130, y: 195 },
      { x: 175, y: 195 },
    ],
  });
  const result = runSimulation([dribbler], ownedBall(dribbler), 11);
  assert.ok(
    result.frames.some((frame) => frame.players[0].position.y < 220),
    "curved dribble must follow its control chain",
  );
}

{
  const passer = player("p_pass", "player", start, {
    type: CommandType.PASS,
    targetPosition: target,
    passStyle: "ground",
    curvePoints: controls,
  });
  const receiver = player("p_receive", "player", target);
  const result = runSimulation([passer, receiver], ownedBall(passer), 12);
  assert.ok(
    result.frames.some((frame) => frame.ball.position.y < 205),
    "ground pass must follow its control chain",
  );
}

{
  const passer = player("p_long", "player", start, {
    type: CommandType.PASS,
    targetPosition: target,
    passStyle: "long",
    coordinated: true,
    curvePoints: controls,
  });
  const receiver = player("p_long_receive", "player", target);
  const result = runSimulation([passer, receiver], ownedBall(passer), 13);
  assert.ok(
    result.frames.some(
      (frame) => frame.ball.position.y < 205 && (frame.ball.height ?? 0) > 2,
    ),
    "long ball must combine the chained route with aerial height",
  );
}

{
  const shooter = player(
    "p_shoot",
    "player",
    { x: PITCH_WIDTH - 145, y: PITCH_HEIGHT / 2 },
    {
      type: CommandType.SHOOT,
      curvePoints: [
        { x: PITCH_WIDTH - 105, y: 165 },
        { x: PITCH_WIDTH - 55, y: 165 },
      ],
    },
  );
  const result = runSimulation([shooter], ownedBall(shooter), 14);
  assert.ok(
    result.frames.some((frame) => frame.ball.position.y < 215),
    "shot must follow its control chain",
  );
  assert.ok(
    result.events.some((event) => event.type === GameEventType.GOAL),
    "curved shot should still reach the goal",
  );
}

{
  const carrier = player(
    "ai_carrier",
    "ai",
    { x: 165, y: PITCH_HEIGHT / 2 },
    null,
    { shooting: 10, movement: 10 },
  );
  const blocker = player("human_blocker", "player", { x: 85, y: PITCH_HEIGHT / 2 });
  const aiCommands = generateAICommands(
    [carrier],
    [blocker],
    ownedBall(carrier),
    3,
  );
  const command = aiCommands.get(carrier.id);
  assert.ok(command, "AI carrier should receive a command");
  assert.equal(command?.type, CommandType.SHOOT);
  assert.ok(
    command?.curvePoints && command.curvePoints.length >= 2,
    "AI should curve a blocked shot lane",
  );
}

console.log("Phase 7–8 curve tests passed.");
