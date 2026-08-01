import { useState, useCallback } from "react";
import type { TeamConfig, LeagueState } from "../engine/types";
import type { TransferMarketState } from "../game/transferMarket";
import {
  loadTeam,
  saveTeam,
  loadLeague,
  saveLeague,
  PLAYER_TEAM_ID_CONST,
} from "../game/persistence";
import { AI_TEAMS, migrateLeague, prepareLeagueForNewSeason } from "../game/league";
import {
  ensureTeamDevelopment,
  prepareTeamForNewSeason,
} from "../game/training";
import {
  awardSeasonPrize,
  loadTransferMarket,
  normalizeMarket,
  saveTransferMarket,
} from "../game/transferMarket";
import { generateReservePlayer, getPlayerOverall } from "../game/transferDatabase";

function transformTenAIPlayersForNewSeason(league: LeagueState): {
  league: LeagueState;
  headlines: string[];
  transformedCount: number;
} {
  const season = league.season ?? 1;
  const aiSquads = { ...(league.aiSquads ?? {}) };
  const headlines: string[] = [];

  // Only unsold players who are still transfer-listed at the end of the season
  // are eligible. Shuffle the full league-wide pool, then transform at most ten.
  const eligible = AI_TEAMS.flatMap((club) => {
    const squad = [...(aiSquads[club.id] ?? club.players)];
    return squad
      .map((player, index) => ({ club, squad, player, index }))
      .filter(({ player }) => player.marketStatus === "listed");
  });

  for (let index = eligible.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [eligible[index], eligible[swapIndex]] = [eligible[swapIndex], eligible[index]];
  }

  eligible.slice(0, 10).forEach(({ club, player: oldPlayer, index }, replacementIndex) => {
    const squad = [...(aiSquads[club.id] ?? club.players)];
    const oldOverall = getPlayerOverall(oldPlayer);
    const replacement = generateReservePlayer(
      club.id,
      1000 + season * 20 + replacementIndex,
      club.tier,
      season,
    );
    const newOverall = getPlayerOverall(replacement);
    squad[index] = replacement;
    aiSquads[club.id] = squad;

    const comparison =
      newOverall > oldOverall
        ? `BETTER by ${newOverall - oldOverall} OVR`
        : newOverall < oldOverall
          ? `WORSE by ${oldOverall - newOverall} OVR`
          : "THE SAME overall";
    headlines.push(
      `${club.name}: unsold transfer-listed player ${oldPlayer.name} (${oldOverall} OVR) was transformed into ${replacement.name} (${newOverall} OVR) — ${comparison}.`,
    );
  });

  return {
    league: { ...league, aiSquads },
    headlines,
    transformedCount: headlines.length,
  };
}


function renamePlayerTeamReferences(league: LeagueState, teamName: string): LeagueState {
  const renameMatch = <T extends { homeId: string; awayId: string; homeName: string; awayName: string }>(match: T): T => ({
    ...match,
    homeName: match.homeId === PLAYER_TEAM_ID_CONST ? teamName : match.homeName,
    awayName: match.awayId === PLAYER_TEAM_ID_CONST ? teamName : match.awayName,
  });

  return {
    ...league,
    teams: league.teams.map((entry) =>
      entry.id === PLAYER_TEAM_ID_CONST ? { ...entry, name: teamName } : entry,
    ),
    playoff: league.playoff
      ? {
          ...league.playoff,
          sf1: renameMatch(league.playoff.sf1),
          sf2: renameMatch(league.playoff.sf2),
          final: league.playoff.final ? renameMatch(league.playoff.final) : undefined,
        }
      : league.playoff,
  };
}

