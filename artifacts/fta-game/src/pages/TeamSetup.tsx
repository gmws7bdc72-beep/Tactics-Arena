import { useState } from "react";
import type { TeamConfig, PlayerCard as PlayerCardType } from "../engine/types";
import { ALL_PLAYERS } from "../game/players";
import { FORMATIONS } from "../game/formations";
import { PITCH_WIDTH, PITCH_HEIGHT } from "../engine/constants";

interface Props {
  team: TeamConfig;
  onSave: (team: TeamConfig) => void;
  onBack: () => void;
}

const SLOT_LABELS = ["GK", "DEF", "MID", "FWD", "FWD"];

export default function TeamSetup({ team, onSave, onBack }: Props) {
  const [currentTeam, setCurrentTeam] = useState<TeamConfig>({ ...team, players: [...team.players] });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<"lineup" | "formation">("lineup");

  const selectFormation = (formationId: string) => {
    const f = FORMATIONS.find(f => f.id === formationId);
    if (!f) return;
    setCurrentTeam(prev => ({
      ...prev,
      formationId: f.id,
      startPositions: f.positions.map(p => ({ ...p })),
    }));
  };

  const swapPlayer = (slotIndex: number, newCard: PlayerCardType) => {
    const newPlayers = [...currentTeam.players];
    newPlayers[slotIndex] = newCard;
    setCurrentTeam(prev => ({ ...prev, players: newPlayers }));
    setActiveSlot(null);
  };

  const renamePlayer = (slotIndex: number, newName: string) => {
    setCurrentTeam(prev => ({
      ...prev,
      players: prev.players.map((p, i) => i === slotIndex ? { ...p, name: newName } : p),
    }));
  };

  const getAvailableForSlot = (slotIndex: number) => {
    const pool = slotIndex === 0
      ? ALL_PLAYERS.filter(p => p.role === "goalkeeper")
      : ALL_PLAYERS.filter(p => p.role !== "goalkeeper");
    return pool.filter(p => !currentTeam.players.some((cp, i) => cp.id === p.id && i !== slotIndex));
  };

  const availableForSlot = activeSlot !== null ? getAvailableForSlot(activeSlot) : [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors text-lg">←</button>
        <h1 className="text-white text-lg font-bold">Team Setup</h1>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-2 mb-4">
        {(["lineup", "formation"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize"
            style={{
              background: tab === t ? "rgba(0,230,118,0.15)" : "rgba(255,255,255,0.06)",
              color: tab === t ? "#00e676" : "#9ca3af",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {tab === "lineup" && (
          <div>
            <p className="text-gray-400 text-xs mb-3">
              Tap a slot to change the player · Slot 1 is Goalkeeper only
            </p>

            {/* Current lineup — 5 slots */}
            <div className="space-y-2 mb-6">
              {currentTeam.players.slice(0, 5).map((p, i) => {
                const slotLabel = SLOT_LABELS[i] ?? `#${i + 1}`;
                const isGKSlot = i === 0;
                return (
                  <div
                    key={i}
                    onClick={() => setActiveSlot(activeSlot === i ? null : i)}
                    className="rounded-xl p-3 cursor-pointer transition-all"
                    style={{
                      background: activeSlot === i ? "rgba(0,230,118,0.06)" : "rgba(255,255,255,0.04)",
                      outline: activeSlot === i ? "2px solid #00e676" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center flex-shrink-0 w-10">
                        <div className="text-xs font-bold" style={{ color: isGKSlot ? "#ffd700" : "#6b7280" }}>{slotLabel}</div>
                      </div>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{
                          background: currentTeam.jerseyColor,
                          color: currentTeam.secondaryColor,
                          outline: isGKSlot ? "2px solid #ffd700" : "none",
                        }}
                      >
                        {p.jerseyNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={p.name}
                          onChange={e => renamePlayer(i, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          maxLength={16}
                          className="bg-transparent text-white text-sm font-semibold w-full outline-none border-b border-transparent focus:border-white/30 transition-colors"
                          placeholder="Player name"
                        />
                        <div className="text-gray-400 text-xs truncate">⚡ {p.ability.replace(/_/g, " ")}</div>
                      </div>
                      <div className="text-xs text-right text-gray-400 flex-shrink-0">
                        <div>ATK {p.stats.attack}</div>
                        <div>DEF {p.stats.defense}</div>
                      </div>
                      <div className="text-gray-400 text-xs">{activeSlot === i ? "▼" : "▶"}</div>
                    </div>

                    {activeSlot === i && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-gray-400 mb-2">
                          {isGKSlot ? "🧤 Goalkeepers only:" : "Choose replacement:"}
                        </p>
                        {availableForSlot.length === 0 ? (
                          <div className="text-gray-600 text-xs italic">No other {isGKSlot ? "goalkeepers" : "players"} available</div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                            {availableForSlot.map(candidate => (
                              <button
                                key={candidate.id}
                                onClick={(e) => { e.stopPropagation(); swapPlayer(i, candidate); }}
                                className="flex items-center gap-3 p-2 rounded-lg text-left transition-all hover:bg-white/10"
                                style={{ background: "rgba(255,255,255,0.04)" }}
                              >
                                <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                  style={{ background: currentTeam.jerseyColor, color: currentTeam.secondaryColor }}
                                >
                                  {candidate.jerseyNumber}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-white text-xs font-semibold truncate">{candidate.name}</div>
                                  <div className="text-gray-400 text-[10px] truncate">{candidate.role} · {candidate.ability.replace(/_/g, " ")}</div>
                                </div>
                                <div className="text-xs text-gray-400 flex-shrink-0">
                                  {candidate.stats.attack}·{candidate.stats.defense}·{candidate.stats.luck}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl text-xs text-gray-500" style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.12)" }}>
              🧤 The GK slot is locked to goalkeeper cards. Use the formation tab to change team shape.
            </div>
          </div>
        )}

        {tab === "formation" && (
          <div>
            <p className="text-gray-400 text-xs mb-4">Choose your starting formation</p>
            <div className="grid grid-cols-2 gap-3">
              {FORMATIONS.map(f => (
                <button
                  key={f.id}
                  onClick={() => selectFormation(f.id)}
                  className="rounded-xl p-4 transition-all"
                  style={{
                    background: currentTeam.formationId === f.id ? "rgba(0,230,118,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${currentTeam.formationId === f.id ? "#00e676" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  <div className="relative w-full mb-2" style={{ paddingBottom: "60%" }}>
                    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}>
                      <rect width={PITCH_WIDTH} height={PITCH_HEIGHT} fill="#1a4a2e" rx="4" />
                      <line x1={PITCH_WIDTH / 2} y1={0} x2={PITCH_WIDTH / 2} y2={PITCH_HEIGHT} stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                      {f.positions.map((pos, i) => (
                        <g key={i}>
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={i === 0 ? 32 : 24}
                            fill={currentTeam.jerseyColor}
                            opacity="0.9"
                            stroke={i === 0 ? "#ffd700" : "none"}
                            strokeWidth={i === 0 ? 3 : 0}
                          />
                          <text x={pos.x} y={pos.y + 5} textAnchor="middle" fill={currentTeam.secondaryColor} fontSize="18" fontWeight="bold">
                            {currentTeam.players[i]?.jerseyNumber ?? i + 1}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                  <div className="text-sm font-bold" style={{ color: currentTeam.formationId === f.id ? "#00e676" : "#9ca3af" }}>
                    {f.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-6">
        <button
          onClick={() => onSave(currentTeam)}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
        >
          Save Team
        </button>
      </div>
    </div>
  );
}
