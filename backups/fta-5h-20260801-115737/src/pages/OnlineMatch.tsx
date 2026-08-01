import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo } from "react";
import type { SimPlayer,
  SimBall,
  Command,
  FrameSnapshot,
  GameEvent,
  Vec2 } from "../engine/types";
import { CommandType,
  GameEventType } from "../engine/types";
import type { PlayerCard } from "../engine/types";
import { runSimulation } from "../engine/simulation";
import { getFormationById,
  getAIFormationById } from "../game/formations";
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  MAX_MATCH_TURNS,
  speedToTiles,
  PLAYERS_PER_TEAM,
  GOAL_DEPTH,
  GOAL_TOP_Y,
  GOAL_WIDTH,
  BALL_RADIUS,
} from "../engine/constants";
import PitchCanvas from "../components/PitchCanvas";
import MechanicPad from "../components/MechanicPad";
import EventLog from "../components/EventLog";
import { useIsMobile } from "../hooks/use-mobile";
import { useCurvePlanner } from "../hooks/useCurvePlanner";
import { getSocket, disconnectSocket } from "../lib/socket";

export interface TeamSummary {
  rulesVersion: number;
  name: string;
  jerseyColor: string;
  secondaryColor?: string;
  crestIcon?: string;
  formationId: string;
  players: PlayerCard[];
  tier?: number;
}

interface Props {
  myRole: "p1" | "p2";
  p1Team: TeamSummary;
  p2Team: TeamSummary;
  roomCode: string;
  onLeave: () => void;
}

const PLAYBACK_FPS = 60;
const ONLINE_TURN_TIME = 25;

function makeSimPlayer(card: PlayerCard, teamId: "player" | "ai", pos: Vec2): SimPlayer {
  const legacyStats = card.stats as PlayerCard["stats"] & { luck?: number };
  return {
    id: `${teamId}_${card.id}`,
    teamId,
    cardId: card.id,
    position: { ...pos },
    velocity: { x: 0, y: 0 },
    startPosition: { ...pos },
    state: "IDLE" as SimPlayer["state"],
    stats: {
      ...card.stats,
      movement: legacyStats.movement ?? legacyStats.luck ?? 5,
    },
    ability: card.ability,
    command: null,
    commandExecuted: false,
    stateTimer: 0,
    recoveryTimer: 0,
    name: card.name,
    jerseyNumber: card.jerseyNumber,
    role: card.role,
  };
}

function makeInitPlayers(p1Team: TeamSummary, p2Team: TeamSummary): { players: SimPlayer[]; ball: SimBall } {
  const p1Formation = getFormationById(p1Team.formationId);
  const p2Formation = getAIFormationById(p2Team.formationId);

  const p1Players = p1Team.players.slice(0, PLAYERS_PER_TEAM).map((card, i) =>
    makeSimPlayer(card, "player", p1Formation.positions[i] ?? { x: PITCH_WIDTH * 0.2, y: PITCH_HEIGHT / 2 })
  );
  const p2Players = p2Team.players.slice(0, PLAYERS_PER_TEAM).map((card, i) =>
    makeSimPlayer(card, "ai", p2Formation.positions[i] ?? { x: PITCH_WIDTH * 0.8, y: PITCH_HEIGHT / 2 })
  );

  const kickoffOwner = p1Players.find(p => p.role === "goalkeeper") ?? p1Players[0];
  const ball: SimBall = {
    position: { ...kickoffOwner.position },
    velocity: { x: 0, y: 0 },
    ownerId: kickoffOwner.id,
    height: 0,
  };
  return { players: [...p1Players, ...p2Players], ball };
}

