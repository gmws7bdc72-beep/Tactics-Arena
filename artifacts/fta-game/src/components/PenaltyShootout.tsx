import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerCard, TeamConfig } from "../engine/types";

export interface PenaltyResult {
  player: number;
  ai: number;
  winner: "player" | "ai";
}

interface Props {
  team: TeamConfig;
  opponentName: string;
  opponentPlayers: PlayerCard[];
  opponentColor: string;
  opponentSecondaryColor: string;
  onComplete: (result: PenaltyResult) => void;
}

type Side = "player" | "ai";
type ShotPhase = "choose" | "runup" | "flight" | "hang" | "drop" | "result" | "complete";

type Cell = { row: number; col: number };

interface ResolvedShot {
  side: Side;
  shooter: PlayerCard;
  chosen: Cell;
  actual: Cell;
  keeperGuess: Cell;
  onTarget: boolean;
  saved: boolean;
  goal: boolean;
}

const COL_X = [22, 50, 78];
const ROW_Y = [18, 49, 80];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shuffledCell(excluding?: Cell): Cell {
  const cells: Cell[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (!excluding || row !== excluding.row || col !== excluding.col) {
        cells.push({ row, col });
      }
    }
  }
  return cells[Math.floor(Math.random() * cells.length)] ?? { row: 1, col: 1 };
}

function keeperRating(player: PlayerCard | undefined): number {
  if (!player) return 5;
  return clamp(
    (player.stats.defense + player.stats.movement + player.stats.aerial) / 3,
    1,
    10,
  );
}

function sortShooters(players: PlayerCard[]): PlayerCard[] {
  return [...players].sort(
    (a, b) =>
      b.stats.shooting - a.stats.shooting ||
      b.stats.attack - a.stats.attack ||
      b.stats.vision - a.stats.vision,
  );
}

function resolveShot(
  side: Side,
  shooter: PlayerCard,
  chosen: Cell,
  keeper: PlayerCard | undefined,
): ResolvedShot {
  const shooting = clamp(shooter.stats.shooting, 1, 10);
  const precision = 0.52 + shooting * 0.045;
  const exactness = 0.36 + shooting * 0.055;
  const onTarget = Math.random() < precision;

  let actual = { ...chosen };
  if (onTarget && Math.random() > exactness) {
    actual = {
      row: clamp(chosen.row + (Math.floor(Math.random() * 3) - 1), 0, 2),
      col: clamp(chosen.col + (Math.floor(Math.random() * 3) - 1), 0, 2),
    };
  }

  if (!onTarget) {
    // A miss must finish outside at least one edge of the elongated goal.
    // Keep the other axis near the chosen zone so the miss still reflects aim.
    const missEdge = Math.floor(Math.random() * 4);
    actual = {
      row:
        missEdge === 0
          ? -1
          : missEdge === 1
            ? 3
            : clamp(chosen.row + (Math.floor(Math.random() * 3) - 1), 0, 2),
      col:
        missEdge === 2
          ? -1
          : missEdge === 3
            ? 3
            : clamp(chosen.col + (Math.floor(Math.random() * 3) - 1), 0, 2),
    };
  }

  const gkRating = keeperRating(keeper);
  const readsCorrectly = Math.random() < 0.12 + gkRating * 0.025;
  const keeperGuess = readsCorrectly
    ? { row: clamp(actual.row, 0, 2), col: clamp(actual.col, 0, 2) }
    : shuffledCell();

  const sameCell =
    keeperGuess.row === clamp(actual.row, 0, 2) &&
    keeperGuess.col === clamp(actual.col, 0, 2);
  const saveChance = 0.28 + gkRating * 0.052 - shooting * 0.018;
  const saved = onTarget && sameCell && Math.random() < clamp(saveChance, 0.18, 0.8);
  const goal = onTarget && !saved;

  return {
    side,
    shooter,
    chosen,
    actual,
    keeperGuess,
    onTarget,
    saved,
    goal,
  };
}

function winnerAfterKick(
  playerGoals: number,
  aiGoals: number,
  playerTaken: number,
  aiTaken: number,
): Side | null {
  if (playerTaken <= 5 && aiTaken <= 5) {
    const playerRemaining = Math.max(0, 5 - playerTaken);
    const aiRemaining = Math.max(0, 5 - aiTaken);
    if (playerGoals > aiGoals + aiRemaining) return "player";
    if (aiGoals > playerGoals + playerRemaining) return "ai";
  }

  if (playerTaken >= 5 && aiTaken >= 5 && playerTaken === aiTaken) {
    if (playerGoals > aiGoals) return "player";
    if (aiGoals > playerGoals) return "ai";
  }

  return null;
}

