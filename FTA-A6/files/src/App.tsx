import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type {
  TeamConfig,
  GameEvent,
  LeagueState,
  PlayoffBracket,
  MatchStats,
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
import TransferTutorial from "./pages/TransferTutorial";
import TutorialWelcome from "./components/TutorialWelcome";
import TeamNameSetup from "./pages/TeamNameSetup";
import { processTransferWeek } from "./game/transferMarket";
import { formatMoney } from "./game/transferDatabase";
import BottomMenuNav, { type MenuTab } from "./components/BottomMenuNav";
import type { TeamSummary } from "./pages/OnlineMatch";
import {
  getAITeamDefForLeague,
  advanceAITrainingWeek,
  applyMatchResult,
  initPlayoff,
  applyPlayoffResult,
  autoSimPlayoffStage,
  getPlayerPlayoffMatch,
  AI_TEAMS,
} from "./game/league";
import { TWO_PLAYER_TEAM_A, TWO_PLAYER_TEAM_B } from "./game/twoPlayer";
import { PLAYER_TEAM_ID_CONST } from "./game/persistence";
import { advanceTeamTraining } from "./game/training";
import { completeMarketTutorial, completeMatchTutorial, completeTeamNaming, dismissTutorialWelcome, loadTutorialProgress, shouldShowTutorialWelcome } from "./game/tutorial";

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
  | "pitch3d-preview"
  | "tutorial-match"
  | "transfer-tutorial"
  | "team-name";

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
  penalties?: { player: number; ai: number };
  stats?: MatchStats;
}

interface PlayoffContext {
  stage: "sf1" | "sf2" | "final";
  opponentId: string;
  isHome: boolean;
}

