import type { PlayerCard, Ability, AbilityId } from "../engine/types";

export const ABILITIES: Record<AbilityId, Ability> = {
  bullet_pass:  { id: "bullet_pass",  name: "Bullet Pass",  description: "Passes travel 50% faster and cut through pressure" },
  iron_tackle:  { id: "iron_tackle",  name: "Iron Tackle",  description: "+20% tackle strength in physical duels" },
  ghost_run:    { id: "ghost_run",    name: "Ghost Run",    description: "Elusive runner — evades zonal press, +15% tackle evasion" },
  eagle_eye:    { id: "eagle_eye",    name: "Eagle Eye",    description: "+25% interception chance on passes" },
  powerhouse:   { id: "powerhouse",   name: "Powerhouse",   description: "Physical beast — +25% duel and tackle strength" },
  shadow_mark:  { id: "shadow_mark",  name: "Shadow Mark",  description: "Slows down a dribbling opponent on close contact" },
  goalkeeper:   { id: "goalkeeper",   name: "Goalkeeper",   description: "+35% save rate on shots and superior loose-ball control" },
};

export const ALL_PLAYERS: PlayerCard[] = [
  // ── Goalkeepers ──────────────────────────────────────────────────────────
  { id: "gk_neuer",   name: "Neuer",   role: "goalkeeper", stats: { attack: 3, defense: 9,  luck: 7 }, ability: "goalkeeper",  jerseyNumber: 1  },
  { id: "gk_alisson", name: "Alisson", role: "goalkeeper", stats: { attack: 2, defense: 10, luck: 8 }, ability: "goalkeeper",  jerseyNumber: 1  },
  { id: "gk_ederson", name: "Ederson", role: "goalkeeper", stats: { attack: 4, defense: 8,  luck: 6 }, ability: "goalkeeper",  jerseyNumber: 1  },

  // ── Defenders ─────────────────────────────────────────────────────────────
  { id: "p4",  name: "Alaba",   role: "defender", stats: { attack: 4, defense: 8,  luck: 6 }, ability: "shadow_mark",  jerseyNumber: 5  },
  { id: "p7",  name: "Dias",    role: "defender", stats: { attack: 3, defense: 10, luck: 5 }, ability: "iron_tackle",  jerseyNumber: 3  },
  { id: "p10", name: "Walker",  role: "defender", stats: { attack: 4, defense: 8,  luck: 5 }, ability: "ghost_run",    jerseyNumber: 2  },
  { id: "p12", name: "Rudiger", role: "defender", stats: { attack: 4, defense: 10, luck: 4 }, ability: "shadow_mark",  jerseyNumber: 22 },

  // ── Midfielders ───────────────────────────────────────────────────────────
  { id: "p3",  name: "Kante",      role: "midfielder", stats: { attack: 6, defense: 9, luck: 5 }, ability: "iron_tackle",  jerseyNumber: 6  },
  { id: "p6",  name: "Modric",     role: "midfielder", stats: { attack: 7, defense: 7, luck: 9 }, ability: "bullet_pass",  jerseyNumber: 8  },
  { id: "p9",  name: "Bellingham", role: "midfielder", stats: { attack: 8, defense: 7, luck: 8 }, ability: "powerhouse",   jerseyNumber: 22 },
  { id: "p11", name: "Pedri",      role: "midfielder", stats: { attack: 7, defense: 6, luck: 9 }, ability: "bullet_pass",  jerseyNumber: 8  },

  // ── Forwards / Strikers ───────────────────────────────────────────────────
  { id: "p1", name: "Kane",     role: "striker", stats: { attack: 9, defense: 4, luck: 6 }, ability: "eagle_eye",   jerseyNumber: 9  },
  { id: "p2", name: "Muller",   role: "forward", stats: { attack: 7, defense: 5, luck: 8 }, ability: "bullet_pass", jerseyNumber: 10 },
  { id: "p5", name: "Vinicius", role: "forward", stats: { attack: 8, defense: 3, luck: 7 }, ability: "ghost_run",   jerseyNumber: 7  },
  { id: "p8", name: "Mbappe",   role: "striker", stats: { attack: 9, defense: 3, luck: 7 }, ability: "ghost_run",   jerseyNumber: 10 },
];

export function getDefaultSquad(): PlayerCard[] {
  return [
    ALL_PLAYERS.find(p => p.id === "gk_neuer")!,
    ALL_PLAYERS.find(p => p.id === "p4")!,
    ALL_PLAYERS.find(p => p.id === "p3")!,
    ALL_PLAYERS.find(p => p.id === "p5")!,
    ALL_PLAYERS.find(p => p.id === "p1")!,
  ];
}

export function getGoalkeepers(): PlayerCard[] {
  return ALL_PLAYERS.filter(p => p.role === "goalkeeper");
}

export function getOutfieldPlayers(): PlayerCard[] {
  return ALL_PLAYERS.filter(p => p.role !== "goalkeeper");
}
