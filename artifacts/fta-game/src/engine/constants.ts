export const PITCH_WIDTH = 700;
export const PITCH_HEIGHT = 460;

export const GRID_COLS = 10;
export const GRID_ROWS = 7;
export const TILE_W = PITCH_WIDTH / GRID_COLS;
export const TILE_H = PITCH_HEIGHT / GRID_ROWS;

export const GOAL_WIDTH = 80;
export const GOAL_DEPTH = 20;

export const GOAL_LEFT_X = 0;
export const GOAL_RIGHT_X = PITCH_WIDTH;
export const GOAL_TOP_Y = (PITCH_HEIGHT - GOAL_WIDTH) / 2;
export const GOAL_BOTTOM_Y = GOAL_TOP_Y + GOAL_WIDTH;

export const PENALTY_AREA_WIDTH = 120;
export const PENALTY_AREA_HEIGHT = 200;

export const TICKS_PER_TURN = 60;
export const DELTA = 0.05;
export const TURN_DURATION = TICKS_PER_TURN * DELTA;

export const BALL_RADIUS = 8;
export const PLAYER_RADIUS = 14;

export const PLAYER_CONTROL_RADIUS = 20;
export const INTERCEPTION_RADIUS = 24;
export const CONTEST_RADIUS = 26;

export const BALL_FRICTION = 0.97;
export const PASS_SPEED = 280;
export const SHOT_SPEED = 380;

export const PASS_WIND_UP = 0.25;
export const PASS_RECOVERY = 0.4;
export const SHOT_WIND_UP = 0.35;
export const SHOT_RECOVERY = 0.6;

export const BASE_PLAYER_SPEED = 220;
export const ACCELERATION = 600;
export const TURNING_COST = 0.4;

// GK zone: cols 0-1 for player team, cols 8-9 for AI
export const GK_ZONE_COLS = 2;

export const GOALS_TO_WIN = 3;
export const MAX_MATCH_TURNS = 30;
export const PLAYERS_PER_TEAM = 5;

export const AI_SHOT_RANGE = 200;
export const AI_PASS_SAFE_DISTANCE = 120;

export const ARENAS = ["bronze", "silver", "gold", "elite"] as const;
export const WINS_TO_PROMOTE = 3;
export const LOSSES_TO_RELEGATE = 3;
