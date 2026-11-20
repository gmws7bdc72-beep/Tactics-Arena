import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, SVGProps } from "react";
import type { TutorialFocus } from "./TutorialCoach";

interface Props {
  onCancel: () => void;
  onPass: () => void;
  onLongPass: () => void;
  onMovePass: () => void;
  onPassMove: () => void;
  onShoot: () => void;
  onDive?: () => void;
  goalkeeperCanDive?: boolean;
  goalkeeperInBox?: boolean;
  onCurve: () => void;
  curveActive: boolean;
  curveCanFinish: boolean;
  curvePointCount: number;
  curvePointLimit: number;
  actionsDisabled?: boolean;
  active: boolean;
  tutorialFocus?: TutorialFocus;
  outOfPossession?: boolean;
  standTackleBlocked?: boolean;
  defenseMode?: "slide" | "stand" | "press" | null;
  onDefense?: (mode: "slide" | "stand" | "press") => void;
}

type ChordKey = "pass" | "movePass";
const HOLD_MS = 460;

export function isOutOfPossession(ownerId: string | null, players: readonly { id: string; teamId: "player" | "ai" }[], planningTeam: "player" | "ai"): boolean {
  if (!ownerId) return true;
  return players.find(player => player.id === ownerId)?.teamId !== planningTeam;
}

const iconProps: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function Ball({ x = 45, y = 36, r = 7 }: { x?: number; y?: number; r?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="rgba(255,255,255,.96)" stroke="currentColor" />
      <path d={`M ${x - 2.5} ${y - 2} l 3 -2 3 2 -1 3.5 -3.5 .5 -2 -3 z`} strokeWidth="1.6" />
      <path d={`M ${x - 6} ${y + 1} l 4 2.5 M ${x + 4} ${y + 3} l 1.5 3`} strokeWidth="1.4" />
    </>
  );
}

function PassIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 14v26c0 7 5 12 12 12h8" opacity=".75" />
      <path d="M17 16h10M17 22h7" opacity=".42" />
      <path d="M23 48c4-5 8-9 14-11M19 45c5 0 8 2 12 6M28 52c2-7 6-12 11-16" />
      <Ball />
    </svg>
  );
}

function LongBallIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 44c8-25 27-32 45-18" />
      <path d="M9 44c7-8 14-11 22-11M10 49h13M14 53h7" opacity=".4" />
      <Ball x={51} y={26} r={6.5} />
    </svg>
  );
}

function ShotIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 25h18M4 33h24M9 41h16" opacity=".42" />
      <path d="M16 18c10 5 17 10 24 16M19 48c8-4 15-8 22-13" opacity=".62" />
      <path d="M13 22c5 2 9 5 13 9M12 44c6-2 10-5 14-9" />
      <Ball x={47} y={35} r={8} />
    </svg>
  );
}


function DiveIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 43c11-1 19-6 26-15" opacity=".42" />
      <circle cx="39" cy="20" r="5" fill="currentColor" stroke="none" />
      <path d="M34 26l-10 9-12 2M27 33l10 8 13 1M29 31l9-3 10 4" />
      <Ball x={54} y={31} r={5.5} />
    </svg>
  );
}

function ComboIcon({ reversed }: { reversed: boolean }) {
  return (
    <svg {...iconProps}>
      <circle cx="15" cy="18" r="5" fill="currentColor" stroke="none" />
      <circle cx="49" cy="46" r="5" fill="currentColor" stroke="none" />
      <path d={reversed ? "M46 38C40 24 27 20 18 24" : "M18 26C26 39 38 42 46 39"} />
      <path d={reversed ? "m22 18-5 6 7 3" : "m42 33 5 6-7 3"} />
      <path d={reversed ? "M46 50c-9 5-20 2-27-7" : "M18 14c10-5 22-2 29 7"} opacity=".42" />
      <path d="M29 27l7 7M36 27l-7 7" opacity=".7" />
    </svg>
  );
}

function CurveIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps}>
      <path d="M14 12c26 0 36 10 36 20S40 52 14 52" />
      <path d="m20 44-7 8 9 5" />
      {active && <><circle cx="33" cy="17" r="2.4" fill="currentColor" stroke="none" /><circle cx="48" cy="31" r="2.4" fill="currentColor" stroke="none" /><circle cx="34" cy="47" r="2.4" fill="currentColor" stroke="none" /></>}
    </svg>
  );
}

function SlideIcon() {
  return <svg {...iconProps}><path d="M6 48h18M10 54h26" opacity=".45"/><circle cx="20" cy="20" r="5" fill="currentColor" stroke="none"/><path d="M18 27l9 9 12 2M26 35l-6 10-9 2M28 37l12 7 11-4M31 31l-5 5-11-3"/><Ball x={52} y={39} r={6}/></svg>;
}

