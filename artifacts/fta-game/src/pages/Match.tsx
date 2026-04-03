import { useState, useEffect, useRef, useCallback } from "react";
import type { TeamConfig, SimPlayer, SimBall, Command, FrameSnapshot, GameEvent, Vec2 } from "../engine/types";
import { CommandType, GameEventType } from "../engine/types";
import type { PlayerCard } from "../engine/types";
import { runSimulation } from "../engine/simulation";
import { generateAICommands } from "../engine/ai";
import { getAISquadForArena } from "../game/players";
import { getFormationById, getAIFormationForArena } from "../game/formations";
import { PITCH_WIDTH, PITCH_HEIGHT, MATCH_TURNS, PLAYER_RADIUS } from "../engine/constants";
import PitchCanvas from "../components/PitchCanvas";
import EventLog from "../components/EventLog";

interface Props {
  team: TeamConfig;
  arenaLevel: string;
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
    })),
    ball: { position: { ...ball.position }, velocity: { ...ball.velocity }, ownerId: ball.ownerId },
    events: [],
  };
}

function resetPositions(simPlayers: SimPlayer[], team: TeamConfig, arenaLevel: string): SimPlayer[] {
  const playerFormation = getFormationById(team.formationId);
  const aiFormation = getAIFormationForArena(arenaLevel);
  let pi = 0, ai = 0;
  return simPlayers.map(p => {
    const pos = p.teamId === "player"
      ? playerFormation.positions[pi++] ?? p.position
      : aiFormation.positions[ai++] ?? p.position;
    return { ...p, position: { ...pos }, velocity: { x: 0, y: 0 }, state: "IDLE" as SimPlayer["state"], command: null, commandExecuted: false };
  });
}

