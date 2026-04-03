import { useState } from "react";
import type { TeamConfig, ArenaProgress } from "../engine/types";
import ArenaDisplay from "../components/ArenaDisplay";
import PlayerCard from "../components/PlayerCard";
import { ABILITIES } from "../game/players";

interface Props {
  team: TeamConfig;
  progress: ArenaProgress;
  onStartMatch: () => void;
  onGoToTeamSetup: () => void;
  onGoToCustomize: () => void;
}

export default function Home({ team, progress, onStartMatch, onGoToTeamSetup, onGoToCustomize }: Props) {
  const totalGames = progress.wins + progress.losses;
  const winRate = totalGames > 0 ? Math.round((progress.wins / totalGames) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${team.jerseyColor}33` }}
          >
            {team.crestIcon}
          </div>
          <div>
            <h1 className="text-white text-xl font-black tracking-tight">{team.name}</h1>
            <p className="text-gray-400 text-xs">Football Tactics Arena</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">
        {/* Arena */}
        <ArenaDisplay
          arena={progress.arena}
          wins={progress.wins}
          losses={progress.losses}
          winsInArena={progress.winsInArena}
          lossesInArena={progress.lossesInArena}
        />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Wins", value: progress.wins, color: "#00e676" },
            { label: "Losses", value: progress.losses, color: "#ff5252" },
            { label: "Win Rate", value: `${winRate}%`, color: "#ffeb3b" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-gray-400 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Lineup preview */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white text-sm font-bold">Your Lineup</h2>
            <button onClick={onGoToTeamSetup} className="text-xs text-[#00b4d8] hover:text-white transition-colors">
              Edit Squad
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {team.players.slice(0, 4).map(p => (
              <PlayerCard key={p.id} card={p} jerseyColor={team.jerseyColor} secondaryColor={team.secondaryColor} compact />
            ))}
          </div>
        </div>

        {/* Play button */}
        <button
          onClick={onStartMatch}
          className="w-full py-4 rounded-2xl text-white font-black text-lg tracking-wide transition-all duration-200 active:scale-95 shadow-lg"
          style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
        >
          Find Match
        </button>

        {/* Navigation */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onGoToTeamSetup}
            className="py-3 rounded-xl text-white text-sm font-semibold transition-all hover:bg-white/10 active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Team Setup
          </button>
          <button
            onClick={onGoToCustomize}
            className="py-3 rounded-xl text-white text-sm font-semibold transition-all hover:bg-white/10 active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Customize
          </button>
        </div>
      </div>
    </div>
  );
}
