import { useState, useCallback } from "react";
import type { TeamConfig, ArenaProgress } from "../engine/types";
import { loadTeam, saveTeam, loadProgress, saveProgress } from "../game/persistence";

export function useGameState() {
  const [team, setTeamState] = useState<TeamConfig>(() => loadTeam());
  const [progress, setProgressState] = useState<ArenaProgress>(() => loadProgress());

  const updateTeam = useCallback((t: TeamConfig) => {
    setTeamState(t);
    saveTeam(t);
  }, []);

  const updateProgress = useCallback((p: ArenaProgress) => {
    setProgressState(p);
    saveProgress(p);
  }, []);

  return { team, updateTeam, progress, updateProgress };
}
