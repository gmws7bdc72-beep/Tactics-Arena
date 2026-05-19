import type { PlayerCard, LeagueTeamEntry, LeagueState, ScheduledMatch, PlayoffMatch, PlayoffBracket, MatchdayResult } from "../engine/types";
import { tileToPos } from "../engine/grid";

export interface AITeamDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  formationId: string;
  players: PlayerCard[];
  jerseyColor: string;
  secondaryColor: string;
  crestIcon: string;
}

// Uniform tier-1 template used by every AI team — everyone plays at max level.
const TIER1_TEMPLATE = {
  formationId: "1-2-1",
  players: [
    { name: "GK",   role: "goalkeeper" as const, stats: { attack: 3, defense: 9,  passing: 6, speed: 4, luck: 6 }, ability: "goalkeeper" as const,  jerseyNumber: 1 },
    { name: "DEF",  role: "defender" as const,   stats: { attack: 5, defense: 9,  passing: 6, speed: 7, luck: 6 }, ability: "iron_tackle" as const, jerseyNumber: 5 },
    { name: "MID1", role: "midfielder" as const, stats: { attack: 7, defense: 7,  passing: 8, speed: 7, luck: 7 }, ability: "eagle_eye" as const,   jerseyNumber: 8 },
    { name: "MID2", role: "midfielder" as const, stats: { attack: 7, defense: 7,  passing: 8, speed: 7, luck: 7 }, ability: "bullet_pass" as const, jerseyNumber: 6 },
    { name: "FWD",  role: "striker" as const,    stats: { attack: 10, defense: 3, passing: 5, speed: 9, luck: 8 }, ability: "ghost_run" as const,   jerseyNumber: 9 },
  ],
};

function mkTeam(
  id: string,
  name: string,
  jerseyColor: string,
  secondaryColor: string,
  crestIcon: string,
  prefix: string
): AITeamDef {
  return {
    id,
    name,
    tier: 1,
    formationId: TIER1_TEMPLATE.formationId,
    jerseyColor,
    secondaryColor,
    crestIcon,
    players: TIER1_TEMPLATE.players.map((p, i) => ({
      ...p,
      id: `${prefix}${i + 1}`,
      name: `${p.name}${i + 1}`,
    })),
  };
}

export const AI_TEAMS: AITeamDef[] = [
  mkTeam("fc_ironforge",   "FC Ironforge",    "#1a237e", "#ffcc00",  "⚔️", "ig"),
  mkTeam("the_vanguard",     "The Vanguard",    "#880e4f", "#ffffff",  "🛡️", "tv"),
  mkTeam("titanium_fc",      "Titanium FC",     "#37474f", "#eceff1",  "⚡", "ti"),
  mkTeam("northern_wolves",  "Northern Wolves", "#1b5e20", "#ffffff",  "🐺", "nw"),
  mkTeam("silver_city",      "Silver City",     "#546e7a", "#cfd8dc",  "🏙️", "sc"),
  mkTeam("river_phoenix",    "River Phoenix",   "#bf360c", "#ffccbc",  "🔥", "rp"),
  mkTeam("rooksville_fc",    "Rooksville FC",   "#f57f17", "#ffffff",  "🌱", "rf"),
  mkTeam("the_underdogs",    "The Underdogs",   "#6a1b9a", "#e1bee7",  "🐕", "ud"),
  mkTeam("coastal_fc",       "Coastal FC",      "#006064", "#b2ebf2",  "🌊", "cf"),
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
