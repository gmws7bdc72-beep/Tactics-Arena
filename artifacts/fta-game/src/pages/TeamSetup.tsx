import { useState } from "react";
import type { TeamConfig, PlayerCard as PlayerCardType } from "../engine/types";
import { ALL_PLAYERS } from "../game/players";
import { FORMATIONS } from "../game/formations";
import PlayerCard from "../components/PlayerCard";
import { PITCH_WIDTH, PITCH_HEIGHT } from "../engine/constants";

interface Props {
  team: TeamConfig;
  onSave: (team: TeamConfig) => void;
  onBack: () => void;
}

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

  const availableForSlot = activeSlot !== null
    ? ALL_PLAYERS.filter(p => !currentTeam.players.some((cp, i) => cp.id === p.id && i !== activeSlot))
    : [];

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
            <p className="text-gray-400 text-xs mb-3">Tap a slot to change the player</p>

            {/* Current lineup */}
            <div className="space-y-2 mb-6">
              {currentTeam.players.map((p, i) => (
                <div
                  key={i}
                  onClick={() => setActiveSlot(activeSlot === i ? null : i)}
                  className={`rounded-xl p-3 cursor-pointer transition-all ${activeSlot === i ? "ring-2 ring-[#00e676]" : "ring-1 ring-white/10"}`}
                  style={{ background: activeSlot === i ? "rgba(0,230,118,0.06)" : "rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 w-12 flex-shrink-0">Slot {i + 1}</div>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: currentTeam.jerseyColor, color: currentTeam.secondaryColor }}
                    >
                      {p.jerseyNumber}
                    </div>
                    <div className="flex-1">
                      <div className="text-white text-sm font-semibold">{p.name}</div>
                      <div className="text-gray-400 text-xs">{p.role} · ⚡ {p.ability.replace(/_/g, " ")}</div>
                    </div>
                    <div className="text-xs text-right text-gray-400">
                      <div>ATK {p.stats.attack}</div>
                      <div>SPD {p.stats.speed}</div>
                    </div>
                    <div className="text-gray-400 text-xs">{activeSlot === i ? "▼" : "▶"}</div>
                  </div>

                  {activeSlot === i && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-gray-400 mb-2">Choose replacement:</p>
                      <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                        {availableForSlot.map(candidate => (
                          <button
                            key={candidate.id}
                            onClick={(e) => { e.stopPropagation(); swapPlayer(i, candidate); }}
                            className="flex items-center gap-3 p-2 rounded-lg text-left transition-all hover:bg-white/10"
                            style={{ background: "rgba(255,255,255,0.04)" }}
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: currentTeam.jerseyColor, color: currentTeam.secondaryColor }}
                            >
                              {candidate.jerseyNumber}
                            </div>
                            <div className="flex-1">
                              <div className="text-white text-xs font-semibold">{candidate.name}</div>
                              <div className="text-gray-400 text-[10px]">{candidate.role}</div>
                            </div>
                            <div className="text-xs text-gray-400">
                              {candidate.stats.attack}·{candidate.stats.defense}·{candidate.stats.speed}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: currentTeam.formationId === f.id ? "#00e676" : "rgba(255,255,255,0.1)",
                  }}
                >
                  <div className="relative w-full mb-2" style={{ paddingBottom: "60%" }}>
                    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}>
                      <rect width={PITCH_WIDTH} height={PITCH_HEIGHT} fill="#1a4a2e" rx="4" />
                      <line x1={PITCH_WIDTH / 2} y1={0} x2={PITCH_WIDTH / 2} y2={PITCH_HEIGHT} stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                      {f.positions.map((pos, i) => (
                        <g key={i}>
                          <circle cx={pos.x} cy={pos.y} r="28" fill={currentTeam.jerseyColor} opacity="0.9" />
                          <text x={pos.x} y={pos.y + 5} textAnchor="middle" fill={currentTeam.secondaryColor} fontSize="18" fontWeight="bold">
                            {currentTeam.players[i]?.jerseyNumber ?? i + 1}
                          </text>
                        </g>
                      ))}
                      <circle cx={PITCH_WIDTH * 0.85} cy={PITCH_HEIGHT / 2} r="16" fill="rgba(255,255,255,0.2)" />
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
