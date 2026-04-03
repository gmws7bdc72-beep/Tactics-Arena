import type { PlayerCard } from "../engine/types";
import { ABILITIES } from "../game/players";

interface Props {
  card: PlayerCard;
  jerseyColor?: string;
  secondaryColor?: string;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  striker: "#ff5252",
  forward: "#ff9800",
  midfielder: "#29b6f6",
  defender: "#66bb6a",
};

const STAT_COLOR = (val: number) => {
  if (val >= 8) return "#00e676";
  if (val >= 6) return "#ffeb3b";
  return "#ff7043";
};

export default function PlayerCard({ card, jerseyColor = "#00b4d8", secondaryColor = "#fff", selected, onClick, compact }: Props) {
  const ability = ABILITIES[card.ability];

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`relative rounded-lg cursor-pointer transition-all duration-200 p-2 ${selected ? "ring-2 ring-[#00e676]" : "ring-1 ring-white/10"}`}
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: jerseyColor, color: secondaryColor }}
          >
            {card.jerseyNumber}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{card.name}</div>
            <div className="text-xs" style={{ color: ROLE_COLORS[card.role] ?? "#888" }}>{card.role}</div>
          </div>
          <div className="text-xs text-right">
            <div style={{ color: STAT_COLOR(card.stats.attack) }}>ATK {card.stats.attack}</div>
            <div style={{ color: STAT_COLOR(card.stats.defense) }}>DEF {card.stats.defense}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${selected ? "ring-2 ring-[#00e676] scale-105" : "ring-1 ring-white/10 hover:ring-white/30"}`}
      style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))" }}
    >
      <div className="h-16 relative" style={{ background: `linear-gradient(135deg, ${jerseyColor}cc, ${jerseyColor}44)` }}>
        <div
          className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: ROLE_COLORS[card.role] ?? "#888", color: "#fff" }}
        >
          {card.role.toUpperCase()}
        </div>
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg border-2"
          style={{ background: jerseyColor, color: secondaryColor, borderColor: secondaryColor }}
        >
          {card.jerseyNumber}
        </div>
      </div>

      <div className="pt-6 pb-3 px-3">
        <div className="text-white text-sm font-bold text-center mb-2">{card.name}</div>

        <div className="grid grid-cols-2 gap-1 mb-2">
          {(["attack", "defense", "luck"] as const).map(stat => (
            <div key={stat} className="flex items-center gap-1">
              <span className="text-gray-400 text-[10px] uppercase w-8 flex-shrink-0">{stat.slice(0, 3)}</span>
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${card.stats[stat] * 10}%`, background: STAT_COLOR(card.stats[stat]) }}
                />
              </div>
              <span className="text-[10px] font-bold" style={{ color: STAT_COLOR(card.stats[stat]) }}>
                {card.stats[stat]}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-yellow-300 font-medium">
            ⚡ {ability.name}
          </span>
        </div>
      </div>
    </div>
  );
}
