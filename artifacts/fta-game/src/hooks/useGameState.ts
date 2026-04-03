import { useState, useCallback } from "react";
import type { TeamConfig, LeagueState } from "../engine/types";
import { loadTeam, saveTeam, loadLeague, saveLeague, resetLeague } from "../game/persistence";
import { PLAYER_TEAM_ID_CONST } from "../game/persistence";
import { migrateLeague } from "../game/league";

export function useGameState() {
  const [team, setTeamState] = useState<TeamConfig>(() => loadTeam());
  const [league, setLeagueState] = useState<LeagueState>(() => {
    const t = loadTeam();
    const raw = loadLeague(t.name);
    const migrated = migrateLeague(raw);
    if (migrated !== raw) saveLeague(migrated);
    return migrated;
  });

  const updateTeam = useCallback((t: TeamConfig) => {
    setTeamState(t);
    saveTeam(t);
    // Sync updated team name into the league standings entry
    setLeagueState(prev => {
      const updated = {
        ...prev,
        teams: prev.teams.map(entry =>
          entry.id === PLAYER_TEAM_ID_CONST ? { ...entry, name: t.name } : entry
        ),
      };
      saveLeague(updated);
      return updated;
    });
  }, []);

  const updateLeague = useCallback((l: LeagueState) => {
    setLeagueState(l);
    saveLeague(l);
  }, []);

  const startNewSeason = useCallback((teamName: string) => {
    const l = resetLeague(teamName);
    setLeagueState(l);
  }, []);

  return { team, updateTeam, league, updateLeague, startNewSeason };
}
