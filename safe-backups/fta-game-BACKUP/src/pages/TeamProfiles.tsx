import { useMemo, useState } from "react";
import type { PlayerCard, PlayerStats, TeamConfig, TeamTactic } from "../engine/types";
import { AI_TEAMS, TEAM_TACTICS } from "../game/league";
import { STAT_LABELS } from "../game/players";

interface Props {
  playerTeam: TeamConfig;
  onBack: () => void;
}

type ProfileTeam = {
  id: string;
  name: string;
  crestIcon: string;
  jerseyColor: string;
  secondaryColor: string;
  formationId: string;
  players: PlayerCard[];
  tactic: TeamTactic;
  isPlayer?: boolean;
};

const PLAYER_TACTIC: TeamTactic = {
  ...TEAM_TACTICS.balanced_build_up,
  name: "Custom Player Tactic",
  description: "Your lineup uses your own manual commands. Player stats still control speed, duels, passing, shooting, and ball control.",
};

function statValue(stats: PlayerStats, key: keyof PlayerStats): number {
  const value = stats[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;

  switch (key) {
    case "shooting": return stats.attack;
    case "dribbling": return Math.round((stats.attack + stats.speed) / 2);
    case "tackling": return stats.defense;
    case "marking": return stats.defense;
    case "stamina": return Math.round((stats.speed + stats.defense) / 2);
    case "strength": return Math.round((stats.attack + stats.defense) / 2);
    case "vision": return stats.passing;
    case "longPassing": return stats.passing;
    case "aerial": return Math.round((stats.attack + stats.defense) / 2);
    default: return 5;
  }
}

function overall(player: PlayerCard): number {
  const keys: (keyof PlayerStats)[] = ["attack", "defense", "passing", "speed", "shooting", "dribbling", "tackling", "marking", "vision", "longPassing", "aerial"];
  return Math.round(keys.reduce((sum, key) => sum + statValue(player.stats, key), 0) / keys.length);
}

function tacticBar(label: string, value: number, color: string) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
        <span>{label}</span>
        <span>{value}/10</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${value * 10}%`, background: color }} />
      </div>
    </div>
  );
}

export default function TeamProfiles({ playerTeam, onBack }: Props) {
  const teams = useMemo<ProfileTeam[]>(() => [
    {
      id: "player_team",
      name: playerTeam.name,
      crestIcon: playerTeam.crestIcon,
      jerseyColor: playerTeam.jerseyColor,
      secondaryColor: playerTeam.secondaryColor,
      formationId: playerTeam.formationId,
      players: playerTeam.players,
      tactic: PLAYER_TACTIC,
      isPlayer: true,
    },
    ...AI_TEAMS.map((team) => ({
      id: team.id,
      name: team.name,
      crestIcon: team.crestIcon,
      jerseyColor: team.jerseyColor,
      secondaryColor: team.secondaryColor,
      formationId: team.formationId,
      players: team.players,
      tactic: team.tactic,
    })),
  ], [playerTeam]);

  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "player_team");
  const selected = teams.find((team) => team.id === selectedId) ?? teams[0];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors text-lg">←</button>
        <div>
          <h1 className="text-white text-lg font-black">Team Profiles</h1>
          <p className="text-gray-500 text-xs">Every team, tactic, position, and player stat</p>
        </div>
      </div>

      <div className="px-4 pb-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedId(team.id)}
              className="px-3 py-2 rounded-xl text-left transition-all min-w-32"
              style={{
                background: selected.id === team.id ? `${team.jerseyColor}24` : "rgba(255,255,255,0.05)",
                border: `1px solid ${selected.id === team.id ? team.jerseyColor : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div className="text-lg">{team.crestIcon}</div>
              <div className="text-white text-xs font-bold truncate">{team.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{team.tactic.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${selected.jerseyColor}55` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${selected.jerseyColor}33` }}>
              {selected.crestIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-black text-lg truncate">{selected.name}</div>
              <div className="text-gray-400 text-xs">Formation {selected.formationId} · {selected.isPlayer ? "Manual controls" : "AI programmed tactic"}</div>
            </div>
          </div>

          <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-xs font-black mb-1" style={{ color: selected.jerseyColor }}>{selected.tactic.name}</div>
            <p className="text-gray-400 text-xs leading-relaxed">{selected.tactic.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {tacticBar("Tempo", selected.tactic.tempo, selected.jerseyColor)}
            {tacticBar("Risk", selected.tactic.risk, "#ff9800")}
            {tacticBar("Press", selected.tactic.pressIntensity, "#ef4444")}
            {tacticBar("Long Ball", selected.tactic.longBallFrequency, "#ffeb3b")}
          </div>
        </div>

        <div className="space-y-3">
          {selected.players.slice(0, 5).map((player) => (
            <div
              key={player.id}
              className="rounded-2xl p-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                  style={{ background: selected.jerseyColor, color: selected.secondaryColor, outline: player.role === "goalkeeper" ? "2px solid #ffd700" : "none" }}
                >
                  {player.jerseyNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-black truncate">{player.name}</div>
                  <div className="text-gray-400 text-[11px] capitalize">{player.role} · {player.ability.replace(/_/g, " ")}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">OVR</div>
                  <div className="text-xl font-black" style={{ color: selected.jerseyColor }}>{overall(player)}</div>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {STAT_LABELS.map(({ key, label }) => {
                  const value = statValue(player.stats, key);
                  return (
                    <div key={key} className="rounded-lg px-1 py-1 text-center" style={{ background: "rgba(0,0,0,0.24)" }}>
                      <div className="text-[9px] text-gray-500 leading-none">{label}</div>
                      <div className="text-[12px] text-white font-bold leading-tight mt-0.5">{value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-xl text-xs text-gray-500" style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.12)" }}>
          🧱 AI teams now keep one rest defender behind the play. Long-ball teams launch aerial passes that cannot be intercepted like floor passes until the ball drops.
        </div>
      </div>
    </div>
  );
}
