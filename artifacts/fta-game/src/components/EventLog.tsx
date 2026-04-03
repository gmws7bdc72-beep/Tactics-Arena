import type { GameEvent } from "../engine/types";
import { GameEventType } from "../engine/types";
import { useEffect, useRef } from "react";

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
};

const EVENT_COLORS: Partial<Record<GameEventType, string>> = {
  [GameEventType.GOAL]: "#ffd700",
  [GameEventType.TACKLE]: "#ff7043",
  [GameEventType.PASS_INTERCEPTED]: "#ff5252",
  [GameEventType.SHOT_ON_GOAL]: "#ff9800",
  [GameEventType.SHOT_BLOCKED]: "#ef9a9a",
  [GameEventType.SAVE]: "#64b5f6",
  [GameEventType.KICKOFF]: "#90caf9",
};

export default function EventLog({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const visible = events.slice(-20);

  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full pr-1">
      {visible.length === 0 && (
        <div className="text-gray-500 text-xs text-center py-4">Match events will appear here</div>
      )}
      {visible.map((evt, i) => (
        <div
          key={i}
          className="flex items-start gap-1.5 text-xs animate-in fade-in duration-200"
        >
          <span className="flex-shrink-0 w-4 text-center">
            {EVENT_ICONS[evt.type] ?? "·"}
          </span>
          <span style={{ color: EVENT_COLORS[evt.type] ?? "#9ca3af" }}>
            {evt.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
