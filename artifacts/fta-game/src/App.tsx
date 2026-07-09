import { useState, useCallback, useEffect } from "react";
import type { TeamConfig, GameEvent, PlayoffBracket } from "./engine/types";
import { useGameState } from "./hooks/useGameState";
import Home from "./pages/Home";
import TeamSetup from "./pages/TeamSetup";
import Customize from "./pages/Customize";
import Match from "./pages/Match";
import PostMatch from "./pages/PostMatch";
import OnlineLobby from "./pages/OnlineLobby";
import OnlineMatch from "./pages/OnlineMatch";
import TeamProfiles from "./pages/TeamProfiles";
import Pitch3DPreview from "./pages/Pitch3DPreview";
import type { TeamSummary } from "./pages/OnlineMatch";
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

type Screen =
  | "home"
  | "team-setup"
  | "customize"
  | "team-profiles"
  | "match"
  | "post-match"
  | "two-player-match"
  | "online-lobby"
  | "online-match"
  | "pitch3d-preview";

interface OnlineGameConfig {
  myRole: "p1" | "p2";
  p1Team: TeamSummary;
  p2Team: TeamSummary;
  roomCode: string;
}

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

function hashToScreen(hash: string): Screen {
  const h = hash.replace(/^#\/?/, "");

  if (h === "pitch3d-preview") return "pitch3d-preview";
  if (h === "team-setup") return "team-setup";
  if (h === "team-profiles") return "team-profiles";
  if (h === "customize") return "customize";

  return "home";
}

export default function App() {
  const {
    team,
    updateTeam,
    league,
    updateLeague,
    startNewSeason,
    refreshState,
  } = useGameState();

  const [screen, setScreen] = useState<Screen>(() => hashToScreen(window.location.hash));
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [playoffContext, setPlayoffContext] = useState<PlayoffContext | null>(null);
  const [onlineConfig, setOnlineConfig] = useState<OnlineGameConfig | null>(null);
  const [profileTeamId, setProfileTeamId] = useState<string>(PLAYER_TEAM_ID_CONST);

  useEffect(() => {
    const onHash = () => {
      setScreen(hashToScreen(window.location.hash));
    };

    window.addEventListener("hashchange", onHash);

    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goToScreen = useCallback((next: Screen) => {
    if (next === "pitch3d-preview") {
      window.location.hash = "/pitch3d-preview";
    } else if (next === "team-setup") {
      window.location.hash = "/team-setup";
    } else if (next === "team-profiles") {
      window.location.hash = "/team-profiles";
    } else if (next === "customize") {
      window.location.hash = "/customize";
    } else if (next === "home") {
      window.location.hash = "/";
    }

    setScreen(next);
  }, []);

  const isLeagueComplete = league.currentMatchIndex >= league.schedule.length;
  const currentMatchIndex = league.currentMatchIndex;
  const currentScheduledMatch = league.schedule[currentMatchIndex] ?? null;
  const currentOpponentDef = currentScheduledMatch
    ? getAITeamDef(currentScheduledMatch.opponentId)
    : null;

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
        seed,
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
    [league, currentScheduledMatch, currentOpponentDef, updateLeague],
  );

  const handlePlayoffMatchEnd = useCallback(
    (result: { playerScore: number; aiScore: number; events: GameEvent[] }) => {
      if (!playoffContext) return;

      const seed = Date.now() % 99999;
      const { stage, isHome } = playoffContext;
      const homeGoals = isHome ? result.playerScore : result.aiScore;
      const awayGoals = isHome ? result.aiScore : result.playerScore;

      const newLeague = applyPlayoffResult(
        league,
        stage,
        homeGoals,
        awayGoals,
        seed,
      );

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
    [league, playoffContext, updateLeague],
  );

  const handleStartMatch = useCallback(() => {
    if (!isLeagueComplete) {
      if (currentOpponentDef) setScreen("match");
      return;
    }

    let current = league;

    if (!current.playoff) {
      current = initPlayoff(current);
      updateLeague(current);
    }

    const po = current.playoff!;
    if (po.stage === "complete") return;

    const playerInfo = getPlayerPlayoffMatch(po, PLAYER_TEAM_ID_CONST);

    if (playerInfo) {
      setPlayoffContext({
        stage: playerInfo.stage,
        opponentId: playerInfo.isHome
          ? playerInfo.match.awayId
          : playerInfo.match.homeId,
        isHome: playerInfo.isHome,
      });

      setScreen("match");
    } else {
      const seed = Date.now() % 99999;

      const simmedMatch =
        po.stage === "sf1"
          ? po.sf1
          : po.stage === "sf2"
            ? po.sf2
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
    if (!currentScheduledMatch || !currentOpponentDef) {
      goToScreen("home");
      return;
    }

    handleMatchEnd({ playerScore: 0, aiScore: 3, events: [] });
  }, [handleMatchEnd, currentScheduledMatch, currentOpponentDef, goToScreen]);

  const handlePlayoffForfeit = useCallback(() => {
    if (!playoffContext) {
      goToScreen("home");
      return;
    }

    handlePlayoffMatchEnd({ playerScore: 0, aiScore: 3, events: [] });
  }, [handlePlayoffMatchEnd, playoffContext, goToScreen]);

  const handleTeamSave = useCallback(
    (t: TeamConfig) => {
      updateTeam(t);
      goToScreen("home");
    },
    [updateTeam, goToScreen],
  );

  const handleNewSeason = useCallback(() => {
    startNewSeason(team.name);
    refreshState();
    setMatchResult(null);
    setPlayoffContext(null);
    goToScreen("home");
  }, [refreshState, startNewSeason, team.name, goToScreen]);

  const handleOpenProfiles = useCallback(
    (teamId: string = PLAYER_TEAM_ID_CONST) => {
      setProfileTeamId(teamId);
      goToScreen("team-profiles");
    },
    [goToScreen],
  );

  if (screen === "pitch3d-preview") {
    return <Pitch3DPreview />;
  }

  if (screen === "home") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <div className="px-4 pt-4">
          <button
            className="mb-3 w-full rounded-2xl border border-cyan-300/40 bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20 active:scale-[0.99]"
            onClick={() => goToScreen("pitch3d-preview")}
          >
            🧪 Open 3D Arena Preview
          </button>
        </div>

        <Home
          team={team}
          league={league}
          isLeagueComplete={isLeagueComplete}
          onStartMatch={handleStartMatch}
          onGoToTeamSetup={() => goToScreen("team-setup")}
          onGoToCustomize={() => goToScreen("customize")}
          onGoToProfiles={handleOpenProfiles}
          onResetSeason={handleNewSeason}
          onTwoPlayer={() => setScreen("two-player-match")}
          onOnline={() => setScreen("online-lobby")}
        />
      </div>
    );
  }

  if (screen === "team-profiles") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <TeamProfiles
          playerTeam={team}
          initialTeamId={profileTeamId}
          onBack={() => goToScreen("home")}
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
          onMatchEnd={() => goToScreen("home")}
          onForfeit={() => goToScreen("home")}
        />
      </div>
    );
  }

  if (screen === "online-lobby") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <OnlineLobby
          team={team}
          onGameReady={(config) => {
            setOnlineConfig(config);
            setScreen("online-match");
          }}
          onBack={() => goToScreen("home")}
        />
      </div>
    );
  }

  if (screen === "online-match" && onlineConfig) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen" style={{ maxWidth: "min(100vw, 760px)" }}>
        <OnlineMatch
          myRole={onlineConfig.myRole}
          p1Team={onlineConfig.p1Team}
          p2Team={onlineConfig.p2Team}
          roomCode={onlineConfig.roomCode}
          onLeave={() => {
            setOnlineConfig(null);
            goToScreen("home");
          }}
        />
      </div>
    );
  }

  if (screen === "team-setup") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <TeamSetup team={team} onSave={handleTeamSave} onBack={() => goToScreen("home")} />
      </div>
    );
  }

  if (screen === "customize") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <Customize
          team={team}
          onSave={(t) => {
            updateTeam(t);
            goToScreen("home");
          }}
          onBack={() => goToScreen("home")}
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
          onNextMatch={() => {
            setMatchResult(null);
            goToScreen("home");
          }}
          onHome={() => {
            setMatchResult(null);
            goToScreen("home");
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
        isLeagueComplete={isLeagueComplete}
        onStartMatch={handleStartMatch}
        onGoToTeamSetup={() => goToScreen("team-setup")}
        onGoToCustomize={() => goToScreen("customize")}
        onGoToProfiles={handleOpenProfiles}
        onResetSeason={handleNewSeason}
        onTwoPlayer={() => setScreen("two-player-match")}
        onOnline={() => setScreen("online-lobby")}
      />
    </div>
  );
}
