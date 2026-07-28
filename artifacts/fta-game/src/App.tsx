import { useState, useCallback, useEffect } from "react";
import type {
  TeamConfig,
  GameEvent,
  LeagueState,
  PlayoffBracket,
} from "./engine/types";
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
import TransferMarket from "./pages/TransferMarket";
import BottomMenuNav, { type MenuTab } from "./components/BottomMenuNav";
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
  | "transfer-market"
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

function hashToScreen(hash: string): {
  screen: Screen;
  tab?: "lineup" | "formation";
} {
  const h = hash.replace(/^#\/?/, "");

  if (h === "pitch3d-preview") {
    return { screen: "pitch3d-preview" };
  }

  if (h === "team-setup/formation") {
    return { screen: "team-setup", tab: "formation" };
  }

  if (h === "team-setup") {
    return { screen: "team-setup", tab: "lineup" };
  }

  if (h === "team-profiles") {
    return { screen: "team-profiles" };
  }

  if (h === "customize") {
    return { screen: "customize" };
  }

  if (h === "transfer-market") {
    return { screen: "transfer-market" };
  }

  return { screen: "home" };
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

  const initialHash = hashToScreen(window.location.hash);

  const [screen, setScreen] = useState<Screen>(initialHash.screen);
  const [setupTab, setSetupTab] = useState<"lineup" | "formation">(
    initialHash.tab ?? "lineup",
  );
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [playoffContext, setPlayoffContext] =
    useState<PlayoffContext | null>(null);
  const [onlineConfig, setOnlineConfig] = useState<OnlineGameConfig | null>(
    null,
  );
  const [profileTeamId, setProfileTeamId] = useState<string>(
    PLAYER_TEAM_ID_CONST,
  );

  useEffect(() => {
    const onHash = () => {
      const { screen: s, tab } = hashToScreen(window.location.hash);

      setScreen(s);

      if (tab) {
        setSetupTab(tab);
      }
    };

    window.addEventListener("hashchange", onHash);

    return () => window.removeEventListener("hashchange", onHash);
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

      const oppName =
        getAITeamDef(playoffContext.opponentId)?.name ?? "Opponent";

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
      if (currentOpponentDef) {
        setScreen("match");
      }

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
      setScreen("home");
      return;
    }

    handleMatchEnd({
      playerScore: 0,
      aiScore: 3,
      events: [],
    });
  }, [handleMatchEnd, currentScheduledMatch, currentOpponentDef]);

  const handlePlayoffForfeit = useCallback(() => {
    if (!playoffContext) {
      setScreen("home");
      return;
    }

    handlePlayoffMatchEnd({
      playerScore: 0,
      aiScore: 3,
      events: [],
    });
  }, [handlePlayoffMatchEnd, playoffContext]);

  const handleTeamSave = useCallback(
    (t: TeamConfig) => {
      updateTeam(t);
      setScreen("home");
    },
    [updateTeam],
  );

  const handleNewSeason = useCallback(() => {
    startNewSeason(team.name);
    refreshState();
    setMatchResult(null);
    setPlayoffContext(null);
    setScreen("home");
  }, [refreshState, startNewSeason, team.name]);

  const handleOpenProfiles = useCallback(
    (teamId: string = PLAYER_TEAM_ID_CONST) => {
      setProfileTeamId(teamId);
      setScreen("team-profiles");
    },
    [],
  );

  if (screen === "pitch3d-preview") {
    return <Pitch3DPreview />;
  }

  const menuScreens: MenuTab[] = ["team-profiles", "team-setup", "home", "transfer-market", "customize"];
  const isMenuScreen = menuScreens.includes(screen as MenuTab);

  const goToMenuTab = (tab: MenuTab) => {
    setScreen(tab);
    if (tab !== "team-setup") setSetupTab("lineup");
    window.location.hash = tab === "home" ? "#/" : `#/${tab}`;
  };

  if (isMenuScreen) {
    let content;

    if (screen === "team-profiles") {
      content = <TeamProfiles playerTeam={team} onBack={() => goToMenuTab("home")} />;
    } else if (screen === "team-setup") {
      content = (
        <TeamSetup
          team={team}
          onSave={(t) => {
            updateTeam(t);
            goToMenuTab("home");
          }}
          initialTab={setupTab}
          onBack={() => goToMenuTab("home")}
        />
      );
    } else if (screen === "customize") {
      content = (
        <Customize
          team={team}
          onSave={(t) => {
            updateTeam(t);
            goToMenuTab("home");
          }}
          onBack={() => goToMenuTab("home")}
        />
      );
    } else if (screen === "transfer-market") {
      content = <TransferMarket team={team} league={league} />;
    } else {
      content = (
        <Home
          team={team}
          league={league}
          isLeagueComplete={isLeagueComplete}
          onStartMatch={handleStartMatch}
          onGoToTeamSetup={() => goToMenuTab("team-setup")}
          onGoToCustomize={() => goToMenuTab("customize")}
          onGoToProfiles={handleOpenProfiles}
          onResetSeason={handleNewSeason}
          onTwoPlayer={() => setScreen("two-player-match")}
          onOnline={() => setScreen("online-lobby")}
        />
      );
    }

    return (
      <div className="mx-auto min-h-screen max-w-md pb-20" style={{ background: "#0a0e1a" }}>
        {content}
        <BottomMenuNav active={screen as MenuTab} onChange={goToMenuTab} />
      </div>
    );
  }

  if (screen === "two-player-match") {
    return (
      <div
        className="max-w-2xl mx-auto min-h-screen"
        style={{ maxWidth: "min(100vw, 760px)" }}
      >
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

  if (screen === "online-lobby") {
    return (
      <div className="max-w-md mx-auto min-h-screen">
        <OnlineLobby
          team={team}
          onGameReady={(config) => {
            setOnlineConfig(config);
            setScreen("online-match");
          }}
          onBack={() => setScreen("home")}
        />
      </div>
    );
  }

  if (screen === "online-match" && onlineConfig) {
    return (
      <div
        className="max-w-2xl mx-auto min-h-screen"
        style={{ maxWidth: "min(100vw, 760px)" }}
      >
        <OnlineMatch
          myRole={onlineConfig.myRole}
          p1Team={onlineConfig.p1Team}
          p2Team={onlineConfig.p2Team}
          roomCode={onlineConfig.roomCode}
          onLeave={() => {
            setOnlineConfig(null);
            setScreen("home");
          }}
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
        <div
          className="max-w-2xl mx-auto min-h-screen"
          style={{ maxWidth: "min(100vw, 760px)" }}
        >
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
        isLeagueComplete={isLeagueComplete}
        onStartMatch={handleStartMatch}
        onGoToTeamSetup={() => setScreen("team-setup")}
        onGoToCustomize={() => setScreen("customize")}
        onGoToProfiles={handleOpenProfiles}
        onResetSeason={handleNewSeason}
        onTwoPlayer={() => setScreen("two-player-match")}
        onOnline={() => setScreen("online-lobby")}
      />
    </div>
  );
}