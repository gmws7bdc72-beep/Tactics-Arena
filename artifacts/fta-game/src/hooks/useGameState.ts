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
import { migrateLeague, prepareLeagueForNewSeason } from "../game/league";
import { ensureTeamDevelopment, prepareTeamForNewSeason } from "../game/training";
import { awardSeasonPrize, loadTransferMarket, normalizeMarket, saveTransferMarket } from "../game/transferMarket";

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
        const next = normalizeMarket(previous, normalizedTeam, normalizedLeague);
        saveTransferMarket(next);
        return next;
      });
    },
    [],
  );

  const startNewSeason = useCallback(
    (teamName: string) => {
      const nextLeague = prepareLeagueForNewSeason(
        league,
        PLAYER_TEAM_ID_CONST,
        teamName,
      );
      const nextTeam = prepareTeamForNewSeason(
        { ...team, name: teamName },
        nextLeague.season ?? 1,
      );

      const prizeMarket = awardSeasonPrize(market, league);
      const normalizedMarket = normalizeMarket(prizeMarket, nextTeam, nextLeague);
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
