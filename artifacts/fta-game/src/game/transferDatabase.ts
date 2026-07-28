import type { PlayerCard, PlayerStats } from "../engine/types";
import { ensurePlayerDevelopment } from "./training";

export const MIN_SQUAD_SIZE = 11;
export const MAX_SQUAD_SIZE = 16;

const FIRST_NAMES = ["Adrian","Bastian","Cairo","Dario","Emil","Felix","Gian","Hector","Ivan","Jonas","Kian","Luca","Marco","Nils","Owen","Pablo","Quinn","Rafael","Sami","Theo","Uri","Victor","Wes","Yuri","Zane"];
const LAST_NAMES = ["Alder","Bauer","Costa","Dunn","Evans","Frost","Grant","Hale","Ibarra","Jensen","Kovac","Lind","Meyer","Nash","Ortiz","Pike","Reed","Silva","Toma","Voss","Ward","Young"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value: number, min = 1, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function getPlayerOverall(player: PlayerCard): number {
  const s = player.stats;
  const weights: Partial<Record<keyof PlayerStats, number>> = player.role === "goalkeeper"
    ? { defense: 2, marking: 1.4, aerial: 1.5, passing: .8, longPassing: 1, strength: .8, movement: .7 }
    : player.role === "defender"
      ? { defense: 1.6, tackling: 1.5, marking: 1.5, strength: 1, aerial: .8, speed: .7, passing: .6 }
      : player.role === "midfielder"
        ? { passing: 1.5, vision: 1.4, movement: 1.2, stamina: 1, dribbling: .8, defense: .6, longPassing: 1 }
        : { attack: 1.4, shooting: 1.5, speed: 1, dribbling: 1.1, movement: 1, vision: .6, aerial: .5 };
  let total = 0, weight = 0;
  for (const [key, w] of Object.entries(weights) as [keyof PlayerStats, number][]) {
    total += s[key] * w;
    weight += w;
  }
  return Math.round((total / Math.max(1, weight)) * 10);
}

export function enrichMarketPlayer(raw: PlayerCard, clubId = raw.clubId ?? "free_agents", season = 1): PlayerCard {
  const player = ensurePlayerDevelopment(raw, season);
  const seed = hash(player.id);
  const overall = getPlayerOverall(player);
  const age = player.age ?? 18 + (seed % 17);
  const potential = player.potential ?? player.development?.potential ?? Math.min(99, overall + 3 + (seed % 14));
  const marketValue = player.marketValue ?? Math.max(250_000, Math.round((overall * overall * 4200 + potential * 12500) / 50_000) * 50_000);
  const weeklyWage = player.weeklyWage ?? Math.max(1_000, Math.round((overall * overall * 8 + marketValue / 900) / 500) * 500);
  let marketStatus = player.marketStatus;
  if (!marketStatus) {
    const roll = seed % 20;
    marketStatus = roll < 3 ? "listed" : roll === 3 ? "untouchable" : roll < 8 ? "not_for_sale" : "available";
  }
  return { ...player, age, potential, marketValue, weeklyWage, marketStatus, clubId };
}

function roleForIndex(index: number): PlayerCard["role"] {
  const roles: PlayerCard["role"][] = ["goalkeeper","defender","defender","defender","midfielder","midfielder","midfielder","forward","forward","striker"];
  return roles[index % roles.length];
}

function baseStats(role: PlayerCard["role"], level: number, seed: number): PlayerStats {
  const n = (offset: number, bonus = 0) => clamp(level + ((seed >> offset) % 3) - 1 + bonus);
  return {
    attack: n(1, role === "forward" || role === "striker" ? 2 : role === "midfielder" ? 0 : -2),
    defense: n(2, role === "defender" || role === "goalkeeper" ? 2 : role === "midfielder" ? 0 : -2),
    passing: n(3, role === "midfielder" ? 2 : 0), speed: n(4, role === "forward" ? 2 : 0),
    movement: n(5, role === "forward" || role === "midfielder" ? 1 : 0), shooting: n(6, role === "striker" ? 2 : role === "forward" ? 1 : -1),
    dribbling: n(7, role === "forward" ? 2 : role === "midfielder" ? 1 : -1), tackling: n(8, role === "defender" ? 2 : -1),
    marking: n(9, role === "defender" || role === "goalkeeper" ? 2 : -1), stamina: n(10, 1), strength: n(11, role === "defender" || role === "striker" ? 1 : 0),
    vision: n(12, role === "midfielder" ? 2 : 0), longPassing: n(13, role === "midfielder" || role === "goalkeeper" ? 1 : 0), aerial: n(14, role === "goalkeeper" || role === "defender" || role === "striker" ? 1 : -1),
  };
}

export function generateReservePlayer(clubId: string, index: number, tier: 1 | 2 | 3 = 2, season = 1): PlayerCard {
  const seed = hash(`${clubId}:${season}:${index}`);
  const role = roleForIndex(index);
  const level = tier === 1 ? 7 : tier === 2 ? 6 : 5;
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[(seed >>> 7) % LAST_NAMES.length];
  return enrichMarketPlayer({
    id: `${clubId}_reserve_${season}_${index}`,
    name: `${first} ${last}`,
    role,
    jerseyNumber: 12 + index,
    ability: role === "goalkeeper" ? "goalkeeper" : "none",
    stats: baseStats(role, level, seed),
  }, clubId, season);
}

export function getInitialSquadSize(clubId: string): number {
  // Clubs begin with different reserve depth: 11–15 players.
  // Nobody starts at the 16-player ceiling, leaving room to buy.
  return MIN_SQUAD_SIZE + (hash(`${clubId}:initial-squad-size`) % 5);
}

export function expandSquad(players: PlayerCard[], clubId: string, tier: 1 | 2 | 3 = 2, season = 1): PlayerCard[] {
  const targetSize = Math.max(players.length, getInitialSquadSize(clubId));
  const unique = new Map(players.map((player) => [player.id, enrichMarketPlayer(player, clubId, season)]));
  let index = 0;
  while (unique.size < targetSize) {
    const generated = generateReservePlayer(clubId, index++, tier, season);
    unique.set(generated.id, generated);
  }
  return [...unique.values()].slice(0, MAX_SQUAD_SIZE);
}

export function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}
