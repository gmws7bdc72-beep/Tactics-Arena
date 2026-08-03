import type { TeamConfig, LeagueState, SavedMatchState, PlayerStats, PlayerCard } from "../engine/types";
import { getDefaultSquad } from "./players";
import { expandSquad, MAX_SQUAD_SIZE } from "./transferDatabase";
import { FORMATIONS } from "./formations";
import { PLAYERS_PER_TEAM } from "../engine/constants";
import { createLeague } from "./league";
import { ensurePlayerDevelopment, ensureTeamDevelopment } from "./training";
import { enforceStartingAbilityCaps } from "./abilityLimits";

const TEAM_KEY = "fta_team_clean_6v6_v1";
const TEAM_BACKUP_KEY = "fta_team_clean_6v6_v1_backup";
const TEAM_NAME_KEY = "fta_team_name_v1";
const LEAGUE_KEY = "fta_league_clean_6v6_v1";
const LEAGUE_BACKUP_KEY = "fta_league_clean_6v6_v1_backup";
const MATCH_KEY = "fta_match_clean_6v6_v1";
const CAREER_KEY = "fta_career_snapshot_v1";
const CAREER_BACKUP_KEY = "fta_career_snapshot_v1_backup";

const PLAYER_TEAM_ID = "player_team";
const CREST_ICONS = ["⚡", "🔥", "🦅", "🐺", "🦁", "⭐", "🛡️", "🗡️"];

export interface CareerSnapshot {
  version: 1;
  savedAt: number;
  team: TeamConfig;
  league: LeagueState;
  market?: unknown;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch (error) {
    console.warn(`[FTA save] Could not read ${key}.`, error);
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`[FTA save] Could not write ${key}.`, error);
  }
}

function backUpCurrent(key: string, backupKey: string): void {
  try {
    const current = localStorage.getItem(key);
    if (current) localStorage.setItem(backupKey, current);
  } catch (error) {
    console.warn(`[FTA save] Could not update backup ${backupKey}.`, error);
  }
}

export function loadCareerSnapshot(): CareerSnapshot | null {
  const candidates = [
    readJson<CareerSnapshot>(CAREER_KEY),
    readJson<CareerSnapshot>(CAREER_BACKUP_KEY),
  ];
  return candidates.find((item) =>
    item?.version === 1 && item.team && item.league,
  ) ?? null;
}

export function saveCareerSnapshot(
  team: TeamConfig,
  league: LeagueState,
  market?: unknown,
): void {
  backUpCurrent(CAREER_KEY, CAREER_BACKUP_KEY);
  const snapshot: CareerSnapshot = {
    version: 1,
    savedAt: Date.now(),
    team: normalizeTeamForCurrentRules(team),
    league,
    market,
  };
  safeSet(CAREER_KEY, JSON.stringify(snapshot));
}

const FALLBACK_STATS: PlayerStats = {
  attack: 5,
  defense: 5,
  passing: 5,
  speed: 5,
  movement: 5,
  shooting: 5,
  dribbling: 5,
  tackling: 5,
  marking: 5,
  stamina: 5,
  strength: 5,
  vision: 5,
  longPassing: 5,
  aerial: 5,
};

function repairPlayer(
  raw: Partial<PlayerCard> | undefined,
  fallback: PlayerCard,
  index: number,
): PlayerCard {
  const source = raw && typeof raw === "object" ? raw : fallback;
  const stats = source.stats && typeof source.stats === "object"
    ? { ...FALLBACK_STATS, ...source.stats }
    : { ...fallback.stats, ...FALLBACK_STATS };

  return ensurePlayerDevelopment({
    ...fallback,
    ...source,
    id: typeof source.id === "string" && source.id ? source.id : `player_repaired_${index}_${Date.now()}`,
    name: typeof source.name === "string" && source.name.trim() ? source.name : fallback.name,
    jerseyNumber: typeof source.jerseyNumber === "number" ? source.jerseyNumber : index + 1,
    stats,
  } as PlayerCard);
}

