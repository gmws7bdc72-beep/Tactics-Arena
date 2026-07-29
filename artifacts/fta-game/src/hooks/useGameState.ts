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
} {
  const season = league.season ?? 1;
  const aiSquads = { ...(league.aiSquads ?? {}) };
  const headlines: string[] = [];

  AI_TEAMS.slice(0, 10).forEach((club, clubIndex) => {
    const squad = [...(aiSquads[club.id] ?? club.players)];
    if (squad.length === 0) return;
    const replaceable = squad
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.role !== "goalkeeper");
    const chosen = replaceable[(season * 7 + clubIndex * 3) % Math.max(1, replaceable.length)]
      ?? { player: squad[0], index: 0 };
    const oldPlayer = chosen.player;
    const oldOverall = getPlayerOverall(oldPlayer);
    const replacement = generateReservePlayer(club.id, 1000 + season * 20 + clubIndex, club.tier, season);
    const newOverall = getPlayerOverall(replacement);
    squad[chosen.index] = replacement;
    aiSquads[club.id] = squad;

    const comparison =
      newOverall > oldOverall
        ? `BETTER by ${newOverall - oldOverall} OVR`
        : newOverall < oldOverall
          ? `WORSE by ${oldOverall - newOverall} OVR`
          : "THE SAME overall";
    headlines.push(
      `${club.name}: ${oldPlayer.name} (${oldOverall} OVR) was transformed into ${replacement.name} (${newOverall} OVR) — ${comparison}.`,
    );
  });

  return { league: { ...league, aiSquads }, headlines };
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
    const normalized = ensureTeamDevelopment(nextTeam);
    setTeamState(normalized);
    saveTeam(normalized);

    setLeagueState((previous) => {
      const updated = {
        ...previous,
        teams: previous.teams.map((entry) =>
          entry.id === PLAYER_TEAM_ID_CONST
            ? { ...entry, name: normalized.name }
            : entry,
        ),
      };
      saveLeague(updated);
      return updated;
    });
  }, []);

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
      const normalizedLeague = migrateLeague({
        ...nextLeague,
        teams: nextLeague.teams.map((entry) =>
          entry.id === PLAYER_TEAM_ID_CONST
            ? { ...entry, name: normalizedTeam.name }
            : entry,
        ),
      });

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
          `Season ${transformationSeason} player transformations: 10 players were replaced.`,
          ...transformation.headlines,
          ...prizeMarket.news,
        ].slice(0, 80),
        newsFeed: [
          {
            id: `season_transform_summary_${transformationSeason}`,
            kind: "system" as const,
            headline: `Season ${transformationSeason}: the 10 transformed players have been revealed.`,
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
