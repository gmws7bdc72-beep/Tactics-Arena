import type { TeamConfig, LeagueState, SavedMatchState } from "../engine/types";
import { getDefaultSquad } from "./players";
import { FORMATIONS } from "./formations";
import { PLAYERS_PER_TEAM } from "../engine/constants";
import { createLeague } from "./league";

const TEAM_KEY = "fta_team_v2";
const LEAGUE_KEY = "fta_league_v3";
const MATCH_KEY = "fta_match_v2";

const PLAYER_TEAM_ID = "player_team";

const CREST_ICONS = ["⚡", "🔥", "🦅", "🐺", "🦁", "⭐", "🛡️", "🗡️"];

function hasValidStats(t: TeamConfig): boolean {
  return t.players.every(
    p => p.stats &&
      typeof p.stats.speed === "number" &&
      typeof p.stats.passing === "number"
  );
}

function normalizeTeamForCurrentRules(team: TeamConfig): TeamConfig {
  const formation = FORMATIONS.find(f => f.id === team.formationId) ?? FORMATIONS[0];
  const defaults = getDefaultSquad();
  const players = [...(team.players ?? [])];

  for (const fallback of defaults) {
    if (players.length >= PLAYERS_PER_TEAM) break;
    if (!players.some((p) => p.id === fallback.id)) {
      players.push(fallback);
    }
  }

  while (players.length < PLAYERS_PER_TEAM) {
    players.push(defaults[players.length % defaults.length]);
  }

  return {
    ...team,
    players: players.slice(0, PLAYERS_PER_TEAM),
    startPositions:
      team.startPositions && team.startPositions.length >= PLAYERS_PER_TEAM
        ? team.startPositions.slice(0, PLAYERS_PER_TEAM)
        : formation.positions.map((p) => ({ ...p })),
  };
}

export function loadTeam(): TeamConfig {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (raw) {
      const t = JSON.parse(raw) as TeamConfig;
      if (t.players && t.players.length >= 5 && hasValidStats(t)) {
        const normalized = normalizeTeamForCurrentRules(t);
        if (normalized.players.length !== t.players.length || normalized.startPositions.length !== (t.startPositions?.length ?? 0)) {
          saveTeam(normalized);
        }
        return normalized;
      }
    }
  } catch {}
  return getDefaultTeam();
}

export function saveTeam(team: TeamConfig): void {
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
}

export function loadLeague(teamName: string): LeagueState {
  try {
    const raw = localStorage.getItem(LEAGUE_KEY);
    if (raw) {
      const l = JSON.parse(raw) as LeagueState;
      if (l.teams && l.schedule) return l;
    }
  } catch {}
  return createLeague(PLAYER_TEAM_ID, teamName);
}

export function saveLeague(league: LeagueState): void {
  localStorage.setItem(LEAGUE_KEY, JSON.stringify(league));
}

export function loadMatch(): SavedMatchState | null {
  try {
    const raw = localStorage.getItem(MATCH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedMatchState;
  } catch {
    return null;
  }
}

export function saveMatch(match: SavedMatchState | null): void {
  if (!match) {
    localStorage.removeItem(MATCH_KEY);
    return;
  }
  localStorage.setItem(MATCH_KEY, JSON.stringify(match));
}

export function resetLeague(teamName: string): LeagueState {
  const l = createLeague(PLAYER_TEAM_ID, teamName);
  saveLeague(l);
  return l;
}

export function getDefaultTeam(): TeamConfig {
  const formation = FORMATIONS.find(f => f.id === "1-2-1") ?? FORMATIONS[0];
  return {
    name: "My Team",
    jerseyColor: "#00b4d8",
    secondaryColor: "#ffffff",
    crestIcon: "⚡",
    players: getDefaultSquad(),
    formationId: formation.id,
    startPositions: formation.positions.map(p => ({ ...p })),
  };
}

export const JERSEY_COLORS = [
  "#00b4d8", "#e63946", "#2d6a4f", "#f77f00",
  "#7b2d8b", "#1a1a2e", "#ffd60a", "#00b288",
  "#c9184a", "#3a86ff",
];

export const SECONDARY_COLORS = [
  "#ffffff", "#000000", "#ffd60a", "#c8e6c9",
  "#fce4ec", "#e3f2fd", "#f3e5f5", "#fff9c4",
  "#ffe0b2", "#e0f2f1",
];

export const PLAYER_TEAM_ID_CONST = PLAYER_TEAM_ID;
export { CREST_ICONS };
