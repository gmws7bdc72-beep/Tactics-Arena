import type {
  PlayerCard,
  PlayerDevelopment,
  PlayerStats,
  TeamConfig,
  TrainingFocus,
} from "../engine/types";

export type MatchTrainingResult = "win" | "draw" | "loss" | "idle";
export type TrainingIntensity = "light" | "balanced" | "intense";

export interface TrainingWeekContext {
  season: number;
  week: number;
  result: MatchTrainingResult;
  intensity?: TrainingIntensity;
}

export const TRAINING_FOCUSES: Array<{
  id: TrainingFocus;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    shortLabel: "ALL",
    description: "Improves the attributes that best fit the player's role.",
  },
  {
    id: "passing",
    label: "Passing",
    shortLabel: "PAS",
    description: "Passing, vision, and close control.",
  },
  {
    id: "shooting",
    label: "Shooting",
    shortLabel: "SHT",
    description: "Shooting, attack, and strength in scoring positions.",
  },
  {
    id: "longPassing",
    label: "Long Balls",
    shortLabel: "LNG",
    description: "Long passing, vision, and delivery accuracy.",
  },
  {
    id: "defending",
    label: "Defending",
    shortLabel: "DEF",
    description: "Defending, tackling, marking, and aerial play.",
  },
  {
    id: "goalkeeping",
    label: "Goalkeeping",
    shortLabel: "GK",
    description: "Goalkeeper defense, handling, aerial command, and distribution.",
  },
  {
    id: "movement",
    label: "Movement",
    shortLabel: "MOV",
    description: "Movement, speed, dribbling, and stamina.",
  },
];

const STAT_KEYS: Array<keyof PlayerStats> = [
  "attack",
  "defense",
  "passing",
  "speed",
  "movement",
  "shooting",
  "dribbling",
  "tackling",
  "marking",
  "stamina",
  "strength",
  "vision",
  "longPassing",
  "aerial",
];

