import type { Command, MatchStats, SimBall, SimPlayer, TeamTactic, Vec2 } from "../engine/types";
import { CommandType } from "../engine/types";
import { GRID_COLS, GRID_ROWS, TILE_H, TILE_W, speedToTiles } from "../engine/constants";
import { posToTile, tileToPos } from "../engine/grid";

const KEY = "fta_hidden_tactical_memory_v1";

export type ReadCategory = "movement" | "passing" | "longBalls" | "shooting" | "combinations" | "curves";

export interface PredictionTurnScore {
  overall: number;
  attempts: number;
  categories: Partial<Record<ReadCategory, number>>;
}

export interface PredictionMatchAccumulator {
  weightedScore: number;
  attempts: number;
  categoryTotals: Partial<Record<ReadCategory, number>>;
  categoryCounts: Partial<Record<ReadCategory, number>>;
}

export interface ClubTacticalMemory {
  meetings: number;
  consecutiveStrongReads: number;
  variationStrength: number;
  categoryPressure: Partial<Record<ReadCategory, number>>;
  outcomes?: {
    possession: number;
    shots: number;
    forwardPassRatio: number;
    offsides: number;
    longBallSuccess: number;
    interceptions: number;
  };
}

type MemoryStore = Record<string, ClubTacticalMemory>;

function defaultMemory(): ClubTacticalMemory {
  return {
    meetings: 0,
    consecutiveStrongReads: 0,
    variationStrength: 0,
    categoryPressure: {},
  };
}

function loadStore(): MemoryStore {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as MemoryStore : {};
  } catch {
    return {};
  }
}

function saveStore(store: MemoryStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Hidden learning must never stop a match from completing.
  }
}

export function loadClubTacticalMemory(clubId: string): ClubTacticalMemory {
  return { ...defaultMemory(), ...(loadStore()[clubId] ?? {}) };
}

export function createPredictionAccumulator(): PredictionMatchAccumulator {
  return { weightedScore: 0, attempts: 0, categoryTotals: {}, categoryCounts: {} };
}

function commandSignature(command: Command): string {
  const base = command.type === CommandType.PASS
    ? command.passStyle === "long" ? "long" : "pass"
    : command.type === CommandType.SHOOT ? "shot" : command.type === CommandType.DIVE ? "dive" : "move";
  if (!command.followUp) return base;
  const follow = command.followUp.type === CommandType.PASS
    ? command.followUp.passStyle === "long" ? "long" : "pass"
    : command.followUp.type === CommandType.SHOOT ? "shot" : command.followUp.type === CommandType.MOVE ? "move" : "dive";
  return `${base}+${follow}`;
}

function categoryFor(command: Command): ReadCategory {
  if (command.followUp) return "combinations";
  if (command.type === CommandType.SHOOT) return "shooting";
  if (command.type === CommandType.PASS) return command.passStyle === "long" ? "longBalls" : "passing";
  return "movement";
}

function actionSimilarity(predicted: Command, actual: Command): number {
  const a = commandSignature(predicted);
  const b = commandSignature(actual);
  if (a === b) return 1;
  const families = new Set([a, b]);
  if ((a.includes("pass") && b.includes("pass")) || (a.includes("move") && b.includes("move"))) return 0.68;
  if (families.has("long") && families.has("pass")) return 0.52;
  if ((a.includes("shot") && b.includes("pass")) || (b.includes("shot") && a.includes("pass"))) return 0.18;
  return 0.08;
}

function angleSimilarity(origin: Vec2, predicted?: Vec2, actual?: Vec2): number {
  if (!predicted || !actual) return 0.25;
  const pa = Math.atan2(predicted.y - origin.y, predicted.x - origin.x);
  const aa = Math.atan2(actual.y - origin.y, actual.x - origin.x);
  const diff = Math.abs(Math.atan2(Math.sin(pa - aa), Math.cos(pa - aa)));
  return Math.max(0, (Math.cos(diff) + 1) / 2);
}

function destinationSimilarity(predicted?: Vec2, actual?: Vec2): number {
  if (!predicted || !actual) return predicted === actual ? 1 : 0.2;
  const tileDistance = Math.hypot(
    (predicted.x - actual.x) / TILE_W,
    (predicted.y - actual.y) / TILE_H,
  );
  return Math.exp(-tileDistance * 0.72);
}

function curveSimilarity(predicted: Command, actual: Command): number {
  const p = predicted.curvePoints ?? [];
  const a = actual.curvePoints ?? [];
  if (p.length < 2 || a.length < 2) return p.length === a.length ? 1 : 0;
  const samples = Math.min(p.length, a.length);
  let total = 0;
  for (let i = 0; i < samples; i += 1) total += destinationSimilarity(p[i], a[i]);
  return total / samples;
}

function sequenceTarget(command: Command): Vec2 | undefined {
  return command.followUp?.targetPosition ?? command.targetPosition;
}

