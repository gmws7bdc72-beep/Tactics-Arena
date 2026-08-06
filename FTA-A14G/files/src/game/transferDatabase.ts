import type { PlayerCard, PlayerStats } from "../engine/types";
import { ensurePlayerDevelopment } from "./training";
import { generateUniquePlayerName, registerGeneratedPlayerNames } from "./nameDatabase";

export const MIN_SQUAD_SIZE = 11;
export const MAX_SQUAD_SIZE = 16;


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
  // Every club already owns its one goalkeeper. Reserve generation must never
  // silently create a second one.
  const roles: PlayerCard["role"][] = [
    "defender",
    "defender",
    "defender",
    "midfielder",
    "midfielder",
    "midfielder",
    "forward",
    "forward",
    "striker",
  ];
  return roles[index % roles.length];
}

function baseStats(role: PlayerCard["role"], level: number, seed: number): PlayerStats {
  // Each attribute receives its own roll. A five-point spread makes new-save
  // squads genuinely different instead of producing near-clones of templates.
  const n = (offset: number, bonus = 0) =>
    clamp(level + (hash(`${seed}:${offset}`) % 5) - 2 + bonus);
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
  const name = generateUniquePlayerName(seed);
  return enrichMarketPlayer({
    id: `${clubId}_reserve_${season}_${index}`,
    name,
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
  registerGeneratedPlayerNames(players.map((player) => player.name));
  const requestedSize = Math.min(
    MAX_SQUAD_SIZE,
    Math.max(players.length, getInitialSquadSize(clubId)),
  );

  const enriched = players.map((player) => enrichMarketPlayer(player, clubId, season));
  const goalkeepers = enriched
    .filter((player) => player.role === "goalkeeper")
    .sort((a, b) => getPlayerOverall(b) - getPlayerOverall(a));
  const outfield = enriched.filter((player) => player.role !== "goalkeeper");

  let goalkeeper = goalkeepers[0];
  if (!goalkeeper) {
    const seed = hash(`${clubId}:${season}:required-goalkeeper`);
    goalkeeper = enrichMarketPlayer(
      {
        id: `${clubId}_required_gk_${season}`,
        name: generateUniquePlayerName(seed),
        role: "goalkeeper",
        jerseyNumber: 1,
        ability: "goalkeeper",
        stats: baseStats("goalkeeper", tier === 1 ? 7 : tier === 2 ? 6 : 5, seed),
      },
      clubId,
      season,
    );
  }

  const unique = new Map<string, PlayerCard>();
  unique.set(goalkeeper.id, {
    ...goalkeeper,
    ability:
      goalkeeper.ability === "sweeper_keeper" ? "sweeper_keeper" : "goalkeeper",
  });
  for (const player of outfield) unique.set(player.id, player);

  let index = 0;
  while (unique.size < requestedSize) {
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


const NEW_SAVE_STAT_WEIGHTS = [
  5,  // 1
  6,  // 2
  8,  // 3
  9,  // 4
  12, // 5
  16, // 6
  17, // 7
  14, // 8
  8,  // 9
  5,  // 10
] as const;

const SPECIAL_ABILITY_CHANCE = 0.48;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedRandomStat(): number {
  const totalWeight = NEW_SAVE_STAT_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;

  for (let index = 0; index < NEW_SAVE_STAT_WEIGHTS.length; index += 1) {
    roll -= NEW_SAVE_STAT_WEIGHTS[index];
    if (roll < 0) return index + 1;
  }

  return 10;
}

/**
 * Kept for backwards compatibility with older modules and saves.
 * New-career player generation no longer uses club tiers or a shared club
 * talent value: every player's attributes are rolled independently.
 */
export function rollNewSaveClubTalent(_tier: 1 | 2 | 3): number {
  return randomInt(1, 10);
}

function fullyRandomStats(): PlayerStats {
  // Every attribute is still rolled independently from 1-10 with no tier,
  // club, role, starter, reserve or template influence. The only change from
  // the previous flat roll is a very gentle middle/upward weighting: weak
  // players still appear, stars still appear, but entire new leagues are less
  // likely to be dominated by 4-6 overall squads.
  return {
    attack: weightedRandomStat(),
    defense: weightedRandomStat(),
    passing: weightedRandomStat(),
    speed: weightedRandomStat(),
    movement: weightedRandomStat(),
    shooting: weightedRandomStat(),
    dribbling: weightedRandomStat(),
    tackling: weightedRandomStat(),
    marking: weightedRandomStat(),
    stamina: weightedRandomStat(),
    strength: weightedRandomStat(),
    vision: weightedRandomStat(),
    longPassing: weightedRandomStat(),
    aerial: weightedRandomStat(),
  };
}

function rollNewSaveAbility(
  template: PlayerCard,
  stats: PlayerStats,
): PlayerCard["ability"] {
  if (template.role === "goalkeeper") {
    const provisionalPlayer: PlayerCard = { ...template, stats, ability: "goalkeeper" };
    const overall = getPlayerOverall(provisionalPlayer);
    const sweeperEligible =
      overall >= 75 &&
      stats.speed >= 8 &&
      stats.defense >= 8 &&
      stats.movement >= 7;
    return sweeperEligible && Math.random() < 0.22
      ? "sweeper_keeper"
      : "goalkeeper";
  }

  // Abilities remain common enough to shape squads, but they are no longer
  // handed to nearly every outfield player. A failed special roll always
  // creates a normal player, even when several abilities would fit.
  if (Math.random() >= SPECIAL_ABILITY_CHANCE) return "none";

  const provisionalPlayer: PlayerCard = {
    ...template,
    stats,
    ability: "none",
  };
  const overall = getPlayerOverall(provisionalPlayer);
  const eligible: PlayerCard["ability"][] = [];

  if (stats.passing >= 7 && (stats.vision >= 6 || stats.longPassing >= 6)) {
    eligible.push("bullet_pass");
  }
  if (stats.tackling >= 7 && (stats.defense >= 6 || stats.marking >= 6)) {
    eligible.push("iron_tackle");
  }
  if (stats.shooting >= 7 && (stats.attack >= 6 || stats.vision >= 6)) {
    eligible.push("eagle_eye");
  }
  if (
    stats.strength >= 8 &&
    (stats.tackling >= 6 || stats.dribbling >= 6 || stats.attack >= 6)
  ) {
    eligible.push("powerhouse");
  }
  if (stats.marking >= 7 && (stats.defense >= 6 || stats.tackling >= 6)) {
    eligible.push("shadow_mark");
  }

  // Ghost Run is an elite movement ability, not a random sticker. A displayed
  // 6-overall player can never receive it. The player must be at least 7
  // overall and already possess genuinely high Speed and Movement.
  if (overall >= 70 && stats.speed >= 8 && stats.movement >= 8) {
    // Add it several times so qualifying elite runners have a real chance of
    // receiving Ghost Run despite usually qualifying for other abilities too.
    eligible.push("ghost_run", "ghost_run", "ghost_run", "ghost_run");
  }

  if (eligible.length === 0) return "none";
  return eligible[randomInt(0, eligible.length - 1)];
}

export function randomizePlayerForNewSave(
  template: PlayerCard,
  clubId: string,
  index: number,
  _tier?: 1 | 2 | 3,
  _clubTalent?: number,
): PlayerCard {
  const nameSeed = randomInt(1, 0x7fffffff);
  const name = generateUniquePlayerName(nameSeed, [template.name]);
  const seed = randomInt(1, 0x7fffffff);
  const stats = fullyRandomStats();
  const ability = rollNewSaveAbility(template, stats);

  return enrichMarketPlayer({
    ...template,
    id: `${clubId}_new_${Date.now().toString(36)}_${index}_${seed.toString(36)}`,
    name,
    ability,
    stats,
    jerseyNumber: index + 1,
    age: undefined,
    potential: undefined,
    marketValue: undefined,
    weeklyWage: undefined,
    marketStatus: undefined,
    development: undefined,
  }, clubId, 1);
}


/**
 * Creates a genuinely new player for the season-end transformation system.
 * The replacement always receives a new identity, a new stat roll and a fresh
 * market profile, while keeping the old player's role and shirt number so the
 * squad remains legal and readable.
 */
export function generateTransformedPlayer(
  oldPlayer: PlayerCard,
  clubId: string,
  season: number,
  serial: number,
): PlayerCard {
  let replacement = randomizePlayerForNewSave(
    oldPlayer,
    clubId,
    5000 + season * 100 + serial,
  );

  // A same-name roll is rare, but a transformation should always be obvious.
  for (let attempt = 0; attempt < 8 && replacement.name === oldPlayer.name; attempt += 1) {
    replacement = randomizePlayerForNewSave(
      oldPlayer,
      clubId,
      6000 + season * 100 + serial * 10 + attempt,
    );
  }

  const id = `${clubId}_transformed_${season}_${serial}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  return enrichMarketPlayer(
    {
      ...replacement,
      id,
      role: oldPlayer.role,
      jerseyNumber: oldPlayer.jerseyNumber,
      clubId,
      age: undefined,
      potential: undefined,
      marketValue: undefined,
      weeklyWage: undefined,
      marketStatus: "available",
      askingPrice: undefined,
      development: undefined,
      transformedFrom: {
        id: oldPlayer.id,
        name: oldPlayer.name,
        season,
        overall: getPlayerOverall(oldPlayer),
      },
    },
    clubId,
    season + 1,
  );
}
