import type { Command, GameEvent, MatchStats, SimPlayer, FrameSnapshot } from "../engine/types";
import { CommandType, GameEventType } from "../engine/types";
import { TILE_W, TILE_H } from "../engine/constants";

export function createEmptyMatchStats(): MatchStats {
  const empty = () => ({
    possessionTicks: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    forwardPasses: 0,
    shots: 0,
    shotsOnTarget: 0,
    interceptions: 0,
    offsides: 0,
    longBallsAttempted: 0,
    longBallsCompleted: 0,
    dribblesWon: 0,
    physicalDuelsWon: 0,
    saves: 0,
  });
  return { player: empty(), ai: empty() };
}

function countCommand(
  stats: MatchStats,
  teamId: "player" | "ai",
  originX: number,
  command: Command | null | undefined,
): void {
  if (!command) return;
  const team = stats[teamId];
  if (command.type === CommandType.PASS) {
    team.passesAttempted += 1;
    if (command.passStyle === "long") team.longBallsAttempted += 1;
    if (command.targetPosition) {
      const progress = teamId === "player"
        ? command.targetPosition.x - originX
        : originX - command.targetPosition.x;
      if (progress > TILE_W * 0.2) team.forwardPasses += 1;
    }
  }

  if (command.followUp) {
    const followOrigin = command.type === CommandType.MOVE && command.targetPosition
      ? command.targetPosition.x
      : originX;
    countCommand(stats, teamId, followOrigin, command.followUp);
  }
}

export function collectTurnStats(
  previous: MatchStats,
  players: SimPlayer[],
  commands: Map<string, Command>,
  frames: FrameSnapshot[],
  events: GameEvent[],
): MatchStats {
  const next: MatchStats = {
    player: { ...previous.player },
    ai: { ...previous.ai },
  };

  for (const player of players) {
    countCommand(next, player.teamId, player.position.x, commands.get(player.id));
  }

  const teamByPlayerId = new Map(players.map((player) => [player.id, player.teamId]));
  for (const frame of frames) {
    const ownerTeam = frame.ball.ownerId ? teamByPlayerId.get(frame.ball.ownerId) : undefined;
    if (ownerTeam) next[ownerTeam].possessionTicks += 1;
  }

  for (const event of events) {
    const teamId = event.teamId;
    if (!teamId) continue;
    const team = next[teamId];
    if (event.type === GameEventType.PASS_COMPLETE) {
      team.passesCompleted += 1;
      if (event.passStyle === "long") team.longBallsCompleted += 1;
    } else if (event.type === GameEventType.SHOT_ON_GOAL) {
      team.shots += 1;
      if (event.onTarget) team.shotsOnTarget += 1;
    } else if (event.type === GameEventType.PASS_INTERCEPTED || event.type === GameEventType.TACKLE) {
      team.interceptions += 1;
      if (event.type === GameEventType.TACKLE) team.physicalDuelsWon += 1;
    } else if (event.type === GameEventType.OFFSIDE) {
      team.offsides += 1;
    } else if (event.type === GameEventType.SAVE) {
      team.saves += 1;
    } else if (event.type === GameEventType.DRIBBLE || event.visualEffect === "dribbled") {
      team.dribblesWon += 1;
    } else if (event.type === GameEventType.GOAL) {
      // Goals from deliberate shots are already marked by SHOT_ON_GOAL. Do not
      // turn passes or dribbles into shots merely because they entered the net.
    }
  }

  return next;
}

export function possessionPercent(stats: MatchStats, teamId: "player" | "ai"): number {
  const total = stats.player.possessionTicks + stats.ai.possessionTicks;
  if (total <= 0) return 50;
  return Math.round((stats[teamId].possessionTicks / total) * 100);
}
