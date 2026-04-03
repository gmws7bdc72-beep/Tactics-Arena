import type { PlayerCard, LeagueTeamEntry, LeagueState, ScheduledMatch } from "../engine/types";
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
      { id: "ig1", name: "Voss", role: "goalkeeper", stats: { attack: 3, defense: 9, speed: 7, luck: 6 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "ig2", name: "Stark", role: "defender", stats: { attack: 5, defense: 9, speed: 7, luck: 6 }, ability: "iron_tackle", jerseyNumber: 5 },
      { id: "ig3", name: "Helm", role: "midfielder", stats: { attack: 7, defense: 7, speed: 8, luck: 7 }, ability: "eagle_eye", jerseyNumber: 8 },
      { id: "ig4", name: "Blaze", role: "forward", stats: { attack: 9, defense: 4, speed: 9, luck: 7 }, ability: "ghost_run", jerseyNumber: 10 },
      { id: "ig5", name: "Forge", role: "striker", stats: { attack: 10, defense: 3, speed: 8, luck: 8 }, ability: "powerhouse", jerseyNumber: 9 },
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
      { id: "tv1", name: "Ward", role: "goalkeeper", stats: { attack: 2, defense: 9, speed: 6, luck: 7 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "tv2", name: "Crest", role: "defender", stats: { attack: 5, defense: 8, speed: 8, luck: 6 }, ability: "shadow_mark", jerseyNumber: 4 },
      { id: "tv3", name: "Edge", role: "midfielder", stats: { attack: 8, defense: 6, speed: 9, luck: 7 }, ability: "bullet_pass", jerseyNumber: 6 },
      { id: "tv4", name: "Fang", role: "forward", stats: { attack: 9, defense: 4, speed: 9, luck: 8 }, ability: "eagle_eye", jerseyNumber: 11 },
      { id: "tv5", name: "Rush", role: "striker", stats: { attack: 10, defense: 3, speed: 10, luck: 7 }, ability: "ghost_run", jerseyNumber: 9 },
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
      { id: "ti1", name: "Stone", role: "goalkeeper", stats: { attack: 3, defense: 10, speed: 5, luck: 6 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "ti2", name: "Grip", role: "defender", stats: { attack: 4, defense: 9, speed: 7, luck: 5 }, ability: "iron_tackle", jerseyNumber: 3 },
      { id: "ti3", name: "Pulse", role: "midfielder", stats: { attack: 8, defense: 7, speed: 8, luck: 8 }, ability: "eagle_eye", jerseyNumber: 7 },
      { id: "ti4", name: "Apex", role: "forward", stats: { attack: 9, defense: 5, speed: 9, luck: 7 }, ability: "powerhouse", jerseyNumber: 10 },
      { id: "ti5", name: "Volt", role: "striker", stats: { attack: 10, defense: 3, speed: 10, luck: 9 }, ability: "ghost_run", jerseyNumber: 9 },
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
      { id: "nw1", name: "Pack", role: "goalkeeper", stats: { attack: 3, defense: 7, speed: 6, luck: 5 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "nw2", name: "Claw", role: "defender", stats: { attack: 4, defense: 7, speed: 7, luck: 5 }, ability: "iron_tackle", jerseyNumber: 5 },
      { id: "nw3", name: "Hunt", role: "defender", stats: { attack: 4, defense: 7, speed: 6, luck: 5 }, ability: "shadow_mark", jerseyNumber: 4 },
      { id: "nw4", name: "Trail", role: "midfielder", stats: { attack: 6, defense: 5, speed: 7, luck: 6 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "nw5", name: "Howl", role: "striker", stats: { attack: 8, defense: 3, speed: 8, luck: 6 }, ability: "powerhouse", jerseyNumber: 9 },
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
      { id: "sc1", name: "Gates", role: "goalkeeper", stats: { attack: 2, defense: 7, speed: 5, luck: 6 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "sc2", name: "Lane", role: "defender", stats: { attack: 3, defense: 7, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 2 },
      { id: "sc3", name: "Cross", role: "midfielder", stats: { attack: 6, defense: 5, speed: 7, luck: 6 }, ability: "bullet_pass", jerseyNumber: 7 },
      { id: "sc4", name: "Urban", role: "midfielder", stats: { attack: 5, defense: 6, speed: 7, luck: 5 }, ability: "eagle_eye", jerseyNumber: 10 },
      { id: "sc5", name: "Metro", role: "striker", stats: { attack: 7, defense: 3, speed: 7, luck: 6 }, ability: "ghost_run", jerseyNumber: 9 },
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
      { id: "rp1", name: "Banks", role: "goalkeeper", stats: { attack: 3, defense: 7, speed: 6, luck: 5 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "rp2", name: "Reed", role: "defender", stats: { attack: 4, defense: 7, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 3 },
      { id: "rp3", name: "Flow", role: "defender", stats: { attack: 3, defense: 6, speed: 7, luck: 6 }, ability: "shadow_mark", jerseyNumber: 6 },
      { id: "rp4", name: "Current", role: "midfielder", stats: { attack: 6, defense: 5, speed: 7, luck: 5 }, ability: "eagle_eye", jerseyNumber: 8 },
      { id: "rp5", name: "Surge", role: "striker", stats: { attack: 8, defense: 3, speed: 8, luck: 6 }, ability: "powerhouse", jerseyNumber: 9 },
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
      { id: "rf1", name: "Rook", role: "goalkeeper", stats: { attack: 2, defense: 5, speed: 4, luck: 5 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "rf2", name: "Pawn", role: "defender", stats: { attack: 3, defense: 5, speed: 5, luck: 4 }, ability: "iron_tackle", jerseyNumber: 5 },
      { id: "rf3", name: "Knight", role: "defender", stats: { attack: 3, defense: 4, speed: 5, luck: 4 }, ability: "shadow_mark", jerseyNumber: 4 },
      { id: "rf4", name: "Bishop", role: "midfielder", stats: { attack: 5, defense: 4, speed: 5, luck: 5 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "rf5", name: "King", role: "striker", stats: { attack: 6, defense: 2, speed: 6, luck: 5 }, ability: "ghost_run", jerseyNumber: 9 },
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
      { id: "ud1", name: "Mutt", role: "goalkeeper", stats: { attack: 2, defense: 5, speed: 5, luck: 6 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "ud2", name: "Scrappy", role: "defender", stats: { attack: 3, defense: 5, speed: 5, luck: 5 }, ability: "iron_tackle", jerseyNumber: 4 },
      { id: "ud3", name: "Grit", role: "midfielder", stats: { attack: 5, defense: 4, speed: 5, luck: 5 }, ability: "eagle_eye", jerseyNumber: 7 },
      { id: "ud4", name: "Heart", role: "midfielder", stats: { attack: 4, defense: 4, speed: 6, luck: 6 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "ud5", name: "Pup", role: "striker", stats: { attack: 6, defense: 2, speed: 6, luck: 6 }, ability: "ghost_run", jerseyNumber: 9 },
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
      { id: "cf1", name: "Shore", role: "goalkeeper", stats: { attack: 2, defense: 5, speed: 4, luck: 5 }, ability: "goalkeeper", jerseyNumber: 1 },
      { id: "cf2", name: "Tide", role: "defender", stats: { attack: 3, defense: 5, speed: 5, luck: 5 }, ability: "iron_tackle", jerseyNumber: 2 },
      { id: "cf3", name: "Wave", role: "midfielder", stats: { attack: 5, defense: 4, speed: 5, luck: 4 }, ability: "eagle_eye", jerseyNumber: 6 },
      { id: "cf4", name: "Reef", role: "midfielder", stats: { attack: 4, defense: 4, speed: 5, luck: 5 }, ability: "bullet_pass", jerseyNumber: 8 },
      { id: "cf5", name: "Drift", role: "striker", stats: { attack: 6, defense: 2, speed: 6, luck: 5 }, ability: "powerhouse", jerseyNumber: 9 },
    ],
  },
];

// Order: easiest first, hardest last
const SCHEDULE_ORDER = [
  "rooksville_fc",
  "the_underdogs",
  "coastal_fc",
  "northern_wolves",
  "river_phoenix",
  "silver_city",
  "fc_ironforge",
  "the_vanguard",
  "titanium_fc",
];

export function createLeague(playerTeamId: string, playerTeamName: string): LeagueState {
  const teams: LeagueTeamEntry[] = [
    { id: playerTeamId, name: playerTeamName, tier: 2, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ...AI_TEAMS.map(t => ({ id: t.id, name: t.name, tier: t.tier, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 })),
  ];

  const schedule: ScheduledMatch[] = SCHEDULE_ORDER.map(id => {
    const team = AI_TEAMS.find(t => t.id === id)!;
    return { opponentId: id, opponentName: team.name, played: false, playerGoals: 0, opponentGoals: 0 };
  });

  return { teams, schedule, currentMatchIndex: 0 };
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

  // Simulate 4 AI-vs-AI matches from remaining unplayed pairs
  const aiIds = AI_TEAMS.map(t => t.id);
  const unplayedPairs: [string, string][] = [];
  const alreadySimulated = new Set<string>();
  for (let i = 0; i < aiIds.length; i++) {
    for (let j = i + 1; j < aiIds.length; j++) {
      const key = `${aiIds[i]}_${aiIds[j]}`;
      const rev = `${aiIds[j]}_${aiIds[i]}`;
      if (!alreadySimulated.has(key) && !alreadySimulated.has(rev)) {
        const teamA = teams.find(t => t.id === aiIds[i])!;
        const teamB = teams.find(t => t.id === aiIds[j])!;
        // Only simulate if both haven't played each other yet (rough check using played count)
        if (teamA.played < state.schedule.length && teamB.played < state.schedule.length) {
          unplayedPairs.push([aiIds[i], aiIds[j]]);
          alreadySimulated.add(key);
        }
      }
    }
  }

  const rng = seededRng(seed + 7777);
  const toSimulate = unplayedPairs.sort(() => rng() - 0.5).slice(0, 4);
  for (const [a, b] of toSimulate) {
    const { homeGoals: hg, awayGoals: ag } = simulateOneAIMatch(teams, a, b, seed + a.length + b.length);
    updateTeam(a, hg, ag);
    updateTeam(b, ag, hg);
  }

  return {
    ...state,
    teams,
    schedule,
    currentMatchIndex: state.currentMatchIndex + 1,
  };
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

// Starting positions on the grid for AI team (attacking left, GK on right)
export function getAIFormationPositions(formationId: string): { col: number; row: number }[] {
  switch (formationId) {
    case "1-1-2":
      return [
        { col: 9, row: 3 }, // GK
        { col: 7, row: 3 }, // DEF
        { col: 5, row: 3 }, // MID
        { col: 3, row: 2 }, // FWD
        { col: 3, row: 4 }, // FWD
      ];
    case "2-1-1":
      return [
        { col: 9, row: 3 },
        { col: 7, row: 2 },
        { col: 7, row: 4 },
        { col: 5, row: 3 },
        { col: 3, row: 3 },
      ];
    case "1-2-1":
    default:
      return [
        { col: 9, row: 3 },
        { col: 7, row: 3 },
        { col: 5, row: 2 },
        { col: 5, row: 4 },
        { col: 3, row: 3 },
      ];
  }
}
