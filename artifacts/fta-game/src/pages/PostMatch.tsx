import type { GameEvent, ArenaProgress } from "../engine/types";
import { GameEventType } from "../engine/types";
import type { TeamConfig } from "../engine/types";
import ArenaDisplay from "../components/ArenaDisplay";

interface Props {
  playerScore: number;
  aiScore: number;
  events: GameEvent[];
  team: TeamConfig;
  oldProgress: ArenaProgress;
  newProgress: ArenaProgress;
  onRematch: () => void;
  onHome: () => void;
}

const ARENA_ORDER = ["bronze", "silver", "gold", "elite"];

export default function PostMatch({ playerScore, aiScore, events, team, oldProgress, newProgress, onRematch, onHome }: Props) {
  const won = playerScore > aiScore;
  const draw = playerScore === aiScore;

  const promoted = ARENA_ORDER.indexOf(newProgress.arena) > ARENA_ORDER.indexOf(oldProgress.arena);
  const relegated = ARENA_ORDER.indexOf(newProgress.arena) < ARENA_ORDER.indexOf(oldProgress.arena);

  const keyEvents = events.filter(e =>
    e.type === GameEventType.GOAL || e.type === GameEventType.TACKLE || e.type === GameEventType.SHOT_ON_GOAL
  ).slice(0, 8);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      {/* Result banner */}
      <div
        className="px-6 py-8 text-center"
        style={{
          background: won
            ? "linear-gradient(135deg, rgba(0,230,118,0.15), rgba(0,178,136,0.08))"
            : draw
            ? "linear-gradient(135deg, rgba(255,235,59,0.15), rgba(255,152,0,0.08))"
            : "linear-gradient(135deg, rgba(255,82,82,0.15), rgba(211,47,47,0.08))",
        }}
      >
        <div className="text-5xl mb-2">
          {won ? "🏆" : draw ? "🤝" : "💀"}
        </div>
        <div
          className="text-3xl font-black mb-1"
          style={{ color: won ? "#00e676" : draw ? "#ffd700" : "#ff5252" }}
        >
          {won ? "Victory!" : draw ? "Draw" : "Defeat"}
        </div>
        <div className="text-gray-300 text-2xl font-bold">
          {playerScore} — {aiScore}
        </div>
        <div className="text-gray-400 text-sm mt-1">{team.name} vs Opponent</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Promotion / Relegation */}
        {promoted && (
          <div className="rounded-xl p-4 text-center" style={{ background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.3)" }}>
            <div className="text-[#00e676] font-bold text-sm">Arena Promotion!</div>
            <div className="text-gray-300 text-xs mt-1">You've advanced to {newProgress.arena.charAt(0).toUpperCase() + newProgress.arena.slice(1)} Arena</div>
          </div>
        )}
        {relegated && (
          <div className="rounded-xl p-4 text-center" style={{ background: "rgba(255,82,82,0.1)", border: "1px solid rgba(255,82,82,0.3)" }}>
            <div className="text-[#ff5252] font-bold text-sm">Arena Relegation</div>
            <div className="text-gray-300 text-xs mt-1">Dropped to {newProgress.arena.charAt(0).toUpperCase() + newProgress.arena.slice(1)} Arena</div>
          </div>
        )}

        {/* Arena status */}
        <ArenaDisplay
          arena={newProgress.arena}
          wins={newProgress.wins}
          losses={newProgress.losses}
          winsInArena={newProgress.winsInArena}
          lossesInArena={newProgress.lossesInArena}
        />

        {/* Key moments */}
        {keyEvents.length > 0 && (
          <div>
            <h3 className="text-white text-sm font-bold mb-2">Key Moments</h3>
            <div className="space-y-1.5">
              {keyEvents.map((evt, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <span className="text-base">
                    {evt.type === GameEventType.GOAL ? "⚽" :
                     evt.type === GameEventType.TACKLE ? "⚡" : "🎯"}
                  </span>
                  <span className="text-gray-300 text-xs">{evt.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div>
          <h3 className="text-white text-sm font-bold mb-2">Match Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Goals",
                player: events.filter(e => e.type === GameEventType.GOAL && e.teamId === "player").length,
                ai: events.filter(e => e.type === GameEventType.GOAL && e.teamId === "ai").length,
              },
              {
                label: "Shots",
                player: events.filter(e => e.type === GameEventType.SHOT_ON_GOAL && e.teamId === "player").length,
                ai: events.filter(e => e.type === GameEventType.SHOT_ON_GOAL && e.teamId === "ai").length,
              },
              {
                label: "Tackles",
                player: events.filter(e => e.type === GameEventType.TACKLE && e.teamId === "player").length,
                ai: events.filter(e => e.type === GameEventType.TACKLE && e.teamId === "ai").length,
              },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="text-gray-400 text-xs mb-2">{stat.label}</div>
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold text-sm">{stat.player}</span>
                  <span className="text-gray-500 text-xs">You vs AI</span>
                  <span className="text-gray-400 font-bold text-sm">{stat.ai}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-6 space-y-3">
        <button
          onClick={onRematch}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
        >
          Next Match
        </button>
        <button
          onClick={onHome}
          className="w-full py-3 rounded-2xl text-gray-300 font-semibold text-sm transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
