export const PITCH_WIDTH = 744;
export const PITCH_HEIGHT = 460;

export const GRID_COLS = 17;
export const GRID_ROWS = 9;
export const TILE_W = PITCH_WIDTH / GRID_COLS;
export const TILE_H = PITCH_HEIGHT / GRID_ROWS;

export const GOAL_WIDTH = 220;
export const GOAL_DEPTH = TILE_W; // exactly one full grid square

export const GOAL_LEFT_X = 0;
export const GOAL_RIGHT_X = PITCH_WIDTH;
export const GOAL_TOP_Y = (PITCH_HEIGHT - GOAL_WIDTH) / 2;
export const GOAL_BOTTOM_Y = GOAL_TOP_Y + GOAL_WIDTH;

export const PENALTY_AREA_WIDTH = 128;
export const PENALTY_AREA_HEIGHT = GOAL_WIDTH + TILE_H * 2;

export const TICKS_PER_TURN = 60;
export const DELTA = 0.05;
export const TURN_DURATION = TICKS_PER_TURN * DELTA;

export const BALL_RADIUS = 6;
export const PLAYER_RADIUS = 16;

export const PLAYER_CONTROL_RADIUS = 20;
export const INTERCEPTION_RADIUS = 24;
export const CONTEST_RADIUS = 26;

export const BALL_FRICTION = 0.983;
export const PASS_SPEED = 150;
export const SHOT_SPEED = 340;

export const PASS_WIND_UP = 0.25;
// Long balls use a longer, smoother wind-up so the full-body kick reads clearly.
export const LONG_PASS_WIND_UP = 0.65;
export const PASS_RECOVERY = 0.2;
export const SHOT_WIND_UP = 0.30;
export const SHOT_RECOVERY = 0.6;

// Traditional goalkeeper zone: the three columns inside each penalty area.
// Both sides now follow the same rule. The old player-only 0-10 allowance is gone.
export const GK_COLS_PLAYER_MIN = 0;
export const GK_COLS_PLAYER_MAX = 2;
export const GK_COLS_AI_MIN = GRID_COLS - 3;
export const GK_COLS_AI_MAX = GRID_COLS - 1;

// Sweeper Keepers may advance three additional columns beyond the box.
export const SWEEPER_GK_COLS_PLAYER_MIN = 0;
export const SWEEPER_GK_COLS_PLAYER_MAX = 5;
export const SWEEPER_GK_COLS_AI_MIN = GRID_COLS - 6;
export const SWEEPER_GK_COLS_AI_MAX = GRID_COLS - 1;

export function isSweeperKeeperAbility(ability?: string): boolean {
  return ability === "sweeper_keeper";
}

export function isGoalkeeperAbility(ability?: string): boolean {
  return ability === "goalkeeper" || ability === "sweeper_keeper";
}

export function goalkeeperColumnBounds(
  teamId: "player" | "ai",
  ability?: string,
): { min: number; max: number } {
  if (isSweeperKeeperAbility(ability)) {
    return teamId === "player"
      ? { min: SWEEPER_GK_COLS_PLAYER_MIN, max: SWEEPER_GK_COLS_PLAYER_MAX }
      : { min: SWEEPER_GK_COLS_AI_MIN, max: SWEEPER_GK_COLS_AI_MAX };
  }

  return teamId === "player"
    ? { min: GK_COLS_PLAYER_MIN, max: GK_COLS_PLAYER_MAX }
    : { min: GK_COLS_AI_MIN, max: GK_COLS_AI_MAX };
}

export const GOALS_TO_WIN = 3;
export const MAX_MATCH_TURNS = 30;
export const PLAYERS_PER_TEAM = 6;

export const AI_SHOT_RANGE = 200;
export const AI_PASS_SAFE_DISTANCE = 120;

// Movement stat → selectable tile range per turn.
// Ordinary outfield players are capped at 2 tiles. Ghost Run unlocks the
// elite 3-tile band, while Sweeper Keeper receives the same full movement band.
export function movementToTiles(movement: number, ability?: string): number {
  const naturalRange = Math.min(
    3,
    Math.ceil(Math.max(1, Math.min(10, movement)) / 4),
  );
  return ability === "ghost_run" || ability === "sweeper_keeper"
    ? naturalRange
    : Math.min(2, naturalRange);
}

// Speed controls the player's actual running pace inside the route allowed by
// Movement. Ordinary players remain capped at a 2-tile pace; Ghost Run and
// Sweeper Keeper can reach the elite 3-tile pace at Speed 9-10.
export function getLinearPixelSpeed(speed: number, ability?: string): number {
  const naturalPace = Math.min(
    3,
    Math.ceil(Math.max(1, Math.min(10, speed)) / 4),
  );
  const paceTiles =
    (ability === "ghost_run" || ability === "sweeper_keeper")
      ? naturalPace
      : Math.min(2, naturalPace);
  const targetTicks = TICKS_PER_TURN * 0.75;
  return (paceTiles * TILE_W) / (targetTicks * DELTA);
}
