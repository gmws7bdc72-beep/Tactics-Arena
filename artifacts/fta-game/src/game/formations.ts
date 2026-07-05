import type { Formation, Vec2 } from "../engine/types";
import { GRID_COLS, TILE_W, TILE_H } from "../engine/constants";

const tc = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE_W, y: (row + 0.5) * TILE_H });
const posToTile = (p: Vec2) => ({ col: Math.floor(p.x / TILE_W), row: Math.floor(p.y / TILE_H) });

const rowsForCount = (count: number): number[] => {
  switch (count) {
    case 0: return [];
    case 1: return [4];
    case 2: return [3, 5];
    case 3: return [2, 4, 6];
    case 4: return [1, 3, 5, 7];
    default: return [0, 2, 4, 6, 8];
  }
};

function linePositions(count: number, col: number): Vec2[] {
  return rowsForCount(count).map(row => tc(col, row));
}

function makeFormation(id: string, label: string, defenders: number, midfielders: number, forwards: number): Formation {
  return {
    id,
    name: `${label} (${defenders}-${midfielders}-${forwards})`,
    positions: [
      tc(0, 4),
      ...linePositions(defenders, 3),
      ...linePositions(midfielders, 5),
      ...linePositions(forwards, 7),
    ],
  };
}

function mirrorForAI(formation: Formation): Formation {
  return {
    id: `ai-${formation.id}`,
    name: formation.name,
    positions: formation.positions.map(pos => {
      const tile = posToTile(pos);
      return tc((GRID_COLS - 1) - tile.col, tile.row);
    }),
  };
}

// 6v6 formations: GK + 5 outfield players.
// IDs use D-M-F after the goalkeeper: defenders-midfielders-forwards.
// This covers every legal 6v6 shape with at least 1 defender.
export const FORMATIONS: Formation[] = [
  // One defender: aggressive / overload shapes
  makeFormation("1-0-4", "All-Out Attack", 1, 0, 4),
  makeFormation("1-1-3", "Three-Forward Rush", 1, 1, 3),
  makeFormation("1-2-2", "Counter Wave", 1, 2, 2),
  makeFormation("1-3-1", "Midfield Diamond", 1, 3, 1),
  makeFormation("1-4-0", "False-Nine Control", 1, 4, 0),

  // Two defenders: balanced shapes
  makeFormation("2-0-3", "Direct Front Three", 2, 0, 3),
  makeFormation("2-1-2", "Classic Balance", 2, 1, 2),
  makeFormation("2-2-1", "Box Midfield", 2, 2, 1),
  makeFormation("2-3-0", "Possession Box", 2, 3, 0),

  // Three defenders: secure shapes
  makeFormation("3-0-2", "Deep Direct", 3, 0, 2),
  makeFormation("3-1-1", "Low Block Spear", 3, 1, 1),
  makeFormation("3-2-0", "Heavy Mid Block", 3, 2, 0),

  // Four / five defenders: extreme defensive shapes
  makeFormation("4-0-1", "Back Four Counter", 4, 0, 1),
  makeFormation("4-1-0", "Back Four Control", 4, 1, 0),
  makeFormation("5-0-0", "Full Lockdown", 5, 0, 0),
];

// AI attacks left, so we mirror the player formations horizontally.
export const AI_FORMATIONS: Formation[] = FORMATIONS.map(mirrorForAI);

export function getFormationById(id: string): Formation {
  return FORMATIONS.find(f => f.id === id) ?? FORMATIONS.find(f => f.id === "2-1-2") ?? FORMATIONS[0];
}

export function getAIFormationById(formationId: string): Formation {
  const aiId = formationId.startsWith("ai-") ? formationId : `ai-${formationId}`;
  return AI_FORMATIONS.find(f => f.id === aiId) ?? AI_FORMATIONS.find(f => f.id === "ai-2-1-2") ?? AI_FORMATIONS[0];
}