export function useGameState() {
  const [team, setTeamState] = useState<TeamConfig>(() => loadTeam());
  const [league, setLeagueState] = useState<LeagueState>(() => {
    const t = loadTeam();
    const raw = loadLeague(t.name);
    const migrated = migrateLeague(raw);
    saveLeague(migrated);
    return migrated;
  });

  const [market, setMarketState] = useState<TransferMarketState>(() => {
    const t = loadTeam();
    const l = migrateLeague(loadLeague(t.name));
    const m = loadTransferMarket(t, l);
    saveTransferMarket(m);
    return m;
  });

  const updateMarket = useCallback((nextMarket: TransferMarketState) => {
    setMarketState(nextMarket);
    saveTransferMarket(nextMarket);
  }, []);

  const updateTeam = useCallback((nextTeam: TeamConfig) => {
    const normalized = ensureTeamDevelopment({
      ...nextTeam,
      name: nextTeam.name.trim() || team.name || "My Team",
    });
    setTeamState(normalized);
    saveTeam(normalized);

    setLeagueState((previous) => {
      const updated = renamePlayerTeamReferences(previous, normalized.name);
      saveLeague(updated);

      setMarketState((previousMarket) => {
        const nextMarket = normalizeMarket(previousMarket, normalized, updated);
        saveTransferMarket(nextMarket);
        return nextMarket;
      });

      return updated;
    });
  }, [team.name]);

  const updateLeague = useCallback((nextLeague: LeagueState) => {
    const migrated = migrateLeague(nextLeague);
    setLeagueState(migrated);
    saveLeague(migrated);
  }, []);

  const updateTeamAndLeague = useCallback(
    (nextTeam: TeamConfig, nextLeague: LeagueState) => {
      const normalizedTeam = ensureTeamDevelopment(
        nextTeam,
        nextLeague.season ?? 1,
      );
      const normalizedLeague = migrateLeague(
        renamePlayerTeamReferences(nextLeague, normalizedTeam.name),
      );

      setTeamState(normalizedTeam);
      setLeagueState(normalizedLeague);
      saveTeam(normalizedTeam);
      saveLeague(normalizedLeague);
      setMarketState((previous) => {
        const next = normalizeMarket(
          previous,
          normalizedTeam,
          normalizedLeague,
        );
        saveTransferMarket(next);
        return next;
      });
    },
    [],
  );

  const startNewSeason = useCallback(
    (teamName: string) => {
      const preparedLeague = prepareLeagueForNewSeason(
        league,
        PLAYER_TEAM_ID_CONST,
        teamName,
      );
      const transformation = transformTenAIPlayersForNewSeason(preparedLeague);
      const nextLeague = transformation.league;
      const nextTeam = prepareTeamForNewSeason(
        { ...team, name: teamName },
        nextLeague.season ?? 1,
      );

      const prizeMarket = awardSeasonPrize(market, league, team);
      const transformationSeason = league.season ?? prizeMarket.season;
      const transformationNews = transformation.headlines.map((headline, index) => ({
        id: `season_transform_${transformationSeason}_${index}`,
        kind: "system" as const,
        headline,
        season: transformationSeason,
        week: league.trainingWeek ?? prizeMarket.week,
      }));
      const marketWithTransformations: TransferMarketState = {
        ...prizeMarket,
        news: [
          `Season ${transformationSeason} player transformations: ${transformation.transformedCount} unsold transfer-listed players were replaced.`,
          ...transformation.headlines,
          ...prizeMarket.news,
        ].slice(0, 80),
        newsFeed: [
          {
            id: `season_transform_summary_${transformationSeason}`,
            kind: "system" as const,
            headline: `Season ${transformationSeason}: ${transformation.transformedCount} unsold transfer-listed players were transformed.`,
            season: transformationSeason,
            week: league.trainingWeek ?? prizeMarket.week,
          },
          ...transformationNews,
          ...prizeMarket.newsFeed,
        ].slice(0, 80),
      };
      const normalizedMarket = normalizeMarket(
        marketWithTransformations,
        nextTeam,
        nextLeague,
      );
      setTeamState(nextTeam);
      setLeagueState(nextLeague);
      setMarketState(normalizedMarket);
      saveTeam(nextTeam);
      saveLeague(nextLeague);
      saveTransferMarket(normalizedMarket);
    },
    [league, team, market],
  );

  const refreshState = useCallback(() => {
    const nextTeam = loadTeam();
    const raw = loadLeague(nextTeam.name);
    const migrated = migrateLeague(raw);
    saveLeague(migrated);
    const nextMarket = loadTransferMarket(nextTeam, migrated);
    setTeamState(nextTeam);
    setLeagueState(migrated);
    setMarketState(nextMarket);
  }, []);

  return {
    team,
    updateTeam,
    league,
    updateLeague,
    updateTeamAndLeague,
    startNewSeason,
    refreshState,
    market,
    updateMarket,
  };
}
