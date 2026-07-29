import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

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
  active?: boolean;
}

type ChordKey = "pass" | "movePass";
const HOLD_MS = 460;

function ActionIcon({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 64 44" className="h-9 w-12 max-w-full" role="img" aria-label={label}>
        {children}
      </svg>
    </span>
  );
}

function PassIcon() {
  return (
    <ActionIcon label="Pass">
      <path d="M8 34c7-1 12-5 16-12 3-6 7-9 14-9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M13 13c6 0 10 3 12 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="48" cy="15" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M43 15l4-4 5 2 1 5-5 3-5-2z" fill="currentColor" opacity=".7" />
    </ActionIcon>
  );
}

function LongPassIcon() {
  return (
    <ActionIcon label="Long ball">
      <path d="M8 32C17 4 39 4 51 27" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M7 32l7-2-3-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="52" cy="28" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M47 28l4-4 5 2 1 5-5 3-5-2z" fill="currentColor" opacity=".7" />
    </ActionIcon>
  );
}

function ShootIcon() {
  return (
    <ActionIcon label="Shoot">
      <path d="M5 15h18M2 23h23M8 31h17" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".7" />
      <circle cx="43" cy="23" r="10" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M36 23l6-6 8 3 1 7-8 4-7-3z" fill="currentColor" opacity=".78" />
      <path d="M24 23h8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </ActionIcon>
  );
}

function ComboIcon({ reversed }: { reversed: boolean }) {
  return (
    <ActionIcon label={reversed ? "Pass then move" : "Move then pass"}>
      <circle cx="13" cy="30" r="5" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="49" cy="14" r="5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d={reversed ? "M47 22C38 35 24 35 16 26" : "M17 23C25 10 39 9 47 18"} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d={reversed ? "M17 26l-1 7-7-2" : "M46 18l1-7 7 2"} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 34l6-5 6 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
    </ActionIcon>
  );
}

function CurveIcon() {
  return (
    <ActionIcon label="Curve">
      <path d="M10 35C16 8 43 7 51 27" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M48 21l4 7 6-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </ActionIcon>
  );
}

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
  active = true,
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
    if (actionsDisabled || !active) return;
    suppressClicksUntil.current = performance.now() + 800;
    clearHoldTimer();
    pressed.current.clear();
    onPassMove();
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, key: ChordKey) => {
    if (actionsDisabled || !active) return;
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
    const reset = () => { pressed.current.clear(); clearHoldTimer(); };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      clearHoldTimer();
    };
  }, []);

  const clickAllowed = () => performance.now() >= suppressClicksUntil.current;
  const disabled = actionsDisabled || !active;
  const actionClass = "h-12 min-w-0 rounded-lg p-1 transition-all active:scale-[0.96] disabled:active:scale-100";
  const chordStyle = { touchAction: "none", userSelect: "none" as const, WebkitUserSelect: "none" as const, WebkitTouchCallout: "none" as const };
  const placeholder = { background: "rgba(255,255,255,0.055)", color: "transparent", border: "1px solid rgba(255,255,255,0.05)" };

  return (
    <div className="h-[56px] flex items-center gap-1.5 px-2 py-1">
      <button
        onClick={onCancel}
        disabled={!active}
        className="h-12 w-9 min-w-9 rounded-lg text-gray-400 text-lg font-bold transition-colors disabled:text-transparent"
        style={!active ? placeholder : { background: "rgba(255,255,255,0.055)" }}
        aria-label="Cancel selected action"
      >✕</button>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
        <button onPointerDown={(e) => handlePointerDown(e, "pass")} onClick={() => { if (clickAllowed() && !disabled) onPass(); }} disabled={disabled} className={actionClass} style={active ? { ...chordStyle, background: "#ffeb3b", color: "#111827" } : placeholder} aria-label="Pass"><PassIcon /></button>
        <button onClick={onLongPass} disabled={disabled} className={actionClass} style={active ? { background: "linear-gradient(135deg,#0ea5e9,#1d4ed8)", color: "#fff" } : placeholder} aria-label="Long ball"><LongPassIcon /></button>
        <button onPointerDown={(e) => handlePointerDown(e, "movePass")} onContextMenu={(e) => e.preventDefault()} onClick={() => { if (clickAllowed() && !disabled) onMovePass(); }} disabled={disabled} className={actionClass} style={active ? { ...chordStyle, background: holdingCombo ? "linear-gradient(135deg,#0f766e,#115e59)" : "linear-gradient(135deg,#9c27b0,#6a1b9a)", color: "#fff" } : placeholder} title="Tap: Move then Pass. Hold: Pass then Move." aria-label={holdingCombo ? "Pass then move" : "Move then pass"}><ComboIcon reversed={holdingCombo} /></button>
        <button onClick={onShoot} disabled={disabled} className={actionClass} style={active ? { background: "#d32f2f", color: "#fff" } : placeholder} aria-label="Shoot"><ShootIcon /></button>
      </div>
      <button
        onClick={onCurve}
        disabled={!active}
        className="relative h-12 w-[58px] min-w-[58px] rounded-lg p-1 transition-all active:scale-[0.96] disabled:active:scale-100"
        style={active ? {
          background: curveActive ? (curveCanFinish ? "linear-gradient(160deg,#22d3ee,#2563eb)" : "linear-gradient(160deg,#155e75,#1e3a8a)") : "linear-gradient(160deg,#0891b2,#4338ca)",
          color: "#fff",
          boxShadow: curveActive ? "0 0 14px rgba(34,211,238,.24)" : "none",
        } : placeholder}
        aria-label={curveActive && curveCanFinish ? "Finish curve" : "Curve"}
        aria-pressed={curveActive}
      >
        <CurveIcon />
        {active && curveActive && <span className="absolute right-1 top-0.5 rounded bg-black/35 px-1 text-[8px] font-bold">{curvePointCount}/{curvePointLimit}</span>}
      </button>
    </div>
  );
}
