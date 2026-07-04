import type { AITeamDef } from "./league";

export const TWO_PLAYER_TEAM_A: AITeamDef = {
  id: "2p_team_a",
  name: "Player 1",
  tier: 1,
  formationId: "1-2-1",
  jerseyColor: "#1565c0",
  secondaryColor: "#ffffff",
  crestIcon: "🔵",
  players: [
    { id: "2pa_gk",  name: "Gates",  role: "goalkeeper", jerseyNumber: 1,  stats: { speed: 5, attack: 4, defense: 8, passing: 5, luck: 5 }, ability: "none" },
    { id: "2pa_def", name: "Stone",  role: "defender",   jerseyNumber: 4,  stats: { speed: 6, attack: 5, defense: 7, passing: 5, luck: 5 }, ability: "none" },
    { id: "2pa_md1", name: "Centro", role: "midfielder", jerseyNumber: 8,  stats: { speed: 7, attack: 6, defense: 5, passing: 7, luck: 5 }, ability: "none" },
    { id: "2pa_md2", name: "Blaze",  role: "midfielder", jerseyNumber: 11, stats: { speed: 7, attack: 6, defense: 5, passing: 7, luck: 5 }, ability: "none" },
    { id: "2pa_fwd", name: "Rush",   role: "forward",    jerseyNumber: 9,  stats: { speed: 8, attack: 7, defense: 3, passing: 5, luck: 5 }, ability: "none" },
  ],
};

export const TWO_PLAYER_TEAM_B: AITeamDef = {
  id: "2p_team_b",
  name: "Player 2",
  tier: 1,
  formationId: "1-2-1",
  jerseyColor: "#b71c1c",
  secondaryColor: "#ffffff",
  crestIcon: "🔴",
  players: [
    { id: "2pb_gk", name: "Vault", role: "goalkeeper", jerseyNumber: 1, stats: { speed: 5, attack: 4, defense: 8, passing: 5, luck: 5 }, ability: "none" },
    { id: "2pb_def", name: "Wall", role: "defender", jerseyNumber: 5, stats: { speed: 6, attack: 5, defense: 7, passing: 5, luck: 5 }, ability: "none" },
    { id: "2pb_md1", name: "Pivot", role: "midfielder", jerseyNumber: 6, stats: { speed: 7, attack: 6, defense: 5, passing: 7, luck: 5 }, ability: "none" },
    { id: "2pb_md2", name: "Flux", role: "midfielder", jerseyNumber: 8, stats: { speed: 7, attack: 6, defense: 5, passing: 7, luck: 5 }, ability: "none" },
    { id: "2pb_fwd", name: "Strike", role: "forward", jerseyNumber: 9, stats: { speed: 8, attack: 8, defense: 3, passing: 5, luck: 5 }, ability: "none" },
  ],
};
