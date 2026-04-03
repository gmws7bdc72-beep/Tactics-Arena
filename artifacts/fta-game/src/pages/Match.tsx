import { useState, useEffect, useRef, useCallback } from "react";
import type { TeamConfig, SimPlayer, SimBall, Command, FrameSnapshot, GameEvent, Vec2 } from "../engine/types";
import { CommandType, GameEventType } from "../engine/types";
import type { PlayerCard } from "../engine/types";
import { runSimulation } from "../engine/simulation";
import { generateAICommands } from "../engine/ai";
import type { AITeamDef } from "../game/league";
import { getAIFormationById, getFormationById } from "../game/formations";
import { PITCH_WIDTH, PITCH_HEIGHT, MAX_MATCH_TURNS, GOALS_TO_WIN } from "../engine/constants";
import PitchCanvas from "../components/PitchCanvas";
import EventLog from "../components/EventLog";

interface Props {
  team: TeamConfig;
  opponentTeamDef: AITeamDef;
  onMatchEnd: (result: { playerScore: number; aiScore: number; events: GameEvent[] }) => void;
  onForfeit: () => void;
}

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

const TURN_TIME = 22;
const PLAYBACK_FPS = 60;

function makeInitFrame(players: SimPlayer[], ball: SimBall): FrameSnapshot {
  return {
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
      tileRange: Math.ceil(Math.max(1, Math.min(10, p.stats.speed)) / 2),
    })),
    ball: { position: { ...ball.position }, velocity: { ...ball.velocity }, ownerId: ball.ownerId },
    events: [],
  };
}

function GoalDots({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex gap-1 justify-center mt-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: i < filled ? "#ffd700" : "rgba(255,255,255,0.12)" }}
        />
      ))}
    </div>
  );
}

