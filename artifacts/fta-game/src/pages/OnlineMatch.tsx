import { useState, useEffect, useRef, useCallback } from "react";
import type { SimPlayer, SimBall, Command, FrameSnapshot, GameEvent, Vec2 } from "../engine/types";
import { CommandType, GameEventType } from "../engine/types";
import type { PlayerCard } from "../engine/types";
import { runSimulation } from "../engine/simulation";
import { getFormationById, getAIFormationById } from "../game/formations";
import {
  PITCH_WIDTH, PITCH_HEIGHT, MAX_MATCH_TURNS, speedToTiles,
} from "../engine/constants";
import PitchCanvas from "../components/PitchCanvas";
import EventLog from "../components/EventLog";
import { useIsMobile } from "../hooks/use-mobile";
import { getSocket, disconnectSocket } from "../lib/socket";

export interface TeamSummary {
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
  return {
    id: `${teamId}_${card.id}`,
    teamId,
    cardId: card.id,
    position: { ...pos },
    velocity: { x: 0, y: 0 },
    state: "IDLE" as SimPlayer["state"],
    stats: { ...card.stats },
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

  const p1Players = p1Team.players.slice(0, 5).map((card, i) =>
    makeSimPlayer(card, "player", p1Formation.positions[i] ?? { x: PITCH_WIDTH * 0.2, y: PITCH_HEIGHT / 2 })
  );
  const p2Players = p2Team.players.slice(0, 5).map((card, i) =>
    makeSimPlayer(card, "ai", p2Formation.positions[i] ?? { x: PITCH_WIDTH * 0.8, y: PITCH_HEIGHT / 2 })
  );

  const kickoffOwner = p1Players.find(p => p.role === "goalkeeper") ?? p1Players[0];
  const ball: SimBall = {
    position: { ...kickoffOwner.position },
    velocity: { x: 0, y: 0 },
    ownerId: kickoffOwner.id,
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
  const pendingCommandsRef = useRef<Map<string, Command>>(new Map());
  useEffect(() => { pendingCommandsRef.current = pendingCommands; }, [pendingCommands]);

  const [currentFrame, setCurrentFrame] = useState<FrameSnapshot | null>(null);
  const [allEvents, setAllEvents] = useState<GameEvent[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [passTargetMode, setPassTargetMode] = useState(false);
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
    setComboActive(false);
    setComboStep(1);
    setComboStoredMove(null);
    setComboStoredPass(null);
  }, []);

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
    const newBall = { position: { ...lastFrame.ball.position }, velocity: { ...lastFrame.ball.velocity }, ownerId: lastFrame.ball.ownerId };
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

    if (passTargetMode && selectedPlayerId) {
      const cmd: Command = { type: CommandType.PASS, targetPlayerId: playerId, targetPosition: { ...pos } };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
      clearSelection();
      return;
    }

    if (selectedPlayerId === playerId) {
      clearSelection();
    } else {
      setSelectedPlayerId(playerId);
      setPassTargetMode(false);
      setComboActive(false);
      setComboStep(1);
      setComboStoredMove(null);
      setComboStoredPass(null);
    }
  }, [passTargetMode, selectedPlayerId, clearSelection, comboActive, comboMoveFirst, comboStep, comboStoredMove, myTeamId]);

  const handleTileClick = useCallback((pos: Vec2, _isEnemy: boolean) => {
    if (phaseRef.current !== "planning" || !selectedPlayerId) return;

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
        setPassTargetMode(true);
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

    if (passTargetMode) {
      const cmd: Command = { type: CommandType.PASS, targetPosition: pos };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    } else {
      const cmd: Command = { type: CommandType.MOVE, targetPosition: pos };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    }
    clearSelection();
  }, [selectedPlayerId, passTargetMode, comboActive, comboMoveFirst, comboStep, comboStoredMove, comboStoredPass, clearSelection]);

  const setShoot = useCallback(() => {
    if (!selectedPlayerId) return;
    setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, { type: CommandType.SHOOT }); return n; });
    clearSelection();
  }, [selectedPlayerId, clearSelection]);

  const setPass = useCallback(() => { if (selectedPlayerId) setPassTargetMode(true); }, [selectedPlayerId]);
  const cancelAction = useCallback(() => clearSelection(), [clearSelection]);

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
    ball: { position: { ...ball.position }, velocity: { ...ball.velocity }, ownerId: ball.ownerId },
    events: [],
  };

  const selectedPlayer = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null;
  const myScore = myRole === "p1" ? score.p1 : score.p2;
  const oppScore = myRole === "p1" ? score.p2 : score.p1;

  const timerColor = timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f97316" : "#22c55e";
  const timerPct = (timeLeft / ONLINE_TURN_TIME) * 100;

  const tileSize = isMobile ? 32 : 40;

  return (
    <div className="relative min-h-screen flex flex-col" style={{ background: "#070b14" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
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
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
        <PitchCanvas
          frame={displayFrame}
          playerTeam={{ jerseyColor: myTeam.jerseyColor, secondaryColor: myTeam.secondaryColor } as any}
          aiTeamColor={oppTeam.jerseyColor}
          aiTeamSecondaryColor={oppTeam.secondaryColor}
          pendingCommands={pendingCommands}
          selectedPlayerId={selectedPlayerId}
          onPlayerClick={handlePlayerClick}
          onTileClick={handleTileClick}
          passTargetMode={passTargetMode}
          phase={phase === "waiting" ? "planning" : phase === "finished" ? "finished" : phase as "planning" | "simulating"}
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
      <div className="flex-shrink-0 px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
        {/* Combo banner */}
        {comboActive && (
          <div className="text-center text-xs mb-2 font-semibold" style={{ color: "#a78bfa" }}>
            Combo Step {comboStep}/2 · {comboMoveFirst ? "Move → Pass" : "Pass → Move"}
          </div>
        )}
        {!comboActive && passTargetMode && (
          <div className="text-center text-xs mb-2 font-semibold" style={{ color: "#38bdf8" }}>
            Tap a tile or player to pass
          </div>
        )}

        {/* Hint text */}
        <p className="text-center text-xs mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          {phase === "planning" && selectedPlayerId && !passTargetMode && !comboActive && "Tap green tile to move · ⚔ orange = tackle"}
          {phase === "planning" && !comboActive && passTargetMode && "Tap a tile or player to pass"}
          {phase === "planning" && comboActive && comboMoveFirst && comboStep === 1 && "Tap destination tile to move to"}
          {phase === "planning" && comboActive && comboMoveFirst && comboStep === 2 && "Now tap pass target (tile or player)"}
          {phase === "planning" && comboActive && !comboMoveFirst && comboStep === 1 && "Tap pass target (tile or player)"}
          {phase === "planning" && comboActive && !comboMoveFirst && comboStep === 2 && "Now tap move destination tile"}
          {phase === "waiting" && `Submitted! Waiting for ${oppTeam.name}…`}
          {phase === "simulating" && "Simulating…"}
        </p>

        {/* Player action buttons */}
        {selectedPlayerId && phase === "planning" && !passTargetMode && !comboActive && (
          <div className="flex gap-2 mb-2 justify-center">
            <button onClick={setPass} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#1d4ed8", color: "#fff" }}>Pass</button>
            <button onClick={setShoot} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#b45309", color: "#fff" }}>Shoot</button>
            <button onClick={() => { setComboMoveFirst(true); setComboActive(true); setComboStep(1); }} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#7c3aed", color: "#fff" }}>Move+Pass</button>
            <button onClick={() => { setComboMoveFirst(false); setComboActive(true); setComboStep(1); setPassTargetMode(true); }} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#0f766e", color: "#fff" }}>Pass+Move</button>
          </div>
        )}

        {(selectedPlayerId || comboActive || passTargetMode) && phase === "planning" && (
          <div className="flex justify-center mb-2">
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
