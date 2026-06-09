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

const HIGHLIGHT_TYPES = new Set([
  GameEventType.GOAL,
  GameEventType.SAVE,
  GameEventType.SHOT_ON_GOAL,
  GameEventType.TACKLE,
  GameEventType.PASS_INTERCEPTED,
]);

export default function EventLog({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [prevLen, setPrevLen] = useState(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (events.length > prevLen) {
      setNewCount(events.length - prevLen);
      setPrevLen(events.length);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="text-gray-600 text-[11px] text-center py-1 italic">
        Commentary will appear here…
      </div>
    );
  }

  const visible = events.slice(-30);
  const lastEvent = visible[visible.length - 1];

  return (
    <div className="flex flex-col gap-0 w-full">
      {/* Latest action — prominent ticker */}
      {lastEvent && (
        <div
          key={events.length}
          className="px-3 py-1.5 rounded-lg mb-1 animate-in fade-in slide-in-from-bottom-1 duration-300"
          style={{
            background: HIGHLIGHT_TYPES.has(lastEvent.type)
              ? "rgba(255,255,255,0.07)"
              : "rgba(255,255,255,0.04)",
            borderLeft: `2px solid ${EVENT_COLORS[lastEvent.type] ?? "#374151"}`,
          }}
        >
          <span className="mr-1.5 text-sm">{EVENT_ICONS[lastEvent.type] ?? "·"}</span>
          <span
            className="text-xs font-semibold"
            style={{ color: EVENT_COLORS[lastEvent.type] ?? "#d1d5db" }}
          >
            {getCommentary(lastEvent)}
          </span>
        </div>
      )}

      {/* Scrollable history — last few events, muted */}
      <div className="flex flex-col gap-0.5 overflow-y-auto max-h-14 pr-1">
        {visible.slice(0, -1).slice(-10).map((evt, i) => (
          <div
            key={i}
            className="flex items-center gap-1 text-[10px] leading-tight opacity-50"
          >
            <span className="flex-shrink-0 w-3 text-center text-[9px]">
              {EVENT_ICONS[evt.type] ?? "·"}
            </span>
            <span style={{ color: EVENT_COLORS[evt.type] ?? "#6b7280" }}>
              {getCommentary(evt)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