export default function OnlineMatch({ myRole, p1Team, p2Team, roomCode, onLeave }: Props) {
  const myTeamId: "player" | "ai" = myRole === "p1" ? "player" : "ai";
  const myTeam = myRole === "p1" ? p1Team : p2Team;
  const oppTeam = myRole === "p1" ? p2Team : p1Team;
  const isMobile = useIsMobile();

  const init = useRef(makeInitPlayers(p1Team, p2Team));
  const [players, setPlayers] = useState<SimPlayer[]>(init.current.players);
  const [ball, setBall] = useState<SimBall>(init.current.ball);
  const playersRef = useRef(players);
  const ballRef = useRef(ball);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { ballRef.current = ball; }, [ball]);

  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [turn, setTurn] = useState(1);
  const [maxTurns] = useState(MAX_MATCH_TURNS);
  const [phase, setPhase] = useState<"planning" | "waiting" | "simulating" | "finished">("planning");
  const phaseRef = useRef<typeof phase>("planning");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [opponentSubmitted, setOpponentSubmitted] = useState(false);
  const [pendingCommands, setPendingCommands] = useState<Map<string, Command>>(new Map());
  const [diveTargetMode, setDiveTargetMode] = useState(false);
  const pendingCommandsRef = useRef<Map<string, Command>>(new Map());
  useEffect(() => { pendingCommandsRef.current = pendingCommands; }, [pendingCommands]);

  const [currentFrame, setCurrentFrame] = useState<FrameSnapshot | null>(null);
  const [allEvents, setAllEvents] = useState<GameEvent[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [passTargetMode, setPassTargetMode] = useState(false);
  const [longPassTargetMode, setLongPassTargetMode] = useState(false);
  // FTA_SHOT_TARGET_MODE
  const [shotTargetMode, setShotTargetMode] = useState(false);
  const [comboActive, setComboActive] = useState(false);
  const [comboMoveFirst, setComboMoveFirst] = useState(true);
  const [comboStep, setComboStep] = useState<1 | 2>(1);
  const [comboStoredMove, setComboStoredMove] = useState<Vec2 | null>(null);
  const [comboStoredPass, setComboStoredPass] = useState<{ targetPosition?: Vec2; targetPlayerId?: string } | null>(null);

  const [timeLeft, setTimeLeft] = useState(ONLINE_TURN_TIME);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);

  const animRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedPlayerId(null);
    setPassTargetMode(false);
    setLongPassTargetMode(false);
    setShotTargetMode(false);
    setComboActive(false);
    setComboStep(1);
    setComboStoredMove(null);
    setComboStoredPass(null);
  }, []);

  const startCombo = useCallback((moveFirst: boolean) => {
    if (!selectedPlayerId) return;
    setComboMoveFirst(moveFirst);
    setComboActive(true);
    setComboStep(1);
    setComboStoredMove(null);
    setComboStoredPass(null);
    setLongPassTargetMode(false);
    setPassTargetMode(!moveFirst);
  }, [selectedPlayerId]);

  const curvePlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );
  const commitCurveCommand = useCallback((command: Command) => {
    if (!selectedPlayerId) return;
    setPendingCommands((previous) => {
      const next = new Map(previous);
      next.set(selectedPlayerId, command);
      return next;
    });
  }, [selectedPlayerId]);
  const curve = useCurvePlanner({
    selectedPlayer: curvePlayer,
    onCommit: commitCurveCommand,
    onCommitted: clearSelection,
  });

  const stopAnim = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  // ── Simulation playback ──────────────────────────────────────────────────
  const finishSimulation = useCallback((lastFrame: FrameSnapshot, goalsDelta: { p1: number; p2: number }) => {
    const newPlayers = playersRef.current.map(p => {
      const fp = lastFrame.players.find(f => f.id === p.id);
      if (!fp) return p;
      return { ...p, position: { ...fp.position }, velocity: { ...fp.velocity }, state: fp.state, command: null, commandExecuted: false };
    });
    const newBall = { position: { ...lastFrame.ball.position }, velocity: { ...lastFrame.ball.velocity }, ownerId: lastFrame.ball.ownerId, height: 0, passStyle: undefined, passStart: undefined };
    setPlayers(newPlayers);
    playersRef.current = newPlayers;
    setBall(newBall);
    ballRef.current = newBall;

    getSocket().emit("turn:ready", { goalsDelta });
    setPendingCommands(new Map());
    setOpponentSubmitted(false);
  }, []);

  const playbackFrames = useCallback((
    frames: FrameSnapshot[],
    goalsDelta: { p1: number; p2: number },
  ) => {
    let idx = 0;
    let last = 0;
    const frameMs = 1000 / PLAYBACK_FPS;
    stopAnim();

    const animate = (time: number) => {
      if (last === 0) last = time;
      if (time - last >= frameMs) {
        if (idx < frames.length) {
          const frame = frames[idx];
          setCurrentFrame(frame);
          if (frame.events.length > 0) {
            setAllEvents(prev => [...prev, ...frame.events]);
          }
          idx++;
          last = time;
        } else {
          finishSimulation(frames[frames.length - 1], goalsDelta);
          return;
        }
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
  }, [finishSimulation, stopAnim]);

  // ── Socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    socket.on("turn:opponent-submitted", () => {
      setOpponentSubmitted(true);
    });

    socket.on("turn:simulate", ({
      p1Commands,
      p2Commands,
      seed,
    }: {
      p1Commands: [string, Command][];
      p2Commands: [string, Command][];
      seed: number;
    }) => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setPhase("simulating");
      phaseRef.current = "simulating";
      clearSelection();

      const allCmds = new Map<string, Command>([...p1Commands, ...p2Commands]);
      const withCommands = playersRef.current.map(p => ({
        ...p,
        command: allCmds.get(p.id) ?? null,
        commandExecuted: false,
      }));

      const { frames, events } = runSimulation(withCommands, ballRef.current, seed);

      const p1Goals = events.filter(e => e.type === GameEventType.GOAL && e.teamId === "player").length;
      const p2Goals = events.filter(e => e.type === GameEventType.GOAL && e.teamId === "ai").length;

      const goalsDelta = { p1: p1Goals, p2: p2Goals };
      playbackFrames(frames, goalsDelta);
    });

    socket.on("turn:done", ({ score, turn: nextTurn, maxTurns: mt }: {
      score: { p1: number; p2: number };
      turn: number;
      maxTurns: number;
    }) => {
      setScore(score);
      setTurn(nextTurn);
      setPhase("planning");
      phaseRef.current = "planning";
      setTimeLeft(ONLINE_TURN_TIME);
      startTimer();
      void mt;
    });

    socket.on("game:over", ({ score: finalScore }: { score: { p1: number; p2: number }; winner: string }) => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setScore(finalScore);
      setPhase("finished");
      phaseRef.current = "finished";
    });

    socket.on("room:opponent-left", () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setOpponentLeft(true);
      setPhase("finished");
    });

    return () => {
      socket.off("turn:opponent-submitted");
      socket.off("turn:simulate");
      socket.off("turn:done");
      socket.off("game:over");
      socket.off("room:opponent-left");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackFrames, clearSelection]);

  // ── Turn timer ───────────────────────────────────────────────────────────
  const confirmTurnRef = useRef<() => void>(() => {});

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(ONLINE_TURN_TIME);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          if (phaseRef.current === "planning") confirmTurnRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Start timer on mount
  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmTurn = useCallback(() => {
    if (phaseRef.current !== "planning") return;
    const cmds = [...pendingCommandsRef.current.entries()];
    // Only include my team's commands
    const myCmds = cmds.filter(([id]) => id.startsWith(myTeamId + "_") || playersRef.current.find(p => p.id === id)?.teamId === myTeamId);
    getSocket().emit("turn:commands", { commands: myCmds });
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase("waiting");
    phaseRef.current = "waiting";
    clearSelection();
  }, [myTeamId, clearSelection]);

  useEffect(() => { confirmTurnRef.current = confirmTurn; }, [confirmTurn]);

  // ── Planning input handlers ──────────────────────────────────────────────
  const handlePlayerClick = useCallback((playerId: string, pos: Vec2) => {
    if (phaseRef.current !== "planning") return;

    // Only allow clicking own team
    const player = playersRef.current.find(p => p.id === playerId);
    if (player?.teamId !== myTeamId) return;

    if (
      curve.active &&
      !curve.baseCommand &&
      selectedPlayerId &&
      (passTargetMode || longPassTargetMode)
    ) {
      curve.setTargetCommand({
        type: CommandType.PASS,
        targetPlayerId: playerId,
        targetPosition: { ...pos },
        passStyle: longPassTargetMode ? "long" : "ground",
      });
      setPassTargetMode(false);
      setLongPassTargetMode(false);
      return;
    }

    if (comboActive && selectedPlayerId) {
      if (comboMoveFirst && comboStep === 2) {
        const cmd: Command = {
          type: CommandType.MOVE,
          targetPosition: comboStoredMove!,
          followUp: { type: CommandType.PASS, targetPlayerId: playerId, targetPosition: { ...pos } },
        };
        setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
        clearSelection();
        return;
      }
      if (!comboMoveFirst && comboStep === 1) {
        setComboStoredPass({ targetPlayerId: playerId, targetPosition: { ...pos } });
        setComboStep(2);
        setPassTargetMode(false);
        return;
      }
    }

    if ((passTargetMode || longPassTargetMode) && selectedPlayerId) {
      const cmd: Command = {
        type: CommandType.PASS,
        targetPlayerId: playerId,
        targetPosition: { ...pos },
        passStyle: longPassTargetMode ? "long" : "ground",
      };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
      clearSelection();
      return;
    }

    if (selectedPlayerId === playerId) {
      clearSelection();
    } else {
      setSelectedPlayerId(playerId);
      setPassTargetMode(false);
      setLongPassTargetMode(false);
      setComboActive(false);
      setComboStep(1);
      setComboStoredMove(null);
      setComboStoredPass(null);
    }
  }, [passTargetMode, longPassTargetMode, selectedPlayerId, clearSelection, comboActive, comboMoveFirst, comboStep, comboStoredMove, myTeamId, curve]);

  const handleTileClick = useCallback((pos: Vec2, _isEnemy: boolean) => {
    if (phaseRef.current !== "planning" || !selectedPlayerId) return;

    // FTA_GK_DIVE_TARGET_V4
    if (diveTargetMode) {
      const cmd: Command = { type: CommandType.DIVE, targetPosition: pos };
      setPendingCommands(prev => {
        const next = new Map(prev);
        next.set(selectedPlayerId, cmd);
        return next;
      });
      setDiveTargetMode(false);
      clearSelection();
      return;
    }

    if (shotTargetMode) {
      const selected = currentFrame?.players.find(
        (player) => player.id === selectedPlayerId,
      );
      if (!selected) return;

      const attackingRight = selected.teamId === "player";
      const fallbackX = attackingRight
        ? PITCH_WIDTH + GOAL_DEPTH * 0.65
        : -GOAL_DEPTH * 0.65;
      const target = {
        x: attackingRight
          ? Math.max(
              PITCH_WIDTH + BALL_RADIUS,
              Math.min(PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS, pos.x > PITCH_WIDTH ? pos.x : fallbackX),
            )
          : Math.min(
              -BALL_RADIUS,
              Math.max(-GOAL_DEPTH + BALL_RADIUS, pos.x < 0 ? pos.x : fallbackX),
            ),
        y: Math.max(
          GOAL_TOP_Y + BALL_RADIUS,
          Math.min(GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS, pos.y),
        ),
      };

      if (curve.active) {
        curve.setTargetCommand({
          type: CommandType.SHOOT,
          targetPosition: target,
        });
        setShotTargetMode(false);
        return;
      }

      setPendingCommands((previous) => {
        const next = new Map(previous);
        next.set(selectedPlayerId, {
          type: CommandType.SHOOT,
          targetPosition: target,
        });
        return next;
      });
      setShotTargetMode(false);
      clearSelection();
      return;
    }

    if (curve.active && !curve.baseCommand) {
      curve.setTargetCommand(
        passTargetMode || longPassTargetMode
          ? {
              type: CommandType.PASS,
              targetPosition: pos,
              passStyle: longPassTargetMode ? "long" : "ground",
            }
          : { type: CommandType.MOVE, targetPosition: pos },
      );
      setPassTargetMode(false);
      setLongPassTargetMode(false);
      return;
    }

    if (comboActive) {
      if (comboMoveFirst) {
        if (comboStep === 1) {
          setComboStoredMove(pos);
          setComboStep(2);
          setPassTargetMode(true);
        } else {
          const cmd: Command = {
            type: CommandType.MOVE,
            targetPosition: comboStoredMove!,
            followUp: { type: CommandType.PASS, targetPosition: pos },
          };
          setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
          clearSelection();
        }
      } else if (comboStep === 1) {
        setComboStoredPass({ targetPosition: pos });
        setComboStep(2);
        setPassTargetMode(false);
      } else {
        const cmd: Command = {
          type: CommandType.PASS,
          ...comboStoredPass!,
          followUp: { type: CommandType.MOVE, targetPosition: pos },
        };
        setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
        clearSelection();
      }
      return;
    }

    if (passTargetMode || longPassTargetMode) {
      const cmd: Command = {
        type: CommandType.PASS,
        targetPosition: pos,
        passStyle: longPassTargetMode ? "long" : "ground",
      };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    } else {
      const cmd: Command = { type: CommandType.MOVE, targetPosition: pos };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    }
    clearSelection();
  }, [selectedPlayerId, passTargetMode, longPassTargetMode, comboActive, comboMoveFirst, comboStep, comboStoredMove, comboStoredPass, clearSelection, curve]);

  const setShoot = useCallback(() => {
    if (!selectedPlayerId) return;
    setPassTargetMode(false);
    setLongPassTargetMode(false);
    setShotTargetMode(true);
  }, [selectedPlayerId]);
  const setPass = useCallback(() => {
    if (!selectedPlayerId) return;
    if (curve.active) curve.beginAction("groundPass");
    setLongPassTargetMode(false);
    setPassTargetMode(true);
  }, [selectedPlayerId, curve]);
  const setLongPass = useCallback(() => {
    if (!selectedPlayerId) return;
    if (curve.active) curve.beginAction("longPass");
    setPassTargetMode(false);
    setLongPassTargetMode(true);
  }, [selectedPlayerId, curve]);
  const cancelAction = useCallback(() => {
    curve.reset();
    clearSelection();
  }, [clearSelection, curve]);
  const toggleCurve = useCallback(() => {
    if (!selectedPlayerId) return;
    if (!curve.active) {
      setPassTargetMode(false);
      setLongPassTargetMode(false);
      setComboActive(false);
      curve.arm();
      return;
    }
    curve.handleCurveButton();
  }, [selectedPlayerId, curve]);

  // ── Derived values ────────────────────────────────────────────────────────
  const displayFrame = currentFrame ?? {
    tick: 0,
    players: players.map(p => ({
      id: p.id,
      teamId: p.teamId,
      position: { ...p.position },
      velocity: { ...p.velocity },
      state: p.state,
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      role: p.role,
      tileRange: speedToTiles(p.stats.speed),
    })),
    ball: { position: { ...ball.position }, velocity: { ...ball.velocity }, ownerId: ball.ownerId, height: ball.height ?? 0, passStyle: ball.passStyle },
    events: [],
  };

  const selectedPlayer = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null;
  const myScore = myRole === "p1" ? score.p1 : score.p2;
  const oppScore = myRole === "p1" ? score.p2 : score.p1;

  const timerColor = timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f97316" : "#22c55e";
  const timerPct = (timeLeft / ONLINE_TURN_TIME) * 100;

  const tileSize = isMobile ? 32 : 40;

  const selectedSimPlayer = selectedPlayerId
    ? currentFrame?.players.find((player) => player.id === selectedPlayerId) ?? null
    : null;

  const goalkeeperCanDive =
    !!selectedSimPlayer &&
    selectedSimPlayer.role === "goalkeeper" &&
    currentFrame?.ball.ownerId !== selectedSimPlayer.id;

  const beginGoalkeeperDive = useCallback(() => {
    if (!selectedPlayerId || !goalkeeperCanDive) return;
    setDiveTargetMode(true);
  }, [selectedPlayerId, goalkeeperCanDive]);

  return (
    <div className="relative h-[100dvh] min-h-0 flex flex-col overflow-hidden" style={{ background: "#070b14" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="flex flex-col items-center min-w-[80px]">
          <span className="text-xs font-semibold" style={{ color: p1Team.jerseyColor }}>
            {p1Team.crestIcon ?? "⚽"} {p1Team.name}
            {myRole === "p1" && <span className="ml-1 text-xs opacity-60">(You)</span>}
          </span>
          <span className="text-2xl font-black text-white">{score.p1}</span>
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="text-xs font-bold text-white opacity-50">
            {phase === "planning" ? `Turn ${turn}/${maxTurns}` : phase === "waiting" ? "Waiting…" : phase === "simulating" ? "Simulating…" : "Full Time"}
          </div>
          {phase === "planning" && (
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${timerPct}%`, background: timerColor }} />
            </div>
          )}
          {phase === "planning" && (
            <span className="text-xs font-mono font-bold" style={{ color: timerColor }}>{timeLeft}s</span>
          )}
          <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
            {roomCode}
          </span>
        </div>

        <div className="flex flex-col items-center min-w-[80px]">
          <span className="text-xs font-semibold" style={{ color: p2Team.jerseyColor }}>
            {p2Team.crestIcon ?? "🆚"} {p2Team.name}
            {myRole === "p2" && <span className="ml-1 text-xs opacity-60">(You)</span>}
          </span>
          <span className="text-2xl font-black text-white">{score.p2}</span>
        </div>
      </div>

      {/* Pitch */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">
        <PitchCanvas
          frame={displayFrame}
          playerTeam={{ jerseyColor: myTeam.jerseyColor, secondaryColor: myTeam.secondaryColor } as any}
          aiTeamColor={oppTeam.jerseyColor}
          aiTeamSecondaryColor={oppTeam.secondaryColor}
          pendingCommands={pendingCommands}
          selectedPlayerId={selectedPlayerId}
          onPlayerClick={handlePlayerClick}
          onTileClick={handleTileClick}
          onCurvePointClick={curve.addControl}
          passTargetMode={passTargetMode || longPassTargetMode || shotTargetMode}
          curveDraft={curve.preview}
          curveControlMode={curve.placingControls}
          phase={phase === "waiting" ? "planning" : phase === "finished" ? "finished" : phase as "planning" | "simulating"}
          activePlanningTeam={myTeamId}
          isVertical={isMobile}
        />
      </div>

      {/* Status banner */}
      {phase === "waiting" && (
        <div className="flex items-center justify-center py-2 px-4 text-sm font-semibold"
          style={{ background: "rgba(234,179,8,0.12)", color: "#fbbf24" }}>
          ✅ Commands locked in — waiting for {oppTeam.name}…
        </div>
      )}
      {phase === "planning" && opponentSubmitted && (
        <div className="flex items-center justify-center py-1 px-4 text-xs font-semibold"
          style={{ background: "rgba(34,197,94,0.1)", color: "#86efac" }}>
          {oppTeam.name} is ready — finish your plan!
        </div>
      )}

      {/* Action bar */}
      <div
        className="flex-shrink-0 px-1.5 sm:px-2 pt-1 sm:pt-2 text-[11px] sm:text-sm"
        style={{
          background: "rgba(255,255,255,0.03)",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Combo banner */}
        {comboActive && (
          <div className="text-center text-xs mb-2 font-semibold" style={{ color: "#a78bfa" }}>
            Combo Step {comboStep}/2 · {comboMoveFirst ? "Move → Pass" : "Pass → Move"}
          </div>
        )}
        {!comboActive && (passTargetMode || longPassTargetMode || shotTargetMode) && (
          <div className="text-center text-xs mb-2 font-semibold" style={{ color: "#38bdf8" }}>
            {shotTargetMode
              ? "Tap inside the goal to place the shot"
              : longPassTargetMode
                ? "Tap a tile or player to launch a long ball"
                : "Tap a tile or player to pass"}
          </div>
        )}
        {curve.active && curve.instruction && (
          <div
            className="text-center text-xs mb-2 font-semibold"
            style={{ color: curve.error ? "#fca5a5" : "#67e8f9" }}
          >
            {curve.error ?? curve.instruction}
          </div>
        )}

        {/* Hint text */}
        <p className="hidden sm:block text-center text-xs mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          {phase === "planning" && selectedPlayerId && !passTargetMode && !longPassTargetMode && !comboActive && !curve.active && "Tap green tile to move · ⚔ orange = tackle"}
          {phase === "planning" && !comboActive && (passTargetMode || longPassTargetMode) && (longPassTargetMode ? "Tap a tile or player to launch a long ball" : "Tap a tile or player to pass")}
          {phase === "planning" && comboActive && comboMoveFirst && comboStep === 1 && "Tap destination tile to move to"}
          {phase === "planning" && comboActive && comboMoveFirst && comboStep === 2 && "Now tap pass target (tile or player)"}
          {phase === "planning" && comboActive && !comboMoveFirst && comboStep === 1 && "Tap pass target (tile or player)"}
          {phase === "planning" && comboActive && !comboMoveFirst && comboStep === 2 && "Now tap move destination tile"}
          {phase === "waiting" && `Submitted! Waiting for ${oppTeam.name}…`}
          {phase === "simulating" && "Simulating…"}
        </p>

        {phase === "planning" && !comboActive && (
          <MechanicPad
            onCancel={cancelAction}
            onPass={setPass}
            onLongPass={setLongPass}
            onMovePass={() => { curve.reset(); startCombo(true); }}
            onPassMove={() => { curve.reset(); startCombo(false); }}
            onShoot={setShoot}
              goalkeeperCanDive={goalkeeperCanDive}
              onDive={beginGoalkeeperDive}
            onCurve={toggleCurve}
            curveActive={curve.active}
            curveCanFinish={curve.canFinish}
            curvePointCount={curve.controls.length}
            curvePointLimit={curve.limit}
            actionsDisabled={curve.placingControls}
            active={!!selectedPlayerId}
          />
        )}

        {comboActive && phase === "planning" && (
          <div className="h-[56px] flex items-center justify-center">
            <button onClick={cancelAction} className="px-3 py-1 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>Cancel</button>
          </div>
        )}

        {/* Confirm / Leave */}
        <div className="flex gap-2 justify-center">
          {phase === "planning" && (
            <button
              onClick={confirmTurn}
              className="flex-1 py-3 rounded-xl font-bold text-white text-base"
              style={{ background: "#22c55e", maxWidth: 260 }}
            >
              ✅ Confirm Commands
            </button>
          )}
          {(phase === "finished" || opponentLeft) && (
            <button
              onClick={() => { disconnectSocket(); onLeave(); }}
              className="flex-1 py-3 rounded-xl font-bold text-white text-base"
              style={{ background: "#6b7280", maxWidth: 260 }}
            >
              Back to Menu
            </button>
          )}
        </div>
      </div>

      {/* Game over overlay */}
      {phase === "finished" && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="rounded-2xl p-8 text-center max-w-xs w-full mx-4"
            style={{ background: "rgba(15,23,42,0.97)", border: "1px solid rgba(255,255,255,0.12)" }}>
            {opponentLeft ? (
              <>
                <div className="text-4xl mb-3">🚪</div>
                <h2 className="text-xl font-black text-white mb-1">Opponent Left</h2>
                <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {oppTeam.name} disconnected from the match.
                </p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-3">
                  {myScore > oppScore ? "🏆" : myScore < oppScore ? "😔" : "🤝"}
                </div>
                <h2 className="text-2xl font-black text-white mb-1">
                  {myScore > oppScore ? "You Win!" : myScore < oppScore ? "You Lose" : "Draw!"}
                </h2>
                <div className="text-4xl font-black mb-1" style={{ color: "#fbbf24" }}>
                  {score.p1} – {score.p2}
                </div>
                <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {p1Team.name} vs {p2Team.name}
                </p>
              </>
            )}
            <button
              onClick={() => { disconnectSocket(); onLeave(); }}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: "#3b82f6" }}
            >
              Back to Menu
            </button>
          </div>
        </div>
      )}

      {/* Event log */}
      <div className="absolute top-16 right-1 max-w-[180px]">
        <EventLog events={allEvents} />
      </div>
    </div>
  );
}
