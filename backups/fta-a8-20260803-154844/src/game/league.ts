import type {
  LeagueState,
  LeagueTeamEntry,
  MatchdayResult,
  PlayerCard,
  PlayerStats,
  PlayoffBracket,
  PlayoffMatch,
  ScheduledMatch,
  TeamTactic,
  TeamTacticId,
} from "../engine/types";
import { TILE_H, TILE_W } from "../engine/constants";
import { getAIFormationById } from "./formations";
import {
  advanceSquadTraining,
  ensurePlayerDevelopment,
  prepareSquadForNewSeason,
  type MatchTrainingResult,
} from "./training";
import {
  expandSquad,
  getPlayerOverall,
  randomizePlayerForNewSave,
  rollNewSaveClubTalent,
} from "./transferDatabase";

export interface AITeamDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  formationId: string;
  players: PlayerCard[];
  jerseyColor: string;
  secondaryColor: string;
  crestIcon: string;
  tacticId: TeamTacticId;
  tactic: TeamTactic;
}

export const TEAM_TACTICS: Record<TeamTacticId, TeamTactic> = {
  slow_possession: {
    id: "slow_possession",
    name: "Slow Possession Progression",
    description:
      "Patient buildup, recycling passes, short support angles, and careful control before entering the box.",
    tempo: 2,
    risk: 2,
    pressIntensity: 4,
    defensiveLine: 5,
    longBallFrequency: 1,
    restDefenseDepth: 5,
    progression: "slow",

    outOfPossessionName: "Compact Zonal Mid Block",
    outOfPossessionDescription:
      "Drops into a calm mid block, protects central passing lanes, and avoids reckless chasing. Midfielders screen, defenders hold shape.",
    markingStyle: "zonal",
    blockHeight: "mid",
    defensiveShape: "compact",
    pressTrigger: "bad_touch",
    markPriority: {
      defender: "forward",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  balanced_build_up: {
    id: "balanced_build_up",
    name: "Balanced Build-Up",
    description:
      "Mixes short passing, safe dribbles, selective forward passes, and balanced rest defense.",
    tempo: 5,
    risk: 5,
    pressIntensity: 5,
    defensiveLine: 6,
    longBallFrequency: 3,
    restDefenseDepth: 4,
    progression: "balanced",

    outOfPossessionName: "Balanced Hybrid Block",
    outOfPossessionDescription:
      "Starts zonal, then picks up nearby runners when the ball enters dangerous areas. No extreme pressing, no parking the bus.",
    markingStyle: "hybrid",
    blockHeight: "mid",
    defensiveShape: "compact",
    pressTrigger: "back_pass",
    markPriority: {
      defender: "forward",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  direct_play: {
    id: "direct_play",
    name: "Direct Play",
    description:
      "Looks forward early, plays vertical, and uses long diagonals when the midfield gets crowded.",
    tempo: 7,
    risk: 6,
    pressIntensity: 5,
    defensiveLine: 6,
    longBallFrequency: 6,
    restDefenseDepth: 4,
    progression: "direct",

    outOfPossessionName: "Direct Mid Block",
    outOfPossessionDescription:
      "Keeps two players ready to break, while defenders and midfielders protect the center. Presses loose touches but does not overcommit.",
    markingStyle: "hybrid",
    blockHeight: "mid",
    defensiveShape: "compact",
    pressTrigger: "bad_touch",
    markPriority: {
      defender: "striker",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  counter_press: {
    id: "counter_press",
    name: "Counter Press",
    description:
      "Aggressive pressure after losing the ball, fast regains, then quick attacks before the defense resets.",
    tempo: 7,
    risk: 7,
    pressIntensity: 9,
    defensiveLine: 8,
    longBallFrequency: 4,
    restDefenseDepth: 4,
    progression: "direct",

    outOfPossessionName: "High Counter-Press",
    outOfPossessionDescription:
      "Hunts the ball immediately, presses high, and uses man-oriented pressure around the carrier. Risky, fast, and chaotic.",
    markingStyle: "hybrid",
    blockHeight: "high",
    defensiveShape: "aggressive",
    pressTrigger: "always",
    markPriority: {
      defender: "forward",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  low_block_counter: {
    id: "low_block_counter",
    name: "Low Block Counter",
    description:
      "Sits deeper, protects the box, keeps a strong rest defender, then breaks forward quickly.",
    tempo: 6,
    risk: 5,
    pressIntensity: 3,
    defensiveLine: 3,
    longBallFrequency: 7,
    restDefenseDepth: 6,
    progression: "counter",

    outOfPossessionName: "Low Block Man Protection",
    outOfPossessionDescription:
      "Defenders stay deep, protect the box, and man-mark the biggest forward threat. They invite pressure, then counter.",
    markingStyle: "man_marking",
    blockHeight: "low",
    defensiveShape: "protect_box",
    pressTrigger: "none",
    markPriority: {
      defender: "striker",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  quick_counterattack: {
    id: "quick_counterattack",
    name: "Quick Counterattack",
    description:
      "First look is forward. Second look is a runner behind the line. Very fast and risky.",
    tempo: 9,
    risk: 8,
    pressIntensity: 6,
    defensiveLine: 5,
    longBallFrequency: 7,
    restDefenseDepth: 5,
    progression: "counter",

    outOfPossessionName: "Trap-and-Sprint Defense",
    outOfPossessionDescription:
      "Lets the opponent enter bait zones, then jumps passing lanes and immediately releases runners. More aggressive than a low block.",
    markingStyle: "hybrid",
    blockHeight: "mid",
    defensiveShape: "aggressive",
    pressTrigger: "wide_trap",
    markPriority: {
      defender: "forward",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  wide_crossing: {
    id: "wide_crossing",
    name: "Wide Crossing",
    description:
      "Moves the ball wide, attacks the far post, and uses diagonal long balls into crossing zones.",
    tempo: 6,
    risk: 6,
    pressIntensity: 5,
    defensiveLine: 5,
    longBallFrequency: 6,
    restDefenseDepth: 4,
    progression: "direct",

    outOfPossessionName: "Wide Trap Zonal Defense",
    outOfPossessionDescription:
      "Protects the middle, allows the ball wide, then traps near the sideline with nearby defenders and midfielders.",
    markingStyle: "zonal",
    blockHeight: "mid",
    defensiveShape: "wide",
    pressTrigger: "wide_trap",
    markPriority: {
      defender: "forward",
      midfielder: "midfielder",
      forward: "defender",
    },
  },

  long_ball_target: {
    id: "long_ball_target",
    name: "Long-Ball Target Man",
    description:
      "Goalkeeper and defenders launch aerial balls toward a strong forward who can win first contact.",
    tempo: 7,
    risk: 7,
    pressIntensity: 4,
    defensiveLine: 4,
    longBallFrequency: 9,
    restDefenseDepth: 6,
    progression: "direct",

    outOfPossessionName: "Deep Aerial Protection",
    outOfPossessionDescription:
      "Stays deep, wins headers, protects the central lane, and keeps strong defenders close to dangerous forwards.",
    markingStyle: "man_marking",
    blockHeight: "low",
    defensiveShape: "protect_box",
    pressTrigger: "back_pass",
    markPriority: {
      defender: "striker",
      midfielder: "midfielder",
      forward: "defender",
    },
  },
};

function stats(base: PlayerStats, patch: Partial<PlayerStats> = {}): PlayerStats {
  return {
    attack: base.attack,
    defense: base.defense,
    passing: base.passing,
    speed: base.speed,
    movement: base.movement,
    shooting: base.shooting,
    dribbling: base.dribbling,
    tackling: base.tackling,
    marking: base.marking,
    stamina: base.stamina,
    strength: base.strength,
    vision: base.vision,
    longPassing: base.longPassing,
    aerial: base.aerial,
    ...patch,
  };
}

const GK: PlayerStats = {
  attack: 2,
  defense: 8,
  passing: 6,
  speed: 5,
  movement: 6,
  shooting: 2,
  dribbling: 4,
  tackling: 5,
  marking: 8,
  stamina: 7,
  strength: 8,
  vision: 6,
  longPassing: 7,
  aerial: 8,
};

const DEF: PlayerStats = {
  attack: 4,
  defense: 8,
  passing: 6,
  speed: 6,
  movement: 5,
  shooting: 4,
  dribbling: 5,
  tackling: 8,
  marking: 8,
  stamina: 8,
  strength: 8,
  vision: 6,
  longPassing: 7,
  aerial: 8,
};

const MID: PlayerStats = {
  attack: 6,
  defense: 6,
  passing: 8,
  speed: 7,
  movement: 6,
  shooting: 6,
  dribbling: 7,
  tackling: 6,
  marking: 6,
  stamina: 8,
  strength: 6,
  vision: 8,
  longPassing: 8,
  aerial: 5,
};

const FWD: PlayerStats = {
  attack: 8,
  defense: 4,
  passing: 6,
  speed: 8,
  movement: 6,
  shooting: 8,
  dribbling: 8,
  tackling: 4,
  marking: 5,
  stamina: 8,
  strength: 7,
  vision: 6,
  longPassing: 6,
  aerial: 7,
};

const ST: PlayerStats = {
  attack: 9,
  defense: 3,
  passing: 5,
  speed: 8,
  movement: 6,
  shooting: 9,
  dribbling: 7,
  tackling: 3,
  marking: 4,
  stamina: 8,
  strength: 8,
  vision: 6,
  longPassing: 5,
  aerial: 8,
};

function player(
  id: string,
  name: string,
  role: PlayerCard["role"],
  jerseyNumber: number,
  playerStats: PlayerStats,
  ability: PlayerCard["ability"] = "none",
): PlayerCard {
  return {
    id,
    name,
    role,
    jerseyNumber,
    stats: playerStats,
    ability,
  };
}

function mkTeam(
  id: string,
  name: string,
  tier: 1 | 2 | 3,
  jerseyColor: string,
  secondaryColor: string,
  crestIcon: string,
  formationId: string,
  tacticId: TeamTacticId,
  players: PlayerCard[],
): AITeamDef {
  return {
    id,
    name,
    tier,
    formationId,
    tacticId,
    tactic: TEAM_TACTICS[tacticId],
    jerseyColor,
    secondaryColor,
    crestIcon,
    players,
  };
}

export const AI_TEAMS: AITeamDef[] = [
  mkTeam(
    "fc_ironforge",
    "FC Ironforge",
    1,
    "#1a237e",
    "#ffcc00",
    "⚔️",
    "4-0-1",
    "low_block_counter",
    [
      player("ig_gk", "Bram Vale", "goalkeeper", 1, stats(GK, { defense: 9, strength: 9, aerial: 9 }), "goalkeeper"),
      player("ig_d1", "Otto Forge", "defender", 5, stats(DEF, { defense: 10, tackling: 10, marking: 10, strength: 10, aerial: 10 }), "iron_tackle"),
      player("ig_d2", "Kellan Pike", "defender", 4, stats(DEF, { defense: 9, marking: 9, strength: 9, aerial: 9 }), "shadow_mark"),
      player("ig_d3", "Tor Vale", "defender", 2, stats(DEF, { speed: 7, stamina: 9, tackling: 8 }), "shadow_mark"),
      player("ig_d4", "Rafe Anvil", "defender", 6, stats(DEF, { passing: 7, vision: 7, strength: 9 }), "powerhouse"),
      player("ig_st", "Milo Hammer", "striker", 9, stats(ST, { strength: 10, aerial: 10, speed: 7 }), "powerhouse"),
    ],
  ),

  mkTeam(
    "the_vanguard",
    "The Vanguard",
    1,
    "#880e4f",
    "#ffffff",
    "🛡️",
    "2-3-0",
    "slow_possession",
    [
      player("tv_gk", "Soren Gate", "goalkeeper", 1, stats(GK, { passing: 8, vision: 8 }), "goalkeeper"),
      player("tv_d1", "Leon Ward", "defender", 2, stats(DEF, { passing: 8, vision: 8, defense: 9 }), "shadow_mark"),
      player("tv_d2", "Nico Barr", "defender", 3, stats(DEF, { defense: 9, marking: 10, strength: 9 }), "iron_tackle"),
      player("tv_m1", "Ilan Tempo", "midfielder", 8, stats(MID, { passing: 10, vision: 10, dribbling: 8 }), "bullet_pass"),
      player("tv_m2", "Marek Calm", "midfielder", 14, stats(MID, { passing: 9, defense: 8, vision: 9 }), "bullet_pass"),
      player("tv_m3", "Ezra Link", "midfielder", 10, stats(MID, { attack: 7, passing: 9, shooting: 7, vision: 9 }), "eagle_eye"),
    ],
  ),

  mkTeam(
    "titanium_fc",
    "Titanium FC",
    1,
    "#37474f",
    "#eceff1",
    "⚡",
    "2-1-2",
    "balanced_build_up",
    [
      player("ti_gk", "Axel Prime", "goalkeeper", 1, stats(GK, { defense: 9, longPassing: 8 }), "goalkeeper"),
      player("ti_d1", "Dane Steel", "defender", 5, stats(DEF, { defense: 9, strength: 9 }), "iron_tackle"),
      player("ti_d2", "Nolan Chrome", "defender", 2, stats(DEF, { speed: 8, passing: 7, stamina: 9 }), "shadow_mark"),
      player("ti_m1", "Vik Pulse", "midfielder", 8, stats(MID, { passing: 9, vision: 9, dribbling: 8 }), "bullet_pass"),
      player("ti_f1", "Orin Spark", "forward", 6, stats(FWD, { passing: 8, strength: 8 }), "powerhouse"),
      player("ti_s1", "Jett Core", "striker", 9, stats(ST, { speed: 9, shooting: 9, dribbling: 8 }), "ghost_run"),
    ],
  ),

  mkTeam(
    "northern_wolves",
    "Northern Wolves",
    2,
    "#1b5e20",
    "#ffffff",
    "🐺",
    "1-2-2",
    "counter_press",
    [
      player("nw_gk", "Rune Frost", "goalkeeper", 1, stats(GK, { speed: 5, longPassing: 8 }), "goalkeeper"),
      player("nw_d1", "Hugo Fang", "defender", 4, stats(DEF, { speed: 8, defense: 9, stamina: 10 }), "shadow_mark"),
      player("nw_m1", "Koa Hunt", "midfielder", 6, stats(MID, { defense: 9, tackling: 9, stamina: 10, speed: 9 }), "iron_tackle"),
      player("nw_m2", "Eli Storm", "midfielder", 12, stats(MID, { speed: 10, stamina: 10, dribbling: 8 }), "ghost_run"),
      player("nw_f1", "Lars Howl", "forward", 11, stats(FWD, { speed: 9, stamina: 9, dribbling: 8 }), "ghost_run"),
      player("nw_s1", "Mika Snow", "striker", 9, stats(ST, { speed: 9, shooting: 9, aerial: 8 }), "eagle_eye"),
    ],
  ),

  mkTeam(
    "silver_city",
    "Silver City",
    2,
    "#546e7a",
    "#cfd8dc",
    "🏙️",
    "2-2-1",
    "wide_crossing",
    [
      player("sc_gk", "Noah Quay", "goalkeeper", 1, stats(GK, { passing: 7, longPassing: 8 }), "goalkeeper"),
      player("sc_d1", "Arlo Pier", "defender", 3, stats(DEF, { passing: 8, longPassing: 9, vision: 8 }), "bullet_pass"),
      player("sc_d2", "Mateo Shore", "defender", 14, stats(DEF, { speed: 9, dribbling: 7, passing: 7 }), "ghost_run"),
      player("sc_m1", "Ciro Lane", "midfielder", 7, stats(MID, { speed: 9, dribbling: 9, passing: 8 }), "ghost_run"),
      player("sc_m2", "Enzo Vale", "midfielder", 11, stats(MID, { passing: 9, longPassing: 9, vision: 9 }), "bullet_pass"),
      player("sc_s1", "Tomas Spire", "striker", 9, stats(ST, { strength: 9, aerial: 10, shooting: 9 }), "powerhouse"),
    ],
  ),

  mkTeam(
    "river_phoenix",
    "River Phoenix",
    2,
    "#bf360c",
    "#ffccbc",
    "🔥",
    "1-1-3",
    "quick_counterattack",
    [
      player("rp_gk", "Ash Calder", "goalkeeper", 1, stats(GK, { longPassing: 9, vision: 7 }), "goalkeeper"),
      player("rp_d1", "Bryn Ember", "defender", 4, stats(DEF, { speed: 8, longPassing: 8 }), "shadow_mark"),
      player("rp_m1", "Kai Flash", "midfielder", 8, stats(MID, { speed: 9, attack: 8, dribbling: 8 }), "ghost_run"),
      player("rp_f1", "Rian Flare", "forward", 7, stats(FWD, { speed: 10, dribbling: 9, shooting: 8 }), "ghost_run"),
      player("rp_f2", "Nico Cinder", "forward", 11, stats(FWD, { speed: 10, dribbling: 9 }), "ghost_run"),
      player("rp_s1", "Sol Blaze", "striker", 9, stats(ST, { attack: 10, shooting: 10, speed: 9 }), "eagle_eye"),
    ],
  ),

  mkTeam(
    "rooksville_fc",
    "Rooksville FC",
    3,
    "#f57f17",
    "#ffffff",
    "🌱",
    "2-0-3",
    "direct_play",
    [
      player("rf_gk", "Pax Reed", "goalkeeper", 1, stats(GK, { movement: 8, longPassing: 8 }), "goalkeeper"),
      player("rf_d1", "Owen Root", "defender", 5, stats(DEF, { movement: 7, longPassing: 8 }), "iron_tackle"),
      player("rf_d2", "Jude Acres", "defender", 8, stats(DEF, { attack: 6, strength: 8, speed: 7 }), "powerhouse"),
      player("rf_f1", "Theo Grove", "forward", 6, stats(FWD, { passing: 8, vision: 8 }), "bullet_pass"),
      player("rf_f2", "Finn Rush", "forward", 9, stats(FWD, { speed: 9, movement: 8 }), "ghost_run"),
      player("rf_s1", "Cole Field", "striker", 10, stats(ST, { movement: 8, shooting: 9, aerial: 8 }), "eagle_eye"),
    ],
  ),

  mkTeam(
    "the_underdogs",
    "The Underdogs",
    3,
    "#6a1b9a",
    "#e1bee7",
    "🐕",
    "1-0-4",
    "quick_counterattack",
    [
      player("ud_gk", "Remy Scraps", "goalkeeper", 1, stats(GK, { movement: 9 }), "goalkeeper"),
      player("ud_d1", "Gus Chain", "defender", 4, stats(DEF, { movement: 8, strength: 8 }), "iron_tackle"),
      player("ud_f1", "Zeke Dash", "forward", 7, stats(FWD, { speed: 10, dribbling: 9, movement: 8 }), "ghost_run"),
      player("ud_f2", "Taz Lucky", "forward", 11, stats(FWD, { speed: 10, movement: 10 }), "ghost_run"),
      player("ud_f3", "Nash Bite", "forward", 6, stats(FWD, { strength: 8, movement: 9 }), "powerhouse"),
      player("ud_s1", "Bo Chance", "striker", 9, stats(ST, { movement: 10, shooting: 8 }), "eagle_eye"),
    ],
  ),

  mkTeam(
    "coastal_fc",
    "Coastal FC",
    2,
    "#006064",
    "#b2ebf2",
    "🌊",
    "3-0-2",
    "long_ball_target",
    [
      player("cf_gk", "Marin Deep", "goalkeeper", 1, stats(GK, { passing: 8, longPassing: 10, aerial: 9 }), "goalkeeper"),
      player("cf_d1", "Cruz Tide", "defender", 5, stats(DEF, { longPassing: 9, passing: 7, aerial: 9 }), "bullet_pass"),
      player("cf_d2", "Ivo Rock", "defender", 3, stats(DEF, { strength: 10, aerial: 10, defense: 9 }), "iron_tackle"),
      player("cf_d3", "Luca Harbor", "defender", 8, stats(DEF, { passing: 8, vision: 8, longPassing: 9 }), "bullet_pass"),
      player("cf_f1", "Sami Break", "forward", 11, stats(FWD, { speed: 8, longPassing: 7 }), "ghost_run"),
      player("cf_s1", "Atlas Bay", "striker", 9, stats(ST, { strength: 10, aerial: 10, shooting: 9 }), "powerhouse"),
    ],
  ),
];

function seededRng(seed: number): () => number {
  let s = seed || 12345;

  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const rng = seededRng(seed);
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function buildRoundRobinMatchdays(ids: string[], seed: number): [string, string][][] {
  const ordered = shuffle(ids, seed);
  const rounds: [string, string][][] = [];

  for (let round = 0; round < ordered.length; round++) {
    const slots: (string | null)[] = [null];

    for (let i = 0; i < ordered.length; i++) {
      slots.push(ordered[(i + round) % ordered.length]);
    }

    const pairings: [string, string][] = [];

    for (let i = 0; i < slots.length / 2; i++) {
      const a = slots[i];
      const b = slots[slots.length - 1 - i];

      if (a && b) {
        pairings.push(round % 2 === 0 ? [a, b] : [b, a]);
      }
    }

    rounds.push(pairings);
  }

  return rounds;
}

export function createInitialAISquads(season = 1): Record<string, PlayerCard[]> {
  const squads = Object.fromEntries(
    AI_TEAMS.map((team) => {
      const clubTalent = rollNewSaveClubTalent(team.tier);
      const players = expandSquad(team.players, team.id, team.tier, season)
        .map((player, index) =>
          randomizePlayerForNewSave(
            player,
            team.id,
            index,
            team.tier,
            clubTalent,
          ),
        )
        .map((player) => ensurePlayerDevelopment(player, season));
      return [team.id, players];
    }),
  );
  return ensureAITransferListings(squads, season);
}

const MIN_AI_TRANSFER_LISTINGS = 20;
const MIN_AI_LISTINGS_PER_CLUB = 1;
const MAX_AI_LISTINGS_PER_CLUB = 4;

type SquadRoleBucket = "goalkeeper" | "defender" | "midfielder" | "attacker";

function stableListingHash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function roleBucket(player: PlayerCard): SquadRoleBucket {
  if (player.role === "goalkeeper") return "goalkeeper";
  if (player.role === "defender") return "defender";
  if (player.role === "midfielder") return "midfielder";
  return "attacker";
}

function formationRolePlan(formationId: string): Record<SquadRoleBucket, number> {
  const clean = formationId.replace(/^ai-/, "");
  const [defenders = 2, midfielders = 1, attackers = 2] = clean
    .split("-")
    .map((value) => Math.max(0, Number.parseInt(value, 10) || 0));
  return { goalkeeper: 1, defender: defenders, midfielder: midfielders, attacker: attackers };
}

function preferredSquadDepth(formationId: string, squadSize: number): Record<SquadRoleBucket, number> {
  const starters = formationRolePlan(formationId);
  const deepBench = squadSize >= 14;
  return {
    goalkeeper: deepBench ? 2 : 1,
    defender: Math.max(1, starters.defender + (starters.defender > 0 ? 1 : 0)),
    midfielder: Math.max(starters.midfielder > 0 ? starters.midfielder + 1 : 1, 1),
    attacker: Math.max(starters.attacker > 0 ? starters.attacker + 1 : 1, 1),
  };
}

function listingScore(
  player: PlayerCard,
  club: AITeamDef,
  squad: PlayerCard[],
  season: number,
): number {
  if (player.marketStatus === "untouchable") return Number.NEGATIVE_INFINITY;

  const bucket = roleBucket(player);
  const counts = squad.reduce<Record<SquadRoleBucket, number>>(
    (total, item) => {
      total[roleBucket(item)] += 1;
      return total;
    },
    { goalkeeper: 0, defender: 0, midfielder: 0, attacker: 0 },
  );
  if (bucket === "goalkeeper" && counts.goalkeeper <= 1) return Number.NEGATIVE_INFINITY;

  const starters = formationRolePlan(club.formationId);
  const preferred = preferredSquadDepth(club.formationId, squad.length);
  const overall = getPlayerOverall(player);
  const sortedOveralls = squad.map(getPlayerOverall).sort((a, b) => a - b);
  const median = sortedOveralls[Math.floor(sortedOveralls.length / 2)] ?? overall;
  const clubFloor = club.tier === 1 ? 68 : club.tier === 2 ? 58 : 48;
  const surplus = Math.max(0, counts[bucket] - preferred[bucket]);

  let score = surplus * 18;
  if (starters[bucket] === 0) score += 15;
  if (overall < median) score += (median - overall) * 1.15;
  if (overall < clubFloor) score += (clubFloor - overall) * 1.35;
  if (player.marketStatus === "listed") score += 30;
  else if (player.marketStatus === "available") score += 3;
  else if (player.marketStatus === "not_for_sale") score -= 4;

  // Transformed players are normal squad members, not protected assets. If a
  // replacement is tactically redundant or below the club standard, it can be
  // listed immediately in the next market cycle.
  if (player.transformedFrom) score += 2;

  score += (stableListingHash(`${season}:${club.id}:${player.id}`) % 1000) / 1000;
  return score;
}

function ensureAITransferListings(
  squads: Record<string, PlayerCard[]>,
  season: number,
): Record<string, PlayerCard[]> {
  const next = Object.fromEntries(
    Object.entries(squads).map(([clubId, players]) => [
      clubId,
      players.map((player) => ({ ...player })),
    ]),
  );

  // First, each club evaluates tactical fit and quality independently. This
  // makes radically shaped teams sell redundant positions instead of keeping
  // five defenders for a one-defender system.
  for (const club of AI_TEAMS) {
    const squad = next[club.id] ?? [];
    const ranked = squad
      .map((player, index) => ({ player, index, score: listingScore(player, club, squad, season) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score);

    let listed = squad.filter((player) => player.marketStatus === "listed").length;
    const strongCandidates = ranked.filter((entry) => entry.score >= 9);
    const desired = Math.min(
      MAX_AI_LISTINGS_PER_CLUB,
      Math.max(MIN_AI_LISTINGS_PER_CLUB, Math.min(strongCandidates.length, 3)),
    );

    for (const candidate of ranked) {
      if (listed >= desired) break;
      if (candidate.player.marketStatus === "listed") continue;
      squad[candidate.index] = {
        ...candidate.player,
        marketStatus: "listed",
        askingPrice: candidate.player.askingPrice ?? candidate.player.marketValue,
      };
      listed += 1;
    }
  }

  // Then enforce a healthy league-wide market. This is a floor, not random
  // listing: the remaining candidates are still ranked by tactical mismatch
  // and quality relative to their own club.
  const allCandidates = AI_TEAMS.flatMap((club) => {
    const squad = next[club.id] ?? [];
    return squad.map((player, index) => ({
      club,
      player,
      index,
      score: listingScore(player, club, squad, season),
    }));
  })
    .filter((entry) => Number.isFinite(entry.score) && entry.player.marketStatus !== "listed")
    .sort((a, b) => b.score - a.score);

  let totalListed = Object.values(next)
    .flat()
    .filter((player) => player.marketStatus === "listed").length;

  for (const candidate of allCandidates) {
    if (totalListed >= MIN_AI_TRANSFER_LISTINGS) break;
    const squad = next[candidate.club.id];
    const live = squad[candidate.index];
    if (!live || live.marketStatus === "untouchable" || live.marketStatus === "listed") continue;
    if (live.role === "goalkeeper" && squad.filter((player) => player.role === "goalkeeper").length <= 1) continue;
    squad[candidate.index] = {
      ...live,
      marketStatus: "listed",
      askingPrice: live.askingPrice ?? live.marketValue,
    };
    totalListed += 1;
  }

  return next;
}

function normalizeAISquads(
  state: LeagueState,
  season: number,
): Record<string, PlayerCard[]> {
  const existing = state.aiSquads ?? {};

  const normalized = Object.fromEntries(
    AI_TEAMS.map((team) => {
      const source = existing[team.id]?.length ? existing[team.id] : team.players;
      return [
        team.id,
        expandSquad(source, team.id, team.tier, season).map((player) => ensurePlayerDevelopment(player, season)),
      ];
    }),
  );

  return ensureAITransferListings(normalized, season);
}

export function createLeague(playerTeamId: string, playerTeamName: string): LeagueState {
  const seed = Date.now() % 999999;

  const teams: LeagueTeamEntry[] = [
    {
      id: playerTeamId,
      name: playerTeamName,
      tier: 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    },
    ...AI_TEAMS.map((team) => ({
      id: team.id,
      name: team.name,
      tier: team.tier,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    })),
  ];

  const aiOrder = shuffle(
    AI_TEAMS.map((team) => team.id),
    seed + 88,
  );

  const schedule: ScheduledMatch[] = aiOrder.map((id, index) => {
    const opponent = AI_TEAMS.find((team) => team.id === id)!;

    return {
      opponentId: opponent.id,
      opponentName: opponent.name,
      played: false,
      playerGoals: 0,
      opponentGoals: 0,
      isHome: index % 2 === 0,
    };
  });

  const aiMatchdays = buildRoundRobinMatchdays(
    AI_TEAMS.map((team) => team.id),
    seed + 100,
  );

  return {
    teams,
    schedule,
    currentMatchIndex: 0,
    aiSchedule: aiMatchdays.flat(),
    aiMatchIndex: 0,
    season: 1,
    trainingWeek: 0,
    aiSquads: createInitialAISquads(1),
  };
}

function simulateOneAIMatch(
  teams: LeagueTeamEntry[],
  homeId: string,
  awayId: string,
  seed: number,
): { homeGoals: number; awayGoals: number } {
  const home = teams.find((team) => team.id === homeId)!;
  const away = teams.find((team) => team.id === awayId)!;
  const rng = seededRng(seed);

  const homePower = 4 - home.tier;
  const awayPower = 4 - away.tier;
  const homeEdge = 0.55 + (homePower - awayPower) * 0.12;

  let homeGoals = Math.floor(rng() * 3);
  let awayGoals = Math.floor(rng() * 3);

  const roll = rng();

  if (roll < homeEdge - 0.15) {
    homeGoals += 1 + Math.floor(rng() * 2);
  } else if (roll > homeEdge + 0.15) {
    awayGoals += 1 + Math.floor(rng() * 2);
  }

  return {
    homeGoals: Math.min(homeGoals, 5),
    awayGoals: Math.min(awayGoals, 5),
  };
}

export function applyMatchResult(
  state: LeagueState,
  playerTeamId: string,
  opponentId: string,
  playerGoals: number,
  opponentGoals: number,
  seed: number,
): LeagueState {
  const teams = state.teams.map((team) => ({ ...team }));

  const updateTeam = (id: string, gf: number, ga: number) => {
    const team = teams.find((entry) => entry.id === id);
    if (!team) return;

    team.played += 1;
    team.goalsFor += gf;
    team.goalsAgainst += ga;

    if (gf > ga) team.won += 1;
    else if (gf === ga) team.drawn += 1;
    else team.lost += 1;
  };

  updateTeam(playerTeamId, playerGoals, opponentGoals);
  updateTeam(opponentId, opponentGoals, playerGoals);

  const schedule = state.schedule.map((match) =>
    match.opponentId === opponentId
      ? {
          ...match,
          played: true,
          playerGoals,
          opponentGoals,
        }
      : match,
  );

  const aiSchedule = state.aiSchedule ?? [];
  const aiMatchIndex = state.aiMatchIndex ?? 0;
  const batch = aiSchedule.slice(aiMatchIndex, aiMatchIndex + 4);

  const lastMatchdayResults: MatchdayResult[] = [];

  for (const [homeId, awayId] of batch) {
    const result = simulateOneAIMatch(
      teams,
      homeId,
      awayId,
      seed + homeId.length * 17 + awayId.length * 31 + aiMatchIndex,
    );

    updateTeam(homeId, result.homeGoals, result.awayGoals);
    updateTeam(awayId, result.awayGoals, result.homeGoals);

    lastMatchdayResults.push({
      homeId,
      awayId,
      homeName: teams.find((team) => team.id === homeId)?.name ?? homeId,
      awayName: teams.find((team) => team.id === awayId)?.name ?? awayId,
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
    });
  }

  return {
    ...state,
    teams,
    schedule,
    currentMatchIndex: state.currentMatchIndex + 1,
    aiMatchIndex: aiMatchIndex + batch.length,
    lastMatchdayResults,
  };
}

export function migrateLeague(state: LeagueState): LeagueState {
  const season = Math.max(1, Math.round(state.season ?? 1));
  const hasValidSchedule = state.aiSchedule && state.aiSchedule.length === 36;
  const aiMatchdays = hasValidSchedule
    ? null
    : buildRoundRobinMatchdays(
        AI_TEAMS.map((team) => team.id),
        state.currentMatchIndex + 999,
      );

  return {
    ...state,
    season,
    trainingWeek: Math.max(0, Math.round(state.trainingWeek ?? state.currentMatchIndex)),
    aiSchedule: hasValidSchedule ? state.aiSchedule : aiMatchdays!.flat(),
    aiMatchIndex: hasValidSchedule
      ? state.aiMatchIndex ?? Math.min(state.currentMatchIndex * 4, 36)
      : Math.min(state.currentMatchIndex * 4, 36),
    aiSquads: normalizeAISquads(state, season),
  };
}

export function getLeagueStandings(teams: LeagueTeamEntry[]): LeagueTeamEntry[] {
  return [...teams].sort((a, b) => {
    const pointsA = getTeamPoints(a);
    const pointsB = getTeamPoints(b);

    if (pointsB !== pointsA) return pointsB - pointsA;

    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;

    if (gdB !== gdA) return gdB - gdA;

    return b.goalsFor - a.goalsFor;
  });
}

export function getTeamPoints(team: LeagueTeamEntry): number {
  return team.won * 3 + team.drawn;
}

export function getAITeamDef(id: string): AITeamDef | undefined {
  return AI_TEAMS.find((team) => team.id === id);
}

export function getAITeamDefForLeague(
  state: LeagueState,
  id: string,
): AITeamDef | undefined {
  const base = getAITeamDef(id);
  if (!base) return undefined;

  const players = state.aiSquads?.[id];
  return players?.length ? { ...base, players } : base;
}

export interface AITrainingWeekOptions {
  playerOpponentId?: string;
  playerGoals?: number;
  opponentGoals?: number;
  includeLastMatchdayResults?: boolean;
}

function resultFromScore(goalsFor: number, goalsAgainst: number): MatchTrainingResult {
  if (goalsFor > goalsAgainst) return "win";
  if (goalsFor < goalsAgainst) return "loss";
  return "draw";
}

export function advanceAITrainingWeek(
  rawState: LeagueState,
  options: AITrainingWeekOptions = {},
): LeagueState {
  const state = migrateLeague(rawState);
  const season = state.season ?? 1;
  const week = (state.trainingWeek ?? 0) + 1;
  const squads = normalizeAISquads(state, season);

  const aiSquads = Object.fromEntries(
    AI_TEAMS.map((team) => {
      let result: MatchTrainingResult = "idle";

      if (team.id === options.playerOpponentId) {
        result = resultFromScore(
          options.opponentGoals ?? 0,
          options.playerGoals ?? 0,
        );
      } else if (options.includeLastMatchdayResults) {
        const match = state.lastMatchdayResults?.find(
          (item) => item.homeId === team.id || item.awayId === team.id,
        );

        if (match) {
          result = match.homeId === team.id
            ? resultFromScore(match.homeGoals, match.awayGoals)
            : resultFromScore(match.awayGoals, match.homeGoals);
        }
      }

      const intensity = team.tier === 1 ? "intense" : "balanced";
      const trained = advanceSquadTraining(
        squads[team.id] ?? team.players,
        { season, week, result, intensity },
        team.tacticId,
        true,
      );

      return [team.id, trained];
    }),
  );

  return {
    ...state,
    trainingWeek: week,
    aiSquads,
  };
}

export function prepareLeagueForNewSeason(
  previous: LeagueState,
  playerTeamId: string,
  playerTeamName: string,
): LeagueState {
  const migrated = migrateLeague(previous);
  const nextSeason = (migrated.season ?? 1) + 1;
  const fresh = createLeague(playerTeamId, playerTeamName);
  const previousSquads = normalizeAISquads(migrated, migrated.season ?? 1);

  return {
    ...fresh,
    season: nextSeason,
    trainingWeek: 0,
    aiSquads: ensureAITransferListings(
      Object.fromEntries(
        AI_TEAMS.map((team) => [
          team.id,
          prepareSquadForNewSeason(
            previousSquads[team.id] ?? team.players,
            nextSeason,
          ),
        ]),
      ),
      nextSeason,
    ),
  };
}

export function getAIFormationPositions(
  formationId: string,
): { col: number; row: number }[] {
  return getAIFormationById(formationId).positions.map((pos) => ({
    col: Math.floor(pos.x / TILE_W),
    row: Math.floor(pos.y / TILE_H),
  }));
}

function knockoutResult(
  teams: LeagueTeamEntry[],
  homeId: string,
  awayId: string,
  seed: number,
): { homeGoals: number; awayGoals: number } {
  const result = simulateOneAIMatch(teams, homeId, awayId, seed);

  if (result.homeGoals !== result.awayGoals) {
    return result;
  }

  const rng = seededRng(seed + 777);

  return rng() < 0.5
    ? { homeGoals: result.homeGoals + 1, awayGoals: result.awayGoals }
    : { homeGoals: result.homeGoals, awayGoals: result.awayGoals + 1 };
}

function resolveWinner(
  match: PlayoffMatch,
  homeGoals: number,
  awayGoals: number,
  seed: number,
  forcedWinnerId?: string,
  penalties?: { home: number; away: number },
): PlayoffMatch {
  let winnerId: string;

  if (forcedWinnerId === match.homeId || forcedWinnerId === match.awayId) {
    winnerId = forcedWinnerId;
  } else if (homeGoals > awayGoals) {
    winnerId = match.homeId;
  } else if (awayGoals > homeGoals) {
    winnerId = match.awayId;
  } else {
    winnerId = seededRng(seed + 222)() < 0.5 ? match.homeId : match.awayId;
  }

  return {
    ...match,
    homeGoals,
    awayGoals,
    penaltyHomeGoals: penalties?.home,
    penaltyAwayGoals: penalties?.away,
    winnerId,
  };
}

export function initPlayoff(state: LeagueState): LeagueState {
  const standings = getLeagueStandings(state.teams);
  const top4 = standings.slice(0, 4);

  const sf1: PlayoffMatch = {
    homeId: top4[0].id,
    awayId: top4[1].id,
    homeName: top4[0].name,
    awayName: top4[1].name,
  };

  const sf2: PlayoffMatch = {
    homeId: top4[2].id,
    awayId: top4[3].id,
    homeName: top4[2].name,
    awayName: top4[3].name,
  };

  const playoff: PlayoffBracket = {
    stage: "sf1",
    top4: top4.map((team) => team.id),
    sf1,
    sf2,
  };

  return {
    ...state,
    playoff,
  };
}

export function applyPlayoffResult(
  state: LeagueState,
  stage: "sf1" | "sf2" | "final",
  homeGoals: number,
  awayGoals: number,
  seed: number,
  forcedWinnerId?: string,
  penalties?: { home: number; away: number },
): LeagueState {
  if (!state.playoff) return state;

  const playoff: PlayoffBracket = {
    ...state.playoff,
    sf1: { ...state.playoff.sf1 },
    sf2: { ...state.playoff.sf2 },
    final: state.playoff.final ? { ...state.playoff.final } : undefined,
  };

  if (stage === "sf1") {
    playoff.sf1 = resolveWinner(playoff.sf1, homeGoals, awayGoals, seed, forcedWinnerId, penalties);
    playoff.stage = "sf2";
  }

  if (stage === "sf2") {
    playoff.sf2 = resolveWinner(playoff.sf2, homeGoals, awayGoals, seed, forcedWinnerId, penalties);

    const sf1WinnerId = playoff.sf1.winnerId!;
    const sf2WinnerId = playoff.sf2.winnerId!;

    playoff.final = {
      homeId: sf1WinnerId,
      awayId: sf2WinnerId,
      homeName:
        state.teams.find((team) => team.id === sf1WinnerId)?.name ??
        sf1WinnerId,
      awayName:
        state.teams.find((team) => team.id === sf2WinnerId)?.name ??
        sf2WinnerId,
    };

    playoff.stage = "final";
  }

  if (stage === "final" && playoff.final) {
    playoff.final = resolveWinner(playoff.final, homeGoals, awayGoals, seed, forcedWinnerId, penalties);
    playoff.champion = playoff.final.winnerId;
    playoff.championName =
      state.teams.find((team) => team.id === playoff.final?.winnerId)?.name ??
      playoff.final.winnerId;
    playoff.stage = "complete";
  }

  return {
    ...state,
    playoff,
  };
}

export function autoSimPlayoffStage(
  state: LeagueState,
  seed: number,
): LeagueState {
  const playoff = state.playoff;

  if (!playoff) return state;

  if (playoff.stage === "sf1") {
    const result = knockoutResult(
      state.teams,
      playoff.sf1.homeId,
      playoff.sf1.awayId,
      seed,
    );

    return applyPlayoffResult(
      state,
      "sf1",
      result.homeGoals,
      result.awayGoals,
      seed,
    );
  }

  if (playoff.stage === "sf2") {
    const result = knockoutResult(
      state.teams,
      playoff.sf2.homeId,
      playoff.sf2.awayId,
      seed + 111,
    );

    return applyPlayoffResult(
      state,
      "sf2",
      result.homeGoals,
      result.awayGoals,
      seed + 111,
    );
  }

  if (playoff.stage === "final" && playoff.final) {
    const result = knockoutResult(
      state.teams,
      playoff.final.homeId,
      playoff.final.awayId,
      seed + 222,
    );

    return applyPlayoffResult(
      state,
      "final",
      result.homeGoals,
      result.awayGoals,
      seed + 222,
    );
  }

  return state;
}

export function getPlayerPlayoffMatch(
  playoff: PlayoffBracket,
  playerTeamId: string,
): {
  stage: "sf1" | "sf2" | "final";
  match: PlayoffMatch;
  isHome: boolean;
} | null {
  const check = (
    stage: "sf1" | "sf2" | "final",
    match: PlayoffMatch | undefined,
  ) => {
    if (!match) return null;

    if (match.homeId === playerTeamId) {
      return {
        stage,
        match,
        isHome: true,
      };
    }

    if (match.awayId === playerTeamId) {
      return {
        stage,
        match,
        isHome: false,
      };
    }

    return null;
  };

  if (playoff.stage === "sf1") {
    return check("sf1", playoff.sf1);
  }

  if (playoff.stage === "sf2") {
    return check("sf2", playoff.sf2);
  }

  if (playoff.stage === "final") {
    return check("final", playoff.final);
  }

  return null;
}
