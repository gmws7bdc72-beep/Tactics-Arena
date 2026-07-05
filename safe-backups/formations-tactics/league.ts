import type { PlayerCard, LeagueTeamEntry, LeagueState, ScheduledMatch, PlayoffMatch, PlayoffBracket, MatchdayResult, TeamTactic, TeamTacticId, PlayerStats } from "../engine/types";

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

const s = (stats: PlayerStats): PlayerStats => stats;

export const TEAM_TACTICS: Record<TeamTacticId, TeamTactic> = {
  slow_possession: {
    id: "slow_possession",
    name: "Slow Possession Progression",
    description: "Patient buildup, recycling passes, low-risk short combinations, and a deep rest defender.",
    tempo: 2,
    risk: 2,
    pressIntensity: 4,
    defensiveLine: 5,
    longBallFrequency: 1,
    restDefenseDepth: 5,
    progression: "slow",
  },
  balanced_build_up: {
    id: "balanced_build_up",
    name: "Balanced Build-Up",
    description: "Mixes short passing, controlled dribbles, and selective forward passes.",
    tempo: 5,
    risk: 5,
    pressIntensity: 5,
    defensiveLine: 6,
    longBallFrequency: 3,
    restDefenseDepth: 4,
    progression: "balanced",
  },
  direct_play: {
    id: "direct_play",
    name: "Direct Play",
    description: "Gets the ball forward early, looks for vertical passes, and uses long diagonals when space opens.",
    tempo: 7,
    risk: 6,
    pressIntensity: 5,
    defensiveLine: 6,
    longBallFrequency: 6,
    restDefenseDepth: 4,
    progression: "direct",
  },
  counter_press: {
    id: "counter_press",
    name: "Counter Press",
    description: "Aggressive high pressure after losing the ball, fast regain attempts, then quick vertical combinations.",
    tempo: 7,
    risk: 7,
    pressIntensity: 9,
    defensiveLine: 8,
    longBallFrequency: 4,
    restDefenseDepth: 4,
    progression: "direct",
  },
  low_block_counter: {
    id: "low_block_counter",
    name: "Low Block Counter",
    description: "Sits deep, protects the box, then launches direct counters into space.",
    tempo: 6,
    risk: 5,
    pressIntensity: 3,
    defensiveLine: 3,
    longBallFrequency: 7,
    restDefenseDepth: 6,
    progression: "counter",
  },
  quick_counterattack: {
    id: "quick_counterattack",
    name: "Quick Counterattack",
    description: "Fast break football: first look is forward, second look is a runner behind the line.",
    tempo: 9,
    risk: 8,
    pressIntensity: 6,
    defensiveLine: 5,
    longBallFrequency: 7,
    restDefenseDepth: 5,
    progression: "counter",
  },
  wide_crossing: {
    id: "wide_crossing",
    name: "Wide Crossing",
    description: "Moves the ball wide, hits diagonal aerial balls, and attacks the far post.",
    tempo: 6,
    risk: 6,
    pressIntensity: 5,
    defensiveLine: 5,
    longBallFrequency: 6,
    restDefenseDepth: 4,
    progression: "direct",
  },
  long_ball_target: {
    id: "long_ball_target",
    name: "Long-Ball Target Man",
    description: "Goalkeeper and defenders launch aerial balls toward a strong target forward.",
    tempo: 7,
    risk: 7,
    pressIntensity: 4,
    defensiveLine: 4,
    longBallFrequency: 9,
    restDefenseDepth: 6,
    progression: "direct",
  },
};

function player(
  id: string,
  name: string,
  role: PlayerCard["role"],
  jerseyNumber: number,
  stats: PlayerStats,
  ability: PlayerCard["ability"] = "none",
): PlayerCard {
  return { id, name, role, jerseyNumber, stats: s(stats), ability };
}

