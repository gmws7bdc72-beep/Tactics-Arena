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

export const AI_TEAMS: AITeamDef[] = [
  // Tier 1 — Elite
  {
    id: "fc_ironforge",
    name: "FC Ironforge",
    tier: 1,
    formationId: "1-1-2",
    jerseyColor: "#1a237e",
    secondaryColor: "#ffcc00",
    crestIcon: "⚔️",
    players: [
      { id: "ig1", name: "Voss",  role: "goalkeeper", stats: { attack: 3, defense: 9,  passing: 6, speed: 4, luck: 6 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "ig2", name: "Stark", role: "defender",   stats: { attack: 5, defense: 9,  passing: 5, speed: 7, luck: 6 }, ability: "iron_tackle", jerseyNumber: 5 },
      { id: "ig3", name: "Helm",  role: "midfielder", stats: { attack: 7, defense: 7,  passing: 8, speed: 7, luck: 7 }, ability: "eagle_eye",   jerseyNumber: 8 },
      { id: "ig4", name: "Blaze", role: "forward",    stats: { attack: 9, defense: 4,  passing: 6, speed: 9, luck: 7 }, ability: "ghost_run",   jerseyNumber: 10 },
      { id: "ig5", name: "Forge", role: "striker",    stats: { attack: 10, defense: 3, passing: 5, speed: 8, luck: 8 }, ability: "powerhouse",  jerseyNumber: 9 },
    ],
  },
  {
    id: "the_vanguard",
    name: "The Vanguard",
    tier: 1,
    formationId: "1-1-2",
    jerseyColor: "#880e4f",
    secondaryColor: "#ffffff",
    crestIcon: "🛡️",
    players: [
      { id: "tv1", name: "Ward",  role: "goalkeeper", stats: { attack: 2, defense: 9,  passing: 5, speed: 4, luck: 7 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "tv2", name: "Crest", role: "defender",   stats: { attack: 5, defense: 8,  passing: 6, speed: 7, luck: 6 }, ability: "shadow_mark", jerseyNumber: 4 },
      { id: "tv3", name: "Edge",  role: "midfielder", stats: { attack: 8, defense: 6,  passing: 8, speed: 8, luck: 7 }, ability: "bullet_pass", jerseyNumber: 6 },
      { id: "tv4", name: "Fang",  role: "forward",    stats: { attack: 9, defense: 4,  passing: 7, speed: 9, luck: 8 }, ability: "eagle_eye",   jerseyNumber: 11 },
      { id: "tv5", name: "Rush",  role: "striker",    stats: { attack: 10, defense: 3, passing: 5, speed: 10, luck: 7 }, ability: "ghost_run",  jerseyNumber: 9 },
    ],
  },
  {
    id: "titanium_fc",
    name: "Titanium FC",
    tier: 1,
    formationId: "1-1-2",
    jerseyColor: "#37474f",
    secondaryColor: "#eceff1",
    crestIcon: "⚡",
    players: [
      { id: "ti1", name: "Stone", role: "goalkeeper", stats: { attack: 3, defense: 10, passing: 5, speed: 4, luck: 6 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "ti2", name: "Grip",  role: "defender",   stats: { attack: 4, defense: 9,  passing: 5, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 3 },
      { id: "ti3", name: "Pulse", role: "midfielder", stats: { attack: 8, defense: 7,  passing: 8, speed: 8, luck: 8 }, ability: "eagle_eye",   jerseyNumber: 7 },
      { id: "ti4", name: "Apex",  role: "forward",    stats: { attack: 9, defense: 5,  passing: 7, speed: 8, luck: 7 }, ability: "powerhouse",  jerseyNumber: 10 },
      { id: "ti5", name: "Volt",  role: "striker",    stats: { attack: 10, defense: 3, passing: 5, speed: 10, luck: 9 }, ability: "ghost_run",  jerseyNumber: 9 },
    ],
  },

  // Tier 2 — Mid
  {
    id: "northern_wolves",
    name: "Northern Wolves",
    tier: 2,
    formationId: "2-1-1",
    jerseyColor: "#1b5e20",
    secondaryColor: "#ffffff",
    crestIcon: "🐺",
    players: [
      { id: "nw1", name: "Pack",  role: "goalkeeper", stats: { attack: 3, defense: 7, passing: 5, speed: 4, luck: 5 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "nw2", name: "Claw",  role: "defender",   stats: { attack: 4, defense: 7, passing: 5, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 5 },
      { id: "nw3", name: "Hunt",  role: "defender",   stats: { attack: 4, defense: 7, passing: 5, speed: 6, luck: 5 }, ability: "shadow_mark", jerseyNumber: 4 },
      { id: "nw4", name: "Trail", role: "midfielder", stats: { attack: 6, defense: 5, passing: 7, speed: 7, luck: 6 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "nw5", name: "Howl",  role: "striker",    stats: { attack: 8, defense: 3, passing: 5, speed: 7, luck: 6 }, ability: "powerhouse",  jerseyNumber: 9 },
    ],
  },
  {
    id: "silver_city",
    name: "Silver City",
    tier: 2,
    formationId: "1-2-1",
    jerseyColor: "#546e7a",
    secondaryColor: "#cfd8dc",
    crestIcon: "🏙️",
    players: [
      { id: "sc1", name: "Gates", role: "goalkeeper", stats: { attack: 2, defense: 7, passing: 5, speed: 4, luck: 6 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "sc2", name: "Lane",  role: "defender",   stats: { attack: 3, defense: 7, passing: 5, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 2 },
      { id: "sc3", name: "Cross", role: "midfielder", stats: { attack: 6, defense: 5, passing: 7, speed: 7, luck: 6 }, ability: "bullet_pass", jerseyNumber: 7 },
      { id: "sc4", name: "Urban", role: "midfielder", stats: { attack: 5, defense: 6, passing: 6, speed: 6, luck: 5 }, ability: "eagle_eye",   jerseyNumber: 10 },
      { id: "sc5", name: "Metro", role: "striker",    stats: { attack: 7, defense: 3, passing: 5, speed: 7, luck: 6 }, ability: "ghost_run",   jerseyNumber: 9 },
    ],
  },
  {
    id: "river_phoenix",
    name: "River Phoenix",
    tier: 2,
    formationId: "2-1-1",
    jerseyColor: "#bf360c",
    secondaryColor: "#ffccbc",
    crestIcon: "🔥",
    players: [
      { id: "rp1", name: "Banks",   role: "goalkeeper", stats: { attack: 3, defense: 7, passing: 5, speed: 4, luck: 5 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "rp2", name: "Reed",    role: "defender",   stats: { attack: 4, defense: 7, passing: 5, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 3 },
      { id: "rp3", name: "Flow",    role: "defender",   stats: { attack: 3, defense: 6, passing: 5, speed: 5, luck: 6 }, ability: "shadow_mark", jerseyNumber: 6 },
      { id: "rp4", name: "Current", role: "midfielder", stats: { attack: 6, defense: 5, passing: 7, speed: 7, luck: 5 }, ability: "eagle_eye",   jerseyNumber: 8 },
      { id: "rp5", name: "Surge",   role: "striker",    stats: { attack: 8, defense: 3, passing: 5, speed: 7, luck: 6 }, ability: "powerhouse",  jerseyNumber: 9 },
    ],
  },

  // Tier 3 — Easy
  {
    id: "rooksville_fc",
    name: "Rooksville FC",
    tier: 3,
    formationId: "2-1-1",
    jerseyColor: "#f57f17",
    secondaryColor: "#ffffff",
    crestIcon: "🌱",
    players: [
      { id: "rf1", name: "Rook",   role: "goalkeeper", stats: { attack: 2, defense: 5, passing: 3, speed: 3, luck: 5 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "rf2", name: "Pawn",   role: "defender",   stats: { attack: 3, defense: 5, passing: 3, speed: 4, luck: 4 }, ability: "iron_tackle", jerseyNumber: 5 },
      { id: "rf3", name: "Knight", role: "defender",   stats: { attack: 3, defense: 4, passing: 3, speed: 4, luck: 4 }, ability: "shadow_mark", jerseyNumber: 4 },
      { id: "rf4", name: "Bishop", role: "midfielder", stats: { attack: 5, defense: 4, passing: 5, speed: 5, luck: 5 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "rf5", name: "King",   role: "striker",    stats: { attack: 6, defense: 2, passing: 4, speed: 5, luck: 5 }, ability: "ghost_run",   jerseyNumber: 9 },
    ],
  },
  {
    id: "the_underdogs",
    name: "The Underdogs",
    tier: 3,
    formationId: "1-2-1",
    jerseyColor: "#6a1b9a",
    secondaryColor: "#e1bee7",
    crestIcon: "🐕",
    players: [
      { id: "ud1", name: "Mutt",    role: "goalkeeper", stats: { attack: 2, defense: 5, passing: 3, speed: 3, luck: 6 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "ud2", name: "Scrappy", role: "defender",   stats: { attack: 3, defense: 5, passing: 3, speed: 4, luck: 5 }, ability: "iron_tackle", jerseyNumber: 4 },
      { id: "ud3", name: "Grit",    role: "midfielder", stats: { attack: 5, defense: 4, passing: 5, speed: 5, luck: 5 }, ability: "eagle_eye",   jerseyNumber: 7 },
      { id: "ud4", name: "Heart",   role: "midfielder", stats: { attack: 4, defense: 4, passing: 5, speed: 5, luck: 6 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "ud5", name: "Pup",     role: "striker",    stats: { attack: 6, defense: 2, passing: 4, speed: 5, luck: 6 }, ability: "ghost_run",   jerseyNumber: 9 },
    ],
  },
  {
    id: "coastal_fc",
    name: "Coastal FC",
    tier: 3,
    formationId: "1-2-1",
    jerseyColor: "#006064",
    secondaryColor: "#b2ebf2",
    crestIcon: "🌊",
    players: [
      { id: "cf1", name: "Shore", role: "goalkeeper", stats: { attack: 2, defense: 5, passing: 3, speed: 3, luck: 5 }, ability: "goalkeeper",  jerseyNumber: 1 },
      { id: "cf2", name: "Tide",  role: "defender",   stats: { attack: 3, defense: 5, passing: 3, speed: 4, luck: 5 }, ability: "iron_tackle", jerseyNumber: 2 },
      { id: "cf3", name: "Wave",  role: "midfielder", stats: { attack: 5, defense: 4, passing: 5, speed: 5, luck: 4 }, ability: "eagle_eye",   jerseyNumber: 6 },
      { id: "cf4", name: "Reef",  role: "midfielder", stats: { attack: 4, defense: 4, passing: 5, speed: 5, luck: 5 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "cf5", name: "Drift", role: "striker",    stats: { attack: 6, defense: 2, passing: 4, speed: 5, luck: 5 }, ability: "powerhouse",  jerseyNumber: 9 },
    ],
  },
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
