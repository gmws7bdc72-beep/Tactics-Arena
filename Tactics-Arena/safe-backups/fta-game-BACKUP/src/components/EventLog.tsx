import type { GameEvent } from "../engine/types";
import { GameEventType } from "../engine/types";
import { getCommentary } from "../engine/commentary";
import { useEffect, useRef, useState } from "react";

interface Props {
  events: GameEvent[];
}

const EVENT_ICONS: Partial<Record<GameEventType, string>> = {
  [GameEventType.GOAL]: "⚽",
  [GameEventType.PASS_COMPLETE]: "→",
  [GameEventType.PASS_INTERCEPTED]: "✂",
  [GameEventType.TACKLE]: "⚡",
  [GameEventType.LOOSE_BALL]: "·",
  [GameEventType.SHOT_ON_GOAL]: "🎯",
  [GameEventType.SHOT_BLOCKED]: "🛡",
  [GameEventType.SAVE]: "🧤",
  [GameEventType.KICKOFF]: "►",
  [GameEventType.OFFSIDE]: "🚩",
  [GameEventType.DRIBBLE]: "⚽",
};

const EVENT_COLORS: Partial<Record<GameEventType, string>> = {
  [GameEventType.GOAL]: "#ffd700",
  [GameEventType.TACKLE]: "#ff7043",
  [GameEventType.PASS_INTERCEPTED]: "#ff5252",
  [GameEventType.SHOT_ON_GOAL]: "#ff9800",
  [GameEventType.SHOT_BLOCKED]: "#ef9a9a",
  [GameEventType.SAVE]: "#64b5f6",
  [GameEventType.KICKOFF]: "#90caf9",
  [GameEventType.OFFSIDE]: "#ce93d8",
  [GameEventType.DRIBBLE]: "#a5d6a7",
  [GameEventType.PASS_COMPLETE]: "#80cbc4",
};

const HIGH_PRIORITY = new Set([
  GameEventType.GOAL,
  GameEventType.SAVE,
  GameEventType.SHOT_ON_GOAL,
  GameEventType.SHOT_BLOCKED,
  GameEventType.TACKLE,
  GameEventType.PASS_INTERCEPTED,
  GameEventType.OFFSIDE,
]);

const TICKER_MS = 1400;

/** Given a batch of new events, pick the ones worth showing (dedup noisy types). */
function filterBatch(batch: GameEvent[]): GameEvent[] {
  const hasHighPriority = batch.some(e => HIGH_PRIORITY.has(e.type));
  if (hasHighPriority) {
    // Only show high-priority events — skip dribbles and plain passes
    return batch.filter(e => HIGH_PRIORITY.has(e.type) || e.type === GameEventType.PASS_COMPLETE);
  }
  // Low-priority batch: show at most one PASS_COMPLETE and one DRIBBLE
  const result: GameEvent[] = [];
  let passAdded = false;
  let dribbleAdded = false;
  for (const e of batch) {
    if (e.type === GameEventType.PASS_COMPLETE && !passAdded) { result.push(e); passAdded = true; }
    else if (e.type === GameEventType.DRIBBLE && !dribbleAdded) { result.push(e); dribbleAdded = true; }
    else if (e.type === GameEventType.KICKOFF) result.push(e);
  }
  return result;
}

export default function EventLog({ events }: Props) {
  // Queue of events waiting to be displayed
  const queueRef = useRef<GameEvent[]>([]);
  const prevLenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Current displayed event + recent history (max 3)
  const [current, setCurrent] = useState<GameEvent | null>(null);
  const [history, setHistory] = useState<GameEvent[]>([]);

  const advance = () => {
    if (queueRef.current.length === 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const next = queueRef.current.shift()!;
    setCurrent(next);
    setHistory(prev => [next, ...prev].slice(0, 3));
  };

  useEffect(() => {
    const newCount = events.length - prevLenRef.current;
    if (newCount <= 0) return;

    const batch = events.slice(prevLenRef.current);
    prevLenRef.current = events.length;

    const filtered = filterBatch(batch);
    if (filtered.length === 0) return;

    queueRef.current.push(...filtered);

    // Start ticker if not already running
    if (!timerRef.current) {
      advance(); // show first immediately
      timerRef.current = setInterval(advance, TICKER_MS);
    }
  }, [events.length]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  if (!current) return null;

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Current event — prominent */}
      <div
        key={current.tick + current.type + current.playerId}
        className="px-3 py-1.5 rounded-lg"
        style={{
          background: HIGH_PRIORITY.has(current.type)
            ? "rgba(0,0,0,0.72)"
            : "rgba(0,0,0,0.55)",
          borderLeft: `2px solid ${EVENT_COLORS[current.type] ?? "#374151"}`,
          backdropFilter: "blur(4px)",
        }}
      >
        <span className="mr-1.5">{EVENT_ICONS[current.type] ?? "·"}</span>
        <span
          className="text-xs font-semibold"
          style={{ color: EVENT_COLORS[current.type] ?? "#d1d5db" }}
        >
          {getCommentary(current)}
        </span>
      </div>

      {/* Last 2 history items — muted */}
      {history.slice(1, 3).map((evt, i) => (
        <div
          key={i}
          className="flex items-center gap-1 px-3 text-[10px] leading-tight opacity-40"
        >
          <span className="w-3 text-center">{EVENT_ICONS[evt.type] ?? "·"}</span>
          <span style={{ color: EVENT_COLORS[evt.type] ?? "#6b7280" }}>
            {getCommentary(evt)}
          </span>
        </div>
      ))}
    </div>
  );
}
