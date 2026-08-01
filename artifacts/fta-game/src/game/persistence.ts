import type { TeamConfig, LeagueState, SavedMatchState, PlayerStats } from "../engine/types";
import { getDefaultSquad } from "./players";
import { expandSquad, MAX_SQUAD_SIZE, MIN_SQUAD_SIZE } from "./transferDatabase";
import { FORMATIONS } from "./formations";
import { PLAYERS_PER_TEAM } from "../engine/constants";
import { createLeague } from "./league";
import { ensurePlayerDevelopment, ensureTeamDevelopment } from "./training";

const TEAM_KEY = "fta_team_clean_6v6_v1";
const TEAM_NAME_KEY = "fta_team_name_v1";
const LEAGUE_KEY = "fta_league_clean_6v6_v1";
const MATCH_KEY = "fta_match_clean_6v6_v1";

const PLAYER_TEAM_ID = "player_team";

const CREST_ICONS = ["⚡", "🔥", "🦅", "🐺", "🦁", "⭐", "🛡️", "🗡️"];

function hasValidStats(t: TeamConfig): boolean {
  return t.players.every(
    (p) =>
      p.stats &&
      typeof p.stats.speed === "number" &&
      typeof p.stats.passing === "number",
  );
}

function normalizeTeamForCurrentRules(team: TeamConfig): TeamConfig {
  const formation =
    FORMATIONS.find((f) => f.id === team.formationId) ??
    FORMATIONS.find((f) => f.id === "2-1-2") ??
    FORMATIONS[0];

  const defaults = getDefaultSquad();
  const existing = [...(team.players ?? [])];
  const players = existing.length <= PLAYERS_PER_TEAM
    ? expandSquad([...existing, ...defaults], PLAYER_TEAM_ID, 2, 1)
    : existing.slice(0, MAX_SQUAD_SIZE);

  return ensureTeamDevelopment({
    ...team,
    formationId: formation.id,
    players: players.map((player) => ensurePlayerDevelopment(player)),
    startPositions:
      team.startPositions && team.startPositions.length >= PLAYERS_PER_TEAM
        ? team.startPositions.slice(0, PLAYERS_PER_TEAM)
        : formation.positions.map((p) => ({ ...p })),
    trainingIntensity: team.trainingIntensity ?? "balanced",
  });
}

export function loadTeam(): TeamConfig {
  try {
    const raw = localStorage.getItem(TEAM_KEY);

    if (raw) {
      const parsed = JSON.parse(raw) as TeamConfig;
      const savedName = localStorage.getItem(TEAM_NAME_KEY)?.trim();
      const t: TeamConfig = {
        ...parsed,
        name: savedName || parsed.name || "My Team",
      };

      if (
        t.players &&
        t.players.length >= MIN_SQUAD_SIZE &&
        hasValidStats(t)
      ) {
        const normalized = normalizeTeamForCurrentRules(t);

        if (
          normalized.players.length !== t.players.length ||
          normalized.startPositions.length !==
            (t.startPositions?.length ?? 0) ||
          normalized.formationId !== t.formationId
        ) {
          saveTeam(normalized);
        }

        return normalized;
      }
    }
  } catch {}

  return getDefaultTeam();
}

export function saveTeam(team: TeamConfig): void {
  const normalized = normalizeTeamForCurrentRules({
    ...team,
    name: team.name.trim() || "My Team",
  });
  localStorage.setItem(TEAM_KEY, JSON.stringify(normalized));
  // Keep the club name in its own tiny key as well. This prevents another
  // screen holding an older TeamConfig object from silently restoring the old
  // name when the full team save is normalized later.
  localStorage.setItem(TEAM_NAME_KEY, normalized.name);
}

export function loadLeague(teamName: string): LeagueState {
  try {
    const raw = localStorage.getItem(LEAGUE_KEY);

    if (raw) {
      const l = JSON.parse(raw) as LeagueState;

      if (l.teams && l.schedule) {
        const renameMatch = <T extends { homeId: string; awayId: string; homeName: string; awayName: string }>(match: T): T => ({
          ...match,
          homeName: match.homeId === PLAYER_TEAM_ID ? teamName : match.homeName,
          awayName: match.awayId === PLAYER_TEAM_ID ? teamName : match.awayName,
        });
        return {
          ...l,
          teams: l.teams.map((entry) =>
            entry.id === PLAYER_TEAM_ID ? { ...entry, name: teamName } : entry,
          ),
          playoff: l.playoff
            ? {
                ...l.playoff,
                sf1: renameMatch(l.playoff.sf1),
                sf2: renameMatch(l.playoff.sf2),
                final: l.playoff.final ? renameMatch(l.playoff.final) : undefined,
              }
            : l.playoff,
        };
      }
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

    const parsed = JSON.parse(raw) as SavedMatchState;
    return {
      ...parsed,
      players: parsed.players.map((player) => {
        const stats = player.stats as PlayerStats & { luck?: number };
        const movement =
          typeof stats.movement === "number" && Number.isFinite(stats.movement)
            ? stats.movement
            : typeof stats.luck === "number" && Number.isFinite(stats.luck)
              ? stats.luck
              : 5;
        return {
          ...player,
          stats: { ...stats, movement },
        };
      }),
    };
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
  const formation =
    FORMATIONS.find((f) => f.id === "2-1-2") ?? FORMATIONS[0];

  return ensureTeamDevelopment({
    name: "My Team",
    jerseyColor: "#00b4d8",
    secondaryColor: "#ffffff",
    crestIcon: "⚡",
    players: getDefaultSquad(),
    formationId: formation.id,
    startPositions: formation.positions.map((p) => ({ ...p })),
    trainingIntensity: "balanced",
  });
}

export const JERSEY_COLORS = [
  "#00b4d8",
  "#e63946",
  "#2d6a4f",
  "#f77f00",
  "#7b2d8b",
  "#1a1a2e",
  "#ffd60a",
  "#00b288",
  "#c9184a",
  "#3a86ff",
];

// Secondary gets the exact same choices as primary.
export const SECONDARY_COLORS = [...JERSEY_COLORS];

export const PLAYER_TEAM_ID_CONST = PLAYER_TEAM_ID;
export { CREST_ICONS };
