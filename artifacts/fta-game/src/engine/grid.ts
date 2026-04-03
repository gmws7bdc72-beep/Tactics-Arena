import { GRID_COLS, GRID_ROWS, TILE_W, TILE_H, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX, GK_COLS_AI_MIN, GK_COLS_AI_MAX } from "./constants";
import type { Vec2 } from "./types";

export function tileToPos(col: number, row: number): Vec2 {
  return {
    x: (col + 0.5) * TILE_W,
    y: (row + 0.5) * TILE_H,
  };
}

export function posToTile(pos: Vec2): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(pos.x / TILE_W))),
    row: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(pos.y / TILE_H))),
  };
}

export function getAdjacentTiles(col: number, row: number): { col: number; row: number }[] {
  const tiles: { col: number; row: number }[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const nc = col + dc;
      const nr = row + dr;
      if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS) {
        tiles.push({ col: nc, row: nr });
      }
    }
  }
  return tiles;
}

// Get all tiles reachable from (col, row) within Chebyshev distance `range`.
// Optionally constrained to GK zone for goalkeeper roles.
export function getReachableTiles(
  col: number,
  row: number,
  range: number,
  isGK: boolean,
  teamId: "player" | "ai"
): { col: number; row: number }[] {
  const tiles: { col: number; row: number }[] = [];
  for (let dc = -range; dc <= range; dc++) {
    for (let dr = -range; dr <= range; dr++) {
      if (dc === 0 && dr === 0) continue;
      // Chebyshev: both |dc| and |dr| must be ≤ range
      if (Math.max(Math.abs(dc), Math.abs(dr)) > range) continue;
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      if (isGK) {
        if (teamId === "player" && (nc < GK_COLS_PLAYER_MIN || nc > GK_COLS_PLAYER_MAX)) continue;
        if (teamId === "ai" && (nc < GK_COLS_AI_MIN || nc > GK_COLS_AI_MAX)) continue;
      }
      tiles.push({ col: nc, row: nr });
    }
  }
  return tiles;
}

export function isAdjacentOrSame(
  col1: number, row1: number,
  col2: number, row2: number
): boolean {
  return Math.abs(col1 - col2) <= 1 && Math.abs(row1 - row2) <= 1;
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

// Clamp a tile to the GK zone
export function clampToGKZone(col: number, row: number, teamId: "player" | "ai"): { col: number; row: number } {
  if (teamId === "player") {
    return { col: Math.max(GK_COLS_PLAYER_MIN, Math.min(GK_COLS_PLAYER_MAX, col)), row };
  }
  return { col: Math.max(GK_COLS_AI_MIN, Math.min(GK_COLS_AI_MAX, col)), row };
}