function mkTeam(
  id: string,
  name: string,
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
    tier: 1,
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
  mkTeam("fc_ironforge", "FC Ironforge", "#1a237e", "#ffcc00", "⚔️", "2-1-1", "low_block_counter", [
    player("ig_gk", "Bram Vale", "goalkeeper", 1, { attack: 2, defense: 9, passing: 6, speed: 4, luck: 7, shooting: 2, dribbling: 3, tackling: 5, marking: 9, stamina: 8, strength: 9, vision: 6, longPassing: 7, aerial: 9 }, "goalkeeper"),
    player("ig_cb1", "Otto Forge", "defender", 5, { attack: 3, defense: 10, passing: 5, speed: 5, luck: 5, shooting: 3, dribbling: 4, tackling: 10, marking: 10, stamina: 9, strength: 10, vision: 5, longPassing: 6, aerial: 10 }, "iron_tackle"),
    player("ig_cb2", "Kellan Pike", "defender", 4, { attack: 4, defense: 9, passing: 6, speed: 6, luck: 5, shooting: 3, dribbling: 5, tackling: 9, marking: 9, stamina: 8, strength: 9, vision: 6, longPassing: 7, aerial: 9 }, "shadow_mark"),
    player("ig_mid", "Rafe Anvil", "midfielder", 6, { attack: 6, defense: 8, passing: 7, speed: 6, luck: 6, shooting: 5, dribbling: 6, tackling: 8, marking: 8, stamina: 9, strength: 8, vision: 7, longPassing: 7, aerial: 7 }, "powerhouse"),
    player("ig_st", "Milo Hammer", "striker", 9, { attack: 8, defense: 4, passing: 5, speed: 7, luck: 6, shooting: 8, dribbling: 6, tackling: 4, marking: 5, stamina: 7, strength: 9, vision: 5, longPassing: 5, aerial: 9 }, "powerhouse"),
    player("ig_wb", "Tor Vale", "defender", 2, { attack: 5, defense: 8, passing: 6, speed: 7, luck: 5, shooting: 4, dribbling: 6, tackling: 8, marking: 8, stamina: 9, strength: 8, vision: 6, longPassing: 7, aerial: 7 }, "shadow_mark"),
  ]),

  mkTeam("the_vanguard", "The Vanguard", "#880e4f", "#ffffff", "🛡️", "2-1-1", "slow_possession", [
    player("tv_gk", "Soren Gate", "goalkeeper", 1, { attack: 3, defense: 9, passing: 8, speed: 4, luck: 7, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 8, strength: 8, vision: 8, longPassing: 7, aerial: 9 }, "goalkeeper"),
    player("tv_def1", "Leon Ward", "defender", 2, { attack: 4, defense: 9, passing: 8, speed: 6, luck: 6, shooting: 4, dribbling: 6, tackling: 9, marking: 9, stamina: 9, strength: 8, vision: 8, longPassing: 8, aerial: 8 }, "shadow_mark"),
    player("tv_def2", "Nico Barr", "defender", 3, { attack: 3, defense: 9, passing: 7, speed: 5, luck: 5, shooting: 3, dribbling: 5, tackling: 9, marking: 10, stamina: 8, strength: 9, vision: 7, longPassing: 7, aerial: 9 }, "iron_tackle"),
    player("tv_cm", "Ilan Tempo", "midfielder", 8, { attack: 7, defense: 7, passing: 10, speed: 6, luck: 8, shooting: 6, dribbling: 8, tackling: 7, marking: 7, stamina: 9, strength: 6, vision: 10, longPassing: 8, aerial: 5 }, "bullet_pass"),
    player("tv_fw", "Ezra Link", "forward", 10, { attack: 8, defense: 5, passing: 9, speed: 7, luck: 7, shooting: 8, dribbling: 7, tackling: 5, marking: 6, stamina: 8, strength: 6, vision: 9, longPassing: 7, aerial: 6 }, "eagle_eye"),
    player("tv_cm2", "Marek Calm", "midfielder", 14, { attack: 6, defense: 8, passing: 9, speed: 6, luck: 7, shooting: 5, dribbling: 7, tackling: 8, marking: 8, stamina: 9, strength: 7, vision: 9, longPassing: 8, aerial: 6 }, "bullet_pass"),
  ]),

  mkTeam("titanium_fc", "Titanium FC", "#37474f", "#eceff1", "⚡", "1-2-1", "balanced_build_up", [
    player("ti_gk", "Axel Prime", "goalkeeper", 1, { attack: 3, defense: 9, passing: 7, speed: 5, luck: 6, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 8, strength: 8, vision: 7, longPassing: 8, aerial: 9 }, "goalkeeper"),
    player("ti_def", "Dane Steel", "defender", 5, { attack: 4, defense: 9, passing: 7, speed: 6, luck: 5, shooting: 4, dribbling: 5, tackling: 9, marking: 9, stamina: 8, strength: 9, vision: 7, longPassing: 7, aerial: 8 }, "iron_tackle"),
    player("ti_cm1", "Orin Spark", "midfielder", 6, { attack: 7, defense: 7, passing: 8, speed: 8, luck: 7, shooting: 7, dribbling: 8, tackling: 7, marking: 7, stamina: 9, strength: 7, vision: 8, longPassing: 8, aerial: 6 }, "powerhouse"),
    player("ti_cm2", "Vik Pulse", "midfielder", 8, { attack: 7, defense: 6, passing: 9, speed: 7, luck: 8, shooting: 6, dribbling: 8, tackling: 6, marking: 7, stamina: 8, strength: 6, vision: 9, longPassing: 8, aerial: 5 }, "bullet_pass"),
    player("ti_st", "Jett Core", "striker", 9, { attack: 9, defense: 3, passing: 6, speed: 9, luck: 7, shooting: 9, dribbling: 8, tackling: 3, marking: 4, stamina: 8, strength: 8, vision: 7, longPassing: 6, aerial: 8 }, "ghost_run"),
    player("ti_fb", "Nolan Chrome", "defender", 2, { attack: 5, defense: 8, passing: 7, speed: 8, luck: 6, shooting: 4, dribbling: 7, tackling: 8, marking: 8, stamina: 9, strength: 8, vision: 7, longPassing: 8, aerial: 7 }, "shadow_mark"),
  ]),

  mkTeam("northern_wolves", "Northern Wolves", "#1b5e20", "#ffffff", "🐺", "1-1-2", "counter_press", [
    player("nw_gk", "Rune Frost", "goalkeeper", 1, { attack: 3, defense: 8, passing: 7, speed: 5, luck: 7, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 8, strength: 8, vision: 7, longPassing: 8, aerial: 8 }, "goalkeeper"),
    player("nw_def", "Hugo Fang", "defender", 4, { attack: 5, defense: 9, passing: 6, speed: 8, luck: 5, shooting: 4, dribbling: 6, tackling: 9, marking: 8, stamina: 10, strength: 8, vision: 6, longPassing: 7, aerial: 7 }, "shadow_mark"),
    player("nw_cm", "Koa Hunt", "midfielder", 6, { attack: 7, defense: 9, passing: 7, speed: 9, luck: 6, shooting: 6, dribbling: 7, tackling: 9, marking: 9, stamina: 10, strength: 7, vision: 7, longPassing: 7, aerial: 6 }, "iron_tackle"),
    player("nw_fw1", "Lars Howl", "forward", 11, { attack: 8, defense: 5, passing: 7, speed: 9, luck: 7, shooting: 8, dribbling: 8, tackling: 5, marking: 6, stamina: 9, strength: 7, vision: 7, longPassing: 6, aerial: 6 }, "ghost_run"),
    player("nw_fw2", "Mika Snow", "striker", 9, { attack: 9, defense: 4, passing: 6, speed: 9, luck: 7, shooting: 9, dribbling: 8, tackling: 4, marking: 5, stamina: 9, strength: 8, vision: 7, longPassing: 6, aerial: 8 }, "eagle_eye"),
    player("nw_wb", "Eli Storm", "midfielder", 12, { attack: 7, defense: 7, passing: 7, speed: 10, luck: 6, shooting: 6, dribbling: 8, tackling: 7, marking: 7, stamina: 10, strength: 7, vision: 7, longPassing: 7, aerial: 6 }, "ghost_run"),
  ]),

  mkTeam("silver_city", "Silver City", "#546e7a", "#cfd8dc", "🏙️", "1-2-1", "wide_crossing", [
    player("sc_gk", "Noah Quay", "goalkeeper", 1, { attack: 3, defense: 8, passing: 7, speed: 5, luck: 6, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 8, strength: 8, vision: 7, longPassing: 8, aerial: 8 }, "goalkeeper"),
    player("sc_def", "Arlo Pier", "defender", 3, { attack: 5, defense: 8, passing: 8, speed: 7, luck: 6, shooting: 4, dribbling: 6, tackling: 8, marking: 8, stamina: 8, strength: 7, vision: 8, longPassing: 9, aerial: 7 }, "bullet_pass"),
    player("sc_wm1", "Ciro Lane", "midfielder", 7, { attack: 7, defense: 6, passing: 8, speed: 9, luck: 7, shooting: 6, dribbling: 9, tackling: 6, marking: 6, stamina: 9, strength: 6, vision: 8, longPassing: 8, aerial: 5 }, "ghost_run"),
    player("sc_wm2", "Enzo Vale", "midfielder", 11, { attack: 7, defense: 6, passing: 9, speed: 8, luck: 7, shooting: 6, dribbling: 8, tackling: 6, marking: 6, stamina: 9, strength: 6, vision: 9, longPassing: 9, aerial: 5 }, "bullet_pass"),
    player("sc_st", "Tomas Spire", "striker", 9, { attack: 9, defense: 3, passing: 6, speed: 7, luck: 7, shooting: 9, dribbling: 7, tackling: 3, marking: 4, stamina: 8, strength: 9, vision: 6, longPassing: 6, aerial: 10 }, "powerhouse"),
    player("sc_wb", "Mateo Shore", "forward", 14, { attack: 8, defense: 5, passing: 8, speed: 9, luck: 7, shooting: 7, dribbling: 9, tackling: 5, marking: 5, stamina: 9, strength: 6, vision: 8, longPassing: 8, aerial: 5 }, "ghost_run"),
  ]),

  mkTeam("river_phoenix", "River Phoenix", "#bf360c", "#ffccbc", "🔥", "1-1-2", "quick_counterattack", [
    player("rp_gk", "Ash Calder", "goalkeeper", 1, { attack: 4, defense: 8, passing: 7, speed: 5, luck: 7, shooting: 2, dribbling: 4, tackling: 5, marking: 7, stamina: 8, strength: 8, vision: 7, longPassing: 9, aerial: 8 }, "goalkeeper"),
    player("rp_def", "Bryn Ember", "defender", 4, { attack: 5, defense: 8, passing: 7, speed: 8, luck: 5, shooting: 4, dribbling: 6, tackling: 8, marking: 8, stamina: 9, strength: 8, vision: 7, longPassing: 8, aerial: 7 }, "shadow_mark"),
    player("rp_mid", "Kai Flash", "midfielder", 8, { attack: 8, defense: 6, passing: 8, speed: 9, luck: 7, shooting: 7, dribbling: 8, tackling: 6, marking: 6, stamina: 9, strength: 7, vision: 8, longPassing: 8, aerial: 6 }, "ghost_run"),
    player("rp_fw", "Rian Flare", "forward", 7, { attack: 9, defense: 4, passing: 7, speed: 10, luck: 7, shooting: 8, dribbling: 9, tackling: 4, marking: 5, stamina: 9, strength: 7, vision: 7, longPassing: 7, aerial: 6 }, "ghost_run"),
    player("rp_st", "Sol Blaze", "striker", 9, { attack: 10, defense: 3, passing: 6, speed: 9, luck: 8, shooting: 10, dribbling: 8, tackling: 3, marking: 4, stamina: 8, strength: 8, vision: 7, longPassing: 6, aerial: 8 }, "eagle_eye"),
    player("rp_wing", "Nico Cinder", "forward", 11, { attack: 8, defense: 4, passing: 7, speed: 10, luck: 7, shooting: 8, dribbling: 9, tackling: 4, marking: 5, stamina: 9, strength: 6, vision: 7, longPassing: 7, aerial: 5 }, "ghost_run"),
  ]),

  mkTeam("rooksville_fc", "Rooksville FC", "#f57f17", "#ffffff", "🌱", "1-2-1", "direct_play", [
    player("rf_gk", "Pax Reed", "goalkeeper", 1, { attack: 3, defense: 8, passing: 6, speed: 4, luck: 8, shooting: 2, dribbling: 4, tackling: 5, marking: 7, stamina: 8, strength: 8, vision: 6, longPassing: 8, aerial: 8 }, "goalkeeper"),
    player("rf_def", "Owen Root", "defender", 5, { attack: 4, defense: 8, passing: 7, speed: 6, luck: 7, shooting: 4, dribbling: 5, tackling: 8, marking: 8, stamina: 9, strength: 8, vision: 7, longPassing: 8, aerial: 8 }, "iron_tackle"),
    player("rf_mid1", "Theo Grove", "midfielder", 6, { attack: 7, defense: 7, passing: 8, speed: 7, luck: 7, shooting: 6, dribbling: 7, tackling: 7, marking: 7, stamina: 9, strength: 7, vision: 8, longPassing: 8, aerial: 6 }, "bullet_pass"),
    player("rf_mid2", "Jude Acres", "midfielder", 8, { attack: 7, defense: 6, passing: 7, speed: 8, luck: 8, shooting: 7, dribbling: 8, tackling: 6, marking: 6, stamina: 8, strength: 7, vision: 7, longPassing: 7, aerial: 6 }, "powerhouse"),
    player("rf_fw", "Finn Rush", "forward", 9, { attack: 8, defense: 4, passing: 6, speed: 9, luck: 8, shooting: 8, dribbling: 8, tackling: 4, marking: 5, stamina: 8, strength: 7, vision: 7, longPassing: 6, aerial: 7 }, "ghost_run"),
    player("rf_st", "Cole Field", "striker", 10, { attack: 8, defense: 4, passing: 6, speed: 8, luck: 8, shooting: 9, dribbling: 7, tackling: 4, marking: 5, stamina: 8, strength: 8, vision: 6, longPassing: 6, aerial: 8 }, "eagle_eye"),
  ]),

  mkTeam("the_underdogs", "The Underdogs", "#6a1b9a", "#e1bee7", "🐕", "1-1-2", "quick_counterattack", [
    player("ud_gk", "Remy Scraps", "goalkeeper", 1, { attack: 3, defense: 8, passing: 6, speed: 5, luck: 9, shooting: 2, dribbling: 4, tackling: 5, marking: 7, stamina: 8, strength: 7, vision: 6, longPassing: 7, aerial: 8 }, "goalkeeper"),
    player("ud_def", "Gus Chain", "defender", 4, { attack: 4, defense: 8, passing: 5, speed: 7, luck: 8, shooting: 4, dribbling: 5, tackling: 8, marking: 8, stamina: 9, strength: 8, vision: 5, longPassing: 6, aerial: 8 }, "iron_tackle"),
    player("ud_mid", "Nash Bite", "midfielder", 6, { attack: 7, defense: 6, passing: 7, speed: 8, luck: 9, shooting: 6, dribbling: 8, tackling: 6, marking: 6, stamina: 9, strength: 7, vision: 7, longPassing: 7, aerial: 6 }, "powerhouse"),
    player("ud_fw1", "Zeke Dash", "forward", 7, { attack: 8, defense: 3, passing: 6, speed: 10, luck: 8, shooting: 8, dribbling: 9, tackling: 3, marking: 4, stamina: 8, strength: 6, vision: 6, longPassing: 6, aerial: 5 }, "ghost_run"),
    player("ud_fw2", "Bo Chance", "striker", 9, { attack: 8, defense: 3, passing: 5, speed: 8, luck: 10, shooting: 8, dribbling: 7, tackling: 3, marking: 4, stamina: 8, strength: 8, vision: 6, longPassing: 5, aerial: 8 }, "eagle_eye"),
    player("ud_wing", "Taz Lucky", "forward", 11, { attack: 8, defense: 3, passing: 6, speed: 10, luck: 10, shooting: 7, dribbling: 9, tackling: 3, marking: 4, stamina: 8, strength: 6, vision: 6, longPassing: 6, aerial: 5 }, "ghost_run"),
  ]),

  mkTeam("coastal_fc", "Coastal FC", "#006064", "#b2ebf2", "🌊", "2-1-1", "long_ball_target", [
    player("cf_gk", "Marin Deep", "goalkeeper", 1, { attack: 4, defense: 8, passing: 8, speed: 5, luck: 6, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 8, strength: 8, vision: 8, longPassing: 10, aerial: 9 }, "goalkeeper"),
    player("cf_cb1", "Cruz Tide", "defender", 5, { attack: 4, defense: 9, passing: 7, speed: 6, luck: 6, shooting: 4, dribbling: 5, tackling: 9, marking: 9, stamina: 8, strength: 9, vision: 7, longPassing: 9, aerial: 9 }, "bullet_pass"),
    player("cf_cb2", "Ivo Rock", "defender", 3, { attack: 3, defense: 9, passing: 6, speed: 5, luck: 5, shooting: 3, dribbling: 4, tackling: 9, marking: 9, stamina: 8, strength: 10, vision: 6, longPassing: 8, aerial: 10 }, "iron_tackle"),
    player("cf_mid", "Luca Harbor", "midfielder", 8, { attack: 7, defense: 7, passing: 8, speed: 7, luck: 7, shooting: 6, dribbling: 7, tackling: 7, marking: 7, stamina: 8, strength: 7, vision: 8, longPassing: 9, aerial: 6 }, "bullet_pass"),
    player("cf_st", "Atlas Bay", "striker", 9, { attack: 9, defense: 4, passing: 5, speed: 7, luck: 7, shooting: 9, dribbling: 6, tackling: 4, marking: 5, stamina: 8, strength: 10, vision: 6, longPassing: 5, aerial: 10 }, "powerhouse"),
    player("cf_wing", "Sami Break", "forward", 11, { attack: 8, defense: 4, passing: 7, speed: 8, luck: 6, shooting: 8, dribbling: 8, tackling: 4, marking: 5, stamina: 8, strength: 7, vision: 7, longPassing: 7, aerial: 7 }, "ghost_run"),
  ]),
];