function PlayerFigure({
  color,
  secondary,
  active,
}: {
  color: string;
  secondary: string;
  active: boolean;
}) {
  return (
    <div
      className="absolute bottom-[12%] left-[14%] h-28 w-16 origin-bottom transition-transform duration-300"
      style={{ transform: active ? "translate(28px,-5px) rotate(-4deg)" : "translate(0,0)" }}
    >
      <div className="absolute left-1/2 top-0 h-7 w-7 -translate-x-1/2 rounded-full bg-amber-200 shadow-lg" />
      <div
        className="absolute left-1/2 top-7 h-12 w-10 -translate-x-1/2 rounded-t-2xl rounded-b-xl shadow-xl"
        style={{ background: color, border: `2px solid ${secondary}` }}
      />
      <div className="absolute left-2 top-[70px] h-12 w-3 origin-top rotate-6 rounded-full bg-slate-800" />
      <div className="absolute right-2 top-[70px] h-12 w-3 origin-top -rotate-6 rounded-full bg-slate-800" />
    </div>
  );
}

export default function PenaltyShootout({
  team,
  opponentName,
  opponentPlayers,
  opponentColor,
  opponentSecondaryColor,
  onComplete,
}: Props) {
  const playerShooters = useMemo(() => sortShooters(team.players), [team.players]);
  const aiShooters = useMemo(() => sortShooters(opponentPlayers), [opponentPlayers]);
  const playerKeeper = team.players.find((player) => player.role === "goalkeeper");
  const aiKeeper = opponentPlayers.find((player) => player.role === "goalkeeper");

  const [side, setSide] = useState<Side>("player");
  const [phase, setPhase] = useState<ShotPhase>("choose");
  const [shot, setShot] = useState<ResolvedShot | null>(null);
  const [playerGoals, setPlayerGoals] = useState(0);
  const [aiGoals, setAiGoals] = useState(0);
  const [playerResults, setPlayerResults] = useState<boolean[]>([]);
  const [aiResults, setAiResults] = useState<boolean[]>([]);
  const [winner, setWinner] = useState<Side | null>(null);
  const timers = useRef<number[]>([]);
  const shotLockRef = useRef(false);

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const playerTaken = playerResults.length;
  const aiTaken = aiResults.length;
  const shooterIndex = side === "player" ? playerTaken : aiTaken;
  const currentShooter =
    side === "player"
      ? playerShooters[shooterIndex % Math.max(1, playerShooters.length)]
      : aiShooters[shooterIndex % Math.max(1, aiShooters.length)];
  const currentKeeper = side === "player" ? aiKeeper : playerKeeper;

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  };

  const finishKick = (resolved: ResolvedShot) => {
    shotLockRef.current = false;
    const nextPlayerGoals = playerGoals + (resolved.side === "player" && resolved.goal ? 1 : 0);
    const nextAiGoals = aiGoals + (resolved.side === "ai" && resolved.goal ? 1 : 0);
    const nextPlayerResults =
      resolved.side === "player" ? [...playerResults, resolved.goal] : playerResults;
    const nextAiResults = resolved.side === "ai" ? [...aiResults, resolved.goal] : aiResults;

    setPlayerGoals(nextPlayerGoals);
    setAiGoals(nextAiGoals);
    setPlayerResults(nextPlayerResults);
    setAiResults(nextAiResults);

    const decided = winnerAfterKick(
      nextPlayerGoals,
      nextAiGoals,
      nextPlayerResults.length,
      nextAiResults.length,
    );

    if (decided) {
      setWinner(decided);
      setPhase("complete");
      return;
    }

    setShot(null);
    setSide(resolved.side === "player" ? "ai" : "player");
    setPhase("choose");
  };

  const takeKick = (chosen: Cell) => {
    if (!currentShooter || phase !== "choose" || shotLockRef.current) return;
    shotLockRef.current = true;
    clearTimers();
    const resolved = resolveShot(side, currentShooter, chosen, currentKeeper);
    setShot(resolved);
    setPhase("runup");
    schedule(() => setPhase("flight"), 320);
    schedule(() => setPhase("hang"), 570);
    schedule(() => setPhase("drop"), 900);
    schedule(() => setPhase("result"), 1140);
    schedule(() => finishKick(resolved), 1900);
  };

  useEffect(() => {
    if (side !== "ai" || phase !== "choose" || !currentShooter) return;
    const timer = window.setTimeout(() => {
      const shooting = clamp(currentShooter.stats.shooting, 1, 10);
      const cornerBias = Math.random() < 0.42 + shooting * 0.035;
      const chosen = cornerBias
        ? { row: Math.random() < 0.5 ? 0 : 2, col: Math.random() < 0.5 ? 0 : 2 }
        : shuffledCell();
      takeKick(chosen);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [side, phase, currentShooter]);

  const goalLeft = 9;
  const goalTop = 9;
  const goalWidth = 82;
  const goalHeight = 39;
  const shotColPercent = shot
    ? shot.actual.col < 0
      ? -8
      : shot.actual.col > 2
        ? 108
        : COL_X[shot.actual.col]
    : 22;
  const shotRowPercent = shot
    ? shot.actual.row < 0
      ? -16
      : shot.actual.row > 2
        ? 116
        : ROW_Y[shot.actual.row]
    : 80;
  const targetLeft = goalLeft + (goalWidth * shotColPercent) / 100;
  const targetTop = goalTop + (goalHeight * shotRowPercent) / 100;
  const keeperLeft = shot ? goalLeft + (goalWidth * COL_X[shot.keeperGuess.col]) / 100 : 50;
  const keeperTop = shot ? goalTop + (goalHeight * ROW_Y[shot.keeperGuess.row]) / 100 : 28;

  const flightStarted = phase === "flight" || phase === "hang" || phase === "drop" || phase === "result";
  const keeperFlying = phase === "flight" || phase === "hang";
  const keeperDropped = phase === "drop" || phase === "result";
  const shooterColor = side === "player" ? team.jerseyColor : opponentColor;
  const shooterSecondary = side === "player" ? team.secondaryColor : opponentSecondaryColor;
  const keeperColor = side === "player" ? opponentColor : team.jerseyColor;

  return (
    <div className="absolute inset-0 z-[90] overflow-hidden bg-[#071019] text-white">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-black/45 px-4 py-3 backdrop-blur-md">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Penalty shootout</div>
          <div className="mt-0.5 text-sm font-black">{team.name} vs {opponentName}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black">{playerGoals}–{aiGoals}</div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400">
            {playerTaken >= 5 && aiTaken >= 5 ? "Sudden death" : "Best of five"}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 top-[72px] flex justify-center gap-6 px-4">
        <KickDots label={team.name} results={playerResults} active={side === "player" && !winner} />
        <KickDots label={opponentName} results={aiResults} active={side === "ai" && !winner} />
      </div>

      <div className="absolute inset-x-3 bottom-4 top-[132px] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,.13),transparent_32%),linear-gradient(#173a2a,#0b251a_70%,#07160f)] shadow-2xl">
        <div className="absolute inset-x-0 bottom-0 h-[64%] origin-bottom bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.018)_0,rgba(255,255,255,.018)_44px,transparent_44px,transparent_88px)]" style={{ clipPath: "polygon(11% 0,89% 0,100% 100%,0 100%)" }} />

        <div
          className="absolute border-[5px] border-white/90 shadow-[0_0_22px_rgba(255,255,255,.25)]"
          style={{ left: `${goalLeft}%`, top: `${goalTop}%`, width: `${goalWidth}%`, height: `${goalHeight}%` }}
        >
          <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.32) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.32) 1px,transparent 1px)", backgroundSize: "12.5% 33.333%" }} />
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, index) => {
              const row = Math.floor(index / 3);
              const col = index % 3;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={side !== "player" || phase !== "choose" || !!winner}
                  onClick={() => takeKick({ row, col })}
                  className="border border-white/10 transition-colors enabled:hover:bg-cyan-300/20 enabled:active:bg-cyan-200/35 disabled:cursor-default"
                  aria-label={`Shoot ${row === 0 ? "high" : row === 1 ? "middle" : "low"} ${col === 0 ? "left" : col === 1 ? "center" : "right"}`}
                />
              );
            })}
          </div>
        </div>

        <div
          className="absolute h-16 w-9 origin-bottom transition-all"
          style={{
            left: `${keeperLeft}%`,
            top: `${keeperTop}%`,
            transform: `translate(-50%,-50%) ${keeperFlying ? `rotate(${(shot?.keeperGuess.col ?? 1) < 1 ? -58 : (shot?.keeperGuess.col ?? 1) > 1 ? 58 : 0}deg) scale(1.12)` : keeperDropped ? `translateY(15px) rotate(${(shot?.keeperGuess.col ?? 1) < 1 ? -72 : (shot?.keeperGuess.col ?? 1) > 1 ? 72 : 0}deg) scaleY(.86)` : "rotate(0deg)"}`,
            transitionDuration: keeperFlying ? "230ms" : "270ms",
            transitionTimingFunction: keeperFlying ? "cubic-bezier(.12,.8,.18,1)" : "cubic-bezier(.25,.7,.35,1)",
          }}
        >
          <div className="absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 rounded-full bg-amber-200" />
          <div className="absolute left-1/2 top-5 h-8 w-7 -translate-x-1/2 rounded-lg" style={{ background: keeperColor }} />
          <div className="absolute left-[-10px] top-7 h-2 w-12 rounded-full" style={{ background: keeperColor }} />
          <div className="absolute left-1 top-12 h-8 w-2 rounded-full bg-slate-800" />
          <div className="absolute right-1 top-12 h-8 w-2 rounded-full bg-slate-800" />
        </div>

        <PlayerFigure color={shooterColor} secondary={shooterSecondary} active={phase !== "choose" && phase !== "complete"} />

        <div
          className="absolute h-4 w-4 rounded-full border border-slate-300 bg-white shadow-[0_3px_10px_rgba(0,0,0,.55)] transition-all"
          style={{
            left: `${flightStarted ? targetLeft : 25}%`,
            top: `${flightStarted ? targetTop : 72}%`,
            transform: `translate(-50%,-50%) scale(${phase === "flight" ? 0.75 : flightStarted ? 0.58 : 1})`,
            transitionDuration: flightStarted ? "250ms" : "0ms",
            transitionTimingFunction: "cubic-bezier(.15,.72,.18,1)",
            opacity: shot && !shot.onTarget && phase === "result" ? 0.3 : 1,
          }}
        />

        <div className="absolute inset-x-0 bottom-4 text-center">
          {!winner && (
            <>
              <div className="text-sm font-black">
                {side === "player" ? currentShooter?.name : `${opponentName} taking`}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {phase === "choose"
                  ? side === "player"
                    ? "Choose one of the nine target zones"
                    : "Goalkeeper reading the run-up"
                  : phase === "result" && shot
                    ? shot.goal
                      ? "Goal"
                      : shot.saved
                        ? "Saved"
                        : "Missed"
                    : ""}
              </div>
            </>
          )}
        </div>

        {winner && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/72 px-5 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1320]/95 p-6 text-center shadow-2xl">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Shootout complete</div>
              <div className="mt-2 text-5xl font-black">{playerGoals}–{aiGoals}</div>
              <div className="mt-2 text-lg font-black" style={{ color: winner === "player" ? "#34d399" : "#fb7185" }}>
                {winner === "player" ? `${team.name} advance` : `${opponentName} advance`}
              </div>
              <button
                type="button"
                onClick={() => onComplete({ player: playerGoals, ai: aiGoals, winner })}
                className="mt-6 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white active:scale-[.98]"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KickDots({ label, results, active }: { label: string; results: boolean[]; active: boolean }) {
  const visibleCount = Math.max(5, results.length + (results.length >= 5 ? 1 : 0));
  return (
    <div className="min-w-0 flex-1 max-w-[230px]">
      <div className="mb-1 truncate text-center text-[9px] font-black uppercase tracking-wider" style={{ color: active ? "#67e8f9" : "#94a3b8" }}>{label}</div>
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: visibleCount }).map((_, index) => {
          const result = results[index];
          return (
            <div
              key={index}
              className="h-2.5 w-2.5 rounded-full border"
              style={{
                background: result === true ? "#34d399" : result === false ? "#fb7185" : "rgba(255,255,255,.08)",
                borderColor: result === true ? "#6ee7b7" : result === false ? "#fda4af" : "rgba(255,255,255,.16)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
