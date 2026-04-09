import { useState, useCallback } from "react";
import type { TeamConfig, GameEvent, LeagueState, PlayoffBracket } from "./engine/types";
import { useGameState } from "./hooks/useGameState";
import Home from "./pages/Home";
import TeamSetup from "./pages/TeamSetup";
import Customize from "./pages/Customize";
import Match from "./pages/Match";
import PostMatch from "./pages/PostMatch";
import {
  getAITeamDef,
  applyMatchResult,
  initPlayoff,
  applyPlayoffResult,
  autoSimPlayoffStage,
  getPlayerPlayoffMatch,
} from "./game/league";
import { TWO_PLAYER_TEAM_A, TWO_PLAYER_TEAM_B } from "./game/twoPlayer";
import { PLAYER_TEAM_ID_CONST } from "./game/persistence";

type Screen = "home" | "team-setup" | "customize" | "match" | "post-match" | "two-player-match";

interface MatchResult {
  playerScore: number;
  aiScore: number;
  events: GameEvent[];
  opponentName: string;
  playoffStage?: "sf1" | "sf2" | "final" | null;
  isAutoSim?: boolean;
  autoSimHomeName?: string;
  autoSimAwayName?: string;
  autoSimHomeGoals?: number;
  autoSimAwayGoals?: number;
}

interface PlayoffContext {
  stage: "sf1" | "sf2" | "final";
  opponentId: string;
  isHome: boolean;
}

