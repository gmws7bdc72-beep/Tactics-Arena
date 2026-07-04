import type { AITeamDef } from "./league";
import { TEAM_TACTICS } from "./league";
import type { PlayerStats } from "../engine/types";

const s = (stats: PlayerStats): PlayerStats => stats;

export const TWO_PLAYER_TEAM_A: AITeamDef = {
  id: "2p_team_a",
  name: "Player 1",
  tier: 1,
  formationId: "1-2-1",
  tacticId: "balanced_build_up",
  tactic: TEAM_TACTICS.balanced_build_up,
  jerseyColor: "#1565c0",
  secondaryColor: "#ffffff",
  crestIcon: "🔵",
  players: [
    { id: "2pa_gk",  name: "Gates",  role: "goalkeeper", jerseyNumber: 1,  stats: s({ speed: 5, attack: 4, defense: 8, passing: 5, luck: 5, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 7, strength: 8, vision: 5, longPassing: 6, aerial: 8 }), ability: "none" },
    { id: "2pa_def", name: "Stone",  role: "defender",   jerseyNumber: 4,  stats: s({ speed: 6, attack: 5, defense: 7, passing: 5, luck: 5, shooting: 4, dribbling: 5, tackling: 7, marking: 7, stamina: 8, strength: 8, vision: 5, longPassing: 6, aerial: 7 }), ability: "none" },
    { id: "2pa_md1", name: "Centro", role: "midfielder", jerseyNumber: 8,  stats: s({ speed: 7, attack: 6, defense: 5, passing: 7, luck: 5, shooting: 6, dribbling: 7, tackling: 5, marking: 6, stamina: 8, strength: 6, vision: 7, longPassing: 7, aerial: 5 }), ability: "none" },
    { id: "2pa_md2", name: "Blaze",  role: "midfielder", jerseyNumber: 11, stats: s({ speed: 7, attack: 6, defense: 5, passing: 7, luck: 5, shooting: 6, dribbling: 7, tackling: 5, marking: 6, stamina: 8, strength: 6, vision: 7, longPassing: 7, aerial: 5 }), ability: "none" },
    { id: "2pa_fwd", name: "Rush",   role: "forward",    jerseyNumber: 9,  stats: s({ speed: 8, attack: 7, defense: 3, passing: 5, luck: 5, shooting: 7, dribbling: 8, tackling: 3, marking: 4, stamina: 8, strength: 7, vision: 5, longPassing: 5, aerial: 6 }), ability: "none" },
  ],
};

export const TWO_PLAYER_TEAM_B: AITeamDef = {
  id: "2p_team_b",
  name: "Player 2",
  tier: 1,
  formationId: "1-2-1",
  tacticId: "balanced_build_up",
  tactic: TEAM_TACTICS.balanced_build_up,
  jerseyColor: "#b71c1c",
  secondaryColor: "#ffffff",
  crestIcon: "🔴",
  players: [
    { id: "2pb_gk", name: "Vault", role: "goalkeeper", jerseyNumber: 1, stats: s({ speed: 5, attack: 4, defense: 8, passing: 5, luck: 5, shooting: 2, dribbling: 4, tackling: 5, marking: 8, stamina: 7, strength: 8, vision: 5, longPassing: 6, aerial: 8 }), ability: "none" },
    { id: "2pb_def", name: "Wall", role: "defender", jerseyNumber: 5, stats: s({ speed: 6, attack: 5, defense: 7, passing: 5, luck: 5, shooting: 4, dribbling: 5, tackling: 7, marking: 7, stamina: 8, strength: 8, vision: 5, longPassing: 6, aerial: 7 }), ability: "none" },
    { id: "2pb_md1", name: "Pivot", role: "midfielder", jerseyNumber: 6, stats: s({ speed: 7, attack: 6, defense: 5, passing: 7, luck: 5, shooting: 6, dribbling: 7, tackling: 5, marking: 6, stamina: 8, strength: 6, vision: 7, longPassing: 7, aerial: 5 }), ability: "none" },
    { id: "2pb_md2", name: "Flux", role: "midfielder", jerseyNumber: 8, stats: s({ speed: 7, attack: 6, defense: 5, passing: 7, luck: 5, shooting: 6, dribbling: 7, tackling: 5, marking: 6, stamina: 8, strength: 6, vision: 7, longPassing: 7, aerial: 5 }), ability: "none" },
    { id: "2pb_fwd", name: "Strike", role: "forward", jerseyNumber: 9, stats: s({ speed: 8, attack: 8, defense: 3, passing: 5, luck: 5, shooting: 8, dribbling: 8, tackling: 3, marking: 4, stamina: 8, strength: 7, vision: 5, longPassing: 5, aerial: 6 }), ability: "none" },
  ],
};
