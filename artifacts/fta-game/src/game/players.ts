import type { PlayerCard, Ability, AbilityId } from "../engine/types";

export const ABILITIES: Record<AbilityId, Ability> = {
  bullet_pass: { id: "bullet_pass", name: "Bullet Pass", description: "50% faster passes" },
  iron_tackle: { id: "iron_tackle", name: "Iron Tackle", description: "+20% duel win rate" },
  ghost_run: { id: "ghost_run", name: "Ghost Run", description: "30% faster movement, low turn cost" },
  eagle_eye: { id: "eagle_eye", name: "Eagle Eye", description: "15% faster shot power" },
  powerhouse: { id: "powerhouse", name: "Powerhouse", description: "20% boost to speed" },
  shadow_mark: { id: "shadow_mark", name: "Shadow Mark", description: "Slows marked opponents" },
};

export const ALL_PLAYERS: PlayerCard[] = [
  { id: "p1", name: "Kane", role: "striker", stats: { attack: 9, defense: 4, speed: 7, luck: 6 }, ability: "eagle_eye", jerseyNumber: 9 },
  { id: "p2", name: "Müller", role: "forward", stats: { attack: 7, defense: 5, speed: 8, luck: 8 }, ability: "bullet_pass", jerseyNumber: 10 },
  { id: "p3", name: "Kante", role: "midfielder", stats: { attack: 6, defense: 9, speed: 9, luck: 5 }, ability: "iron_tackle", jerseyNumber: 6 },
  { id: "p4", name: "Alaba", role: "defender", stats: { attack: 4, defense: 9, speed: 7, luck: 6 }, ability: "shadow_mark", jerseyNumber: 5 },
  { id: "p5", name: "Vinicius", role: "forward", stats: { attack: 8, defense: 3, speed: 10, luck: 7 }, ability: "ghost_run", jerseyNumber: 7 },
  { id: "p6", name: "Modric", role: "midfielder", stats: { attack: 7, defense: 7, speed: 7, luck: 9 }, ability: "bullet_pass", jerseyNumber: 8 },
  { id: "p7", name: "Dias", role: "defender", stats: { attack: 3, defense: 10, speed: 6, luck: 5 }, ability: "iron_tackle", jerseyNumber: 3 },
  { id: "p8", name: "Mbappe", role: "striker", stats: { attack: 9, defense: 3, speed: 10, luck: 7 }, ability: "ghost_run", jerseyNumber: 10 },
  { id: "p9", name: "Bellingham", role: "midfielder", stats: { attack: 8, defense: 7, speed: 8, luck: 8 }, ability: "powerhouse", jerseyNumber: 22 },
  { id: "p10", name: "Walker", role: "defender", stats: { attack: 4, defense: 8, speed: 9, luck: 5 }, ability: "ghost_run", jerseyNumber: 2 },
  { id: "p11", name: "Pedri", role: "midfielder", stats: { attack: 7, defense: 6, speed: 8, luck: 9 }, ability: "bullet_pass", jerseyNumber: 8 },
  { id: "p12", name: "Rudiger", role: "defender", stats: { attack: 4, defense: 10, speed: 7, luck: 4 }, ability: "shadow_mark", jerseyNumber: 22 },
];

export const AI_PLAYERS: PlayerCard[] = [
  { id: "ai1", name: "Torres", role: "striker", stats: { attack: 8, defense: 4, speed: 8, luck: 6 }, ability: "eagle_eye", jerseyNumber: 9 },
  { id: "ai2", name: "Reyes", role: "forward", stats: { attack: 7, defense: 5, speed: 7, luck: 7 }, ability: "powerhouse", jerseyNumber: 11 },
  { id: "ai3", name: "Marcos", role: "midfielder", stats: { attack: 6, defense: 7, speed: 8, luck: 6 }, ability: "iron_tackle", jerseyNumber: 8 },
  { id: "ai4", name: "Santos", role: "defender", stats: { attack: 4, defense: 8, speed: 7, luck: 5 }, ability: "shadow_mark", jerseyNumber: 4 },
  { id: "ai5", name: "Cruz", role: "striker", stats: { attack: 7, defense: 3, speed: 9, luck: 7 }, ability: "ghost_run", jerseyNumber: 7 },
  { id: "ai6", name: "Diaz", role: "midfielder", stats: { attack: 7, defense: 6, speed: 7, luck: 8 }, ability: "bullet_pass", jerseyNumber: 10 },
];

export function getDefaultSquad(): PlayerCard[] {
  return [ALL_PLAYERS[0], ALL_PLAYERS[2], ALL_PLAYERS[3], ALL_PLAYERS[4]];
}

export function getAISquadForArena(arena: string): PlayerCard[] {
  const powerMap: Record<string, number[]> = {
    bronze: [0, 2, 3, 4],
    silver: [0, 2, 3, 5],
    gold: [0, 1, 2, 5],
    elite: [0, 1, 3, 5],
  };
  const indices = powerMap[arena] ?? [0, 2, 3, 4];
  return indices.map(i => AI_PLAYERS[i]);
}