export function scorePredictionTurn(
  predictions: Map<string, Command>,
  actualCommands: Map<string, Command>,
  aiPlayers: SimPlayer[],
): PredictionTurnScore {
  let weighted = 0;
  let attempts = 0;
  const categoryTotals: Partial<Record<ReadCategory, number>> = {};
  const categoryCounts: Partial<Record<ReadCategory, number>> = {};

  for (const [playerId, predicted] of predictions) {
    const actual = actualCommands.get(playerId);
    const player = aiPlayers.find((candidate) => candidate.id === playerId);
    if (!actual || !player) continue;

    const action = actionSimilarity(predicted, actual);
    const destination = destinationSimilarity(sequenceTarget(predicted), sequenceTarget(actual));
    const direction = angleSimilarity(player.position, predicted.targetPosition, actual.targetPosition);
    const sequence = predicted.followUp || actual.followUp
      ? actionSimilarity(predicted.followUp ?? predicted, actual.followUp ?? actual)
      : 1;

    let score = action * 0.34 + destination * 0.34 + direction * 0.2 + sequence * 0.12;
    const predictedCurve = (predicted.curvePoints?.length ?? 0) >= 2;
    const actualCurve = (actual.curvePoints?.length ?? 0) >= 2;
    if (predictedCurve && actualCurve) {
      const similarity = curveSimilarity(predicted, actual);
      // Correctly anticipating the side and shape of a curve is intentionally
      // worth far more than an ordinary destination prediction.
      score *= 1 + similarity * 2.5;
      categoryTotals.curves = (categoryTotals.curves ?? 0) + similarity * 3;
      categoryCounts.curves = (categoryCounts.curves ?? 0) + 1;
    }

    const category = categoryFor(actual);
    weighted += score;
    attempts += 1;
    categoryTotals[category] = (categoryTotals[category] ?? 0) + score;
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }

  const categories: Partial<Record<ReadCategory, number>> = {};
  for (const category of Object.keys(categoryTotals) as ReadCategory[]) {
    categories[category] = (categoryTotals[category] ?? 0) / Math.max(1, categoryCounts[category] ?? 1);
  }
  return { overall: attempts > 0 ? weighted / attempts : 0, attempts, categories };
}

export function addPredictionTurn(
  accumulator: PredictionMatchAccumulator,
  score: PredictionTurnScore,
): void {
  if (score.attempts <= 0) return;
  accumulator.weightedScore += score.overall * score.attempts;
  accumulator.attempts += score.attempts;
  for (const [category, value] of Object.entries(score.categories) as [ReadCategory, number][]) {
    accumulator.categoryTotals[category] = (accumulator.categoryTotals[category] ?? 0) + value;
    accumulator.categoryCounts[category] = (accumulator.categoryCounts[category] ?? 0) + 1;
  }
}

