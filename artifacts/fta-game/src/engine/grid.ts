import { GRID_COLS, GRID_ROWS, TILE_W, TILE_H, PITCH_WIDTH, PITCH_HEIGHT, PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT, GOALKEEPER_REACH_TILES, goalkeeperColumnBounds } from "./constants";
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

/** Whether the keeper is inside their own painted penalty area. */
export function isInsideOwnPenaltyArea(position: Vec2, teamId: "player" | "ai"): boolean {
  const inDepth = teamId === "player" ? position.x <= PENALTY_AREA_WIDTH : position.x >= PITCH_WIDTH - PENALTY_AREA_WIDTH;
  return inDepth && Math.abs(position.y - PITCH_HEIGHT / 2) <= PENALTY_AREA_HEIGHT / 2;
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
export function getReachableTiles(
  col: number,
  row: number,
  range: number,
  isGK: boolean,
  teamId: "player" | "ai",
  ability?: string,
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
        const bounds = goalkeeperColumnBounds(teamId, ability);
        if (nc < bounds.min || nc > bounds.max) continue;
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

// Legacy helper retained for callers that still normalize goalkeeper targets.
export function clampToGKZone(
  col: number,
  row: number,
  teamId: "player" | "ai",
  ability?: string,
): { col: number; row: number } {
  const bounds = goalkeeperColumnBounds(teamId, ability);
  return { col: Math.max(bounds.min, Math.min(bounds.max, col)), row };
}


export function getGoalkeeperDiveRange(_defense: number, _speed: number): number {
  return GOALKEEPER_REACH_TILES;
}

/** Own tile plus one quarter of the tile forward or to either side. */
export function isWithinGoalkeeperReach(keeperPosition: Vec2, ballPosition: Vec2, teamId: "player" | "ai"): boolean {
  const tile = posToTile(keeperPosition);
  const center = tileToPos(tile.col, tile.row);
  const forward = (ballPosition.x - center.x) / TILE_W * (teamId === "player" ? 1 : -1);
  const sideways = Math.abs(ballPosition.y - center.y) / TILE_H;
  const half = 0.5;
  const extent = half + (GOALKEEPER_REACH_TILES - 1);
  const epsilon = 1e-9;
  return forward >= -half - epsilon && (
    (forward <= extent + epsilon && sideways <= half + epsilon) ||
    (forward <= half + epsilon && sideways <= extent + epsilon)
  );
}

// These tiles choose a direction; they do not extend the catch area to their centres.
export function getDiveReachableTiles(
  col: number,
  row: number,
  range: number,
  teamId: "player" | "ai",
  ability?: string,
): { col: number; row: number }[] {
  const tiles: { col: number; row: number }[] = [];
  for (let dc = -1; dc <= 1; dc += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (Math.abs(dc) + Math.abs(dr) !== 1 || range <= 1) continue;
      if (dc !== 0 && dc !== (teamId === "player" ? 1 : -1)) continue;
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      const bounds = goalkeeperColumnBounds(teamId, ability);
      if (nc < bounds.min || nc > bounds.max) continue;
      tiles.push({ col: nc, row: nr });
    }
  }
  return tiles;
}
