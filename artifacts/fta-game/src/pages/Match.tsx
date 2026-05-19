import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { TeamConfig, SimPlayer, SimBall, Command, FrameSnapshot, GameEvent, Vec2 } from "../engine/types";
import { CommandType, GameEventType } from "../engine/types";
import type { PlayerCard } from "../engine/types";
import { runSimulation, getOffsidePlayers } from "../engine/simulation";
import { generateAICommands } from "../engine/ai";
import type { AdaptiveAIState } from "../engine/ai";
import type { AITeamDef } from "../game/league";
import { getAIFormationById, getFormationById } from "../game/formations";
import { PITCH_WIDTH, PITCH_HEIGHT, MAX_MATCH_TURNS, GOALS_TO_WIN, speedToTiles, TILE_H, GRID_ROWS } from "../engine/constants";
import PitchCanvas from "../components/PitchCanvas";
import EventLog from "../components/EventLog";
import { useIsMobile } from "../hooks/use-mobile";
import { loadMatch, saveMatch } from "../game/persistence";

interface Props {
  team: TeamConfig;
  opponentTeamDef: AITeamDef;
  isHome?: boolean;
  twoPlayer?: boolean;
  p1TeamDef?: AITeamDef;
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
    startPosition: { ...pos },
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
      tileRange: speedToTiles(p.stats.speed),
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

// ── Color clash detection ──────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function rgbDist(a: string, b: string): number {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return 200;
  return Math.sqrt((ra[0]-rb[0])**2 + (ra[1]-rb[1])**2 + (ra[2]-rb[2])**2);
}
const CLASH_THRESHOLD = 90; // out of ~442 max
const CONTRAST_POOL = ["#e65100","#1b5e20","#4a148c","#880e4f","#006064","#bf360c","#37474f","#0d47a1","#b71c1c"];
function pickContrasting(againstColor: string): string {
  return CONTRAST_POOL.reduce((best, c) => rgbDist(againstColor, c) > rgbDist(againstColor, best) ? c : best, CONTRAST_POOL[0]);
}

