export interface Vec2 {
  x: number;
  y: number;
}

export interface TilePos {
  col: number;
  row: number;
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
  followUp?: Command;
  /** When true the pass is a planned coordinated play — skip accuracy deviation so
   *  the ball lands exactly on the announced tile, matching the runner's move target. */
  coordinated?: boolean;
}

export interface PlayerStats {
  attack: number;
  defense: number;
  passing: number;
  speed: number;
  luck: number;
}

export type AbilityId =
  | "bullet_pass"
  | "iron_tackle"
  | "ghost_run"
  | "eagle_eye"
  | "powerhouse"
  | "shadow_mark"
  | "goalkeeper";

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
}

export interface PlayerCard {
  id: string;
  name: string;
  role: "goalkeeper" | "defender" | "midfielder" | "forward" | "striker";
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
  role: "goalkeeper" | "defender" | "midfielder" | "forward" | "striker";
}

export interface SimBall {
  position: Vec2;
  velocity: Vec2;
  ownerId: string | null;
  /** If set, ball is in a "pass animation" and will snap to this position
   *  when it reaches the closest point or slows to a stop. */
  passTarget?: Vec2;
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
    role: "goalkeeper" | "defender" | "midfielder" | "forward" | "striker";
    tileRange: number;
  }[];
  ball: {
    position: Vec2;
    velocity: Vec2;
    ownerId: string | null;
  };
  events: GameEvent[];
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

export interface LeagueTeamEntry {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface ScheduledMatch {
  opponentId: string;
  opponentName: string;
  played: boolean;
  playerGoals: number;
  opponentGoals: number;
  isHome?: boolean;
}

export interface PlayoffMatch {
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals?: number;
  awayGoals?: number;
  winnerId?: string;
}

export interface PlayoffBracket {
  stage: "sf1" | "sf2" | "final" | "complete";
  top4: string[];         // team IDs ranked 1st–4th
  sf1: PlayoffMatch;      // 1st vs 2nd
  sf2: PlayoffMatch;      // 3rd vs 4th
  final?: PlayoffMatch;   // sf1 winner vs sf2 winner
  champion?: string;      // winning team ID
  championName?: string;  // winning team name
}

export interface MatchdayResult {
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
}

export interface LeagueState {
  teams: LeagueTeamEntry[];
  schedule: ScheduledMatch[];
  currentMatchIndex: number;
  playoff?: PlayoffBracket;
  aiSchedule?: [string, string][];
  aiMatchIndex?: number;
  lastMatchdayResults?: MatchdayResult[];
}

export interface SavedMatchState {
  version: 1;
  twoPlayer: boolean;
  isHome: boolean;
  turn: number;
  phase: "planning" | "simulating" | "finished";
  score: { player: number; ai: number };
  players: SimPlayer[];
  ball: SimBall;
  currentFrame: FrameSnapshot;
  allEvents: GameEvent[];
  matchEndResult: { playerScore: number; aiScore: number } | null;
  pendingCommands: [string, Command][];
  selectedPlayerId: string | null;
  passTargetMode: boolean;
  twoPlayerTurn: "p1" | "p2";
  p1StoredCommands: [string, Command][];
  comboMoveFirst: boolean;
  comboActive: boolean;
  comboStep: 1 | 2;
  comboStoredMove: Vec2 | null;
  comboStoredPass: { targetPosition?: Vec2; targetPlayerId?: string } | null;
  replayMode: boolean;
  replayIdx: number;
  replaySpeed: 1 | 6 | 8 | 10;
  replayPlaying: boolean;
  turnSaveCount: number;
}