const FOCUS_STATS: Record<Exclude<TrainingFocus, "balanced">, Array<keyof PlayerStats>> = {
  passing: ["passing", "vision", "dribbling"],
  shooting: ["shooting", "attack", "strength"],
  longPassing: ["longPassing", "vision", "passing"],
  defending: ["defense", "tackling", "marking", "aerial"],
  goalkeeping: ["defense", "marking", "aerial", "longPassing"],
  movement: ["movement", "speed", "dribbling", "stamina"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizedStat(value: unknown, fallback = 5): number {
  return clamp(
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value)
      : fallback,
    1,
    10,
  );
}

export function normalizePlayerStats(player: PlayerCard): PlayerStats {
  const legacy = player.stats as PlayerStats & { luck?: number };

  return {
    attack: normalizedStat(legacy.attack),
    defense: normalizedStat(legacy.defense),
    passing: normalizedStat(legacy.passing),
    speed: normalizedStat(legacy.speed),
    movement: normalizedStat(legacy.movement ?? legacy.luck),
    shooting: normalizedStat(legacy.shooting, legacy.attack),
    dribbling: normalizedStat(legacy.dribbling, Math.round((legacy.attack + legacy.speed) / 2)),
    tackling: normalizedStat(legacy.tackling, legacy.defense),
    marking: normalizedStat(legacy.marking, legacy.defense),
    stamina: normalizedStat(legacy.stamina, Math.round((legacy.speed + legacy.defense) / 2)),
    strength: normalizedStat(legacy.strength, Math.round((legacy.attack + legacy.defense) / 2)),
    vision: normalizedStat(legacy.vision, legacy.passing),
    longPassing: normalizedStat(legacy.longPassing, legacy.passing),
    aerial: normalizedStat(legacy.aerial, Math.round((legacy.attack + legacy.defense) / 2)),
  };
}

function weightedAverage(values: Array<[number, number]>): number {
  const totalWeight = values.reduce((sum, [, weight]) => sum + weight, 0);
  const total = values.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return totalWeight > 0 ? total / totalWeight : 0;
}

export function calculatePlayerOverall(player: PlayerCard): number {
  const s = normalizePlayerStats(player);

  switch (player.role) {
    case "goalkeeper":
      return round1(
        weightedAverage([
          [s.defense, 1.6],
          [s.marking, 1.25],
          [s.aerial, 1.35],
          [s.longPassing, 0.85],
          [s.strength, 0.8],
          [s.movement, 0.7],
          [s.vision, 0.65],
        ]),
      );
    case "defender":
      return round1(
        weightedAverage([
          [s.defense, 1.4],
          [s.tackling, 1.35],
          [s.marking, 1.3],
          [s.strength, 0.9],
          [s.aerial, 0.9],
          [s.movement, 0.75],
          [s.passing, 0.65],
        ]),
      );
    case "midfielder":
      return round1(
        weightedAverage([
          [s.passing, 1.35],
          [s.vision, 1.25],
          [s.movement, 1.05],
          [s.dribbling, 0.95],
          [s.stamina, 0.95],
          [s.longPassing, 0.9],
          [s.defense, 0.55],
          [s.attack, 0.6],
        ]),
      );
    case "forward":
      return round1(
        weightedAverage([
          [s.attack, 1.25],
          [s.shooting, 1.15],
          [s.movement, 1.2],
          [s.dribbling, 1.1],
          [s.speed, 1],
          [s.passing, 0.65],
          [s.vision, 0.6],
        ]),
      );
    case "striker":
      return round1(
        weightedAverage([
          [s.attack, 1.4],
          [s.shooting, 1.45],
          [s.movement, 1.15],
          [s.speed, 0.9],
          [s.dribbling, 0.85],
          [s.aerial, 0.75],
          [s.strength, 0.7],
        ]),
      );
  }
}

export function defaultTrainingFocus(player: PlayerCard): TrainingFocus {
  if (player.role === "goalkeeper") return "goalkeeping";
  if (player.role === "defender") return "defending";
  if (player.role === "midfielder") return "passing";
  if (player.role === "forward") return "movement";
  return "shooting";
}

function defaultAge(player: PlayerCard): number {
  const roll = hashString(`${player.id}:age`) % 15;
  return 18 + roll;
}

function defaultPotential(player: PlayerCard, age: number): number {
  const overall = calculatePlayerOverall(player);
  const youthBonus = age <= 21 ? 2 : age <= 25 ? 1.4 : age <= 29 ? 0.8 : 0.35;
  const variation = (hashString(`${player.id}:potential`) % 11) / 10;
  return round1(clamp(overall + youthBonus + variation, overall, 10));
}

export function ensurePlayerDevelopment(player: PlayerCard, season = 1): PlayerCard {
  const stats = normalizePlayerStats(player);
  const age = clamp(Math.round(player.age ?? defaultAge({ ...player, stats })), 16, 40);
  const existing = player.development;
  const focus = TRAINING_FOCUSES.some((item) => item.id === existing?.focus)
    ? existing!.focus
    : defaultTrainingFocus(player);
  const overall = calculatePlayerOverall({ ...player, stats });
  const potential = round1(
    clamp(
      existing?.potential ?? defaultPotential({ ...player, stats }, age),
      overall,
      10,
    ),
  );

  const development: PlayerDevelopment = {
    focus,
    potential,
    morale: clamp(Math.round(existing?.morale ?? 72), 25, 100),
    progress: clamp(Math.round(existing?.progress ?? 0), 0, 99),
    totalGrowth: Math.max(0, Math.round(existing?.totalGrowth ?? 0)),
    seasonGrowth: Math.max(0, Math.round(existing?.seasonGrowth ?? 0)),
    lastWeekGrowth: Math.max(0, Math.round(existing?.lastWeekGrowth ?? 0)),
    lastTrainedWeek: Math.max(0, Math.round(existing?.lastTrainedWeek ?? 0)),
    history: Array.isArray(existing?.history)
      ? existing!.history.slice(-24).map((entry) => ({
          ...entry,
          season: Math.max(1, Math.round(entry.season ?? season)),
          week: Math.max(0, Math.round(entry.week ?? 0)),
          focus: TRAINING_FOCUSES.some((item) => item.id === entry.focus)
            ? entry.focus
            : focus,
          progressGain: Math.max(0, Math.round(entry.progressGain ?? 0)),
          statGains: entry.statGains ?? {},
          overallBefore: round1(entry.overallBefore ?? overall),
          overallAfter: round1(entry.overallAfter ?? overall),
          moraleAfter: clamp(Math.round(entry.moraleAfter ?? 72), 25, 100),
        }))
      : [],
  };

  return {
    ...player,
    age,
    stats,
    development,
  };
}

export function ensureTeamDevelopment(team: TeamConfig, season = 1): TeamConfig {
  return {
    ...team,
    trainingIntensity: team.trainingIntensity ?? "balanced",
    players: (team.players ?? []).map((player) =>
      ensurePlayerDevelopment(player, season),
    ),
  };
}

export function getTrainingEffectiveness(player: PlayerCard): number {
  const normalized = ensurePlayerDevelopment(player);
  const development = normalized.development!;
  const overall = calculatePlayerOverall(normalized);
  const gap = Math.max(0, development.potential - overall);
  const agePenalty = Math.max(0, (normalized.age ?? 24) - 28) * 2.4;

  return clamp(
    Math.round(42 + development.morale * 0.35 + gap * 13 - agePenalty),
    18,
    100,
  );
}

export function focusStatsForPlayer(
  player: PlayerCard,
  focus: TrainingFocus,
): Array<keyof PlayerStats> {
  if (focus !== "balanced") {
    return FOCUS_STATS[focus];
  }

  switch (player.role) {
    case "goalkeeper":
      return ["defense", "aerial", "marking", "longPassing", "movement"];
    case "defender":
      return ["defense", "tackling", "marking", "movement", "passing"];
    case "midfielder":
      return ["passing", "vision", "movement", "stamina", "longPassing"];
    case "forward":
      return ["movement", "dribbling", "shooting", "passing", "speed"];
    case "striker":
      return ["shooting", "attack", "movement", "strength", "aerial"];
  }
}

function moraleDelta(result: MatchTrainingResult, intensity: TrainingIntensity): number {
  const resultDelta = result === "win" ? 4 : result === "draw" ? 1 : result === "loss" ? -3 : 0;
  const intensityDelta = intensity === "intense" ? -1 : intensity === "light" ? 1 : 0;
  return resultDelta + intensityDelta;
}

function pickGrowthStat(
  player: PlayerCard,
  focus: TrainingFocus,
  season: number,
  week: number,
  growthIndex: number,
): keyof PlayerStats | null {
  const stats = normalizePlayerStats(player);
  const preferred = focusStatsForPlayer(player, focus).filter(
    (key) => stats[key] < 10,
  );
  const candidates = preferred.length > 0
    ? preferred
    : STAT_KEYS.filter((key) => stats[key] < 10);

  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    const weakness = stats[a] - stats[b];
    if (weakness !== 0) return weakness;

    const ah = hashString(`${player.id}:${season}:${week}:${growthIndex}:${a}`);
    const bh = hashString(`${player.id}:${season}:${week}:${growthIndex}:${b}`);
    return ah - bh;
  });

  return ranked[0];
}

