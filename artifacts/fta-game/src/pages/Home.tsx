import type { TeamConfig, LeagueState } from "../engine/types";
import { getLeagueStandings, getTeamPoints } from "../game/league";

interface Props {
  team: TeamConfig;
  league: LeagueState;
  onStartMatch: () => void;
  onGoToTeamSetup: () => void;
  onGoToCustomize: () => void;
}

const TIER_LABEL: Record<number, string> = { 1: "Elite", 2: "Mid", 3: "Easy" };
const TIER_COLOR: Record<number, string> = { 1: "#ff5252", 2: "#ffeb3b", 3: "#00e676" };

export default function Home({ team, league, onStartMatch, onGoToTeamSetup, onGoToCustomize }: Props) {
  const standings = getLeagueStandings(league.teams);
  const playerEntry = league.teams.find(t => t.id === "player_team")!;
  const playerRank = standings.findIndex(t => t.id === "player_team") + 1;
  const nextMatch = league.schedule[league.currentMatchIndex] ?? null;
  const isLeagueComplete = league.currentMatchIndex >= league.schedule.length;
  const totalMatches = league.schedule.length;
  const played = league.currentMatchIndex;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-3">
        <div className="flex items-center gap-3 mb-0.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${team.jerseyColor}33` }}
          >
            {team.crestIcon}
          </div>
          <div className="flex-1">
            <h1 className="text-white text-xl font-black tracking-tight leading-none">{team.name}</h1>
            <p className="text-gray-400 text-xs">Football Tactics Arena · League Season</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Rank</div>
            <div className="text-white font-black text-xl leading-none">#{playerRank}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Match {played + 1} of {totalMatches}</span>
            <span>{getTeamPoints(playerEntry)} pts</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(played / totalMatches) * 100}%`, background: "linear-gradient(90deg, #00e676, #00b4d8)" }}
            />
          </div>
        </div>

        {/* Next match card */}
        {nextMatch && !isLeagueComplete ? (
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">Next Match</div>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <div className="text-xl mb-0.5">{team.crestIcon}</div>
                <div className="text-white text-sm font-bold truncate">{team.name}</div>
              </div>
              <div className="text-gray-400 font-black text-lg">vs</div>
              <div className="flex-1 text-center">
                {(() => {
                  const opp = league.teams.find(t => t.id === nextMatch.opponentId);
                  const tier = opp?.tier ?? 2;
                  return (
                    <>
                      <div className="text-xl mb-0.5">🏟️</div>
                      <div className="text-white text-sm font-bold truncate">{nextMatch.opponentName}</div>
                      <div className="text-xs font-semibold mt-0.5" style={{ color: TIER_COLOR[tier] }}>
                        {TIER_LABEL[tier]}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <button
              onClick={onStartMatch}
              className="w-full mt-4 py-3.5 rounded-xl text-white font-black text-base tracking-wide transition-all active:scale-95 shadow-lg"
              style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
            >
              ▶ Kick Off
            </button>
          </div>
        ) : isLeagueComplete ? (
          <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)" }}>
            <div className="text-3xl mb-1">🏆</div>
            <div className="text-[#ffd700] font-black text-lg">Season Complete!</div>
            <div className="text-gray-400 text-sm mt-1">Final rank: #{playerRank} · {getTeamPoints(playerEntry)} pts</div>
          </div>
        ) : null}

        {/* League Table */}
        <div>
          <div className="text-white text-sm font-bold mb-2">League Table</div>
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-3 py-1.5 text-gray-500 text-[10px] font-semibold uppercase border-b border-white/5">
              <span>Club</span>
              <span className="text-right w-6">W</span>
              <span className="text-right w-6">D</span>
              <span className="text-right w-6">L</span>
              <span className="text-right w-8">Pts</span>
            </div>
            {standings.map((t, i) => {
              const isPlayer = t.id === "player_team";
              const isNext = nextMatch?.opponentId === t.id;
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-3 py-2 border-b border-white/5 last:border-0"
                  style={{
                    background: isPlayer
                      ? `${team.jerseyColor}18`
                      : isNext
                      ? "rgba(0,180,255,0.06)"
                      : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-600 text-[10px] w-3 flex-shrink-0">{i + 1}</span>
                    <span
                      className="text-xs font-semibold truncate"
                      style={{ color: isPlayer ? team.jerseyColor : isNext ? "#00b4d8" : "#d1d5db" }}
                    >
                      {isPlayer ? `${team.crestIcon} ${t.name}` : t.name}
                    </span>
                    {isNext && <span className="text-[9px] text-[#00b4d8] font-bold flex-shrink-0">NEXT</span>}
                  </div>
                  <span className="text-gray-300 text-xs text-right w-6">{t.won}</span>
                  <span className="text-gray-300 text-xs text-right w-6">{t.drawn}</span>
                  <span className="text-gray-300 text-xs text-right w-6">{t.lost}</span>
                  <span
                    className="text-xs font-bold text-right w-8"
                    style={{ color: isPlayer ? "#00e676" : "#d1d5db" }}
                  >
                    {getTeamPoints(t)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Your stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Played", value: playerEntry.played, color: "#9ca3af" },
            { label: "Won", value: playerEntry.won, color: "#00e676" },
            { label: "Draw", value: playerEntry.drawn, color: "#ffd700" },
            { label: "Lost", value: playerEntry.lost, color: "#ff5252" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-lg font-black leading-none" style={{ color: s.color }}>{s.value}</div>
              <div className="text-gray-500 text-[10px] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

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
