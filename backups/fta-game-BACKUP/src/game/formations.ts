import type { Formation } from "../engine/types";
import { TILE_W, TILE_H } from "../engine/constants";

const tc = (col: number, row: number) => ({ x: (col + 0.5) * TILE_W, y: (row + 0.5) * TILE_H });

// 5v5 formations: GK + 4 outfield (positions[0] = GK)
// Player team: attacks right (col 15), GK at col 0, own half = cols 0-7
export const FORMATIONS: Formation[] = [
  {
    id: "1-1-2",
    name: "1-1-2 (Attack)",
    positions: [tc(0, 4), tc(3, 4), tc(5, 4), tc(7, 2), tc(7, 6)],
  },
  {
    id: "2-1-1",
    name: "2-1-1 (Defend)",
    positions: [tc(0, 4), tc(3, 2), tc(3, 6), tc(5, 4), tc(7, 4)],
  },
  {
    id: "1-2-1",
    name: "1-2-1 (Balance)",
    positions: [tc(0, 4), tc(3, 4), tc(5, 2), tc(5, 6), tc(7, 4)],
  },
];

// AI formations: attacks left (col 0), GK at col 15, own half = cols 8-15
export const AI_FORMATIONS: Formation[] = [
  {
    id: "ai-1-1-2",
    name: "1-1-2",
    positions: [tc(15, 4), tc(12, 4), tc(10, 4), tc(8, 2), tc(8, 6)],
  },
  {
    id: "ai-2-1-1",
    name: "2-1-1",
    positions: [tc(15, 4), tc(12, 2), tc(12, 6), tc(10, 4), tc(8, 4)],
  },
  {
    id: "ai-1-2-1",
    name: "1-2-1",
    positions: [tc(15, 4), tc(12, 4), tc(10, 2), tc(10, 6), tc(8, 4)],
  },
];

export function getFormationById(id: string): Formation {
  return FORMATIONS.find(f => f.id === id) ?? FORMATIONS[0];
}

export function getAIFormationById(formationId: string): Formation {
  const aiId = "ai-" + formationId;
  return AI_FORMATIONS.find(f => f.id === aiId) ?? AI_FORMATIONS[0];
}