export function advancePlayerTraining(
  rawPlayer: PlayerCard,
  context: TrainingWeekContext,
  forcedFocus?: TrainingFocus,
): PlayerCard {
  const player = ensurePlayerDevelopment(rawPlayer, context.season);
  const development = player.development!;
  const intensity = context.intensity ?? "balanced";
  const focus = forcedFocus ?? development.focus;
  const overallBefore = calculatePlayerOverall(player);
  const effectiveness = getTrainingEffectiveness(player);
  const potentialGap = Math.max(0, development.potential - overallBefore);
  const intensityFactor = intensity === "light" ? 0.72 : intensity === "intense" ? 1.22 : 1;
  const atCeiling = potentialGap < 0.08;
  const baseProgress = atCeiling
    ? 3 + Math.round(effectiveness * 0.035)
    : 8 + Math.round(effectiveness * 0.17 + potentialGap * 2.5);
  const progressGain = Math.max(2, Math.round(baseProgress * intensityFactor));
  let progress = development.progress + progressGain;
  let stats = { ...player.stats };
  const statGains: Partial<Record<keyof PlayerStats, number>> = {};
  let growthCount = 0;

  while (progress >= 100 && growthCount < 2) {
    const candidatePlayer: PlayerCard = { ...player, stats };
    const currentOverall = calculatePlayerOverall(candidatePlayer);

    if (currentOverall >= development.potential - 0.04) {
      progress = 99;
      break;
    }

    const stat = pickGrowthStat(
      candidatePlayer,
      focus,
      context.season,
      context.week,
      growthCount,
    );

    if (!stat) {
      progress = 99;
      break;
    }

    stats = {
      ...stats,
      [stat]: clamp(stats[stat] + 1, 1, 10),
    };
    statGains[stat] = (statGains[stat] ?? 0) + 1;
    growthCount += 1;
    progress -= 100;
  }

  const morale = clamp(
    development.morale + moraleDelta(context.result, intensity),
    25,
    100,
  );
  const updatedPlayer: PlayerCard = {
    ...player,
    stats,
    development: {
      ...development,
      focus,
      morale,
      progress: clamp(progress, 0, 99),
      totalGrowth: development.totalGrowth + growthCount,
      seasonGrowth: development.seasonGrowth + growthCount,
      lastWeekGrowth: growthCount,
      lastTrainedWeek: context.week,
      history: development.history,
    },
  };
  const overallAfter = calculatePlayerOverall(updatedPlayer);

  updatedPlayer.development = {
    ...updatedPlayer.development!,
    history: [
      ...development.history,
      {
        season: context.season,
        week: context.week,
        focus,
        progressGain,
        statGains,
        overallBefore,
        overallAfter,
        moraleAfter: morale,
      },
    ].slice(-24),
  };

  return updatedPlayer;
}

