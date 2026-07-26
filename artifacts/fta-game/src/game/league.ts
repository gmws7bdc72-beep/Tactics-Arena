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
  KitStyle,
  SleeveStyle,
} from "../engine/types";
import { TILE_H, TILE_W } from "../engine/constants";
import { getAIFormationById } from "./formations";
import { deriveKitStyle, deriveSleeveStyle } from "./visuals";

export interface AITeamDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  formationId: string;
  players: PlayerCard[];
  jerseyColor: string;
  secondaryColor: string;
  kitStyle?: KitStyle;
  sleeveStyle?: SleeveStyle;
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
    luck: base.luck,
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
  luck: 6,
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
  luck: 5,
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
  luck: 6,
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
  luck: 6,
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
  luck: 6,
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
    kitStyle: deriveKitStyle(id),
    sleeveStyle: deriveSleeveStyle(id),
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
      player("rf_gk", "Pax Reed", "goalkeeper", 1, stats(GK, { luck: 8, longPassing: 8 }), "goalkeeper"),
      player("rf_d1", "Owen Root", "defender", 5, stats(DEF, { luck: 7, longPassing: 8 }), "iron_tackle"),
      player("rf_d2", "Jude Acres", "defender", 8, stats(DEF, { attack: 6, strength: 8, speed: 7 }), "powerhouse"),
      player("rf_f1", "Theo Grove", "forward", 6, stats(FWD, { passing: 8, vision: 8 }), "bullet_pass"),
      player("rf_f2", "Finn Rush", "forward", 9, stats(FWD, { speed: 9, luck: 8 }), "ghost_run"),
      player("rf_s1", "Cole Field", "striker", 10, stats(ST, { luck: 8, shooting: 9, aerial: 8 }), "eagle_eye"),
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
      player("ud_gk", "Remy Scraps", "goalkeeper", 1, stats(GK, { luck: 9 }), "goalkeeper"),
      player("ud_d1", "Gus Chain", "defender", 4, stats(DEF, { luck: 8, strength: 8 }), "iron_tackle"),
      player("ud_f1", "Zeke Dash", "forward", 7, stats(FWD, { speed: 10, dribbling: 9, luck: 8 }), "ghost_run"),
      player("ud_f2", "Taz Lucky", "forward", 11, stats(FWD, { speed: 10, luck: 10 }), "ghost_run"),
      player("ud_f3", "Nash Bite", "forward", 6, stats(FWD, { strength: 8, luck: 9 }), "powerhouse"),
      player("ud_s1", "Bo Chance", "striker", 9, stats(ST, { luck: 10, shooting: 8 }), "eagle_eye"),
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

export function createLeague(playerTeamId: string, playerTeamName: string): LeagueState {
  const seed = Date.now() % 999999;

  const teams: LeagueTeamEntry[] = [
    {
      id: playerTeamId,
      name: playerTeamName,
      tier: 2,
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
  if (state.aiSchedule && state.aiSchedule.length === 36) {
    return state;
  }

  const aiMatchdays = buildRoundRobinMatchdays(
    AI_TEAMS.map((team) => team.id),
    state.currentMatchIndex + 999,
  );

  return {
    ...state,
    aiSchedule: aiMatchdays.flat(),
    aiMatchIndex: Math.min(state.currentMatchIndex * 4, 36),
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
): PlayoffMatch {
  let winnerId: string;

  if (homeGoals > awayGoals) {
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
): LeagueState {
  if (!state.playoff) return state;

  const playoff: PlayoffBracket = {
    ...state.playoff,
    sf1: { ...state.playoff.sf1 },
    sf2: { ...state.playoff.sf2 },
    final: state.playoff.final ? { ...state.playoff.final } : undefined,
  };

  if (stage === "sf1") {
    playoff.sf1 = resolveWinner(playoff.sf1, homeGoals, awayGoals, seed);
    playoff.stage = "sf2";
  }

  if (stage === "sf2") {
    playoff.sf2 = resolveWinner(playoff.sf2, homeGoals, awayGoals, seed);

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
    playoff.final = resolveWinner(playoff.final, homeGoals, awayGoals, seed);
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