export default function App() {
  const { team, updateTeam, league, updateLeague, startNewSeason, refreshState } = useGameState();
  const [screen, setScreen] = useState<Screen>("home");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [playoffContext, setPlayoffContext] = useState<PlayoffContext | null>(null);

  const isLeagueComplete = league.currentMatchIndex >= league.schedule.length;
  const currentMatchIndex = league.currentMatchIndex;
  const currentScheduledMatch = league.schedule[currentMatchIndex] ?? null;
  const currentOpponentDef = currentScheduledMatch
    ? getAITeamDef(currentScheduledMatch.opponentId)
    : null;

  // ── Regular season match end ──────────────────────────────────────────────
  const handleMatchEnd = useCallback(
    (result: { playerScore: number; aiScore: number; events: GameEvent[] }) => {
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
        playoffStage: null,
      });
      setScreen("post-match");
    },
    [league, currentScheduledMatch, currentOpponentDef, updateLeague]
  );

  // ── Playoff match end ─────────────────────────────────────────────────────
  const handlePlayoffMatchEnd = useCallback(
    (result: { playerScore: number; aiScore: number; events: GameEvent[] }) => {
      if (!playoffContext) return;
      const seed = Date.now() % 99999;
      const { stage, isHome } = playoffContext;
      const homeGoals = isHome ? result.playerScore : result.aiScore;
      const awayGoals = isHome ? result.aiScore : result.playerScore;
      const newLeague = applyPlayoffResult(league, stage, homeGoals, awayGoals, seed);
      updateLeague(newLeague);
      const oppName = getAITeamDef(playoffContext.opponentId)?.name ?? "Opponent";
      setPlayoffContext(null);
      setMatchResult({
        playerScore: result.playerScore,
        aiScore: result.aiScore,
        events: result.events,
        opponentName: oppName,
        playoffStage: stage,
      });
      setScreen("post-match");
    },
    [league, playoffContext, updateLeague]
  );

  // ── Start a match (regular or playoff) ───────────────────────────────────
  const handleStartMatch = useCallback(() => {
    if (!isLeagueComplete) {
      if (currentOpponentDef) setScreen("match");
      return;
    }

    // Initialize playoff if not yet started
    let current = league;
    if (!current.playoff) {
      current = initPlayoff(current);
      updateLeague(current);
    }

    const po = current.playoff!;
    if (po.stage === "complete") return;

    const playerInfo = getPlayerPlayoffMatch(po, PLAYER_TEAM_ID_CONST);

    if (playerInfo) {
      // Player has a match this stage → go play it
      setPlayoffContext({
        stage: playerInfo.stage,
        opponentId: playerInfo.isHome ? playerInfo.match.awayId : playerInfo.match.homeId,
        isHome: playerInfo.isHome,
      });
      setScreen("match");
    } else {
      // AI vs AI stage → auto-simulate and show result
      const seed = Date.now() % 99999;
      const simmedMatch =
        po.stage === "sf1" ? po.sf1
        : po.stage === "sf2" ? po.sf2
        : po.final ?? po.sf2;
      const newLeague = autoSimPlayoffStage(current, seed);
      updateLeague(newLeague);
      setMatchResult({
        playerScore: 0,
        aiScore: 0,
        events: [],
        opponentName: `${simmedMatch.homeName} vs ${simmedMatch.awayName}`,
        playoffStage: po.stage as "sf1" | "sf2" | "final",
        isAutoSim: true,
        autoSimHomeName: simmedMatch.homeName,
        autoSimAwayName: simmedMatch.awayName,
        // Scores from newly updated playoff
        autoSimHomeGoals: (() => {
          const np = newLeague.playoff!;
          if (po.stage === "sf1") return np.sf1.homeGoals;
          if (po.stage === "sf2") return np.sf2.homeGoals;
          return np.final?.homeGoals;
        })(),
        autoSimAwayGoals: (() => {
          const np = newLeague.playoff!;
          if (po.stage === "sf1") return np.sf1.awayGoals;
          if (po.stage === "sf2") return np.sf2.awayGoals;
          return np.final?.awayGoals;
        })(),
      });
      setScreen("post-match");
    }
  }, [isLeagueComplete, league, currentOpponentDef, updateLeague]);

  const handleForfeit = useCallback(() => {
    if (!currentScheduledMatch || !currentOpponentDef) { setScreen("home"); return; }
    handleMatchEnd({ playerScore: 0, aiScore: 3, events: [] });
  }, [handleMatchEnd, currentScheduledMatch, currentOpponentDef]);

  const handlePlayoffForfeit = useCallback(() => {
    if (!playoffContext) { setScreen("home"); return; }
    handlePlayoffMatchEnd({ playerScore: 0, aiScore: 3, events: [] });
  }, [handlePlayoffMatchEnd, playoffContext]);

  const handleTeamSave = useCallback(
    (t: TeamConfig) => { updateTeam(t); setScreen("home"); },
    [updateTeam]
  );

  const handleNewSeason = useCallback(() => {
    startNewSeason(team.name);
    refreshState();
    setMatchResult(null);
    setPlayoffContext(null);
    setScreen("home");
  }, [refreshState, startNewSeason, team.name]);

  // ── Screens ───────────────────────────────────────────────────────────────
  if (screen === "home") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <Home
          team={team}
          league={league}
          isLeagueComplete={isLeagueComplete}
          onStartMatch={handleStartMatch}
          onGoToTeamSetup={() => setScreen("team-setup")}
          onGoToCustomize={() => setScreen("customize")}
          onResetSeason={handleNewSeason}
          onTwoPlayer={() => setScreen("two-player-match")}
        />
      </div>
    );
  }

  if (screen === "two-player-match") {
    return (
      <div className="max-w-2xl mx-auto min-h-screen" style={{ maxWidth: "min(100vw, 760px)" }}>
        <Match
          team={team}
          opponentTeamDef={TWO_PLAYER_TEAM_B}
          isHome={true}
          twoPlayer={true}
          p1TeamDef={TWO_PLAYER_TEAM_A}
          onMatchEnd={() => setScreen("home")}
          onForfeit={() => setScreen("home")}
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

  if (screen === "match") {
    const isPlayoff = !!playoffContext;
    const opponentDef = isPlayoff
      ? getAITeamDef(playoffContext!.opponentId)
      : currentOpponentDef;
    const isHomeForMatch = isPlayoff
      ? playoffContext!.isHome
      : currentScheduledMatch?.isHome !== false;

    if (opponentDef) {
      return (
        <div className="max-w-2xl mx-auto min-h-screen" style={{ maxWidth: "min(100vw, 760px)" }}>
          <Match
            team={team}
            opponentTeamDef={opponentDef}
            isHome={isHomeForMatch}
            onMatchEnd={isPlayoff ? handlePlayoffMatchEnd : handleMatchEnd}
            onForfeit={isPlayoff ? handlePlayoffForfeit : handleForfeit}
          />
        </div>
      );
    }
  }

  if (screen === "post-match" && matchResult) {
    const playoff: PlayoffBracket | undefined = league.playoff;
    const isPlayoffComplete = playoff?.stage === "complete";
    // Only offer "New Season" once the full playoff is resolved
    const showNewSeason = isPlayoffComplete;

    return (
      <div className="max-w-md mx-auto min-h-screen">
        <PostMatch
          playerScore={matchResult.playerScore}
          aiScore={matchResult.aiScore}
          events={matchResult.events}
          team={team}
          opponentName={matchResult.opponentName}
          league={league}
          isLeagueComplete={isLeagueComplete}
          playoffStage={matchResult.playoffStage ?? null}
          isAutoSim={matchResult.isAutoSim ?? false}
          autoSimHomeName={matchResult.autoSimHomeName}
          autoSimAwayName={matchResult.autoSimAwayName}
          autoSimHomeGoals={matchResult.autoSimHomeGoals}
          autoSimAwayGoals={matchResult.autoSimAwayGoals}
          showNewSeason={showNewSeason}
          onNextMatch={() => { setMatchResult(null); setScreen("home"); }}
          onHome={() => { setMatchResult(null); setScreen("home"); }}
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
        isLeagueComplete={isLeagueComplete}
        onStartMatch={handleStartMatch}
        onGoToTeamSetup={() => setScreen("team-setup")}
        onGoToCustomize={() => setScreen("customize")}
        onResetSeason={handleNewSeason}
        onTwoPlayer={() => setScreen("two-player-match")}
      />
    </div>
  );
}