export function setPlayerTrainingFocus(
  player: PlayerCard,
  focus: TrainingFocus,
  season = 1,
): PlayerCard {
  const normalized = ensurePlayerDevelopment(player, season);

  return {
    ...normalized,
    development: {
      ...normalized.development!,
      focus,
    },
  };
}

function squadAverage(players: PlayerCard[], keys: Array<keyof PlayerStats>): number {
  if (players.length === 0) return 5;
  const sum = players.reduce(
    (total, player) =>
      total +
      keys.reduce((statTotal, key) => statTotal + normalizePlayerStats(player)[key], 0) /
        keys.length,
    0,
  );
  return sum / players.length;
}

export function chooseAITrainingFocus(
  rawPlayer: PlayerCard,
  rawSquad: PlayerCard[],
  tacticId?: string,
): TrainingFocus {
  const player = ensurePlayerDevelopment(rawPlayer);
  const squad = rawSquad.map((item) => ensurePlayerDevelopment(item));
  const s = player.stats;
  const scores: Record<TrainingFocus, number> = {
    balanced: 3,
    passing: 0,
    shooting: 0,
    longPassing: 0,
    defending: 0,
    goalkeeping: -50,
    movement: 0,
  };

  if (player.role === "goalkeeper") {
    scores.goalkeeping = 16 - (s.defense + s.aerial + s.marking) / 3;
    scores.longPassing = 12 - (s.longPassing + s.vision) / 2;
    scores.movement = 10 - (s.movement + s.speed) / 2;
    scores.balanced = 4;
  } else if (player.role === "defender") {
    scores.defending = 16 - (s.defense + s.tackling + s.marking) / 3;
    scores.movement = 12 - (s.movement + s.speed) / 2;
    scores.passing = 10 - (s.passing + s.vision) / 2;
    scores.longPassing = 9 - s.longPassing;
  } else if (player.role === "midfielder") {
    scores.passing = 16 - (s.passing + s.vision) / 2;
    scores.movement = 13 - (s.movement + s.stamina) / 2;
    scores.longPassing = 11 - s.longPassing;
    scores.defending = 9 - (s.defense + s.tackling) / 2;
    scores.shooting = 8 - s.shooting;
  } else {
    scores.shooting = 16 - (s.shooting + s.attack) / 2;
    scores.movement = 15 - (s.movement + s.speed + s.dribbling) / 3;
    scores.passing = 9 - (s.passing + s.vision) / 2;
    scores.longPassing = 7 - s.longPassing;
  }

  const squadPassing = squadAverage(squad, ["passing", "vision"]);
  const squadDefending = squadAverage(squad, ["defense", "tackling", "marking"]);
  const squadFinishing = squadAverage(squad, ["attack", "shooting"]);
  const squadMovement = squadAverage(squad, ["movement", "speed"]);

  scores.passing += Math.max(0, 7 - squadPassing) * 0.65;
  scores.defending += Math.max(0, 7 - squadDefending) * 0.65;
  scores.shooting += Math.max(0, 7 - squadFinishing) * 0.65;
  scores.movement += Math.max(0, 7 - squadMovement) * 0.65;

  if (tacticId === "slow_possession" || tacticId === "balanced_build_up") {
    scores.passing += 2.2;
  }
  if (tacticId === "long_ball_target" || tacticId === "direct_play" || tacticId === "wide_crossing") {
    scores.longPassing += 2.4;
  }
  if (tacticId === "counter_press" || tacticId === "quick_counterattack") {
    scores.movement += 2.4;
  }
  if (tacticId === "low_block_counter") {
    scores.defending += 2.4;
  }

  return (Object.entries(scores) as Array<[TrainingFocus, number]>).sort(
    ([focusA, scoreA], [focusB, scoreB]) => {
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (
        hashString(`${player.id}:${focusA}`) -
        hashString(`${player.id}:${focusB}`)
      );
    },
  )[0][0];
}

