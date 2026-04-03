import { GRID_COLS, GRID_ROWS, TILE_W, TILE_H } from "./constants";
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

export function isAdjacentOrSame(
  col1: number, row1: number,
  col2: number, row2: number
): boolean {
  return Math.abs(col1 - col2) <= 1 && Math.abs(row1 - row2) <= 1;
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}
