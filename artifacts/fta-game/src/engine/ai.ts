import type { SimPlayer, SimBall, Command, Vec2 } from "./types";
import { CommandType } from "./types";
import {
  PITCH_WIDTH, PITCH_HEIGHT, AI_SHOT_RANGE, AI_PASS_SAFE_DISTANCE
} from "./constants";

function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function normalize(v: Vec2): Vec2 {
  const l = Math.sqrt(v.x * v.x + v.y * v.y);
  if (l === 0) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

export function generateAICommands(
  aiPlayers: SimPlayer[],
  playerPlayers: SimPlayer[],
  ball: SimBall
): Map<string, Command> {
  const commands = new Map<string, Command>();
  const goalCenter: Vec2 = { x: PITCH_WIDTH, y: PITCH_HEIGHT / 2 };
  const ownGoalCenter: Vec2 = { x: 0, y: PITCH_HEIGHT / 2 };

  const ballOwner = ball.ownerId;
  const aiHasBall = aiPlayers.some(p => p.id === ballOwner);
  const playerHasBall = playerPlayers.some(p => p.id === ballOwner);
  const ballFree = !aiHasBall && !playerHasBall;

  const sortedByDistToBall = [...aiPlayers].sort((a, b) =>
    dist(a.position, ball.position) - dist(b.position, ball.position)
  );

  for (const player of aiPlayers) {
    const hasBall = player.id === ballOwner;

    if (hasBall) {
      const distToGoal = dist(player.position, goalCenter);

      if (distToGoal < AI_SHOT_RANGE) {
        commands.set(player.id, { type: CommandType.SHOOT, targetPosition: goalCenter });
        continue;
      }

      const bestPassTarget = findBestPassTarget(player, aiPlayers, playerPlayers, goalCenter);
      if (bestPassTarget) {
        commands.set(player.id, {
          type: CommandType.PASS,
          targetPlayerId: bestPassTarget.id,
          targetPosition: bestPassTarget.position,
        });
        continue;
      }

      const advanceTarget = computeAdvanceTarget(player, goalCenter, playerPlayers);
      commands.set(player.id, { type: CommandType.MOVE, targetPosition: advanceTarget });
      continue;
    }

    if (aiHasBall) {
      const carrier = aiPlayers.find(p => p.id === ballOwner)!;
      const distToGoal = dist(carrier.position, goalCenter);

      if (player.id === sortedByDistToBall[0].id && distToGoal > AI_SHOT_RANGE) {
        const supportPos = getSupportPosition(carrier, goalCenter, aiPlayers, player);
        commands.set(player.id, { type: CommandType.MOVE, targetPosition: supportPos });
      } else {
        const pressurePos = computeDefensivePosition(player, playerPlayers, ownGoalCenter, aiPlayers);
        commands.set(player.id, { type: CommandType.MOVE, targetPosition: pressurePos });
      }
      continue;
    }

    if (playerHasBall) {
      const carrier = playerPlayers.find(p => p.id === ballOwner)!;
      const myDistToBall = dist(player.position, ball.position);
      const isClosest = sortedByDistToBall[0].id === player.id;

      if (isClosest && myDistToBall < 180) {
        const pressureTarget = {
          x: carrier.position.x + (carrier.position.x - player.position.x) * 0.2,
          y: carrier.position.y,
        };
        commands.set(player.id, { type: CommandType.MOVE, targetPosition: clampToField(pressureTarget) });
      } else {
        const defensivePos = computeDefensivePosition(player, playerPlayers, ownGoalCenter, aiPlayers);
        commands.set(player.id, { type: CommandType.MOVE, targetPosition: defensivePos });
      }
      continue;
    }

    if (ballFree) {
      const chaseTarget = clampToField({
        x: ball.position.x + ball.velocity.x * 0.3,
        y: ball.position.y + ball.velocity.y * 0.3,
      });
      if (player.id === sortedByDistToBall[0].id) {
        commands.set(player.id, { type: CommandType.MOVE, targetPosition: chaseTarget });
      } else {
        const support = { x: chaseTarget.x + 60, y: chaseTarget.y + (player.position.y > PITCH_HEIGHT / 2 ? 40 : -40) };
        commands.set(player.id, { type: CommandType.MOVE, targetPosition: clampToField(support) });
      }
    }
  }

  return commands;
}

function findBestPassTarget(
  carrier: SimPlayer,
  teammates: SimPlayer[],
  opponents: SimPlayer[],
  goalCenter: Vec2
): SimPlayer | null {
  let best: SimPlayer | null = null;
  let bestScore = -Infinity;

  for (const tm of teammates) {
    if (tm.id === carrier.id) continue;
    const d = dist(carrier.position, tm.position);
    if (d < 60 || d > 280) continue;

    const distToGoal = dist(tm.position, goalCenter);
    const carrierDistToGoal = dist(carrier.position, goalCenter);
    if (distToGoal >= carrierDistToGoal) continue;

    const passSafe = isPassSafe(carrier.position, tm.position, opponents);
    if (!passSafe) continue;

    const score = (1 / distToGoal) * 1000 + d * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = tm;
    }
  }

  return best;
}