export function advanceSquadTraining(
  rawPlayers: PlayerCard[],
  context: TrainingWeekContext,
  tacticId?: string,
  strategicAI = false,
): PlayerCard[] {
  const normalizedSquad = rawPlayers.map((player) =>
    ensurePlayerDevelopment(player, context.season),
  );

  return normalizedSquad.map((player) => {
    const focus = strategicAI
      ? chooseAITrainingFocus(player, normalizedSquad, tacticId)
      : player.development!.focus;
    return advancePlayerTraining(player, context, focus);
  });
}

export function advanceTeamTraining(
  rawTeam: TeamConfig,
  context: Omit<TrainingWeekContext, "intensity">,
): TeamConfig {
  const team = ensureTeamDevelopment(rawTeam, context.season);

  return {
    ...team,
    players: advanceSquadTraining(team.players, {
      ...context,
      intensity: team.trainingIntensity ?? "balanced",
    }),
  };
}

export function prepareTeamForNewSeason(
  rawTeam: TeamConfig,
  season: number,
): TeamConfig {
  const team = ensureTeamDevelopment(rawTeam, season);

  return {
    ...team,
    players: team.players.map((player) => ({
      ...player,
      age: clamp((player.age ?? 24) + 1, 16, 40),
      development: {
        ...player.development!,
        seasonGrowth: 0,
        lastWeekGrowth: 0,
        lastTrainedWeek: 0,
        morale: clamp(player.development!.morale + 4, 25, 100),
      },
    })),
  };
}

export function prepareSquadForNewSeason(
  rawPlayers: PlayerCard[],
  season: number,
): PlayerCard[] {
  return rawPlayers.map((player) => {
    const normalized = ensurePlayerDevelopment(player, season);
    return {
      ...normalized,
      age: clamp((normalized.age ?? 24) + 1, 16, 40),
      development: {
        ...normalized.development!,
        seasonGrowth: 0,
        lastWeekGrowth: 0,
        lastTrainedWeek: 0,
        morale: clamp(normalized.development!.morale + 4, 25, 100),
      },
    };
  });
}