function normalizeTeamForCurrentRules(team: TeamConfig): TeamConfig {
  const formation =
    FORMATIONS.find((item) => item.id === team.formationId) ??
    FORMATIONS.find((item) => item.id === "2-1-2") ??
    FORMATIONS[0];

  const defaults = getDefaultSquad();
  const rawPlayers = Array.isArray(team.players) ? team.players : [];
  const repairedBase = (rawPlayers.length ? rawPlayers : defaults).map((player, index) =>
    repairPlayer(player, defaults[index % defaults.length], index),
  );
  const unique = [...new Map(repairedBase.map((player) => [player.id, player])).values()];
  const players = enforceStartingAbilityCaps(
    expandSquad(unique, PLAYER_TEAM_ID, 2, 1)
      .slice(0, MAX_SQUAD_SIZE)
      .map((player, index) => repairPlayer(player, defaults[index % defaults.length], index)),
  );

  return ensureTeamDevelopment({
    ...team,
    name: typeof team.name === "string" && team.name.trim() ? team.name.trim() : "My Team",
    jerseyColor: team.jerseyColor || "#00b4d8",
    secondaryColor: team.secondaryColor || "#ffffff",
    crestIcon: team.crestIcon || "⚡",
    formationId: formation.id,
    players,
    startPositions:
      Array.isArray(team.startPositions) && team.startPositions.length >= PLAYERS_PER_TEAM
        ? team.startPositions.slice(0, PLAYERS_PER_TEAM).map((position) => ({ ...position }))
        : formation.positions.map((position) => ({ ...position })),
    trainingIntensity: team.trainingIntensity ?? "balanced",
  });
}

function teamCandidate(value: unknown, savedName?: string | null): TeamConfig | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as TeamConfig;
  const withName = {
    ...parsed,
    name: savedName?.trim() || parsed.name || "My Team",
  };
  try {
    return normalizeTeamForCurrentRules(withName);
  } catch (error) {
    console.warn("[FTA save] Team candidate needed repair but could not be recovered.", error);
    return null;
  }
}

export function loadTeam(): TeamConfig {
  const savedName = localStorage.getItem(TEAM_NAME_KEY);
  const snapshot = loadCareerSnapshot();
  const candidates: unknown[] = [
    readJson<TeamConfig>(TEAM_KEY),
    readJson<TeamConfig>(TEAM_BACKUP_KEY),
    snapshot?.team,
  ];

  for (const candidate of candidates) {
    const repaired = teamCandidate(candidate, savedName);
    if (repaired) {
      saveTeam(repaired);
      return repaired;
    }
  }

  const fallback = getDefaultTeam();
  saveTeam(fallback);
  return fallback;
}

export function saveTeam(team: TeamConfig): void {
  const normalized = normalizeTeamForCurrentRules(team);
  backUpCurrent(TEAM_KEY, TEAM_BACKUP_KEY);
  safeSet(TEAM_KEY, JSON.stringify(normalized));
  safeSet(TEAM_NAME_KEY, normalized.name);
}

function normalizeLeagueName(league: LeagueState, teamName: string): LeagueState {
  const renameMatch = <T extends { homeId: string; awayId: string; homeName: string; awayName: string }>(match: T): T => ({
    ...match,
    homeName: match.homeId === PLAYER_TEAM_ID ? teamName : match.homeName,
    awayName: match.awayId === PLAYER_TEAM_ID ? teamName : match.awayName,
  });

  return {
    ...league,
    teams: league.teams.map((entry) =>
      entry.id === PLAYER_TEAM_ID ? { ...entry, name: teamName } : entry,
    ),
    playoff: league.playoff
      ? {
          ...league.playoff,
          sf1: renameMatch(league.playoff.sf1),
          sf2: renameMatch(league.playoff.sf2),
          final: league.playoff.final ? renameMatch(league.playoff.final) : undefined,
        }
      : league.playoff,
  };
}