export default function Match({ team, opponentTeamDef, isHome = true, twoPlayer = false, p1TeamDef, onMatchEnd, onForfeit }: Props) {
  const p1Source = twoPlayer && p1TeamDef ? p1TeamDef : null;
  const playerFormation = p1Source ? getFormationById(p1Source.formationId) : getFormationById(team.formationId);
  const aiFormation = getAIFormationById(opponentTeamDef.formationId);
  const aiTier = opponentTeamDef.tier;
  const isMobile = useIsMobile();

  // ── Color clash: if both teams share a similar jersey color, override the AI's ──
  const p1JerseyColor = p1Source ? p1Source.jerseyColor : team.jerseyColor;
  const rawAiColor = opponentTeamDef.jerseyColor;
  const effectiveAiColor = rgbDist(p1JerseyColor, rawAiColor) < CLASH_THRESHOLD
    ? pickContrasting(p1JerseyColor)
    : rawAiColor;
  const effectiveAiSecondaryColor = effectiveAiColor !== rawAiColor ? "#ffffff" : (opponentTeamDef.secondaryColor ?? "#ffffff");

  const savedMatch = loadMatch();
  const initState = useRef((() => {
    if (savedMatch && savedMatch.version === 1 && savedMatch.twoPlayer === twoPlayer && savedMatch.isHome === isHome) {
      return {
        players: savedMatch.players,
        ball: savedMatch.ball,
      };
    }
    const p1Players = p1Source ? p1Source.players : team.players;
    const pl = p1Players.slice(0, 5).map((card, i) =>
      makeSimPlayer(card, "player", playerFormation.positions[i] ?? { x: PITCH_WIDTH * 0.2, y: PITCH_HEIGHT / 2 })
    );
    const ai = opponentTeamDef.players.slice(0, 5).map((card, i) =>
      makeSimPlayer(card, "ai", aiFormation.positions[i] ?? { x: PITCH_WIDTH * 0.8, y: PITCH_HEIGHT / 2 })
    );
    // 50/50 kickoff — random regardless of home/away
    const kickoffGK = Math.random() < 0.5
      ? pl.find(p => p.role === "goalkeeper") ?? pl[0]
      : ai.find(p => p.role === "goalkeeper") ?? ai[0];
    const ball: SimBall = { position: { ...kickoffGK.position }, velocity: { x: 0, y: 0 }, ownerId: kickoffGK.id };
    return { players: [...pl, ...ai], ball };
  })());

  const [players, setPlayers] = useState<SimPlayer[]>(initState.current.players);
  const [ball, setBall] = useState<SimBall>(initState.current.ball);
  const [score, setScore] = useState(savedMatch?.score ?? { player: 0, ai: 0 });
  const scoreRef = useRef(savedMatch?.score ?? { player: 0, ai: 0 });
  const [turn, setTurn] = useState(savedMatch?.turn ?? 1);
  const turnRef = useRef(savedMatch?.turn ?? 1);
  const [phase, setPhase] = useState<"planning" | "simulating" | "finished">(savedMatch?.phase ?? "planning");
  const [pendingCommands, setPendingCommands] = useState<Map<string, Command>>(new Map(savedMatch?.pendingCommands ?? []));
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(savedMatch?.selectedPlayerId ?? null);
  const [passTargetMode, setPassTargetMode] = useState(savedMatch?.passTargetMode ?? false);
  const [currentFrame, setCurrentFrame] = useState<FrameSnapshot>(() =>
    savedMatch?.currentFrame ?? makeInitFrame(initState.current.players, initState.current.ball)
  );
  const [allEvents, setAllEvents] = useState<GameEvent[]>(savedMatch?.allEvents ?? []);
  const allEventsRef = useRef<GameEvent[]>([]);
  const [showGoalBanner, setShowGoalBanner] = useState<"player" | "ai" | null>(null);

  // Combo move+pass state
  const [comboMoveFirst, setComboMoveFirst] = useState(savedMatch?.comboMoveFirst ?? true);
  const [comboActive, setComboActive] = useState(savedMatch?.comboActive ?? false);
  const [comboStep, setComboStep] = useState<1 | 2>(savedMatch?.comboStep ?? 1);
  const [comboStoredMove, setComboStoredMove] = useState<Vec2 | null>(savedMatch?.comboStoredMove ?? null);
  const [comboStoredPass, setComboStoredPass] = useState<{ targetPosition?: Vec2; targetPlayerId?: string } | null>(savedMatch?.comboStoredPass ?? null);

  // 2-player sequential turn tracking: P1 plans first, then P2.
  const [twoPlayerTurn, setTwoPlayerTurn] = useState<"p1" | "p2">("p1");
  const twoPlayerTurnRef = useRef<"p1" | "p2">("p1");
  const p1StoredCommandsRef = useRef<Map<string, Command>>(new Map());

  const animRef = useRef<number | null>(null);
  const phaseRef = useRef<"planning" | "simulating" | "finished">("planning");
  const playersRef = useRef(players);
  const ballRef = useRef(ball);
  const pendingCommandsRef = useRef(pendingCommands);
  // Tracks where the AI conceded goals this match so it can adapt its defensive shape
  const adaptiveAIRef = useRef<AdaptiveAIState>({ concededRows: [] });

  // Replay
  const allMatchFramesRef = useRef<FrameSnapshot[]>([]);
  const [matchEndResult, setMatchEndResult] = useState<{ playerScore: number; aiScore: number } | null>(null);
  const [replayMode, setReplayMode] = useState(savedMatch?.replayMode ?? false);
  const [replayIdx, setReplayIdx] = useState(savedMatch?.replayIdx ?? 0);
  const [replaySpeed, setReplaySpeed] = useState<1 | 6 | 8 | 10>(savedMatch?.replaySpeed ?? 1);
  const [replayPlaying, setReplayPlaying] = useState(savedMatch?.replayPlaying ?? false);
  const replayAnimRef = useRef<number | null>(null);
  const replayIdxRef = useRef(0);
  const replaySpeedRef = useRef<1 | 6 | 8 | 10>(1);

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { ballRef.current = ball; }, [ball]);
  useEffect(() => { pendingCommandsRef.current = pendingCommands; }, [pendingCommands]);
  const turnSaveCountRef = useRef(savedMatch?.turnSaveCount ?? 0);

  const persistMatch = useCallback(() => {
    saveMatch({
      version: 1,
      twoPlayer,
      isHome,
      turn: turnRef.current,
      phase: phaseRef.current,
      score: scoreRef.current,
      players: playersRef.current,
      ball: ballRef.current,
      currentFrame,
      allEvents: allEventsRef.current,
      matchEndResult,
      pendingCommands: [...pendingCommandsRef.current.entries()],
      selectedPlayerId,
      passTargetMode,
      comboMoveFirst,
      comboActive,
      comboStep,
      comboStoredMove,
      comboStoredPass,
      replayMode,
      replayIdx,
      replaySpeed,
      replayPlaying,
      turnSaveCount: turnSaveCountRef.current,
    });
  }, [twoPlayer, isHome, currentFrame, matchEndResult, selectedPlayerId, passTargetMode, comboMoveFirst, comboActive, comboStep, comboStoredMove, comboStoredPass, replayMode, replayIdx, replaySpeed, replayPlaying]);

  useEffect(() => {
    if (!savedMatch) return;
    setPlayers(savedMatch.players);
    setBall(savedMatch.ball);
    setScore(savedMatch.score);
    scoreRef.current = savedMatch.score;
    setTurn(savedMatch.turn);
    turnRef.current = savedMatch.turn;
    setPhase(savedMatch.phase);
    phaseRef.current = savedMatch.phase;
    setPendingCommands(new Map(savedMatch.pendingCommands));
    pendingCommandsRef.current = new Map(savedMatch.pendingCommands);
    setSelectedPlayerId(savedMatch.selectedPlayerId);
    setPassTargetMode(savedMatch.passTargetMode);
    setComboMoveFirst(savedMatch.comboMoveFirst);
    setComboActive(savedMatch.comboActive);
    setComboStep(savedMatch.comboStep);
    setComboStoredMove(savedMatch.comboStoredMove);
    setComboStoredPass(savedMatch.comboStoredPass);
    setReplayMode(savedMatch.replayMode);
    setReplayIdx(savedMatch.replayIdx);
    setReplaySpeed(savedMatch.replaySpeed);
    setReplayPlaying(savedMatch.replayPlaying);
    setCurrentFrame(savedMatch.currentFrame);
    setAllEvents(savedMatch.allEvents);
    allEventsRef.current = savedMatch.allEvents;
    turnSaveCountRef.current = savedMatch.turnSaveCount;
  }, []);

  useEffect(() => {
    const saved = turnSaveCountRef.current + 1;
    turnSaveCountRef.current = saved;
    if (saved % 3 === 0) persistMatch();
  }, [turn, persistMatch]);

  useEffect(() => {
    const onBeforeUnload = () => persistMatch();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      persistMatch();
      window.removeEventListener("beforeunload", onBeforeUnload);
      saveMatch(null);
    };
  }, [persistMatch]);

  const stopAnim = () => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedPlayerId(null);
    setPassTargetMode(false);
    setComboActive(false);
    setComboStep(1);
    setComboStoredMove(null);
    setComboStoredPass(null);
  }, []);

  const startCombo = useCallback(() => {
    if (!selectedPlayerId) return;
    setComboActive(true);
    setComboStep(1);
    setComboStoredMove(null);
    setComboStoredPass(null);
    setPassTargetMode(comboMoveFirst ? false : true);
  }, [selectedPlayerId, comboMoveFirst]);

  const finishSimulation = useCallback((lastFrame: FrameSnapshot, allNewEvents: GameEvent[]) => {
    const goalEvent = allNewEvents.find(e => e.type === GameEventType.GOAL);
    const oldScore = scoreRef.current;
    let newScore = { ...oldScore };

    if (goalEvent?.teamId === "player") {
      newScore = { player: oldScore.player + 1, ai: oldScore.ai };
      setShowGoalBanner("player");
      setTimeout(() => setShowGoalBanner(null), 2200);
      // Record the row where the AI was beaten so it can adapt its defensive shape
      const concededRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(lastFrame.ball.position.y / TILE_H)));
      adaptiveAIRef.current = {
        ...adaptiveAIRef.current,
        concededRows: [...adaptiveAIRef.current.concededRows, concededRow],
      };
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

    let newBall: SimBall;
    if (goalEvent) {
      const concedingTeamId = goalEvent.teamId === "player" ? "ai" : "player";
      const concedingGK =
        newSimPlayers.find(p => p.teamId === concedingTeamId && p.role === "goalkeeper") ??
        newSimPlayers.find(p => p.teamId === concedingTeamId);
      newBall = concedingGK
        ? { position: { ...concedingGK.position }, velocity: { x: 0, y: 0 }, ownerId: concedingGK.id }
        : { position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 }, velocity: { x: 0, y: 0 }, ownerId: null };
    } else {
      // Zero velocity so the planning phase always starts with a stationary ball.
      // If the simulation ended with the ball still rolling (a pass that didn't
      // reach its target in 60 ticks), snap it to passTarget immediately so the
      // planning UI always shows the ball at the correct destination tile.
      newBall = { ...lastFrame.ball, velocity: { x: 0, y: 0 } };
      if (newBall.passTarget) {
        newBall = { ...newBall, position: { ...newBall.passTarget }, passTarget: undefined };
      }
    }

    setPlayers(newSimPlayers);
    setBall(newBall);
    playersRef.current = newSimPlayers;
    ballRef.current = newBall;
    setCurrentFrame(makeInitFrame(newSimPlayers, newBall));

    // Reset sequential 2-player turn to P1 for the new turn
    if (twoPlayer) {
      twoPlayerTurnRef.current = "p1";
      setTwoPlayerTurn("p1");
      p1StoredCommandsRef.current = new Map();
    }

    const matchOver = newScore.player >= GOALS_TO_WIN || newScore.ai >= GOALS_TO_WIN || nextTurn > MAX_MATCH_TURNS;
    if (matchOver) {
      phaseRef.current = "finished";
      setPhase("finished");
      setTimeout(() => {
        setMatchEndResult({ playerScore: newScore.player, aiScore: newScore.ai });
      }, goalEvent ? 2400 : 1200);
    } else {
      turnRef.current = nextTurn;
      setTurn(nextTurn);
      phaseRef.current = "planning";
      setPhase("planning");
    }
  }, [onMatchEnd, playerFormation, aiFormation, twoPlayer]);

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

    // Accumulate all frames so the full-match replay can play them back
    allMatchFramesRef.current.push(...frames);
    stopAnim();
    animRef.current = requestAnimationFrame(animate);
  }, [finishSimulation]);

  const runTurn = useCallback((combinedCommands?: Map<string, Command>) => {
    const currentPlayers = playersRef.current;
    const currentBall = ballRef.current;
    const currentPending = combinedCommands ?? pendingCommandsRef.current;

    let withCommands: SimPlayer[];
    if (twoPlayer) {
      withCommands = currentPlayers.map(p => ({
        ...p,
        command: currentPending.get(p.id) ?? null,
        commandExecuted: false,
      }));
    } else {
      const aiPlayersList = currentPlayers.filter(x => x.teamId === "ai");
      const playerPlayersList = currentPlayers.filter(x => x.teamId === "player");
      const aiCommands = generateAICommands(aiPlayersList, playerPlayersList, currentBall, aiTier, adaptiveAIRef.current);
      withCommands = currentPlayers.map(p => {
        const cmd = p.teamId === "player"
          ? currentPending.get(p.id) ?? null
          : aiCommands.get(p.id) ?? { type: CommandType.MOVE, targetPosition: { ...p.position } };
        return { ...p, command: cmd, commandExecuted: false };
      });
    }

    const seed = Date.now() % 99999;
    const { frames, events } = runSimulation(withCommands, currentBall, seed);
    playbackFrames(frames, events);
  }, [playbackFrames, aiTier, twoPlayer]);

  const confirmTurn = useCallback(() => {
    if (phaseRef.current !== "planning") return;

    // Sequential 2-player mode: P1 confirms first, then P2.
    if (twoPlayer) {
      if (twoPlayerTurnRef.current === "p1") {
        // Store P1's commands and hand the pitch to P2.
        p1StoredCommandsRef.current = new Map(pendingCommandsRef.current);
        setPendingCommands(new Map());
        pendingCommandsRef.current = new Map();
        clearSelection();
        twoPlayerTurnRef.current = "p2";
        setTwoPlayerTurn("p2");
        return;
      }
      // P2 confirmed — merge both sets and run the turn.
      const combined = new Map([...p1StoredCommandsRef.current, ...pendingCommandsRef.current]);
      phaseRef.current = "simulating";
      setPhase("simulating");
      clearSelection();
      setPendingCommands(new Map());
      pendingCommandsRef.current = new Map();
      twoPlayerTurnRef.current = "p1";
      setTwoPlayerTurn("p1");
      runTurn(combined);
      return;
    }

    phaseRef.current = "simulating";
    setPhase("simulating");
    clearSelection();
    setPendingCommands(new Map());
    runTurn();
  }, [twoPlayer, runTurn, clearSelection]);

  // ── Replay handlers ───────────────────────────────────────────────────────
  const stopReplayAnim = useCallback(() => {
    if (replayAnimRef.current !== null) {
      cancelAnimationFrame(replayAnimRef.current);
      replayAnimRef.current = null;
    }
  }, []);

  const startReplayAnimation = useCallback((startIdx: number) => {
    const allFrames = allMatchFramesRef.current;
    let idx = startIdx;
    let last = 0;
    const loop = (time: number) => {
      if (last === 0) last = time;
      const frameMs = 1000 / (30 * replaySpeedRef.current);
      if (time - last >= frameMs) {
        if (idx < allFrames.length) {
          setCurrentFrame(allFrames[idx]);
          setReplayIdx(idx);
          replayIdxRef.current = idx;
          idx++;
          last = time;
        } else {
          setReplayPlaying(false);
          return;
        }
      }
      replayAnimRef.current = requestAnimationFrame(loop);
    };
    stopReplayAnim();
    replayAnimRef.current = requestAnimationFrame(loop);
  }, [stopReplayAnim]);

  const handleWatchReplay = useCallback(() => {
    replayIdxRef.current = 0;
    setReplayIdx(0);
    setReplayPlaying(true);
    setReplayMode(true);
    startReplayAnimation(0);
  }, [startReplayAnimation]);

  const handleContinue = useCallback(() => {
    if (matchEndResult) {
      onMatchEnd({ playerScore: matchEndResult.playerScore, aiScore: matchEndResult.aiScore, events: allEventsRef.current });
    }
  }, [matchEndResult, onMatchEnd]);

  const handleExitReplay = useCallback(() => {
    stopReplayAnim();
    setReplayPlaying(false);
    setReplayMode(false);
  }, [stopReplayAnim]);

  const handleToggleReplayPlay = useCallback(() => {
    if (replayPlaying) {
      stopReplayAnim();
      setReplayPlaying(false);
    } else {
      setReplayPlaying(true);
      startReplayAnimation(replayIdxRef.current);
    }
  }, [replayPlaying, stopReplayAnim, startReplayAnimation]);

  const handleReplaySpeed = useCallback(() => {
    const next: 1 | 6 | 8 | 10 = replaySpeed === 1 ? 6 : replaySpeed === 6 ? 8 : replaySpeed === 8 ? 10 : 1;
    setReplaySpeed(next);
    replaySpeedRef.current = next;
  }, [replaySpeed]);

  const handleReplayScrub = useCallback((idx: number) => {
    const allFrames = allMatchFramesRef.current;
    if (idx >= 0 && idx < allFrames.length) {
      stopReplayAnim();
      setReplayPlaying(false);
      setReplayIdx(idx);
      replayIdxRef.current = idx;
      setCurrentFrame(allFrames[idx]);
    }
  }, [stopReplayAnim]);
  // ─────────────────────────────────────────────────────────────────────────

  const handlePlayerClick = useCallback((playerId: string, pos: Vec2) => {
    if (phaseRef.current !== "planning") return;

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
  }, [passTargetMode, selectedPlayerId, clearSelection, comboActive, comboMoveFirst, comboStep, comboStoredMove]);

  const handleTileClick = useCallback((pos: Vec2, _isEnemy: boolean) => {
    if (phaseRef.current !== "planning" || !selectedPlayerId) return;

    if (comboActive) {
      if (comboMoveFirst) {
        if (comboStep === 1) {
          setComboStoredMove(pos);
          setComboStep(2);
          setPassTargetMode(true);
        } else {
          // Step 2: tile tapped as pass target (no player needed)
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

  // ── Keyboard shortcuts during planning ───────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Skip if focus is inside an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;

      if (phaseRef.current !== "planning") return;

      if (e.key === "Enter") {
        confirmTurn();
        return;
      }

      if (!selectedPlayerId) return;

      switch (e.key) {
        case "1": // Move + Pass
          if (!comboActive) { setComboMoveFirst(true); startCombo(); }
          break;
        case "2": // Pass + Move
          if (!comboActive) { setComboMoveFirst(false); startCombo(); }
          break;
        case "3": // Pass
          if (!comboActive && !passTargetMode) setPass();
          break;
        case "4": // Shoot
          if (!comboActive) setShoot();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [confirmTurn, selectedPlayerId, comboActive, passTargetMode, startCombo, setPass, setShoot]);

  // Always recompute offside from live player positions so the OS flag shows
  // continuously (during both simulation playback and the planning phase)
  // for any player past the offside line — not just at the moment of reception.
  const liveFrame = useMemo((): FrameSnapshot => {
    const offsideSet = getOffsidePlayers(players);
    return {
      ...currentFrame,
      players: currentFrame.players.map(p => ({
        ...p,
        offside: offsideSet.has(p.id),
      })),
    };
  }, [currentFrame, players]);

  return (
    <div className="relative min-h-screen flex flex-col" style={{ background: "#070b14" }}>
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
            <div className="text-xs text-gray-400 truncate">
              {twoPlayer ? <span style={{ color: p1JerseyColor }}>● P1</span> : <>{team.crestIcon} {team.name}</>}
            </div>
            <div className="text-white font-black text-3xl leading-none">{score.player}</div>
            <GoalDots filled={score.player} total={GOALS_TO_WIN} />
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-[10px]">First to {GOALS_TO_WIN}</div>
            {phase === "simulating" && <div className="text-[#00e676] text-sm">▶</div>}
            {phase === "finished" && <div className="text-gray-500 text-xs">FT</div>}
            <div className="text-gray-600 text-[10px]">T{turn}/{MAX_MATCH_TURNS}</div>
          </div>
          <div className="text-center min-w-20">
            <div className="text-xs text-gray-400 truncate">
              {twoPlayer ? <span style={{ color: effectiveAiColor }}>● P2</span> : <>{opponentTeamDef.crestIcon} {opponentTeamDef.name}</>}
            </div>
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
              {showGoalBanner === "player"
                ? (twoPlayer ? "Player 1" : team.name)
                : (twoPlayer ? "Player 2" : opponentTeamDef.name)}
            </div>
          </div>
        </div>
      )}

      {/* Pitch */}
      <div className="flex-1 relative" style={{ minHeight: 0, padding: "4px 4px 0" }}>
        {isMobile && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <span className="text-[10px] text-white/40 font-semibold tracking-wide">▲ Attacking</span>
          </div>
        )}
        <PitchCanvas
          frame={liveFrame}
          playerTeam={twoPlayer && p1TeamDef ? { ...team, jerseyColor: p1TeamDef.jerseyColor, secondaryColor: p1TeamDef.secondaryColor, crestIcon: p1TeamDef.crestIcon } : team}
          aiTeamColor={effectiveAiColor}
          aiTeamSecondaryColor={effectiveAiSecondaryColor}
          pendingCommands={pendingCommands}
          selectedPlayerId={selectedPlayerId}
          passTargetMode={passTargetMode}
          passOriginPos={
            comboActive && comboMoveFirst && comboStep === 2 && comboStoredMove
              ? comboStoredMove
              : undefined
          }
          phase={phase}
          isVertical={isMobile}
          activePlanningTeam={twoPlayer ? (twoPlayerTurn === "p1" ? "player" : "ai") : undefined}
          onPlayerClick={handlePlayerClick}
          onTileClick={handleTileClick}
        />
        {isMobile && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <span className="text-[10px] text-white/40 font-semibold tracking-wide">▼ Your Goal</span>
          </div>
        )}

        {/* Combo hint banner */}
        {comboActive && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-purple-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg text-center whitespace-nowrap">
              {comboMoveFirst
                ? comboStep === 1 ? "Combo: tap move destination" : "Combo: tap pass target"
                : comboStep === 1 ? "Combo: tap pass target" : "Combo: tap move destination"}
            </div>
          </div>
        )}

        {!comboActive && passTargetMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-400/90 text-black text-xs font-bold px-3 py-1.5 rounded-full pointer-events-none shadow-lg">
            Tap tile or teammate to pass
          </div>
        )}
      </div>

      {/* Controls bottom bar */}
      <div className="flex-shrink-0" style={{ background: "rgba(0,0,0,0.55)" }}>
        {/* Normal action buttons (no pass target mode, no combo) */}
        {selectedPlayerId && phase === "planning" && !passTargetMode && !comboActive && (
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
              onClick={startCombo}
              className="flex-1 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #9c27b0, #6a1b9a)" }}
            >
              {comboMoveFirst ? "Move+Pass" : "Pass+Move"}
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

        {/* Combo order toggle + cancel (shown when player selected, not yet in combo) */}
        {selectedPlayerId && phase === "planning" && !passTargetMode && !comboActive && (
          <div className="flex items-center gap-2 px-4 pt-1">
            <span className="text-[10px] text-gray-600">Combo order:</span>
            <button
              onClick={() => setComboMoveFirst(v => !v)}
              className="text-[10px] px-2 py-0.5 rounded-md font-semibold transition-all"
              style={{ background: "rgba(156,39,176,0.20)", color: "#ce93d8" }}
            >
              {comboMoveFirst ? "Move → Pass" : "Pass → Move"}
            </button>
          </div>
        )}

        {/* Combo in-progress: show cancel */}
        {comboActive && phase === "planning" && (
          <div className="flex gap-2 px-4 pt-2.5">
            <button
              onClick={cancelAction}
              className="px-3 py-2 rounded-xl text-gray-500 text-sm font-medium hover:text-white transition-colors"
            >
              ✕ Cancel
            </button>
            <div className="flex-1 flex items-center justify-center text-xs text-purple-400 font-semibold">
              Step {comboStep}/2 · {comboMoveFirst ? "Move → Pass" : "Pass → Move"}
            </div>
          </div>
        )}

        {/* 2P sequential planning banner */}
        {twoPlayer && phase === "planning" && (
          <div
            className="mx-4 mt-2 px-3 py-1.5 rounded-xl text-center text-xs font-bold"
            style={{
              background: twoPlayerTurn === "p1" ? "rgba(100,180,255,0.10)" : "rgba(255,160,100,0.10)",
              border: `1px solid ${twoPlayerTurn === "p1" ? "rgba(100,180,255,0.25)" : "rgba(255,160,100,0.25)"}`,
              color: twoPlayerTurn === "p1" ? "#93c5fd" : "#fdba74",
            }}
          >
            {twoPlayerTurn === "p1"
              ? "P1: Plan your moves, then confirm — P2 plans next"
              : "P2: Plan your moves, then confirm to simulate"}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2">
          <div className="flex-1 text-xs text-gray-500">
            {phase === "planning" && !selectedPlayerId && "Tap any player · green tiles = move range"}
            {phase === "planning" && selectedPlayerId && !passTargetMode && !comboActive && "Tap green tile to move · ⚔ orange = tackle"}
            {phase === "planning" && !comboActive && passTargetMode && "Tap a tile or player to pass"}
            {phase === "planning" && comboActive && comboMoveFirst && comboStep === 1 && "Tap destination tile to move to"}
            {phase === "planning" && comboActive && comboMoveFirst && comboStep === 2 && "Now tap pass target (tile or player)"}
            {phase === "planning" && comboActive && !comboMoveFirst && comboStep === 1 && "Tap pass target (tile or player)"}
            {phase === "planning" && comboActive && !comboMoveFirst && comboStep === 2 && "Now tap move destination tile"}
            {phase === "simulating" && "Simulating…"}
            {phase === "finished" && "Match over!"}
          </div>
          <button
            onClick={confirmTurn}
            disabled={phase !== "planning"}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-black transition-all active:scale-95 disabled:opacity-40"
            style={{
              background: phase === "planning"
                ? twoPlayer && twoPlayerTurn === "p2"
                  ? "linear-gradient(135deg, #ff9800, #e65100)"
                  : "linear-gradient(135deg, #00e676, #00b288)"
                : "rgba(255,255,255,0.08)",
            }}
          >
            {twoPlayer && phase === "planning" ? (twoPlayerTurn === "p1" ? "P1 Done" : "P2 Done") : "Confirm"}
          </button>
        </div>

        <div className="px-4 pb-3 h-10 overflow-hidden">
          <EventLog events={allEvents} />
        </div>
      </div>

      {/* Match-end overlay */}
      {matchEndResult && !replayMode && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.72)" }}>
          <div className="text-center px-8 py-7 rounded-2xl mx-4" style={{ background: "rgba(7,11,20,0.97)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="text-gray-400 text-xs tracking-widest uppercase mb-1">Full Time</div>
            <div className="text-white font-black text-5xl mb-1">
              {matchEndResult.playerScore} – {matchEndResult.aiScore}
            </div>
            <div
              className="text-base font-bold mb-6"
              style={{ color: matchEndResult.playerScore > matchEndResult.aiScore ? "#00e676" : matchEndResult.playerScore < matchEndResult.aiScore ? "#ff5252" : "#ffd700" }}
            >
              {matchEndResult.playerScore > matchEndResult.aiScore ? "Victory!" : matchEndResult.playerScore < matchEndResult.aiScore ? "Defeat" : "Draw"}
            </div>
            <div className="flex gap-3">
              {allMatchFramesRef.current.length > 0 && (
                <button
                  onClick={handleWatchReplay}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#ccc" }}
                >
                  ▶ Replay
                </button>
              )}
              <button
                onClick={handleContinue}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-black transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replay controls overlay */}
      {replayMode && (
        <div
          className="absolute bottom-0 left-0 right-0 z-40 flex flex-col gap-2 px-4 py-3"
          style={{ background: "rgba(7,11,20,0.92)", backdropFilter: "blur(8px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <input
            type="range"
            min={0}
            max={Math.max(0, allMatchFramesRef.current.length - 1)}
            value={replayIdx}
            onChange={e => handleReplayScrub(Number(e.target.value))}
            className="w-full h-1 accent-green-400 cursor-pointer"
            style={{ accentColor: "#00e676" }}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleReplayPlay}
              className="text-white text-xl w-8 text-center"
            >
              {replayPlaying ? "⏸" : "▶"}
            </button>
            <button
              onClick={handleReplaySpeed}
              className="text-xs font-black px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(255,215,0,0.15)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.3)" }}
            >
              {replaySpeed}×
            </button>
            <div className="flex-1 text-center text-xs text-gray-500">
              {replayPlaying ? "Playing…" : "Paused"} · {allMatchFramesRef.current.length > 0 ? Math.round(replayIdx / allMatchFramesRef.current.length * 100) : 0}%
            </div>
            <button
              onClick={handleExitReplay}
              className="text-gray-400 hover:text-white text-sm font-medium px-2 py-1 transition-colors"
            >
              ✕ Exit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
