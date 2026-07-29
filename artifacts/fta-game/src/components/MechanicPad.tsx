import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface Props {
  onCancel: () => void;
  onPass: () => void;
  onLongPass: () => void;
  onMovePass: () => void;
  onPassMove: () => void;
  onShoot: () => void;
  onCurve: () => void;
  curveActive: boolean;
  curveCanFinish: boolean;
  curvePointCount: number;
  curvePointLimit: number;
  actionsDisabled?: boolean;
}

type ChordKey = "pass" | "movePass";

const HOLD_MS = 460;

export default function MechanicPad({
  onCancel,
  onPass,
  onLongPass,
  onMovePass,
  onPassMove,
  onShoot,
  onCurve,
  curveActive,
  curveCanFinish,
  curvePointCount,
  curvePointLimit,
  actionsDisabled = false,
}: Props) {
  const pressed = useRef(new Map<number, ChordKey>());
  const holdTimer = useRef<number | null>(null);
  const suppressClicksUntil = useRef(0);
  const [holdingCombo, setHoldingCombo] = useState(false);

  const clearHoldTimer = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHoldingCombo(false);
  };

  const consumeAsPassMove = () => {
    if (actionsDisabled) return;
    suppressClicksUntil.current = performance.now() + 800;
    clearHoldTimer();
    pressed.current.clear();
    onPassMove();
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: ChordKey,
  ) => {
    if (actionsDisabled) return;
    pressed.current.set(event.pointerId, key);
    const values = [...pressed.current.values()];

    if (values.includes("pass") && values.includes("movePass")) {
      consumeAsPassMove();
      return;
    }
    if (key === "movePass") {
      clearHoldTimer();
      setHoldingCombo(true);
      holdTimer.current = window.setTimeout(consumeAsPassMove, HOLD_MS);
    }
  };

  const releasePointer = (pointerId: number) => {
    const key = pressed.current.get(pointerId);
    pressed.current.delete(pointerId);
    if (key === "movePass") clearHoldTimer();
  };

  useEffect(() => {
    const release = (event: PointerEvent) => releasePointer(event.pointerId);
    const resetPointers = () => {
      pressed.current.clear();
      clearHoldTimer();
    };
    const visibility = () => {
      if (document.hidden) resetPointers();
    };

    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", resetPointers);
    document.addEventListener("visibilitychange", visibility);

    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", resetPointers);
      document.removeEventListener("visibilitychange", visibility);
      clearHoldTimer();
    };
  }, []);

  const clickAllowed = () => performance.now() >= suppressClicksUntil.current;
  const actionClass =
    "h-10 min-w-0 flex-1 rounded-lg px-1.5 text-[10px] sm:text-xs font-black leading-tight transition-all active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100";
  const chordStyle = {
    touchAction: "none",
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
    WebkitTouchCallout: "none" as const,
  };

  return (
    <div className="flex items-stretch gap-1.5 px-2 sm:px-3 pt-1.5">
      <button
        onClick={onCancel}
        className="h-10 w-9 min-w-9 rounded-lg text-gray-500 text-sm font-bold hover:text-white transition-colors"
        aria-label="Cancel selected action"
      >
        ✕
      </button>

      <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
        <button
          onPointerDown={(event) => handlePointerDown(event, "pass")}
          onClick={() => {
            if (clickAllowed() && !actionsDisabled) onPass();
          }}
          disabled={actionsDisabled}
          className={actionClass}
          style={{ ...chordStyle, background: "#ffeb3b", color: "#111827" }}
        >
          Pass
        </button>

        <button
          onClick={onLongPass}
          disabled={actionsDisabled}
          className={actionClass}
          style={{ background: "linear-gradient(135deg, #0ea5e9, #1d4ed8)", color: "#fff" }}
        >
          Long
        </button>

        <button
          onPointerDown={(event) => handlePointerDown(event, "movePass")}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => {
            if (clickAllowed() && !actionsDisabled) onMovePass();
          }}
          disabled={actionsDisabled}
          className={`${actionClass} basis-[30%]`}
          style={{
            ...chordStyle,
            background: holdingCombo
              ? "linear-gradient(135deg, #0f766e, #115e59)"
              : "linear-gradient(135deg, #9c27b0, #6a1b9a)",
            color: "#fff",
          }}
          title="Tap for Move → Pass. Hold for Pass → Move."
        >
          <span className="block text-sm font-black tracking-tight">
            {holdingCombo ? "P→M" : "M→P"}
          </span>
        </button>

        <button
          onClick={onShoot}
          disabled={actionsDisabled}
          className={actionClass}
          style={{ background: "#d32f2f", color: "#fff" }}
        >
          Shoot
        </button>
      </div>

      <button
        onClick={onCurve}
        className="h-10 w-[58px] min-w-[58px] rounded-lg px-1 text-[10px] sm:text-xs font-black leading-tight transition-all active:scale-[0.97]"
        style={{
          background: curveActive
            ? curveCanFinish
              ? "linear-gradient(160deg, #22d3ee, #2563eb)"
              : "linear-gradient(160deg, #155e75, #1e3a8a)"
            : "linear-gradient(160deg, #0891b2, #4338ca)",
          color: "#fff",
          boxShadow: curveActive ? "0 0 12px rgba(34,211,238,0.24)" : "none",
        }}
        aria-pressed={curveActive}
      >
        <span className="block text-sm">↝</span>
        <span className="block">
          {curveActive && curveCanFinish ? "Finish" : curveActive ? "Curve" : "Curve"}
        </span>
        {curveActive && (
          <span className="block text-[7px] font-semibold opacity-80">
            {curvePointCount}/{curvePointLimit}
          </span>
        )}
      </button>
    </div>
  );
}