/**
 * Build a round-robin schedule for an ODD number of teams using the circle/polygon method.
 * With N teams (N odd) there are N rounds, each with (N-1)/2 matches.
 * One team has a bye each round; every pair of teams meets exactly once.
 * Returns an array of rounds; each round is an array of [homeId, awayId] pairs.
 */
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
  const n = ids.length; // must be odd (9)
  const orderedIds = shuffle(ids, seed);
  // Fix a "dummy" (null) at slot 0; rotate the n real teams.
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n; r++) {
    const round: [string, string][] = [];
    // Build the 10-slot circle: slot 0 = null, slots 1..n = rotated ids
    const slots: (string | null)[] = [null];
    for (let i = 0; i < n; i++) {
      slots.push(orderedIds[(r + i) % n]);
    }
    // Pair slot i with slot (n - i) for i = 0 .. floor(n/2)
    for (let i = 0; i <= Math.floor(n / 2); i++) {
      const a = slots[i];
      const b = slots[n - i];
      if (a !== null && b !== null) {
        round.push([a, b]);
      }
    }
    rounds.push(round);
  }
  return rounds;
}

export function createLeague(playerTeamId: string, playerTeamName: string): LeagueState {
  const seed = Date.now() % 999999;
  const scheduleSeed = seed ^ 0x5f3759df;
  const teams: LeagueTeamEntry[] = [
    { id: playerTeamId, name: playerTeamName, tier: 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ...AI_TEAMS.map(t => ({ id: t.id, name: t.name, tier: t.tier, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 })),
  ];

  const aiOrder = shuffle(AI_TEAMS.map(t => t.id), scheduleSeed);
  const schedule: ScheduledMatch[] = aiOrder.map((id, idx) => {
    const team = AI_TEAMS.find(t => t.id === id)!;
    return { opponentId: id, opponentName: team.name, played: false, playerGoals: 0, opponentGoals: 0, isHome: idx % 2 === 0 };
  });

  // Build a proper round-robin schedule for the 9 AI teams.
  // 9 rounds (one per player matchday), 4 games per round.
  // Each AI team plays exactly once per round (no team gets 2 games in one matchday).
  const aiIds = AI_TEAMS.map(t => t.id);
  const matchdays = buildRoundRobinMatchdays(aiIds, seed);

  // Flatten into [round0_pair0, round0_pair1, ..., round8_pair3] — 36 pairs total.
  // applyMatchResult slices 4 at a time, so each slice is exactly one round.
  const aiSchedule: [string, string][] = matchdays.flat();

  return { teams, schedule, currentMatchIndex: 0, aiSchedule, aiMatchIndex: 0 };
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function simulateOneAIMatch(
  teams: LeagueTeamEntry[],
  homeId: string,
  awayId: string,
  seed: number
): { homeGoals: number; awayGoals: number } {
  const home = teams.find(t => t.id === homeId)!;
  const away = teams.find(t => t.id === awayId)!;
  const rng = seededRng(seed);

  const WIN_ODDS: Record<number, Record<number, number>> = {
    1: { 1: 0.5, 2: 0.72, 3: 0.88 },
    2: { 1: 0.28, 2: 0.5, 3: 0.70 },
    3: { 1: 0.12, 2: 0.30, 3: 0.5 },
  };

  const homeWinChance = WIN_ODDS[home.tier][away.tier] ?? 0.5;
  const r = rng();
  let homeGoals = 0;
  let awayGoals = 0;

  if (r < homeWinChance * 0.85) {
    homeGoals = 3;
    awayGoals = Math.floor(rng() * 3);
  } else if (r < homeWinChance * 0.85 + 0.12) {
    homeGoals = Math.floor(rng() * 3);
    awayGoals = homeGoals;
  } else {
    awayGoals = 3;
    homeGoals = Math.floor(rng() * 3);
  }

  return { homeGoals, awayGoals };
}

export function applyMatchResult(
  state: LeagueState,
  playerTeamId: string,
  opponentId: string,
  playerGoals: number,
  opponentGoals: number,
  seed: number
): LeagueState {
  const teams = state.teams.map(t => ({ ...t }));

  const updateTeam = (id: string, gf: number, ga: number) => {
    const t = teams.find(x => x.id === id)!;
    t.played++;
    t.goalsFor += gf;
    t.goalsAgainst += ga;
    if (gf > ga) t.won++;
    else if (gf === ga) t.drawn++;
    else t.lost++;
  };

  updateTeam(playerTeamId, playerGoals, opponentGoals);
  updateTeam(opponentId, opponentGoals, playerGoals);

  const schedule = state.schedule.map(m =>
    m.opponentId === opponentId
      ? { ...m, played: true, playerGoals, opponentGoals }
      : m
  );

  // Process the next 4 pre-computed AI-vs-AI pairs from the schedule.
  // Using a pre-computed schedule guarantees each pair plays exactly once.
  const aiSchedule = state.aiSchedule ?? [];
  const aiMatchIndex = state.aiMatchIndex ?? 0;
  const batch = aiSchedule.slice(aiMatchIndex, aiMatchIndex + 4);
  const lastMatchdayResults: MatchdayResult[] = [];
  for (const [a, b] of batch) {
    const { homeGoals: hg, awayGoals: ag } = simulateOneAIMatch(teams, a, b, seed + a.length + b.length + aiMatchIndex);
    updateTeam(a, hg, ag);
    updateTeam(b, ag, hg);
    const homeName = teams.find(t => t.id === a)?.name ?? a;
    const awayName = teams.find(t => t.id === b)?.name ?? b;
    lastMatchdayResults.push({ homeId: a, awayId: b, homeName, awayName, homeGoals: hg, awayGoals: ag });
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

/**
 * Migrates a league saved before the round-robin aiSchedule was introduced.
 * Rebuilds the proper matchday schedule and estimates progress from currentMatchIndex.
 */
export function migrateLeague(state: LeagueState): LeagueState {
  // Already has a valid round-robin schedule (36 pairs, no team doubled per round)
  if (state.aiSchedule && state.aiSchedule.length === 36) return state;

  const aiIds = AI_TEAMS.map(t => t.id);
  const matchdays = buildRoundRobinMatchdays(aiIds, (state.aiMatchIndex ?? 0) + state.currentMatchIndex + 1);
  const aiSchedule: [string, string][] = matchdays.flat();

  const estimatedDone = Math.min((state.aiMatchIndex ?? state.currentMatchIndex * 4), aiSchedule.length);
  return { ...state, aiSchedule, aiMatchIndex: estimatedDone };
}

export function getLeagueStandings(teams: LeagueTeamEntry[]): LeagueTeamEntry[] {
  return [...teams].sort((a, b) => {
    const apts = a.won * 3 + a.drawn;
    const bpts = b.won * 3 + b.drawn;
    if (bpts !== apts) return bpts - apts;
    const agd = a.goalsFor - a.goalsAgainst;
    const bgd = b.goalsFor - b.goalsAgainst;
    if (bgd !== agd) return bgd - agd;
    return b.goalsFor - a.goalsFor;
  });
}

export function getTeamPoints(t: LeagueTeamEntry): number {
  return t.won * 3 + t.drawn;
}

export function getAITeamDef(id: string): AITeamDef | undefined {
  return AI_TEAMS.find(t => t.id === id);
}

// Starting positions on the grid for AI team (attacking left, GK at col 15, own half = cols 8-15)
export function getAIFormationPositions(formationId: string): { col: number; row: number }[] {
  switch (formationId) {
    case "1-1-2":
      return [
        { col: 15, row: 4 },
        { col: 12, row: 4 },
        { col: 10, row: 4 },
        { col: 8,  row: 2 },
        { col: 8,  row: 6 },
      ];
    case "2-1-1":
      return [
        { col: 15, row: 4 },
        { col: 12, row: 2 },
        { col: 12, row: 6 },
        { col: 10, row: 4 },
        { col: 8,  row: 4 },
      ];
    case "1-2-1":
    default:
      return [
        { col: 15, row: 4 },
        { col: 12, row: 4 },
        { col: 10, row: 2 },
        { col: 10, row: 6 },
        { col: 8,  row: 4 },
      ];
  }
}

// ─── Playoff ─────────────────────────────────────────────────────────────────

function knockoutResult(
  teams: LeagueTeamEntry[],
  homeId: string,
  awayId: string,
  seed: number
): { homeGoals: number; awayGoals: number } {
  const result = simulateOneAIMatch(teams, homeId, awayId, seed);
  if (result.homeGoals !== result.awayGoals) return result;
  const rng = seededRng(seed + 98765);
  return rng() < 0.5
    ? { homeGoals: result.homeGoals + 1, awayGoals: result.awayGoals }
    : { homeGoals: result.homeGoals, awayGoals: result.awayGoals + 1 };
}

function resolveWinner(
  match: PlayoffMatch,
  homeGoals: number,
  awayGoals: number,
  seed: number
): PlayoffMatch {
  let winnerId: string;
  if (homeGoals > awayGoals) winnerId = match.homeId;
  else if (awayGoals > homeGoals) winnerId = match.awayId;
  else {
    const rng = seededRng(seed + 11111);
    winnerId = rng() < 0.5 ? match.homeId : match.awayId;
  }
  return { ...match, homeGoals, awayGoals, winnerId };
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
    top4: top4.map(t => t.id),
    sf1,
    sf2,
  };

  return { ...state, playoff };
}

export function applyPlayoffResult(
  state: LeagueState,
  stage: "sf1" | "sf2" | "final",
  homeGoals: number,
  awayGoals: number,
  seed: number
): LeagueState {
  const po = state.playoff!;
  let updated: PlayoffBracket = { ...po, sf1: { ...po.sf1 }, sf2: { ...po.sf2 } };

  if (stage === "sf1") {
    updated.sf1 = resolveWinner(po.sf1, homeGoals, awayGoals, seed);
    updated.stage = "sf2";
  } else if (stage === "sf2") {
    updated.sf2 = resolveWinner(po.sf2, homeGoals, awayGoals, seed);
    const sf1WinnerId = updated.sf1.winnerId!;
    const sf2WinnerId = updated.sf2.winnerId!;
    const sf1WinnerName = state.teams.find(t => t.id === sf1WinnerId)?.name ?? sf1WinnerId;
    const sf2WinnerName = state.teams.find(t => t.id === sf2WinnerId)?.name ?? sf2WinnerId;
    updated.final = {
      homeId: sf1WinnerId,
      awayId: sf2WinnerId,
      homeName: sf1WinnerName,
      awayName: sf2WinnerName,
    };
    updated.stage = "final";
  } else if (stage === "final") {
    const fin = resolveWinner(po.final!, homeGoals, awayGoals, seed);
    updated.final = fin;
    updated.champion = fin.winnerId;
    updated.championName = state.teams.find(t => t.id === fin.winnerId)?.name ?? fin.winnerId;
    updated.stage = "complete";
  }

  return { ...state, playoff: updated };
}

export function autoSimPlayoffStage(state: LeagueState, seed: number): LeagueState {
  const po = state.playoff!;
  if (po.stage === "sf1") {
    const { homeGoals, awayGoals } = knockoutResult(state.teams, po.sf1.homeId, po.sf1.awayId, seed);
    return applyPlayoffResult(state, "sf1", homeGoals, awayGoals, seed);
  }
  if (po.stage === "sf2") {
    const { homeGoals, awayGoals } = knockoutResult(state.teams, po.sf2.homeId, po.sf2.awayId, seed + 111);
    return applyPlayoffResult(state, "sf2", homeGoals, awayGoals, seed + 111);
  }
  if (po.stage === "final" && po.final) {
    const { homeGoals, awayGoals } = knockoutResult(state.teams, po.final.homeId, po.final.awayId, seed + 222);
    return applyPlayoffResult(state, "final", homeGoals, awayGoals, seed + 222);
  }
  return state;
}

export function getPlayerPlayoffMatch(
  po: PlayoffBracket,
  playerTeamId: string
): { stage: "sf1" | "sf2" | "final"; match: PlayoffMatch; isHome: boolean } | null {
  const check = (stage: "sf1" | "sf2" | "final", match: PlayoffMatch | undefined) => {
    if (!match) return null;
    if (match.homeId === playerTeamId) return { stage, match, isHome: true };
    if (match.awayId === playerTeamId) return { stage, match, isHome: false };
    return null;
  };
  if (po.stage === "sf1") return check("sf1", po.sf1);
  if (po.stage === "sf2") return check("sf2", po.sf2);
  if (po.stage === "final") return check("final", po.final);
  return null;
}