function isPassSafe(from: Vec2, to: Vec2, opponents: SimPlayer[]): boolean {
  for (const opp of opponents) {
    const t = Math.max(0, Math.min(1,
      ((opp.position.x - from.x) * (to.x - from.x) + (opp.position.y - from.y) * (to.y - from.y)) /
      ((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
    ));
    const closest = { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) };
    if (dist(opp.position, closest) < AI_PASS_SAFE_DISTANCE) return false;
  }
  return true;
}

function computeAdvanceTarget(carrier: SimPlayer, goalCenter: Vec2, opponents: SimPlayer[]): Vec2 {
  const dir = normalize({ x: goalCenter.x - carrier.position.x, y: goalCenter.y - carrier.position.y });
  let target = {
    x: carrier.position.x + dir.x * 90,
    y: carrier.position.y + dir.y * 40,
  };

  for (const opp of opponents) {
    const d = dist(opp.position, target);
    if (d < 60) {
      target = {
        x: target.x + (opp.position.y > target.y ? -30 : 30),
        y: target.y + (opp.position.y > target.y ? -20 : 20),
      };
    }
  }

  return clampToField(target);
}

function getSupportPosition(carrier: SimPlayer, goalCenter: Vec2, teammates: SimPlayer[], self: SimPlayer): Vec2 {
  const dir = normalize({ x: goalCenter.x - carrier.position.x, y: goalCenter.y - carrier.position.y });
  const offset = self.position.y > PITCH_HEIGHT / 2 ? -60 : 60;

  return clampToField({
    x: carrier.position.x + dir.x * 100,
    y: carrier.position.y + offset,
  });
}

function computeDefensivePosition(
  player: SimPlayer,
  attackers: SimPlayer[],
  ownGoalCenter: Vec2,
  teammates: SimPlayer[]
): Vec2 {
  const sortedAttackers = [...attackers].sort(
    (a, b) => dist(a.position, ownGoalCenter) - dist(b.position, ownGoalCenter)
  );

  const myIndex = teammates.findIndex(t => t.id === player.id);
  const markTarget = sortedAttackers[myIndex % sortedAttackers.length];

  if (!markTarget) {
    return clampToField({
      x: ownGoalCenter.x + 120,
      y: player.position.y,
    });
  }

  const coverPos = {
    x: markTarget.position.x - (markTarget.position.x - ownGoalCenter.x) * 0.3,
    y: markTarget.position.y + (player.position.y > PITCH_HEIGHT / 2 ? 20 : -20),
  };

  return clampToField(coverPos);
}

function clampToField(pos: Vec2): Vec2 {
  return {
    x: Math.max(20, Math.min(PITCH_WIDTH - 20, pos.x)),
    y: Math.max(20, Math.min(PITCH_HEIGHT - 20, pos.y)),
  };
}