export default function Match({ team, arenaLevel, onMatchEnd, onForfeit }: Props) {
  const aiCards = getAISquadForArena(arenaLevel);
  const playerFormation = getFormationById(team.formationId);
  const aiFormation = getAIFormationForArena(arenaLevel);

  const initState = useRef((() => {
    const pl = team.players.slice(0, 4).map((card, i) =>
      makeSimPlayer(card, "player", team.startPositions[i] ?? playerFormation.positions[i])
    );
    const ai = aiCards.slice(0, 4).map((card, i) =>
      makeSimPlayer(card, "ai", aiFormation.positions[i] ?? { x: PITCH_WIDTH - 100, y: PITCH_HEIGHT / 2 })
    );
    const allP = [...pl, ...ai];
    const ball: SimBall = { position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 }, velocity: { x: 0, y: 0 }, ownerId: null };
    return { players: allP, ball };
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
  const [showPressure, setShowPressure] = useState(false);

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

  const finishSimulation = useCallback((lastFrame: FrameSnapshot, frames: FrameSnapshot[], allNewEvents: GameEvent[]) => {
    const goalEvent = allNewEvents.find(e => e.type === GameEventType.GOAL);
    const oldScore = scoreRef.current;
    let newScore = { ...oldScore };

    if (goalEvent?.teamId === "player") {
      newScore = { player: oldScore.player + 1, ai: oldScore.ai };
      setShowGoalBanner("player");
      setTimeout(() => setShowGoalBanner(null), 2000);
    } else if (goalEvent?.teamId === "ai") {
      newScore = { player: oldScore.player, ai: oldScore.ai + 1 };
      setShowGoalBanner("ai");
      setTimeout(() => setShowGoalBanner(null), 2000);
    }

    scoreRef.current = newScore;
    setScore(newScore);

    const nextTurn = turnRef.current + 1;

    const newSimPlayers = (() => {
      const fp = lastFrame.players;
      let pi = 0, ai = 0;
      return playersRef.current.map(orig => {
        const frameP = fp.find(x => x.id === orig.id)!;
        const pos = goalEvent
          ? (orig.teamId === "player"
              ? playerFormation.positions[pi++] ?? frameP.position
              : aiFormation.positions[ai++] ?? frameP.position)
          : { ...frameP.position };
        return {
          ...orig,
          position: pos,
          velocity: { x: 0, y: 0 },
          state: "IDLE" as SimPlayer["state"],
          command: null,
          commandExecuted: false,
        };
      });
    })();

    const newBall: SimBall = goalEvent
      ? { position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 }, velocity: { x: 0, y: 0 }, ownerId: null }
      : { ...lastFrame.ball };

    setPlayers(newSimPlayers);
    setBall(newBall);
    playersRef.current = newSimPlayers;
    ballRef.current = newBall;

    const resetFrame = makeInitFrame(newSimPlayers, newBall);
    setCurrentFrame(resetFrame);

    if (nextTurn > MATCH_TURNS) {
      phaseRef.current = "finished";
      setPhase("finished");
      setTimeout(() => {
        onMatchEnd({ playerScore: newScore.player, aiScore: newScore.ai, events: allEventsRef.current });
      }, 1200);
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
      const elapsed = time - last;
      if (elapsed >= frameMs) {
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
          finishSimulation(frames[frames.length - 1], frames, allNewEvents);
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
    const aiCommands = generateAICommands(aiPlayersList, playerPlayersList, currentBall);

    const withCommands = currentPlayers.map(p => {
      const cmd = p.teamId === "player"
        ? currentPending.get(p.id) ?? null
        : aiCommands.get(p.id) ?? { type: CommandType.MOVE, targetPosition: { ...p.position } };
      return { ...p, command: cmd, commandExecuted: false };
    });

    const seed = Date.now() % 99999;
    const { frames, events } = runSimulation(withCommands, currentBall, seed);

    setAllEvents(prev => {
      const next = [...prev, ...events.filter(e => !prev.includes(e))];
      allEventsRef.current = next;
      return next;
    });

    playbackFrames(frames, events);
  }, [playbackFrames]);

  const confirmTurn = useCallback(() => {
    if (phaseRef.current !== "planning") return;
    if (timerRef.current) clearInterval(timerRef.current);

    phaseRef.current = "simulating";
    setPhase("simulating");
    setActionPicker(null);
    setSelectedPlayerId(null);
    setPassTargetMode(false);
    setPendingCommands(new Map());

    runTurn();
  }, [runTurn]);

  // Turn timer
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

  const [actionPicker, setActionPicker] = useState<{ playerId: string } | null>(null);

  const handlePlayerClick = useCallback((playerId: string, _pos: Vec2) => {
    if (phaseRef.current !== "planning") return;

    if (passTargetMode && selectedPlayerId) {
      const targetFrame = currentFrame.players.find(p => p.id === playerId);
      if (!targetFrame) return;
      const cmd: Command = {
        type: CommandType.PASS,
        targetPlayerId: playerId,
        targetPosition: { ...targetFrame.position },
      };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
      setPassTargetMode(false);
      setActionPicker(null);
      setSelectedPlayerId(null);
      return;
    }

    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      setActionPicker(null);
    } else {
      setSelectedPlayerId(playerId);
      setActionPicker({ playerId });
    }
  }, [passTargetMode, selectedPlayerId, currentFrame]);

  const handlePitchClick = useCallback((pos: Vec2) => {
    if (phaseRef.current !== "planning") return;
    if (!selectedPlayerId) return;

    if (passTargetMode) {
      const cmd: Command = { type: CommandType.PASS, targetPosition: pos };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
      setPassTargetMode(false);
      setActionPicker(null);
      setSelectedPlayerId(null);
      return;
    }

    const cmd: Command = { type: CommandType.MOVE, targetPosition: pos };
    setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
    setSelectedPlayerId(null);
    setActionPicker(null);
  }, [selectedPlayerId, passTargetMode]);

  const setAction = (type: CommandType) => {
    if (!selectedPlayerId) return;
    if (type === CommandType.PASS) {
      setPassTargetMode(true);
      setActionPicker(null);
      return;
    }
    if (type === CommandType.SHOOT) {
      const cmd: Command = { type: CommandType.SHOOT };
      setPendingCommands(prev => { const n = new Map(prev); n.set(selectedPlayerId, cmd); return n; });
      setSelectedPlayerId(null);
      setActionPicker(null);
    }
  };

  const aiPositions = currentFrame.players.filter(p => p.teamId === "ai").map(p => p.position);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#070b14" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
        <button onClick={onForfeit} className="text-gray-500 hover:text-white transition-colors text-sm px-2 py-1">
          ✕ Forfeit
        </button>
        <div className="flex items-center gap-5">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">{team.name}</div>
            <div className="text-white font-black text-2xl leading-none">{score.player}</div>
          </div>
          <div className="text-center min-w-16">
            <div className="text-gray-400 text-xs">Turn {turn}/{MATCH_TURNS}</div>
            {phase === "planning" && (
              <div className="text-sm font-bold mt-0.5" style={{ color: turnTimer <= 5 ? "#ff5252" : "#ffd700" }}>
                {turnTimer}s
              </div>
            )}
            {phase === "simulating" && <div className="text-xs text-[#00e676] mt-0.5">Playing...</div>}
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Opponent</div>
            <div className="text-white font-black text-2xl leading-none">{score.ai}</div>
          </div>
        </div>
        <div className="text-xl px-2">{team.crestIcon}</div>
      </div>

      {/* GOAL banner */}
      {showGoalBanner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className="px-12 py-6 rounded-3xl text-center zoom-in"
            style={{
              background: showGoalBanner === "player" ? "rgba(0,230,118,0.92)" : "rgba(255,82,82,0.92)",
              boxShadow: showGoalBanner === "player"
                ? "0 0 60px rgba(0,230,118,0.5)"
                : "0 0 60px rgba(255,82,82,0.5)",
            }}
          >
            <div className="text-4xl font-black text-white">⚽ GOAL!</div>
            <div className="text-white text-lg font-bold mt-1">
              {showGoalBanner === "player" ? team.name : "Opponent"}
            </div>
          </div>
        </div>
      )}

      {/* Pitch */}
      <div className="flex-1 relative" style={{ minHeight: 0, padding: "4px 4px 0" }}>
        <PitchCanvas
          frame={currentFrame}
          playerTeam={team}
          pendingCommands={pendingCommands}
          selectedPlayerId={selectedPlayerId}
          phase={phase}
          onPlayerClick={handlePlayerClick}
          onPitchClick={handlePitchClick}
          showPressure={showPressure}
          aiPositions={aiPositions}
        />
        {passTargetMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-400/90 text-black text-xs font-bold px-3 py-1.5 rounded-full pointer-events-none">
            Tap teammate or pitch for pass target
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0" style={{ background: "rgba(0,0,0,0.5)" }}>
        {/* Action picker */}
        {actionPicker && phase === "planning" && !passTargetMode && (
          <div className="flex gap-2 justify-center px-4 pt-2">
            <button onClick={() => { setActionPicker(null); setSelectedPlayerId(null); }}
              className="px-3 py-1.5 rounded-lg text-gray-400 text-xs font-medium transition-all hover:bg-white/10">
              ✕
            </button>
            <button onClick={() => setAction(CommandType.MOVE)}
              className="flex-1 py-2 rounded-xl text-white text-sm font-semibold transition-all active:scale-95"
              style={{ background: "#1565c0" }}>
              Move
            </button>
            <button onClick={() => setAction(CommandType.PASS)}
              className="flex-1 py-2 rounded-xl text-black text-sm font-semibold transition-all active:scale-95"
              style={{ background: "#ffeb3b" }}>
              Pass
            </button>
            <button onClick={() => setAction(CommandType.SHOOT)}
              className="flex-1 py-2 rounded-xl text-white text-sm font-semibold transition-all active:scale-95"
              style={{ background: "#d32f2f" }}>
              Shoot
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2">
          <div className="flex-1 text-xs text-gray-500">
            {phase === "planning" && !selectedPlayerId && "Tap a player to command"}
            {phase === "planning" && selectedPlayerId && !passTargetMode && "Select action or tap pitch"}
            {phase === "simulating" && "Simulating turn..."}
            {phase === "finished" && "Match over!"}
          </div>
          <button
            onClick={() => setShowPressure(p => !p)}
            className="px-2 py-1 rounded text-xs font-medium transition-all"
            style={{
              background: showPressure ? "rgba(220,50,50,0.2)" : "rgba(255,255,255,0.07)",
              color: showPressure ? "#ff5252" : "#6b7280",
            }}>
            Heat
          </button>
          <button
            onClick={confirmTurn}
            disabled={phase !== "planning"}
            className="px-5 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
            style={{ background: phase === "planning" ? "linear-gradient(135deg, #00e676, #00b288)" : "rgba(255,255,255,0.08)" }}>
            Confirm
          </button>
        </div>

        {/* Events */}
        <div className="px-4 pb-3 h-12 overflow-hidden">
          <EventLog events={allEvents} />
        </div>
      </div>
    </div>
  );
}