function hashToScreen(hash: string): {
  screen: Screen;
  tab?: "lineup" | "formation" | "training";
} {
  const h = hash.replace(/^#\/?/, "");

  if (h === "pitch3d-preview") {
    return { screen: "pitch3d-preview" };
  }

  if (h === "team-setup/formation") {
    return { screen: "team-setup", tab: "formation" };
  }

  if (h === "team-setup/training") {
    return { screen: "team-setup", tab: "training" };
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
    updateTeamAndLeague,
    startNewSeason,
    refreshState,
    market,
    updateMarket,
  } = useGameState();

  const initialHash = hashToScreen(window.location.hash);

  const [screen, setScreen] = useState<Screen>(() => {
    const tutorialProgress = loadTutorialProgress();
    const namingPending =
      tutorialProgress.matchComplete &&
      tutorialProgress.marketComplete &&
      !tutorialProgress.teamNameChosen;
    return namingPending ? "team-name" : initialHash.screen;
  });
  const [setupTab, setSetupTab] = useState<"lineup" | "formation" | "training">(
    initialHash.tab ?? "lineup",
  );
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [playoffContext, setPlayoffContext] = useState<PlayoffContext | null>(
    null,
  );
  const [onlineConfig, setOnlineConfig] = useState<OnlineGameConfig | null>(
    null,
  );
  const [profileTeamId, setProfileTeamId] =
    useState<string>(PLAYER_TEAM_ID_CONST);
  const [showTutorialWelcome, setShowTutorialWelcome] = useState(() =>
    shouldShowTutorialWelcome(),
  );
  const knownIncomingOfferIds = useRef(
    new Set(
      market.offers
        .filter(
          (offer) =>
            offer.toClubId === PLAYER_TEAM_ID_CONST &&
            (offer.status === "pending" || offer.status === "countered"),
        )
        .map((offer) => offer.id),
    ),
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

  useEffect(() => {
    const activeIncoming = market.offers.filter(
      (offer) =>
        offer.toClubId === PLAYER_TEAM_ID_CONST &&
        (offer.status === "pending" || offer.status === "countered"),
    );
    const newOffers = activeIncoming.filter(
      (offer) => !knownIncomingOfferIds.current.has(offer.id),
    );

    activeIncoming.forEach((offer) =>
      knownIncomingOfferIds.current.add(offer.id),
    );

    if (newOffers.length === 0) return;

    const latest = newOffers[0];
    toast(
      newOffers.length === 1
        ? "📩 New transfer offer"
        : `📩 ${newOffers.length} new transfer offers`,
      {
        description:
          newOffers.length === 1
            ? `${latest.fromClubName} offered ${formatMoney(
                latest.counterAmount ?? latest.amount,
              )} for ${latest.playerName}. Check Market → Offers.`
            : `Latest: ${latest.fromClubName} offered ${formatMoney(
                latest.counterAmount ?? latest.amount,
              )} for ${latest.playerName}.`,
        duration: 2200,
      },
    );
  }, [market.offers]);

  const isLeagueComplete = league.currentMatchIndex >= league.schedule.length;
  const currentMatchIndex = league.currentMatchIndex;
  const currentScheduledMatch = league.schedule[currentMatchIndex] ?? null;
  const currentOpponentDef = currentScheduledMatch
    ? getAITeamDefForLeague(league, currentScheduledMatch.opponentId)
    : null;

  const handleMatchEnd = useCallback(
    (result: {
      playerScore: number;
      aiScore: number;
      events: GameEvent[];
      penalties?: { player: number; ai: number };
      stats?: MatchStats;
    }) => {
      if (!currentScheduledMatch || !currentOpponentDef) return;

      const seed = Date.now() % 99999;

      const resultLeague = applyMatchResult(
        league,
        PLAYER_TEAM_ID_CONST,
        currentScheduledMatch.opponentId,
        result.playerScore,
        result.aiScore,
        seed,
      );
      const newLeague = advanceAITrainingWeek(resultLeague, {
        playerOpponentId: currentScheduledMatch.opponentId,
        playerGoals: result.playerScore,
        opponentGoals: result.aiScore,
        includeLastMatchdayResults: true,
      });
      const trainedTeam = advanceTeamTraining(team, {
        season: newLeague.season ?? 1,
        week: newLeague.trainingWeek ?? 1,
        result:
          result.playerScore > result.aiScore
            ? "win"
            : result.playerScore < result.aiScore
              ? "loss"
              : "draw",
      });

      const transferResult = processTransferWeek(
        market,
        trainedTeam,
        newLeague,
      );
      updateTeamAndLeague(transferResult.team, transferResult.league);
      updateMarket(transferResult.state);

      setMatchResult({
        playerScore: result.playerScore,
        aiScore: result.aiScore,
        events: result.events,
        opponentName: currentOpponentDef.name,
        playoffStage: null,
        penalties: result.penalties,
        stats: result.stats,
      });

      setScreen("post-match");
    },
    [
      league,
      team,
      currentScheduledMatch,
      currentOpponentDef,
      updateTeamAndLeague,
      market,
      updateMarket,
    ],
  );

  const handlePlayoffMatchEnd = useCallback(
    (result: {
      playerScore: number;
      aiScore: number;
      events: GameEvent[];
      penalties?: { player: number; ai: number };
      stats?: MatchStats;
    }) => {
      if (!playoffContext) return;

      const seed = Date.now() % 99999;
      const { stage, isHome } = playoffContext;

      const homeGoals = isHome ? result.playerScore : result.aiScore;
      const awayGoals = isHome ? result.aiScore : result.playerScore;
      const penaltyHome = result.penalties
        ? isHome
          ? result.penalties.player
          : result.penalties.ai
        : undefined;
      const penaltyAway = result.penalties
        ? isHome
          ? result.penalties.ai
          : result.penalties.player
        : undefined;
      const playerWon =
        result.playerScore > result.aiScore ||
        (result.playerScore === result.aiScore &&
          (result.penalties?.player ?? 0) > (result.penalties?.ai ?? 0));
      const opponentWon =
        result.aiScore > result.playerScore ||
        (result.playerScore === result.aiScore &&
          (result.penalties?.ai ?? 0) > (result.penalties?.player ?? 0));
      const forcedWinnerId = playerWon
        ? PLAYER_TEAM_ID_CONST
        : opponentWon
          ? playoffContext.opponentId
          : undefined;

      const resultLeague = applyPlayoffResult(
        league,
        stage,
        homeGoals,
        awayGoals,
        seed,
        forcedWinnerId,
        penaltyHome !== undefined && penaltyAway !== undefined
          ? { home: penaltyHome, away: penaltyAway }
          : undefined,
      );
      const newLeague = advanceAITrainingWeek(resultLeague, {
        playerOpponentId: playoffContext.opponentId,
        playerGoals: result.playerScore,
        opponentGoals: result.aiScore,
      });
      const trainedTeam = advanceTeamTraining(team, {
        season: newLeague.season ?? 1,
        week: newLeague.trainingWeek ?? 1,
        result: playerWon ? "win" : opponentWon ? "loss" : "draw",
      });

      const transferResult = processTransferWeek(
        market,
        trainedTeam,
        newLeague,
      );
      updateTeamAndLeague(transferResult.team, transferResult.league);
      updateMarket(transferResult.state);

      const oppName =
        getAITeamDefForLeague(newLeague, playoffContext.opponentId)?.name ??
        "Opponent";

      setPlayoffContext(null);

      setMatchResult({
        playerScore: result.playerScore,
        aiScore: result.aiScore,
        events: result.events,
        opponentName: oppName,
        playoffStage: stage,
        penalties: result.penalties,
        stats: result.stats,
      });

      setScreen("post-match");
    },
    [league, team, playoffContext, updateTeamAndLeague, market, updateMarket],
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
            : (po.final ?? po.sf2);

      const resultLeague = autoSimPlayoffStage(current, seed);
      const newLeague = advanceAITrainingWeek(resultLeague);
      const trainedTeam = advanceTeamTraining(team, {
        season: newLeague.season ?? 1,
        week: newLeague.trainingWeek ?? 1,
        result: "idle",
      });

      const transferResult = processTransferWeek(
        market,
        trainedTeam,
        newLeague,
      );
      updateTeamAndLeague(transferResult.team, transferResult.league);
      updateMarket(transferResult.state);

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
  }, [
    isLeagueComplete,
    league,
    team,
    currentOpponentDef,
    updateLeague,
    updateTeamAndLeague,
    market,
    updateMarket,
  ]);

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

  const menuScreens: MenuTab[] = [
    "team-profiles",
    "team-setup",
    "home",
    "transfer-market",
    "customize",
  ];
  const isMenuScreen = menuScreens.includes(screen as MenuTab);

  const goToMenuTab = (tab: MenuTab) => {
    setScreen(tab);
    if (tab !== "team-setup") setSetupTab("lineup");
    window.location.hash = tab === "home" ? "#/" : `#/${tab}`;
  };

  if (isMenuScreen) {
    let content;

    if (screen === "team-profiles") {
      content = (
        <TeamProfiles
          playerTeam={team}
          league={league}
          market={market}
          initialTeamId={profileTeamId}
          onBack={() => goToMenuTab("home")}
        />
      );
    } else if (screen === "team-setup") {
      content = (
        <TeamSetup
          team={team}
          onSave={(t: TeamConfig) => {
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
          onSave={(t: TeamConfig) => {
            updateTeam(t);
            goToMenuTab("home");
          }}
          onPersist={updateTeam}
          onBack={() => goToMenuTab("home")}
        />
      );
    } else if (screen === "transfer-market") {
      content = (
        <TransferMarket
          team={team}
          league={league}
          market={market}
          onChange={(nextMarket, nextTeam, nextLeague) => {
            updateMarket(nextMarket);
            if (nextTeam && nextLeague)
              updateTeamAndLeague(nextTeam, nextLeague);
          }}
          onTutorial={() => setScreen("transfer-tutorial")}
        />
      );
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
          onTutorial={() => setScreen("tutorial-match")}
        />
      );
    }

    return (
      <div
        className="mx-auto min-h-screen max-w-md pb-20"
        style={{ background: "#0a0e1a" }}
      >
        {content}
        <BottomMenuNav active={screen as MenuTab} onChange={goToMenuTab} />
        {showTutorialWelcome && (
          <TutorialWelcome
            onStart={() => {
              setShowTutorialWelcome(false);
              setScreen("tutorial-match");
            }}
            onSkip={() => {
              dismissTutorialWelcome();
              setShowTutorialWelcome(false);
            }}
          />
        )}
      </div>
    );
  }

  if (screen === "tutorial-match") {
    const tutorialOpponent = AI_TEAMS.find((entry) => entry.tier === 3) ?? AI_TEAMS[0];
    return (
      <div className="mx-auto min-h-screen max-w-2xl" style={{ maxWidth: "min(100vw, 760px)" }}>
        <Match
          team={team}
          opponentTeamDef={tutorialOpponent}
          isHome={true}
          tutorialMode={true}
          onMatchEnd={() => {
            completeMatchTutorial();
            setScreen("transfer-tutorial");
          }}
          onTutorialComplete={() => {
            completeMatchTutorial();
            setScreen("transfer-tutorial");
          }}
          onForfeit={() => setScreen("home")}
        />
      </div>
    );
  }

  if (screen === "transfer-tutorial") {
    return (
      <TransferTutorial
        team={team}
        onBack={() => setScreen("home")}
        onComplete={() => {
          const progress = completeMarketTutorial();
          setScreen(progress.teamNameChosen ? "transfer-market" : "team-name");
        }}
      />
    );
  }

  if (screen === "team-name") {
    return (
      <TeamNameSetup
        team={team}
        onComplete={(name) => {
          updateTeam({ ...team, name });
          completeTeamNaming();
          toast.success(`Welcome, ${name}`);
          setScreen("transfer-market");
        }}
      />
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
          onGameReady={(config: OnlineGameConfig) => {
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
      ? getAITeamDefForLeague(league, playoffContext!.opponentId)
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
            requiresWinner={isPlayoff}
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
          penalties={matchResult.penalties}
          stats={matchResult.stats}
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
        onTutorial={() => setScreen("tutorial-match")}
      />
    </div>
  );
}
