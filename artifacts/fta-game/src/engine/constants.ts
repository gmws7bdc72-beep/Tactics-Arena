export const PITCH_WIDTH = 700;
export const PITCH_HEIGHT = 460;

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
export const INTERCEPTION_RADIUS = 22;
export const CONTEST_RADIUS = 24;

export const BALL_FRICTION = 0.97;
export const PASS_SPEED = 280;
export const SHOT_SPEED = 380;

export const PASS_WIND_UP = 0.25;
export const PASS_RECOVERY = 0.4;
export const SHOT_WIND_UP = 0.35;
export const SHOT_RECOVERY = 0.6;

export const BASE_PLAYER_SPEED = 80;
export const SPEED_STAT_MULTIPLIER = 4.5;
export const ACCELERATION = 400;
export const TURNING_COST = 0.3;

export const AI_SHOT_RANGE = 180;
export const AI_PASS_SAFE_DISTANCE = 120;

export const MATCH_TURNS = 12;

export const ARENAS = ["bronze", "silver", "gold", "elite"] as const;
export const WINS_TO_PROMOTE = 3;
export const LOSSES_TO_RELEGATE = 3;
