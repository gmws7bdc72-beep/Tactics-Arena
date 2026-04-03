import { useState, useCallback } from "react";
import type { TeamConfig, ArenaProgress, GameEvent } from "./engine/types";
import { useGameState } from "./hooks/useGameState";
import Home from "./pages/Home";
import TeamSetup from "./pages/TeamSetup";
import Customize from "./pages/Customize";
import Match from "./pages/Match";
import PostMatch from "./pages/PostMatch";
import { ARENAS, WINS_TO_PROMOTE, LOSSES_TO_RELEGATE } from "./engine/constants";

type Screen = "home" | "team-setup" | "customize" | "match" | "post-match";

interface MatchResult {
  playerScore: number;
  aiScore: number;
  events: GameEvent[];
}

const ARENA_ORDER: ArenaProgress["arena"][] = ["bronze", "silver", "gold", "elite"];

function computeNewProgress(old: ArenaProgress, won: boolean): ArenaProgress {
  const newWins = won ? old.wins + 1 : old.wins;
  const newLosses = won ? old.losses : old.losses + 1;
  const newWinsInArena = won ? old.winsInArena + 1 : old.winsInArena;
  const newLossesInArena = won ? old.lossesInArena : old.lossesInArena + 1;

  let arena = old.arena;
  let winsInArena = newWinsInArena;
  let lossesInArena = newLossesInArena;

  const arenaIdx = ARENA_ORDER.indexOf(old.arena);

  if (newWinsInArena >= WINS_TO_PROMOTE && arenaIdx < ARENA_ORDER.length - 1) {
    arena = ARENA_ORDER[arenaIdx + 1];
    winsInArena = 0;
    lossesInArena = 0;
  } else if (newLossesInArena >= LOSSES_TO_RELEGATE && arenaIdx > 0) {
    arena = ARENA_ORDER[arenaIdx - 1];
    winsInArena = 0;
    lossesInArena = 0;
  }

  return {
    arena,
    wins: newWins,
    losses: newLosses,
    winsInArena,
    lossesInArena,
  };
}

export default function App() {
  const { team, updateTeam, progress, updateProgress } = useGameState();
  const [screen, setScreen] = useState<Screen>("home");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [oldProgress, setOldProgress] = useState<ArenaProgress>(progress);
  const [newProgress, setNewProgress] = useState<ArenaProgress>(progress);

  const handleMatchEnd = useCallback((result: MatchResult) => {
    const won = result.playerScore > result.aiScore;
    const newProg = computeNewProgress(progress, won);
    setMatchResult(result);
    setOldProgress(progress);
    setNewProgress(newProg);
    updateProgress(newProg);
    setScreen("post-match");
  }, [progress, updateProgress]);

  const handleRematch = useCallback(() => {
    setMatchResult(null);
    setScreen("match");
  }, []);

  const handleTeamSave = useCallback((t: TeamConfig) => {
    updateTeam(t);
    setScreen("home");
  }, [updateTeam]);

  if (screen === "home") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <Home
          team={team}
          progress={progress}
          onStartMatch={() => setScreen("match")}
          onGoToTeamSetup={() => setScreen("team-setup")}
          onGoToCustomize={() => setScreen("customize")}
        />
      </div>
    );
  }

  if (screen === "team-setup") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <TeamSetup team={team} onSave={handleTeamSave} onBack={() => setScreen("home")} />
      </div>
    );
  }

  if (screen === "customize") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <Customize team={team} onSave={t => { updateTeam(t); setScreen("home"); }} onBack={() => setScreen("home")} />
      </div>
    );
  }

  if (screen === "match") {
    return (
      <div className="max-w-2xl mx-auto min-h-screen" style={{ maxWidth: "min(100vw, 760px)" }}>
        <Match
          team={team}
          arenaLevel={progress.arena}
          onMatchEnd={handleMatchEnd}
          onForfeit={() => {
            handleMatchEnd({ playerScore: 0, aiScore: 0, events: [] });
          }}
        />
      </div>
    );
  }

  if (screen === "post-match" && matchResult) {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <PostMatch
          playerScore={matchResult.playerScore}
          aiScore={matchResult.aiScore}
          events={matchResult.events}
          team={team}
          oldProgress={oldProgress}
          newProgress={newProgress}
          onRematch={handleRematch}
          onHome={() => setScreen("home")}
        />
      </div>
    );
  }

  return null;
}
