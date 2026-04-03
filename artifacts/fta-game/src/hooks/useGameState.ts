import { useState, useCallback } from "react";
import type { TeamConfig, LeagueState } from "../engine/types";
import { loadTeam, saveTeam, loadLeague, saveLeague, resetLeague } from "../game/persistence";

export function useGameState() {
  const [team, setTeamState] = useState<TeamConfig>(() => loadTeam());
  const [league, setLeagueState] = useState<LeagueState>(() => {
    const t = loadTeam();
    return loadLeague(t.name);
  });

  const updateTeam = useCallback((t: TeamConfig) => {
    setTeamState(t);
    saveTeam(t);
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
