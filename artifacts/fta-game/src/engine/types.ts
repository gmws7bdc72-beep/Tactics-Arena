export interface Vec2 {
  x: number;
  y: number;
}

export enum PlayerState {
  IDLE = "IDLE",
  MOVING = "MOVING",
  DRIBBLING = "DRIBBLING",
  PASSING = "PASSING",
  SHOOTING = "SHOOTING",
  CONTESTING = "CONTESTING",
  RECOVERING = "RECOVERING",
}

export enum CommandType {
  MOVE = "MOVE",
  PASS = "PASS",
  SHOOT = "SHOOT",
}

export interface Command {
  type: CommandType;
  targetPosition?: Vec2;
  targetPlayerId?: string;
  triggerTime?: number;
}

export interface PlayerStats {
  attack: number;
  defense: number;
  speed: number;
  luck: number;
}

export type AbilityId =
  | "bullet_pass"
  | "iron_tackle"
  | "ghost_run"
  | "eagle_eye"
  | "powerhouse"
  | "shadow_mark";

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
}

export interface PlayerCard {
  id: string;
  name: string;
  role: "defender" | "midfielder" | "forward" | "striker";
  stats: PlayerStats;
  ability: AbilityId;
  jerseyNumber: number;
}

export interface SimPlayer {
  id: string;
  teamId: "player" | "ai";
  cardId: string;
  position: Vec2;
  velocity: Vec2;
  state: PlayerState;
  stats: PlayerStats;
  ability: AbilityId;
  command: Command | null;
  commandExecuted: boolean;
  stateTimer: number;
  recoveryTimer: number;
  name: string;
  jerseyNumber: number;
}

export interface SimBall {
  position: Vec2;
  velocity: Vec2;
  ownerId: string | null;
}

export enum GameEventType {
  GOAL = "GOAL",
  PASS_COMPLETE = "PASS_COMPLETE",
  PASS_INTERCEPTED = "PASS_INTERCEPTED",
  TACKLE = "TACKLE",
  LOOSE_BALL = "LOOSE_BALL",
  SHOT_ON_GOAL = "SHOT_ON_GOAL",
  SHOT_BLOCKED = "SHOT_BLOCKED",
  SAVE = "SAVE",
  KICKOFF = "KICKOFF",
}

export interface GameEvent {
  type: GameEventType;
  tick: number;
  playerId?: string;
  targetId?: string;
  teamId?: "player" | "ai";
  message: string;
}

export interface FrameSnapshot {
  tick: number;
  players: {
    id: string;
    teamId: "player" | "ai";
    position: Vec2;
    velocity: Vec2;
    state: PlayerState;
    name: string;
    jerseyNumber: number;
  }[];
  ball: {
    position: Vec2;
    velocity: Vec2;
    ownerId: string | null;
  };
  events: GameEvent[];
}

export interface MatchState {
  score: { player: number; ai: number };
  turn: number;
  maxTurns: number;
  phase: "planning" | "simulating" | "finished";
  frames: FrameSnapshot[];
  currentFrame: number;
  allEvents: GameEvent[];
  goalScoredBy?: "player" | "ai";
}

export interface Formation {
  id: string;
  name: string;
  positions: Vec2[];
}

export interface TeamConfig {
  name: string;
  jerseyColor: string;
  secondaryColor: string;
  crestIcon: string;
  players: PlayerCard[];
  formationId: string;
  startPositions: Vec2[];
}

export interface ArenaProgress {
  arena: "bronze" | "silver" | "gold" | "elite";
  wins: number;
  losses: number;
  winsInArena: number;
  lossesInArena: number;
}