export function loadLeague(teamName: string): LeagueState {
  const snapshot = loadCareerSnapshot();
  const candidates = [
    readJson<LeagueState>(LEAGUE_KEY),
    readJson<LeagueState>(LEAGUE_BACKUP_KEY),
    snapshot?.league ?? null,
  ];

  for (const candidate of candidates) {
    if (candidate?.teams && candidate.schedule) return normalizeLeagueName(candidate, teamName);
  }

  const fallback = createLeague(PLAYER_TEAM_ID, teamName);
  saveLeague(fallback);
  return fallback;
}

export function saveLeague(league: LeagueState): void {
  backUpCurrent(LEAGUE_KEY, LEAGUE_BACKUP_KEY);
  safeSet(LEAGUE_KEY, JSON.stringify(league));
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
        return { ...player, stats: { ...stats, movement } };
      }),
    };
  } catch (error) {
    console.warn("[FTA save] Match save could not be loaded.", error);
    return null;
  }
}

export function saveMatch(match: SavedMatchState | null): void {
  if (!match) {
    localStorage.removeItem(MATCH_KEY);
    return;
  }
  safeSet(MATCH_KEY, JSON.stringify(match));
}

export function resetLeague(teamName: string): LeagueState {
  const league = createLeague(PLAYER_TEAM_ID, teamName);
  saveLeague(league);
  return league;
}

export function getDefaultTeam(): TeamConfig {
  const formation = FORMATIONS.find((item) => item.id === "2-1-2") ?? FORMATIONS[0];
  return ensureTeamDevelopment({
    name: "My Team",
    jerseyColor: "#00b4d8",
    secondaryColor: "#ffffff",
    crestIcon: "⚡",
    players: getDefaultSquad(),
    formationId: formation.id,
    startPositions: formation.positions.map((position) => ({ ...position })),
    trainingIntensity: "balanced",
  });
}

export const JERSEY_COLORS = [
  // Reds and corals
  "#ff1744", "#ff2d55", "#ef4444", "#e63946", "#dc2626", "#c9184a", "#be123c", "#9f1239", "#7f1d1d", "#ff6b6b", "#ff7f50", "#fb7185",
  // Oranges, ambers and golds
  "#ff8c00", "#f97316", "#f77f00", "#ea580c", "#c2410c", "#ffb703", "#f59e0b", "#facc15", "#ffd60a", "#eab308", "#ca8a04", "#b45309",
  // Yellows and limes
  "#fff200", "#fde047", "#fef08a", "#d9f99d", "#bef264", "#a3e635", "#84cc16", "#65a30d", "#4d7c0f",
  // Greens
  "#00e676", "#10b981", "#00b288", "#14b86e", "#22c55e", "#16a34a", "#15803d", "#166534", "#2d6a4f", "#064e3b", "#00a86b", "#32cd32",
  // Teals and cyans
  "#00f5d4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#00e5ff", "#22d3ee", "#06b6d4", "#00b4d8", "#0891b2", "#0e7490", "#155e75",
  // Blues
  "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#3a86ff", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#1a237e", "#001f54",
  // Indigos and violets
  "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95",
  // Purples and magentas
  "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#7e22ce", "#6b21a8", "#d946ef", "#c026d3", "#a21caf", "#86198f", "#7b2d8b",
  // Pinks
  "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#ff69b4", "#ff4da6",
  // Browns, tans and creams
  "#3f2d20", "#5c4033", "#6f4e37", "#8b5e34", "#a16207", "#b7791f", "#d6a85f", "#e7c27d", "#f5e6c8", "#fff1d6",
  // Whites, silvers and greys
  "#ffffff", "#f8fafc", "#f1f5f9", "#e5e7eb", "#d1d5db", "#9ca3af", "#64748b", "#475569", "#374151", "#1f2937", "#111827", "#111111",
  // Deep/navy specialty shades
  "#0f172a", "#1a1a2e", "#172554", "#082f49", "#052e16", "#3b0764", "#4a044e", "#450a0a",
];

export const SECONDARY_COLORS = [...JERSEY_COLORS];
export const PLAYER_TEAM_ID_CONST = PLAYER_TEAM_ID;
export { CREST_ICONS };
