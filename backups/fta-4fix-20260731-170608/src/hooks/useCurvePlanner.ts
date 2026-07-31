import { useCallback, useEffect, useMemo, useState } from "react";
import type { Command, SimPlayer, Vec2 } from "../engine/types";
import { CommandType } from "../engine/types";
import {
  curvePointLimitForMechanic,
  sanitizeCurvePoints,
  type CurveMechanic,
} from "../engine/curve";
import { PITCH_HEIGHT, PITCH_WIDTH } from "../engine/constants";

interface CurvePlannerOptions {
  selectedPlayer: SimPlayer | null;
  onCommit: (command: Command) => void;
  onCommitted: () => void;
}

export interface CurveDraftPreview {
  origin: Vec2;
  controls: Vec2[];
  target: Vec2;
  limit: number;
}

export function useCurvePlanner({
  selectedPlayer,
  onCommit,
  onCommitted,
}: CurvePlannerOptions) {
  const [active, setActive] = useState(false);
  const [mechanic, setMechanic] = useState<CurveMechanic>("move");
  const [baseCommand, setBaseCommand] = useState<Command | null>(null);
  const [controls, setControls] = useState<Vec2[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setActive(false);
    setMechanic("move");
    setBaseCommand(null);
    setControls([]);
    setError(null);
  }, []);

  useEffect(() => {
    reset();
  }, [selectedPlayer?.id, reset]);

  const limit = selectedPlayer
    ? curvePointLimitForMechanic(selectedPlayer.stats, mechanic)
    : 2;

  const arm = useCallback(() => {
    if (!selectedPlayer) return;
    setActive(true);
    setMechanic("move");
    setBaseCommand(null);
    setControls([]);
    setError(null);
  }, [selectedPlayer]);

  const beginAction = useCallback(
    (nextMechanic: CurveMechanic, command: Command | null = null) => {
      if (!selectedPlayer) return;
      setActive(true);
      setMechanic(nextMechanic);
      setBaseCommand(command);
      setControls([]);
      setError(null);
    },
    [selectedPlayer],
  );

  const setTargetCommand = useCallback((command: Command) => {
    setBaseCommand(command);
    setControls([]);
    setError(null);
  }, []);

  const addControl = useCallback(
    (point: Vec2) => {
      if (!active || !baseCommand || controls.length >= limit) return;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const clamped = {
        x: Math.max(0, Math.min(PITCH_WIDTH, point.x)),
        y: Math.max(0, Math.min(PITCH_HEIGHT, point.y)),
      };
      setControls((previous) =>
        previous.length >= limit ? previous : [...previous, clamped],
      );
      setError(null);
    },
    [active, baseCommand, controls.length, limit],
  );

  const canFinish = !!baseCommand && controls.length >= 2;

  const finish = useCallback(() => {
    if (!selectedPlayer || !baseCommand) {
      setError("Choose an action and its target first.");
      return false;
    }

    const cleanControls = sanitizeCurvePoints(controls, limit);
    if (cleanControls.length < 2) {
      setError("Add at least 2 curve points.");
      return false;
    }


    onCommit({ ...baseCommand, curvePoints: cleanControls });
    reset();
    onCommitted();
    return true;
  }, [
    selectedPlayer,
    baseCommand,
    controls,
    limit,
    onCommit,
    onCommitted,
    reset,
  ]);

  const handleCurveButton = useCallback(() => {
    if (!active) {
      arm();
      return;
    }
    if (baseCommand) {
      finish();
      return;
    }
    reset();
  }, [active, arm, baseCommand, finish, reset]);

  const preview = useMemo((): CurveDraftPreview | undefined => {
    if (!selectedPlayer || !active || !baseCommand) return undefined;
    const target =
      baseCommand.type === CommandType.SHOOT
        ? {
            x: selectedPlayer.teamId === "player" ? PITCH_WIDTH : 0,
            y: PITCH_HEIGHT / 2,
          }
        : baseCommand.targetPosition;
    if (!target) return undefined;
    return {
      origin: { ...selectedPlayer.position },
      controls,
      target: { ...target },
      limit,
    };
  }, [selectedPlayer, active, baseCommand, controls, limit]);

  const instruction = !active
    ? null
    : !baseCommand
      ? mechanic === "move"
        ? "Curve armed · tap a green tile for the dribble target, or choose another action"
        : "Choose the action target"
      : controls.length < 2
        ? `Tap ${2 - controls.length} more curve point${controls.length === 1 ? "" : "s"}`
        : controls.length < limit
          ? `Curve ready · ${controls.length}/${limit} points · add more or press Finish`
          : `Curve ready · ${controls.length}/${limit} points · press Finish`;

  return {
    active,
    mechanic,
    baseCommand,
    controls,
    limit,
    canFinish,
    error,
    instruction,
    preview,
    placingControls: active && !!baseCommand,
    arm,
    reset,
    beginAction,
    setTargetCommand,
    addControl,
    finish,
    handleCurveButton,
  };
}

