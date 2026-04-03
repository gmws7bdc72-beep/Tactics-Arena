import type { TeamConfig, ArenaProgress, PlayerCard } from "../engine/types";
import { getDefaultSquad } from "./players";
import { FORMATIONS } from "./formations";
import { PITCH_WIDTH, PITCH_HEIGHT } from "../engine/constants";

const TEAM_KEY = "fta_team";
const PROGRESS_KEY = "fta_progress";

const CREST_ICONS = ["⚡", "🔥", "🦅", "🐺", "🦁", "⭐", "🛡️", "🗡️"];

export function loadTeam(): TeamConfig {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (raw) return JSON.parse(raw) as TeamConfig;
  } catch {}
  return getDefaultTeam();
}

export function saveTeam(team: TeamConfig): void {
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
}

export function loadProgress(): ArenaProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as ArenaProgress;
  } catch {}
  return {
    arena: "bronze",
    wins: 0,
    losses: 0,
    winsInArena: 0,
    lossesInArena: 0,
  };
}

export function saveProgress(progress: ArenaProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function getDefaultTeam(): TeamConfig {
  const formation = FORMATIONS[0];
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

export const SECONDARY_COLORS = [
  "#ffffff",
  "#000000",
  "#ffd60a",
  "#c8e6c9",
  "#fce4ec",
  "#e3f2fd",
  "#f3e5f5",
  "#fff9c4",
  "#ffe0b2",
  "#e0f2f1",
];

export { CREST_ICONS };
