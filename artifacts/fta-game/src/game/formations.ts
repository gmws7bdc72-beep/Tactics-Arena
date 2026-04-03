import type { Formation } from "../engine/types";

const TW = 70;
const TH = 460 / 7;
const tc = (col: number, row: number) => ({ x: (col + 0.5) * TW, y: (row + 0.5) * TH });

// 5v5 formations: GK + 4 outfield (positions[0] = GK)
// Player team: attacks right (col 9), GK at col 0
export const FORMATIONS: Formation[] = [
  {
    id: "1-1-2",
    name: "1-1-2 (Attack)",
    positions: [tc(0, 3), tc(2, 3), tc(3, 3), tc(4, 2), tc(4, 4)],
  },
  {
    id: "2-1-1",
    name: "2-1-1 (Defend)",
    positions: [tc(0, 3), tc(2, 2), tc(2, 4), tc(3, 3), tc(4, 3)],
  },
  {
    id: "1-2-1",
    name: "1-2-1 (Balance)",
    positions: [tc(0, 3), tc(2, 3), tc(3, 2), tc(3, 4), tc(4, 3)],
  },
];

// AI formations: attacks left (col 0), GK at col 9
export const AI_FORMATIONS: Formation[] = [
  {
    id: "ai-1-1-2",
    name: "1-1-2",
    positions: [tc(9, 3), tc(7, 3), tc(6, 3), tc(5, 2), tc(5, 4)],
  },
  {
    id: "ai-2-1-1",
    name: "2-1-1",
    positions: [tc(9, 3), tc(7, 2), tc(7, 4), tc(6, 3), tc(5, 3)],
  },
  {
    id: "ai-1-2-1",
    name: "1-2-1",
    positions: [tc(9, 3), tc(7, 3), tc(6, 2), tc(6, 4), tc(5, 3)],
  },
];

export function getFormationById(id: string): Formation {
  return FORMATIONS.find(f => f.id === id) ?? FORMATIONS[0];
}

export function getAIFormationById(formationId: string): Formation {
  const aiId = "ai-" + formationId;
  return AI_FORMATIONS.find(f => f.id === aiId) ?? AI_FORMATIONS[0];
}
