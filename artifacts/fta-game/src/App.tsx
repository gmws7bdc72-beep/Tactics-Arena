import { useState, useCallback } from "react";
import type { TeamConfig, GameEvent, LeagueState } from "./engine/types";
import { useGameState } from "./hooks/useGameState";
import Home from "./pages/Home";
import TeamSetup from "./pages/TeamSetup";
import Customize from "./pages/Customize";
import Match from "./pages/Match";
import PostMatch from "./pages/PostMatch";
import { getAITeamDef } from "./game/league";
import { applyMatchResult } from "./game/league";
import { PLAYER_TEAM_ID_CONST } from "./game/persistence";

type Screen = "home" | "team-setup" | "customize" | "match" | "post-match";

interface MatchResult {
  playerScore: number;
  aiScore: number;
  events: GameEvent[];
  opponentName: string;
}

export default function App() {
  const { team, updateTeam, league, updateLeague, startNewSeason } = useGameState();
  const [screen, setScreen] = useState<Screen>("home");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  const currentMatchIndex = league.currentMatchIndex;
  const currentScheduledMatch = league.schedule[currentMatchIndex] ?? null;
  const isLeagueComplete = currentMatchIndex >= league.schedule.length;

  const currentOpponentDef = currentScheduledMatch
    ? getAITeamDef(currentScheduledMatch.opponentId)
    : null;

  const handleMatchEnd = useCallback((result: { playerScore: number; aiScore: number; events: GameEvent[] }) => {
    if (!currentScheduledMatch || !currentOpponentDef) return;
    const seed = Date.now() % 99999;
    const newLeague = applyMatchResult(
      league,
      PLAYER_TEAM_ID_CONST,
      currentScheduledMatch.opponentId,
      result.playerScore,
      result.aiScore,
      seed
    );
    updateLeague(newLeague);
    setMatchResult({
      playerScore: result.playerScore,
      aiScore: result.aiScore,
      events: result.events,
      opponentName: currentOpponentDef.name,
    });
    setScreen("post-match");
  }, [league, currentScheduledMatch, currentOpponentDef, updateLeague]);

  const handleForfeit = useCallback(() => {
    if (!currentScheduledMatch || !currentOpponentDef) {
      setScreen("home");
      return;
    }
    handleMatchEnd({ playerScore: 0, aiScore: 3, events: [] });
  }, [handleMatchEnd, currentScheduledMatch, currentOpponentDef]);

  const handleTeamSave = useCallback((t: TeamConfig) => {
    updateTeam(t);
    setScreen("home");
  }, [updateTeam]);

  const handleNewSeason = useCallback(() => {
    startNewSeason(team.name);
    setMatchResult(null);
    setScreen("home");
  }, [startNewSeason, team.name]);

  if (screen === "home") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <Home
          team={team}
          league={league}
          onStartMatch={() => {
            if (!isLeagueComplete && currentOpponentDef) {
              setScreen("match");
            }
          }}
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
        <Customize
          team={team}
          onSave={t => { updateTeam(t); setScreen("home"); }}
          onBack={() => setScreen("home")}
        />
      </div>
    );
  }

  if (screen === "match" && currentOpponentDef) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen" style={{ maxWidth: "min(100vw, 760px)" }}>
        <Match
          team={team}
          opponentTeamDef={currentOpponentDef}
          isHome={currentScheduledMatch?.isHome !== false}
          onMatchEnd={handleMatchEnd}
          onForfeit={handleForfeit}
        />
      </div>
    );
  }

  if (screen === "post-match" && matchResult) {
    const newLeagueComplete = league.currentMatchIndex >= league.schedule.length;
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <PostMatch
          playerScore={matchResult.playerScore}
          aiScore={matchResult.aiScore}
          events={matchResult.events}
          team={team}
          opponentName={matchResult.opponentName}
          league={league}
          isLeagueComplete={newLeagueComplete}
          onNextMatch={() => {
            setMatchResult(null);
            setScreen("home");
          }}
          onHome={() => {
            setMatchResult(null);
            setScreen("home");
          }}
          onNewSeason={handleNewSeason}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen">
      <Home
        team={team}
        league={league}
        onStartMatch={() => setScreen("match")}
        onGoToTeamSetup={() => setScreen("team-setup")}
        onGoToCustomize={() => setScreen("customize")}
      />
    </div>
  );
}
