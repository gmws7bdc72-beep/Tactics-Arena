import type { PlayerCard, PlayerRole, PlayerStats } from "../engine/types";

const REWARD_CODE = "rodrigoiscuteasl";
const BASE_STATS: PlayerStats = {
  attack: 8,
  defense: 8,
  passing: 8,
  speed: 8,
  movement: 8,
  shooting: 8,
  dribbling: 8,
  tackling: 8,
  marking: 8,
  stamina: 8,
  strength: 8,
  vision: 8,
  longPassing: 8,
  aerial: 8,
};

const ROSTER: Array<{
  name: string;
  role: PlayerRole;
  ability: PlayerCard["ability"];
  boostedStats: Array<keyof PlayerStats>;
}> = [
  { name: "R. Sentinel", role: "goalkeeper", ability: "goalkeeper", boostedStats: ["defense", "movement", "marking"] },
  { name: "R. Anchor", role: "defender", ability: "shadow_mark", boostedStats: ["defense", "aerial", "tackling"] },
  { name: "R. Shield", role: "defender", ability: "iron_tackle", boostedStats: ["defense", "aerial", "tackling"] },
  { name: "R. Engine", role: "midfielder", ability: "bullet_pass", boostedStats: ["attack", "movement", "passing", "longPassing"] },
  { name: "R. Spark", role: "forward", ability: "ghost_run", boostedStats: ["attack", "vision", "speed", "passing", "aerial"] },
  { name: "R. Finisher", role: "striker", ability: "eagle_eye", boostedStats: ["attack", "shooting", "strength", "vision"] },
  { name: "R. Wall", role: "defender", ability: "powerhouse", boostedStats: ["defense", "aerial", "tackling"] },
  { name: "R. Marker", role: "defender", ability: "bullet_pass", boostedStats: ["defense", "aerial", "tackling"] },
  { name: "R. Link", role: "midfielder", ability: "shadow_mark", boostedStats: ["attack", "movement", "passing", "longPassing"] },
  { name: "R. Switch", role: "midfielder", ability: "bullet_pass", boostedStats: ["attack", "movement", "passing", "longPassing"] },
  { name: "R. Pulse", role: "midfielder", ability: "powerhouse", boostedStats: ["attack", "movement", "passing", "longPassing"] },
  { name: "R. Arrow", role: "forward", ability: "eagle_eye", boostedStats: ["attack", "vision", "speed", "passing", "aerial"] },
  { name: "R. Clutch", role: "forward", ability: "powerhouse", boostedStats: ["attack", "vision", "speed", "passing", "aerial"] },
  { name: "R. Strike", role: "striker", ability: "iron_tackle", boostedStats: ["attack", "shooting", "strength", "vision"] },
  { name: "R. Ace", role: "striker", ability: "bullet_pass", boostedStats: ["attack", "shooting", "strength", "vision"] },
  { name: "R. Dash", role: "forward", ability: "shadow_mark", boostedStats: ["attack", "vision", "speed", "passing", "aerial"] },
];

export function createCodeRewardSquad(code: string): PlayerCard[] | null {
  if (code.trim().toLowerCase() !== REWARD_CODE) return null;

  return ROSTER.map(({ name, role, ability, boostedStats }, index) => {
    const stats = { ...BASE_STATS };
    for (const stat of boostedStats) stats[stat] = 9;
    return {
      id: `rodrigo_85_${String(index + 1).padStart(2, "0")}`,
      name,
      role,
      ability,
      jerseyNumber: index + 1,
      stats,
      age: 25,
      potential: 8.5,
    };
  });
}
