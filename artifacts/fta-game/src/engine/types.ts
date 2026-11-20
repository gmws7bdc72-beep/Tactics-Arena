export type PlayerRole = "goalkeeper" | "defender" | "midfielder" | "forward" | "striker";

export type KitStyle = "solid" | "vertical-stripes" | "horizontal-stripes" | "diagonal-sash";
export type SleeveStyle = "primary" | "secondary" | "split";

export interface PlayerAppearance {
  skinTone: string;
  hairColor: string;
  hairStyle: "short" | "fade" | "curly" | "mohawk" | "bald" | "dreadlocks";
  facialHair: "none" | "stubble" | "goatee" | "full";
}

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
  SLIDING = "SLIDING",
  LUNGING = "LUNGING",
  RECOVERING = "RECOVERING",
  DIVING = "DIVING",
}

export enum CommandType {
  MOVE = "MOVE",
  PASS = "PASS",
  SHOOT = "SHOOT",
  DIVE = "DIVE",
  SLIDE = "SLIDE",
  STAND_TACKLE = "STAND_TACKLE",
  PRESS = "PRESS",
}

export type PassStyle = "ground" | "long";

export interface Command {
  type: CommandType;
  targetPosition?: Vec2;
  targetPlayerId?: string;
  followUp?: Command;
  /**
   * Ordered intermediate handles for a curved action. The origin and final
   * targetPosition are implicit and do not consume the player's point limit.
   */
  curvePoints?: Vec2[];
  /** When true the pass is a planned coordinated play — skip accuracy deviation so
   *  the ball lands exactly on the announced tile, matching the runner's move target. */
  coordinated?: boolean;
  /** "long" makes the ball fly over the lane instead of travelling as a floor pass. */
  passStyle?: PassStyle;
}

export interface PlayerStats {
  attack: number;
  defense: number;
  passing: number;
  speed: number;
  movement: number;
  shooting: number;
  dribbling: number;
  tackling: number;
  marking: number;
  stamina: number;
  strength: number;
  vision: number;
  longPassing: number;
  aerial: number;
}


export type TrainingFocus =
  | "balanced"
  | "passing"
  | "shooting"
  | "longPassing"
  | "defending"
  | "goalkeeping"
  | "movement";

export interface DevelopmentHistoryEntry {
  season: number;
  week: number;
  focus: TrainingFocus;
  progressGain: number;
  statGains: Partial<Record<keyof PlayerStats, number>>;
  overallBefore: number;
  overallAfter: number;
  moraleAfter: number;
  /** Ability learned during this training week, when one was unlocked. */
  abilityUnlocked?: AbilityId;
}

export interface PlayerDevelopment {
  focus: TrainingFocus;
  potential: number;
  morale: number;
  progress: number;
  totalGrowth: number;
  seasonGrowth: number;
  lastWeekGrowth: number;
  lastTrainedWeek: number;
  history: DevelopmentHistoryEntry[];
}

export type TeamTacticId =
  | "slow_possession"
  | "balanced_build_up"
  | "direct_play"
  | "counter_press"
  | "low_block_counter"
  | "quick_counterattack"
  | "wide_crossing"
  | "long_ball_target";

export interface TeamTactic {
  id: TeamTacticId;
  name: string;
  description: string;
  tempo: number;
  risk: number;
  pressIntensity: number;
  defensiveLine: number;
  longBallFrequency: number;
  restDefenseDepth: number;
  progression: "slow" | "balanced" | "direct" | "counter";
  outOfPossessionName?: string;
  outOfPossessionDescription?: string;
  markingStyle?: "zonal" | "man_marking" | "hybrid";
  blockHeight?: "low" | "mid" | "high";
  defensiveShape?: "compact" | "wide" | "aggressive" | "protect_box";
  pressTrigger?: "none" | "bad_touch" | "back_pass" | "wide_trap" | "always";
  markPriority?: {
    defender?: "striker" | "forward" | "midfielder";
    midfielder?: "midfielder" | "forward" | "defender";
    forward?: "defender" | "midfielder" | "goalkeeper";
  };
}

export type AbilityId =
  | "bullet_pass"
  | "iron_tackle"
  | "ghost_run"
  | "eagle_eye"
  | "powerhouse"
  | "shadow_mark"
  | "goalkeeper"
  | "sweeper_keeper"
  | "none";

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
}

export interface PlayerCard {
  id: string;
  name: string;
  role: PlayerRole;
  stats: PlayerStats;
  ability: AbilityId;
  jerseyNumber: number;
  appearance?: PlayerAppearance;
  age?: number;
  potential?: number;
  marketValue?: number;
  weeklyWage?: number;
  marketStatus?: "available" | "listed" | "not_for_sale" | "untouchable";
  /** True while club debt rules force this player to remain transfer-listed. */
  forcedListedForDebt?: boolean;
  clubId?: string;
  askingPrice?: number;
  /** Preserved so season-end replacements can be audited in news and profiles. */
  transformedFrom?: {
    id: string;
    name: string;
    season: number;
    overall: number;
  };
  development?: PlayerDevelopment;
}