function StandTackleIcon() {
  return <svg {...iconProps}><path d="M9 17l8-5M8 23h7M12 48l10-10 4-12M22 38l5 11M26 26l10 5 7-3M25 26l-8 5"/><circle cx="27" cy="18" r="5" fill="currentColor" stroke="none"/><path d="M37 42l8-8M39 48l7-1" opacity=".55"/><Ball x={51} y={37} r={7}/></svg>;
}

function PressIcon() {
  return <svg {...iconProps}><circle cx="17" cy="17" r="5" fill="currentColor" stroke="none"/><path d="M16 25l9 7 7-1M24 32l-2 9-10 7M23 40l9 8M14 28l-6 6M34 17h12M38 12l6 5-6 5"/><circle cx="48" cy="38" r="10" strokeDasharray="3 4" opacity=".6"/><Ball x={48} y={38} r={5}/></svg>;
}

export default function MechanicPad({
  onCancel, onPass, onLongPass, onMovePass, onPassMove, onShoot, onDive, onCurve,
  curveActive, curveCanFinish, curvePointCount, curvePointLimit,
  actionsDisabled = false,
  active,
  goalkeeperCanDive = false,
  goalkeeperInBox = false,
  tutorialFocus = "none",
  outOfPossession = false,
  standTackleBlocked = false,
  defenseMode = null,
  onDefense,
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
  const focusClass = (name: TutorialFocus) => tutorialFocus === name ? " ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#07101c] animate-pulse" : "";
  const actionClass = `h-12 min-w-0 rounded-xl border border-white/10 p-1 text-white shadow-sm transition-transform active:scale-[0.96] disabled:opacity-30 disabled:active:scale-100 [&>svg]:h-full [&>svg]:w-full ${active ? "" : "invisible pointer-events-none"}`;
  const chordStyle = { touchAction: "none", userSelect: "none" as const, WebkitUserSelect: "none" as const, WebkitTouchCallout: "none" as const };

  if (outOfPossession) {
    const defenseActionClass = "h-12 min-w-0 rounded-xl border border-white/10 p-1 text-white shadow-sm transition-transform active:scale-[0.96] disabled:opacity-45 [&>svg]:h-full [&>svg]:w-full";
    return (
      <div className="flex h-14 items-center gap-1.5 px-2 py-1">
        <button onClick={() => active && onCancel()} className={`h-12 w-9 min-w-9 rounded-xl border border-white/10 text-lg font-bold text-gray-400 ${active ? "" : "invisible pointer-events-none"}`} aria-label="Cancel selected action">×</button>
        <div className={`grid min-w-0 flex-1 ${goalkeeperCanDive && goalkeeperInBox ? "grid-cols-5" : "grid-cols-4"} gap-1.5`}>
          <button onClick={() => onDefense?.("slide")} disabled={!active || actionsDisabled} className={defenseActionClass} style={{ background: "linear-gradient(145deg,#fb4b4b,#991b1b)", boxShadow: defenseMode === "slide" ? "0 0 0 2px #fff, 0 0 14px #ef4444" : undefined }} aria-label="Slide tackle" aria-pressed={defenseMode === "slide"}><SlideIcon /></button>
          <button onClick={() => onDefense?.("press")} disabled={!active || actionsDisabled} className={defenseActionClass} style={{ background: "linear-gradient(145deg,#38bdf8,#1d4ed8)", boxShadow: defenseMode === "press" ? "0 0 0 2px #fff, 0 0 14px #38bdf8" : undefined }} aria-label="Press" aria-pressed={defenseMode === "press"}><PressIcon /></button>
          <button onClick={() => onDefense?.("stand")} disabled={!active || actionsDisabled || standTackleBlocked} title={standTackleBlocked ? "Available again next turn" : undefined} className={defenseActionClass} style={{ background: "linear-gradient(145deg,#4ade80,#15803d)", boxShadow: defenseMode === "stand" ? "0 0 0 2px #fff, 0 0 14px #4ade80" : undefined }} aria-label="Standing tackle" aria-pressed={defenseMode === "stand"}><StandTackleIcon /></button>
          <button onClick={() => active && !actionsDisabled && onMovePass()} disabled={!active || actionsDisabled} className={defenseActionClass} style={{ background: "linear-gradient(145deg,#c026d3,#6b21a8)" }} aria-label="Move then pass"><ComboIcon reversed={false} /></button>
          {goalkeeperCanDive && goalkeeperInBox && <button onClick={() => onDive?.()} disabled={!active || actionsDisabled} className={defenseActionClass} style={{ background: "linear-gradient(145deg,#22d3ee,#0369a1)" }} aria-label="Dive"><DiveIcon /></button>}
        </div>
        <button onClick={() => active && onCurve()} disabled={!active} className="relative h-12 w-14 min-w-14 rounded-xl border border-white/10 p-1 text-white shadow-sm disabled:opacity-45 [&>svg]:h-full [&>svg]:w-full" style={{ background: curveActive ? (curveCanFinish ? "linear-gradient(145deg,#22d3ee,#2563eb)" : "linear-gradient(145deg,#0e7490,#1e3a8a)") : "linear-gradient(145deg,#0891b2,#4338ca)", boxShadow: curveActive ? "0 0 14px rgba(34,211,238,.28)" : "none" }} aria-label={curveActive && curveCanFinish ? "Finish curve" : curveActive ? "Curve active" : "Add curve"} aria-pressed={curveActive}><CurveIcon active={curveActive} />{curveActive && <span className="absolute bottom-0.5 right-1 rounded bg-black/45 px-1 text-[8px] font-bold leading-3">{curvePointCount}/{curvePointLimit}</span>}</button>
      </div>
    );
  }

  return (
    <div className="flex h-14 items-center gap-1.5 px-2 py-1">
      <button onClick={() => active && onCancel()} className={`h-12 w-9 min-w-9 rounded-xl border border-white/10 text-lg font-bold text-gray-400 transition-colors hover:text-white ${active ? "" : "invisible pointer-events-none"}`} aria-label="Cancel selected action">×</button>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
        <button onPointerDown={(event) => handlePointerDown(event, "pass")} onClick={() => { if (active && clickAllowed() && !actionsDisabled) onPass(); }} disabled={actionsDisabled || !active} className={actionClass} style={{ ...chordStyle, background: "linear-gradient(145deg,#facc15,#ca8a04)", color: "#111827" }} aria-label="Inside-foot pass"><PassIcon /></button>
        <button onClick={() => active && onLongPass()} disabled={actionsDisabled || !active} className={`${actionClass}${focusClass("longPass")}`} style={{ background: "linear-gradient(145deg,#38bdf8,#1d4ed8)" }} aria-label="Long pass"><LongBallIcon /></button>
        <button onPointerDown={(event) => handlePointerDown(event, "movePass")} onContextMenu={(event) => event.preventDefault()} onClick={() => { if (active && clickAllowed() && !actionsDisabled) onMovePass(); }} disabled={actionsDisabled || !active} className={`${actionClass}${focusClass("combo")}`} style={{ ...chordStyle, background: holdingCombo ? "linear-gradient(145deg,#14b8a6,#115e59)" : "linear-gradient(145deg,#c026d3,#6b21a8)" }} aria-label={holdingCombo ? "Pass then move" : "Move then pass"}><ComboIcon reversed={holdingCombo} /></button>
        <button onClick={() => active && (goalkeeperCanDive ? onDive?.() : onShoot())} disabled={actionsDisabled || !active} className={`${actionClass}${focusClass(goalkeeperCanDive ? "dive" : "shoot")}`} style={{ background: goalkeeperCanDive ? "linear-gradient(145deg,#22d3ee,#0369a1)" : "linear-gradient(145deg,#ef4444,#991b1b)" }} aria-label={goalkeeperCanDive ? "Dive" : "Shoot"}>{goalkeeperCanDive ? <DiveIcon /> : <ShotIcon />}</button>
      </div>
      <button onClick={() => active && onCurve()} className={`relative h-12 w-14 min-w-14 rounded-xl border border-white/10 p-1 text-white shadow-sm transition-transform active:scale-[0.96] ${active ? "" : "invisible pointer-events-none"}${focusClass("curve")}`} style={{ background: curveActive ? (curveCanFinish ? "linear-gradient(145deg,#22d3ee,#2563eb)" : "linear-gradient(145deg,#0e7490,#1e3a8a)") : "linear-gradient(145deg,#0891b2,#4338ca)", boxShadow: curveActive ? "0 0 14px rgba(34,211,238,.28)" : "none" }} aria-label={curveActive && curveCanFinish ? "Finish curve" : curveActive ? "Curve active" : "Add curve"} aria-pressed={curveActive}><CurveIcon active={curveActive} />{curveActive && <span className="absolute bottom-0.5 right-1 rounded bg-black/45 px-1 text-[8px] font-bold leading-3">{curvePointCount}/{curvePointLimit}</span>}</button>
    </div>
  );
}
