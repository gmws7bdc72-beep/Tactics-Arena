interface Props {
  arena: string;
  wins: number;
  losses: number;
  winsInArena: number;
  lossesInArena: number;
  compact?: boolean;
}

const ARENA_CONFIG: Record<string, { label: string; color: string; gradient: string; icon: string }> = {
  bronze: { label: "Bronze Arena", color: "#cd7f32", gradient: "from-[#cd7f32] to-[#8b4513]", icon: "🥉" },
  silver: { label: "Silver Arena", color: "#c0c0c0", gradient: "from-[#c0c0c0] to-[#808080]", icon: "🥈" },
  gold: { label: "Gold Arena", color: "#ffd700", gradient: "from-[#ffd700] to-[#b8860b]", icon: "🥇" },
  elite: { label: "Elite Arena", color: "#a855f7", gradient: "from-[#a855f7] to-[#7c3aed]", icon: "👑" },
};

export default function ArenaDisplay({ arena, wins, losses, winsInArena, lossesInArena, compact }: Props) {
  const config = ARENA_CONFIG[arena] ?? ARENA_CONFIG.bronze;
  const winsNeeded = 3;
  const maxWins = winsNeeded;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg">{config.icon}</span>
        <div>
          <div className="text-xs font-bold" style={{ color: config.color }}>{config.label}</div>
          <div className="text-xs text-gray-400">{wins}W / {losses}L</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center text-2xl shadow-lg`}>
          {config.icon}
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: config.color }}>{config.label}</div>
          <div className="text-gray-400 text-xs">{wins}W / {losses}L overall</div>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progress</span>
          <span>{winsInArena}/{winsNeeded} wins to advance</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: maxWins }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-2 rounded-full transition-all duration-300"
              style={{ background: i < winsInArena ? config.color : "rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>
      </div>

      {lossesInArena > 0 && (
        <div className="text-xs text-gray-500">
          {lossesInArena} loss{lossesInArena !== 1 ? "es" : ""} in this arena — 3 losses relegates
        </div>
      )}
    </div>
  );
}