export interface SimPlayer {
  id: string;
  teamId: "player" | "ai";
  cardId: string;
  position: Vec2;
  velocity: Vec2;
  /** Match-start position — used to return an offside player to their kickoff spot. */
  startPosition: Vec2;
  state: PlayerState;
  stats: PlayerStats;
  ability: AbilityId;
  command: Command | null;
  commandExecuted: boolean;
  stateTimer: number;
  recoveryTimer: number;
  /** Cannot standing-tackle this turn after losing possession last turn. */
  standTackleBlocked?: boolean;
  name: string;
  jerseyNumber: number;
  role: PlayerRole;
  appearance?: PlayerAppearance;
  /** Runtime arc-length cursor for a curved MOVE command. */
  curveMotion?: {
    points: Vec2[];
    index: number;
    travelled: number;
    totalLength: number;
  };
  /** Runtime target for a goalkeeper dive. */
  diveMotion?: {
    start: Vec2;
    target: Vec2;
    duration: number;
    elapsed: number;
  };
}

export interface SimBall {
  position: Vec2;
  velocity: Vec2;
  ownerId: string | null;
  /** If set, ball is in a "pass animation" and will snap to this position
   *  when it reaches the closest point or slows to a stop. */
  passTarget?: Vec2;
  /** Visual height in pixels. Ground passes keep this at 0; long balls arc upward. */
  height?: number;
  passStyle?: PassStyle;
  passStart?: Vec2;
  /** Runtime arc-length cursor for curved passes and shots. */
  curveMotion?: {
    points: Vec2[];
    index: number;
    travelled: number;
    totalLength: number;
  };
  /** Constant speed used while a targeted pass or shot is in flight. */
  travelSpeed?: number;
  /** Peak visual height for a long ball, scaled to its route distance. */
  flightPeakHeight?: number;
}

export type DuelEffectKind = "outmuscled" | "dribbled";

export interface DuelEffectSnapshot {
  id: string;
  kind: DuelEffectKind;
  position: Vec2;
  direction: Vec2;
  intensity: number;
  progress: number;
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
  OFFSIDE = "OFFSIDE",
  DRIBBLE = "DRIBBLE",
  POST_HIT = "POST_HIT",
}

export interface GameEvent {
  type: GameEventType;
  tick: number;
  playerId?: string;
  targetId?: string;
  teamId?: "player" | "ai";
  message: string;
  /** Optional non-text pitch effect attached to a physical duel. */
  visualEffect?: DuelEffectKind;
  effectPosition?: Vec2;
  effectDirection?: Vec2;
  effectIntensity?: number;
  /** True when a deliberate shot's resolved target is inside the goal mouth. */
  onTarget?: boolean;
  /** Preserves pass type for match statistics. */
  passStyle?: PassStyle;
}


export interface TeamMatchStats {
  possessionTicks: number;
  passesAttempted: number;
  passesCompleted: number;
  forwardPasses: number;
  shots: number;
  shotsOnTarget: number;
  interceptions: number;
  offsides: number;
  longBallsAttempted: number;
  longBallsCompleted: number;
  dribblesWon: number;
  physicalDuelsWon: number;
  saves: number;
}

export interface MatchStats {
  player: TeamMatchStats;
  ai: TeamMatchStats;
}

export interface FrameSnapshot {
  tick: number;
  players: {
    id: string;
    teamId: "player" | "ai";
    position: Vec2;
    velocity: Vec2;
    state: PlayerState;
    stateTimer?: number;
    standTackleBlocked?: boolean;
    actionPassStyle?: PassStyle;
    actionTarget?: Vec2;
    /** Deterministic kick animation authored by the simulation snapshot. */
    actionKind?: "pass" | "longPass" | "shot";
    /** 0..1 progress through the visible wind-up/contact/follow-through. */
    actionProgress?: number;
    name: string;
    jerseyNumber: number;
    role: PlayerRole;
    appearance?: PlayerAppearance;
    /** Ability copied from the authoritative SimPlayer into the render snapshot. */
    ability: AbilityId;
    tileRange: number;
    offside?: boolean;
  }[];
  ball: {
    position: Vec2;
    velocity: Vec2;
    ownerId: string | null;
    /** Preserved from the previous turn when a pass was still in flight at turn end. */
    passTarget?: Vec2;
    passStart?: Vec2;
    height?: number;
    passStyle?: PassStyle;
    travelSpeed?: number;
    flightPeakHeight?: number;
  };
  events: GameEvent[];
  duelEffects?: DuelEffectSnapshot[];
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
  kitStyle?: KitStyle;
  sleeveStyle?: SleeveStyle;
  crestIcon: string;
  players: PlayerCard[];
  formationId: string;
  startPositions: Vec2[];
  trainingIntensity?: "light" | "balanced" | "intense";
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
  penaltyHomeGoals?: number;
  penaltyAwayGoals?: number;
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
  season?: number;
  trainingWeek?: number;
  aiSquads?: Record<string, PlayerCard[]>;
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
  matchEndResult: {
    playerScore: number;
    aiScore: number;
    penalties?: { player: number; ai: number };
  } | null;
  pendingCommands: [string, Command][];
  selectedPlayerId: string | null;
  passTargetMode: boolean;
  twoPlayerTurn?: "p1" | "p2";
  p1StoredCommands?: [string, Command][];
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
  predictionCommands?: [string, Command][];
  matchStats?: MatchStats;
}