export function commitClubLearning(
  clubId: string,
  accumulator: PredictionMatchAccumulator,
  stats: MatchStats,
): ClubTacticalMemory {
  const store = loadStore();
  const current = { ...defaultMemory(), ...(store[clubId] ?? {}) };
  const overall = accumulator.attempts > 0 ? accumulator.weightedScore / accumulator.attempts : 0;
  const strongRead = accumulator.attempts >= 2 && overall >= 0.62;
  const consecutiveStrongReads = strongRead ? current.consecutiveStrongReads + 1 : Math.max(0, current.consecutiveStrongReads - 1);
  const categoryPressure = { ...current.categoryPressure };

  for (const category of Object.keys(accumulator.categoryTotals) as ReadCategory[]) {
    const score = (accumulator.categoryTotals[category] ?? 0) / Math.max(1, accumulator.categoryCounts[category] ?? 1);
    categoryPressure[category] = Math.max(0, Math.min(1.5, (categoryPressure[category] ?? 0) * 0.55 + score * 0.45));
  }

  const ai = stats.ai;
  const totalPossession = stats.player.possessionTicks + stats.ai.possessionTicks;
  const possession = totalPossession > 0 ? ai.possessionTicks / totalPossession : 0.5;
  const outcomes = {
    possession,
    shots: ai.shots,
    forwardPassRatio: ai.passesAttempted > 0 ? ai.forwardPasses / ai.passesAttempted : 0,
    offsides: ai.offsides,
    longBallSuccess: ai.longBallsAttempted > 0 ? ai.longBallsCompleted / ai.longBallsAttempted : 0,
    interceptions: ai.interceptions,
  };

  const next: ClubTacticalMemory = {
    meetings: current.meetings + (accumulator.attempts > 0 ? 1 : 0),
    consecutiveStrongReads,
    // Two strong meetings create a noticeable but controlled adjustment; the
    // third can increase it further without erasing the club's identity.
    variationStrength: Math.max(0, Math.min(1, consecutiveStrongReads <= 1 ? current.variationStrength * 0.75 : 0.28 + (consecutiveStrongReads - 2) * 0.22)),
    categoryPressure,
    outcomes,
  };
  store[clubId] = next;
  saveStore(store);
  return next;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function clampTileTarget(player: SimPlayer, target: Vec2, rowShift: number, colShift: number): Vec2 {
  const from = posToTile(player.position);
  const original = posToTile(target);
  const maxRange = speedToTiles(player.stats.speed);
  let col = Math.max(0, Math.min(GRID_COLS - 1, original.col + colShift));
  let row = Math.max(0, Math.min(GRID_ROWS - 1, original.row + rowShift));
  const dc = col - from.col;
  const dr = row - from.row;
  const distance = Math.hypot(dc, dr);
  if (distance > maxRange && distance > 0) {
    const scale = maxRange / distance;
    col = Math.round(from.col + dc * scale);
    row = Math.round(from.row + dr * scale);
  }
  return tileToPos(col, row);
}

export function applyHiddenTacticalVariation(
  commands: Map<string, Command>,
  aiPlayers: SimPlayer[],
  _playerPlayers: SimPlayer[],
  _ball: SimBall,
  _tactic: TeamTactic | undefined,
  memory: ClubTacticalMemory,
  seedValue: number,
): Map<string, Command> {
  const rng = seeded(seedValue ^ 0x5f3759df);
  const next = new Map(commands);
  const outcomes = memory.outcomes;
  const needsProgression = !!outcomes && outcomes.possession > 0.54 && outcomes.shots < 3;
  const offsideCaution = !!outcomes && outcomes.offsides >= 2;
  const weakLongBalls = !!outcomes && outcomes.longBallSuccess < 0.32;
  const needsMoreBallWins = !!outcomes && outcomes.interceptions < 3;
  const outcomeAdjustment = needsProgression || offsideCaution || weakLongBalls || needsMoreBallWins ? 0.2 : 0;
  if (memory.variationStrength <= 0.02 && outcomeAdjustment <= 0) return commands;

  for (const player of aiPlayers) {
    const command = next.get(player.id);
    if (!command) continue;
    const category = categoryFor(command);
    const pressure = Math.min(1.5, memory.categoryPressure[category] ?? 0);
    const chance = Math.min(0.58, outcomeAdjustment + memory.variationStrength * (0.22 + pressure * 0.26));
    if (rng() > chance) continue;

    let varied: Command = { ...command };
    if (command.type === CommandType.MOVE && command.targetPosition) {
      const rowShift = rng() < 0.5 ? -1 : 1;
      const colShift = offsideCaution ? 1 : needsProgression ? -1 : 0; // AI attacks left.
      varied = { ...command, targetPosition: clampTileTarget(player, command.targetPosition, rowShift, colShift) };
    } else if (command.type === CommandType.PASS) {
      if (command.passStyle === "long" && weakLongBalls) {
        varied = { ...command, passStyle: "ground", curvePoints: undefined };
      } else {
        const alternatives = aiPlayers
          .filter((candidate) => candidate.id !== player.id)
          .sort((a, b) => {
            const aProgress = player.position.x - a.position.x;
            const bProgress = player.position.x - b.position.x;
            return (needsProgression ? bProgress - aProgress : Math.abs(a.position.y - player.position.y) - Math.abs(b.position.y - player.position.y));
          });
        const alternate = alternatives[Math.min(alternatives.length - 1, rng() < 0.65 ? 0 : 1)];
        if (alternate) varied = { ...command, targetPlayerId: alternate.id, targetPosition: { ...alternate.position } };
      }
    }

    if (command.followUp && memory.categoryPressure.combinations && rng() < memory.variationStrength * 0.5) {
      if (command.type === CommandType.MOVE && command.followUp.type === CommandType.PASS) {
        varied = {
          type: CommandType.PASS,
          targetPosition: command.followUp.targetPosition,
          targetPlayerId: command.followUp.targetPlayerId,
          passStyle: command.followUp.passStyle,
          followUp: { type: CommandType.MOVE, targetPosition: command.targetPosition },
        };
      } else if (command.type === CommandType.PASS && command.followUp.type === CommandType.MOVE) {
        varied = {
          type: CommandType.MOVE,
          targetPosition: command.followUp.targetPosition,
          followUp: {
            type: CommandType.PASS,
            targetPosition: command.targetPosition,
            targetPlayerId: command.targetPlayerId,
            passStyle: command.passStyle,
          },
        };
      }
    }

    if ((command.curvePoints?.length ?? 0) >= 2 && memory.categoryPressure.curves && rng() < memory.variationStrength * 0.65) {
      varied = { ...varied, curvePoints: rng() < 0.45 ? undefined : command.curvePoints?.map((point) => ({ x: point.x, y: TILE_H * GRID_ROWS - point.y })) };
    }

    next.set(player.id, varied);
  }

  return next;
}
