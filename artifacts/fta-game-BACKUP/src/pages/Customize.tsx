import { useState } from "react";
import type { TeamConfig } from "../engine/types";
import { JERSEY_COLORS, SECONDARY_COLORS, CREST_ICONS } from "../game/persistence";

interface Props {
  team: TeamConfig;
  onSave: (team: TeamConfig) => void;
  onBack: () => void;
}

export default function Customize({ team, onSave, onBack }: Props) {
  const [current, setCurrent] = useState<TeamConfig>({ ...team });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors text-lg">←</button>
        <h1 className="text-white text-lg font-bold">Customize</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
        {/* Preview */}
        <div
          className="rounded-2xl p-6 flex flex-col items-center gap-4"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-xl"
            style={{ background: `${current.jerseyColor}33`, border: `3px solid ${current.jerseyColor}` }}
          >
            {current.crestIcon}
          </div>
          <div
            className="w-12 h-14 rounded-lg flex items-center justify-center text-xl font-bold shadow-lg relative overflow-hidden"
            style={{ background: current.jerseyColor, color: current.secondaryColor }}
          >
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${current.secondaryColor}22, transparent)` }}
            />
            <span className="relative">7</span>
          </div>
          <div className="text-white font-black text-lg">{current.name}</div>
        </div>

        {/* Team name */}
        <div>
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-2">Team Name</label>
          <input
            type="text"
            value={current.name}
            maxLength={20}
            onChange={e => setCurrent(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl text-white text-sm font-semibold outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            placeholder="Your team name..."
          />
        </div>

        {/* Crest */}
        <div>
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-2">Crest</label>
          <div className="flex flex-wrap gap-2">
            {CREST_ICONS.map(icon => (
              <button
                key={icon}
                onClick={() => setCurrent(prev => ({ ...prev, crestIcon: icon }))}
                className="w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-all"
                style={{
                  background: current.crestIcon === icon ? "rgba(0,230,118,0.15)" : "rgba(255,255,255,0.06)",
                  border: `2px solid ${current.crestIcon === icon ? "#00e676" : "transparent"}`,
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Primary color */}
        <div>
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-2">Primary Color</label>
          <div className="flex flex-wrap gap-2">
            {JERSEY_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setCurrent(prev => ({ ...prev, jerseyColor: color }))}
                className="w-9 h-9 rounded-full transition-all"
                style={{
                  background: color,
                  border: `3px solid ${current.jerseyColor === color ? "#fff" : "transparent"}`,
                  transform: current.jerseyColor === color ? "scale(1.2)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Secondary color */}
        <div>
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-2">Secondary Color</label>
          <div className="flex flex-wrap gap-2">
            {SECONDARY_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setCurrent(prev => ({ ...prev, secondaryColor: color }))}
                className="w-9 h-9 rounded-full transition-all"
                style={{
                  background: color,
                  border: `3px solid ${current.secondaryColor === color ? "#00e676" : "rgba(255,255,255,0.2)"}`,
                  transform: current.secondaryColor === color ? "scale(1.2)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pb-6">
        <button
          onClick={() => onSave(current)}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