export default function Match({ team, opponentTeamDef, onMatchEnd, onForfeit }: Props) {
  const playerFormation = getFormationById(team.formationId);
  const aiFormation = getAIFormationById(opponentTeamDef.formationId);
  const aiTier = opponentTeamDef.tier;

  const initState = useRef((() => {
    const pl = team.players.slice(0, 5).map((card, i) =>
      makeSimPlayer(card, "player", playerFormation.positions[i] ?? { x: PITCH_WIDTH * 0.2, y: PITCH_HEIGHT / 2 })
    );
    const ai = opponentTeamDef.players.slice(0, 5).map((card, i) =>
      makeSimPlayer(card, "ai", aiFormation.positions[i] ?? { x: PITCH_WIDTH * 0.8, y: PITCH_HEIGHT / 2 })
    );
    const ball: SimBall = { position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 }, velocity: { x: 0, y: 0 }, ownerId: null };
    return { players: [...pl, ...ai], ball };
  })());

  const [players, setPlayers] = useState<SimPlayer[]>(initState.current.players);
  const [ball, setBall] = useState<SimBall>(initState.current.ball);
  const [score, setScore] = useState({ player: 0, ai: 0 });
  const scoreRef = useRef({ player: 0, ai: 0 });
  const [turn, setTurn] = useState(1);
  const turnRef = useRef(1);
  const [phase, setPhase] = useState<"planning" | "simulating" | "finished">("planning");
  const [pendingCommands, setPendingCommands] = useState<Map<string, Command>>(new Map());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [passTargetMode, setPassTargetMode] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<FrameSnapshot>(() =>
    makeInitFrame(initState.current.players, initState.current.ball)
  );
  const [allEvents, setAllEvents] = useState<GameEvent[]>([]);
  const allEventsRef = useRef<GameEvent[]>([]);
  const [turnTimer, setTurnTimer] = useState(TURN_TIME);
  const [showGoalBanner, setShowGoalBanner] = useState<"player" | "ai" | null>(null);

  const animRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<"planning" | "simulating" | "finished">("planning");
  const playersRef = useRef(players);
  const ballRef = useRef(ball);
  const pendingCommandsRef = useRef(pendingCommands);

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { ballRef.current = ball; }, [ball]);
  useEffect(() => { pendingCommandsRef.current = pendingCommands; }, [pendingCommands]);

  const stopAnim = () => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedPlayerId(null);
    setPassTargetMode(false);
  }, []);

  const finishSimulation = useCallback((lastFrame: FrameSnapshot, allNewEvents: GameEvent[]) => {
    const goalEvent = allNewEvents.find(e => e.type === GameEventType.GOAL);
    const oldScore = scoreRef.current;
    let newScore = { ...oldScore };

    if (goalEvent?.teamId === "player") {
      newScore = { player: oldScore.player + 1, ai: oldScore.ai };
      setShowGoalBanner("player");
      setTimeout(() => setShowGoalBanner(null), 2200);
    } else if (goalEvent?.teamId === "ai") {
      newScore = { player: oldScore.player, ai: oldScore.ai + 1 };
      setShowGoalBanner("ai");
      setTimeout(() => setShowGoalBanner(null), 2200);
    }

    scoreRef.current = newScore;
    setScore(newScore);

    const nextTurn = turnRef.current + 1;

    let pIdx = 0, aIdx = 0;
    const newSimPlayers = playersRef.current.map(orig => {
      const frameP = lastFrame.players.find(x => x.id === orig.id)!;
      const pos = goalEvent
        ? orig.teamId === "player"
          ? playerFormation.positions[pIdx++] ?? frameP.position
          : aiFormation.positions[aIdx++] ?? frameP.position
        : { ...frameP.position };
      return { ...orig, position: pos, velocity: { x: 0, y: 0 }, state: "IDLE" as SimPlayer["state"], command: null, commandExecuted: false };
    });

    const newBall: SimBall = goalEvent
      ? { position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 }, velocity: { x: 0, y: 0 }, ownerId: null }
      : { ...lastFrame.ball };

    setPlayers(newSimPlayers);
    setBall(newBall);
    playersRef.current = newSimPlayers;
    ballRef.current = newBall;
    setCurrentFrame(makeInitFrame(newSimPlayers, newBall));

    const matchOver = newScore.player >= GOALS_TO_WIN || newScore.ai >= GOALS_TO_WIN || nextTurn > MAX_MATCH_TURNS;
    if (matchOver) {
      phaseRef.current = "finished";
      setPhase("finished");
      setTimeout(() => {
        onMatchEnd({ playerScore: newScore.player, aiScore: newScore.ai, events: allEventsRef.current });
      }, goalEvent ? 2400 : 1200);
    } else {
      turnRef.current = nextTurn;
      setTurn(nextTurn);
      phaseRef.current = "planning";
      setPhase("planning");
    }
  }, [onMatchEnd, playerFormation, aiFormation]);

  const playbackFrames = useCallback((frames: FrameSnapshot[], allNewEvents: GameEvent[]) => {
    let idx = 0;
    let last = 0;
    const frameMs = 1000 / PLAYBACK_FPS;

    const animate = (time: number) => {
      if (last === 0) last = time;
      if (time - last >= frameMs) {
        if (idx < frames.length) {
          const frame = frames[idx];
          setCurrentFrame(frame);
          if (frame.events.length > 0) {
            setAllEvents(prev => {
              const next = [...prev, ...frame.events];
              allEventsRef.current = next;
              return next;
            });
          }
          idx++;
          last = time;
        } else {
          finishSimulation(frames[frames.length - 1], allNewEvents);
          return;
        }
      }
      animRef.current = requestAnimationFrame(animate);
    };

    stopAnim();
    animRef.current = requestAnimationFrame(animate);
  }, [finishSimulation]);

  const runTurn = useCallback(() => {
    const currentPlayers = playersRef.current;
    const currentBall = ballRef.current;
    const currentPending = pendingCommandsRef.current;

    const aiPlayersList = currentPlayers.filter(x => x.teamId === "ai");
    const playerPlayersList = currentPlayers.filter(x => x.teamId === "player");
    const aiCommands = generateAICommands(aiPlayersList, playerPlayersList, currentBall, aiTier);

    const withCommands = currentPlayers.map(p => {
      const cmd = p.teamId === "player"
        ? currentPending.get(p.id) ?? null
        : aiCommands.get(p.id) ?? { type: CommandType.MOVE, targetPosition: { ...p.position } };
      return { ...p, command: cmd, commandExecuted: false };
    });

    const seed = Date.now() % 99999;
    const { frames, events } = runSimulation(withCommands, currentBall, seed);
    playbackFrames(frames, events);
  }, [playbackFrames, aiTier]);

  const confirmTurn = useCallback(() => {
    if (phaseRef.current !== "planning") return;
    if (timerRef.current) clearInterval(timerRef.current);
    phaseRef.current = "simulating";
    setPhase("simulating");
    clearSelection();
    setPendingCommands(new Map());
    runTurn();
  }, [runTurn, clearSelection]);

  useEffect(() => {
    if (phase !== "planning") return;
    setTurnTimer(TURN_TIME);
    timerRef.current = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          confirmTurn();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [phase, turn]);

  const handlePlayerClick = useCallback((playerId: string, _pos: Vec2) => {
    if (phaseRef.current !== "planning") return;

    if (passTargetMode && selectedPlayerId) {
      const targetFrame = currentFrame.players.find(p => p.id === playerId);
      if (!targetFrame) return;
      const cmd: Command = { type: CommandType.PASS, targetPlayerId: playerId, targetPosition: { ...targetFrame.position } };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
      clearSelection();
      return;
    }

    if (selectedPlayerId === playerId) {
      clearSelection();
    } else {
      setSelectedPlayerId(playerId);
      setPassTargetMode(false);
    }
  }, [passTargetMode, selectedPlayerId, currentFrame, clearSelection]);

  const handleTileClick = useCallback((pos: Vec2, _isEnemy: boolean) => {
    if (phaseRef.current !== "planning" || !selectedPlayerId) return;

    if (passTargetMode) {
      const cmd: Command = { type: CommandType.PASS, targetPosition: pos };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    } else {
      const cmd: Command = { type: CommandType.MOVE, targetPosition: pos };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    }
    clearSelection();
  }, [selectedPlayerId, passTargetMode, clearSelection]);

  const setShoot = useCallback(() => {
    if (!selectedPlayerId) return;
    const cmd: Command = { type: CommandType.SHOOT };
    setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    clearSelection();
  }, [selectedPlayerId, clearSelection]);

  const setPass = useCallback(() => {
    if (!selectedPlayerId) return;
    setPassTargetMode(true);
  }, [selectedPlayerId]);

  const cancelAction = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#070b14" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <button onClick={onForfeit} className="text-gray-500 hover:text-white transition-colors text-sm px-2 py-1">
          ✕
        </button>
        <div className="flex items-center gap-5">
          <div className="text-center min-w-20">
            <div className="text-xs text-gray-400 truncate">{team.crestIcon} {team.name}</div>
            <div className="text-white font-black text-3xl leading-none">{score.player}</div>
            <GoalDots filled={score.player} total={GOALS_TO_WIN} />
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-[10px]">First to {GOALS_TO_WIN}</div>
            {phase === "planning" && (
              <div className="text-sm font-bold leading-tight" style={{ color: turnTimer <= 5 ? "#ff5252" : "#ffd700" }}>
                {turnTimer}s
              </div>
            )}
            {phase === "simulating" && <div className="text-[#00e676] text-sm">▶</div>}
            {phase === "finished" && <div className="text-gray-500 text-xs">FT</div>}
            <div className="text-gray-600 text-[10px]">T{turn}/{MAX_MATCH_TURNS}</div>
          </div>
          <div className="text-center min-w-20">
            <div className="text-xs text-gray-400 truncate">{opponentTeamDef.crestIcon} {opponentTeamDef.name}</div>
            <div className="text-white font-black text-3xl leading-none">{score.ai}</div>
            <GoalDots filled={score.ai} total={GOALS_TO_WIN} />
          </div>
        </div>
        <div className="w-8" />
      </div>

      {/* Goal banner */}
      {showGoalBanner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className="px-12 py-6 rounded-3xl text-center animate-bounce"
            style={{
              background: showGoalBanner === "player" ? "rgba(0,230,118,0.94)" : "rgba(255,82,82,0.94)",
              boxShadow: showGoalBanner === "player" ? "0 0 80px rgba(0,230,118,0.5)" : "0 0 80px rgba(255,82,82,0.5)",
            }}
          >
            <div className="text-4xl font-black text-white">⚽ GOAL!</div>
            <div className="text-white text-lg font-bold mt-1">
              {showGoalBanner === "player" ? team.name : opponentTeamDef.name}
            </div>
          </div>
        </div>
      )}

      {/* Pitch */}
      <div className="flex-1 relative" style={{ minHeight: 0, padding: "4px 4px 0" }}>
        <PitchCanvas
          frame={currentFrame}
          playerTeam={team}
          aiTeamColor={opponentTeamDef.jerseyColor}
          aiTeamSecondaryColor={opponentTeamDef.secondaryColor}
          pendingCommands={pendingCommands}
          selectedPlayerId={selectedPlayerId}
          passTargetMode={passTargetMode}
          phase={phase}
          onPlayerClick={handlePlayerClick}
          onTileClick={handleTileClick}
        />

        {passTargetMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-400/90 text-black text-xs font-bold px-3 py-1.5 rounded-full pointer-events-none shadow-lg">
            Tap tile or teammate to pass
          </div>
        )}
      </div>

      {/* Controls bottom bar */}
      <div className="flex-shrink-0" style={{ background: "rgba(0,0,0,0.55)" }}>
        {selectedPlayerId && phase === "planning" && !passTargetMode && (
          <div className="flex gap-2 px-4 pt-2.5">
            <button
              onClick={cancelAction}
              className="px-3 py-2 rounded-xl text-gray-500 text-sm font-medium hover:text-white transition-colors"
            >
              ✕
            </button>
            <button
              onClick={setPass}
              className="flex-1 py-2 rounded-xl text-black text-sm font-bold transition-all active:scale-95"
              style={{ background: "#ffeb3b" }}
            >
              Pass
            </button>
            <button
              onClick={setShoot}
              className="flex-1 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
              style={{ background: "#d32f2f" }}
            >
              Shoot
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2">
          <div className="flex-1 text-xs text-gray-500">
            {phase === "planning" && !selectedPlayerId && "Tap a player · green tiles = your range"}
            {phase === "planning" && selectedPlayerId && !passTargetMode && "Tap green tile to move · ⚔ orange = tackle"}
            {phase === "planning" && passTargetMode && "Tap a tile or player to pass"}
            {phase === "simulating" && "Simulating…"}
            {phase === "finished" && "Match over!"}
          </div>
          <button
            onClick={confirmTurn}
            disabled={phase !== "planning"}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-black transition-all active:scale-95 disabled:opacity-40"
            style={{
              background: phase === "planning"
                ? "linear-gradient(135deg, #00e676, #00b288)"
                : "rgba(255,255,255,0.08)",
            }}
          >
            Confirm
          </button>
        </div>

        <div className="px-4 pb-3 h-10 overflow-hidden">
          <EventLog events={allEvents} />
        </div>
      </div>
    </div>
  );
}
