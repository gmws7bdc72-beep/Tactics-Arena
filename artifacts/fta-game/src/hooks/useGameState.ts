import { useState, useCallback } from "react";
import type { TeamConfig, LeagueState } from "../engine/types";
import type { TransferMarketState } from "../game/transferMarket";
import {
  loadTeam,
  saveTeam,
  loadLeague,
  saveLeague,
  saveCareerSnapshot,
  PLAYER_TEAM_ID_CONST,
} from "../game/persistence";
import { AI_TEAMS, migrateLeague, prepareLeagueForNewSeason } from "../game/league";
import {
  ensureTeamDevelopment,
  prepareTeamForNewSeason,
} from "../game/training";
import {
  awardSeasonPrize,
  enforceDebtTransferListings,
  loadTransferMarket,
  normalizeMarket,
  saveTransferMarket,
} from "../game/transferMarket";
import { generateTransformedPlayer, getPlayerOverall } from "../game/transferDatabase";

function transformTenListedPlayersForNewSeason(
  team: TeamConfig,
  league: LeagueState,
): {
  team: TeamConfig;
  league: LeagueState;
  headlines: string[];
  transformedCount: number;
  transformedPlayerIds: string[];
} {
  const season = league.season ?? 1;
  const aiSquads = { ...(league.aiSquads ?? {}) };
  const candidates: Array<{
    clubId: string;
    clubName: string;
    player: TeamConfig["players"][number];
    index: number;
    isPlayerClub: boolean;
  }> = [];

  team.players.forEach((player, index) => {
    if (player.marketStatus === "listed") {
      candidates.push({
        clubId: PLAYER_TEAM_ID_CONST,
        clubName: team.name,
        player,
        index,
        isPlayerClub: true,
      });
    }
  });

  AI_TEAMS.forEach((club) => {
    const squad = [...(aiSquads[club.id] ?? club.players)];
    squad.forEach((player, index) => {
      if (player.marketStatus === "listed") {
        candidates.push({
          clubId: club.id,
          clubName: club.name,
          player,
          index,
          isPlayerClub: false,
        });
      }
    });
  });

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  let nextTeam = { ...team, players: [...team.players] };
  const headlines: string[] = [];
  const transformedPlayerIds: string[] = [];

  candidates.slice(0, 10).forEach((candidate, replacementIndex) => {
    const oldPlayer = candidate.player;
    const oldOverall = getPlayerOverall(oldPlayer);
    const replacement = generateTransformedPlayer(
      oldPlayer,
      candidate.clubId,
      season,
      replacementIndex,
    );
    const newOverall = getPlayerOverall(replacement);

    if (candidate.isPlayerClub) {
      const players = [...nextTeam.players];
      const liveIndex = players.findIndex((player) => player.id === oldPlayer.id);
      if (liveIndex >= 0) players[liveIndex] = replacement;
      nextTeam = { ...nextTeam, players };
    } else {
      const squad = [...(aiSquads[candidate.clubId] ?? [])];
      const liveIndex = squad.findIndex((player) => player.id === oldPlayer.id);
      if (liveIndex >= 0) squad[liveIndex] = replacement;
      aiSquads[candidate.clubId] = squad;
    }

    const comparison =
      newOverall > oldOverall
        ? `BETTER by ${newOverall - oldOverall} OVR`
        : newOverall < oldOverall
          ? `WORSE by ${oldOverall - newOverall} OVR`
          : "THE SAME overall";
    headlines.push(
      `${candidate.clubName}: unsold transfer-listed player ${oldPlayer.name} (${oldOverall} OVR) was transformed into ${replacement.name} (${newOverall} OVR) — ${comparison}.`,
    );
    transformedPlayerIds.push(oldPlayer.id);
  });

  return {
    team: nextTeam,
    league: { ...league, aiSquads },
    headlines,
    transformedCount: headlines.length,
    transformedPlayerIds,
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
    saveCareerSnapshot(team, league, nextMarket);
  }, [team, league]);

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
        saveCareerSnapshot(normalized, updated, nextMarket);
        return nextMarket;
      });

      return updated;
    });
  }, [team.name]);

  const updateLeague = useCallback((nextLeague: LeagueState) => {
    const migrated = migrateLeague(nextLeague);
    setLeagueState(migrated);
    saveLeague(migrated);
    saveCareerSnapshot(team, migrated, market);
  }, [team, market]);

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
        saveCareerSnapshot(normalizedTeam, normalizedLeague, next);
        return next;
      });
    },
    [],
  );

  const startNewSeason = useCallback(
    (teamName: string) => {
      const transformation = transformTenListedPlayersForNewSeason(
        { ...team, name: teamName },
        league,
      );
      const nextLeague = prepareLeagueForNewSeason(
        transformation.league,
        PLAYER_TEAM_ID_CONST,
        teamName,
      );
      const nextTeam = prepareTeamForNewSeason(
        transformation.team,
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
      const transformedIds = new Set(transformation.transformedPlayerIds);
      const marketWithTransformations: TransferMarketState = {
        ...prizeMarket,
        offers: prizeMarket.offers.map((offer) =>
          transformedIds.has(offer.playerId) &&
          (offer.status === "pending" || offer.status === "countered")
            ? { ...offer, status: "withdrawn" as const }
            : offer,
        ),
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
      const debtAdjusted = enforceDebtTransferListings(
        normalizedMarket,
        nextTeam,
        nextLeague,
      );
      setTeamState(debtAdjusted.team);
      setLeagueState(debtAdjusted.league);
      setMarketState(debtAdjusted.state);
      saveTeam(debtAdjusted.team);
      saveLeague(debtAdjusted.league);
      saveTransferMarket(debtAdjusted.state);
      saveCareerSnapshot(
        debtAdjusted.team,
        debtAdjusted.league,
        debtAdjusted.state,
      );
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
    saveCareerSnapshot(nextTeam, migrated, nextMarket);
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
