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

    // Supports the literal two-button hold as well as a long hold on Move+Pass.
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
    "min-h-11 rounded-xl px-2 py-2 text-[11px] sm:text-sm font-black leading-tight transition-all active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100";
  const chordStyle = {
    touchAction: "none",
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
    WebkitTouchCallout: "none" as const,
  };

  return (
    <div className="flex items-stretch gap-2 px-3 sm:px-4 pt-2.5">
      <button
        onClick={onCancel}
        className="w-11 min-w-11 rounded-xl text-gray-500 text-base font-bold hover:text-white transition-colors"
        aria-label="Cancel selected action"
      >
        ✕
      </button>

      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
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
          style={{
            background: "linear-gradient(135deg, #0ea5e9, #1d4ed8)",
            color: "#fff",
          }}
        >
          Long Ball
        </button>
        <button
          onPointerDown={(event) => handlePointerDown(event, "movePass")}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => {
            if (clickAllowed() && !actionsDisabled) onMovePass();
          }}
          disabled={actionsDisabled}
          className={actionClass}
          style={{
            ...chordStyle,
            background: holdingCombo
              ? "linear-gradient(135deg, #0f766e, #115e59)"
              : "linear-gradient(135deg, #9c27b0, #6a1b9a)",
            color: "#fff",
          }}
          title="Tap for Move → Pass. Hold for Pass → Move."
        >
          <span className="block">Move + Pass</span>
          <span className="block text-[8px] sm:text-[9px] font-semibold opacity-75">
            Hold: Pass + Move
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
        className="w-[clamp(70px,21vw,96px)] min-w-[70px] self-stretch rounded-xl px-2 py-2 text-xs sm:text-sm font-black leading-tight transition-all active:scale-[0.97]"
        style={{
          background: curveActive
            ? curveCanFinish
              ? "linear-gradient(160deg, #22d3ee, #2563eb)"
              : "linear-gradient(160deg, #155e75, #1e3a8a)"
            : "linear-gradient(160deg, #0891b2, #4338ca)",
          color: "#fff",
          boxShadow: curveActive
            ? "0 0 18px rgba(34,211,238,0.28)"
            : "none",
        }}
        aria-pressed={curveActive}
      >
        <span className="block text-lg">↝</span>
        <span className="block">
          {curveActive && curveCanFinish ? "Finish" : curveActive ? "Curve On" : "Curve"}
        </span>
        {curveActive && (
          <span className="block mt-1 text-[9px] font-semibold opacity-80">
            {curvePointCount}/{curvePointLimit} pts
          </span>
        )}
      </button>
    </div>
  );
}
