import type { GameEvent, LeagueState, TeamConfig } from "../engine/types";
import { GameEventType } from "../engine/types";
import { getLeagueStandings, getTeamPoints } from "../game/league";

interface Props {
  playerScore: number;
  aiScore: number;
  events: GameEvent[];
  team: TeamConfig;
  opponentName: string;
  league: LeagueState;
  isLeagueComplete: boolean;
  onNextMatch: () => void;
  onHome: () => void;
  onNewSeason: () => void;
}

export default function PostMatch({
  playerScore,
  aiScore,
  events,
  team,
  opponentName,
  league,
  isLeagueComplete,
  onNextMatch,
  onHome,
  onNewSeason,
}: Props) {
  const won = playerScore > aiScore;
  const draw = playerScore === aiScore;

  const playerEntry = league.teams.find(t => t.id === "player_team")!;
  const standings = getLeagueStandings(league.teams);
  const playerRank = standings.findIndex(t => t.id === "player_team") + 1;

  const keyEvents = events.filter(e =>
    e.type === GameEventType.GOAL ||
    e.type === GameEventType.SAVE ||
    e.type === GameEventType.SHOT_ON_GOAL
  ).slice(0, 6);

  const resultColor = won ? "#00e676" : draw ? "#ffd700" : "#ff5252";
  const resultBg = won
    ? "linear-gradient(135deg, rgba(0,230,118,0.15), rgba(0,178,136,0.08))"
    : draw
    ? "linear-gradient(135deg, rgba(255,235,59,0.15), rgba(255,152,0,0.08))"
    : "linear-gradient(135deg, rgba(255,82,82,0.15), rgba(211,47,47,0.08))";

  const pointsGained = won ? 3 : draw ? 1 : 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      {/* Result banner */}
      <div className="px-6 py-6 text-center" style={{ background: resultBg }}>
        <div className="text-4xl mb-1.5">{won ? "🏆" : draw ? "🤝" : "💀"}</div>
        <div className="text-3xl font-black mb-0.5" style={{ color: resultColor }}>
          {won ? "Victory!" : draw ? "Draw" : "Defeat"}
        </div>
        <div className="text-gray-300 text-2xl font-bold">{playerScore} — {aiScore}</div>
        <div className="text-gray-500 text-xs mt-1">{team.name} vs {opponentName}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
          style={{ background: "rgba(255,255,255,0.06)", color: resultColor }}>
          {pointsGained > 0 ? `+${pointsGained} pts` : "0 pts"} · #{playerRank} in table
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* League complete banner */}
        {isLeagueComplete && (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)" }}
          >
            <div className="text-2xl mb-1">🏆</div>
            <div className="text-[#ffd700] font-black text-base">League Season Complete!</div>
            <div className="text-gray-400 text-sm mt-1">
              Final: #{playerRank} · {getTeamPoints(playerEntry)} points
            </div>
          </div>
        )}

        {/* League standings (top 5) */}
        <div>
          <div className="text-white text-sm font-bold mb-2">League Standings</div>
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {standings.slice(0, 6).map((t, i) => {
              const isPlayer = t.id === "player_team";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-2 border-b border-white/5 last:border-0"
                  style={{ background: isPlayer ? `${team.jerseyColor}18` : "transparent" }}
                >
                  <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                  <span
                    className="flex-1 text-xs font-semibold truncate"
                    style={{ color: isPlayer ? team.jerseyColor : "#d1d5db" }}
                  >
                    {isPlayer ? `${team.crestIcon} ${t.name}` : t.name}
                  </span>
                  <span className="text-gray-500 text-[10px]">{t.won}W {t.drawn}D {t.lost}L</span>
                  <span className="text-xs font-bold w-8 text-right" style={{ color: isPlayer ? "#00e676" : "#d1d5db" }}>
                    {getTeamPoints(t)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Key moments */}
        {keyEvents.length > 0 && (
          <div>
            <div className="text-white text-sm font-bold mb-2">Key Moments</div>
            <div className="space-y-1.5">
              {keyEvents.map((evt, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <span className="text-base">
                    {evt.type === GameEventType.GOAL ? "⚽"
                     : evt.type === GameEventType.SAVE ? "🧤"
                     : "🎯"}
                  </span>
                  <span className="text-gray-300 text-xs">{evt.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Match stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "Goals",
              player: events.filter(e => e.type === GameEventType.GOAL && e.teamId === "player").length,
              ai: events.filter(e => e.type === GameEventType.GOAL && e.teamId === "ai").length,
            },
            {
              label: "Shots",
              player: events.filter(e => e.type === GameEventType.SHOT_ON_GOAL && e.teamId === "player").length,
              ai: events.filter(e => e.type === GameEventType.SHOT_ON_GOAL && e.teamId === "ai").length,
            },
            {
              label: "Saves",
              player: events.filter(e => e.type === GameEventType.SAVE && e.teamId === "player").length,
              ai: events.filter(e => e.type === GameEventType.SAVE && e.teamId === "ai").length,
            },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-gray-400 text-[10px] mb-1.5">{stat.label}</div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-white font-bold text-sm">{stat.player}</span>
                <span className="text-gray-600 text-[10px]">vs</span>
                <span className="text-gray-400 font-bold text-sm">{stat.ai}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-6 space-y-2.5">
        {isLeagueComplete ? (
          <button
            onClick={onNewSeason}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #ffd700, #ff9800)" }}
          >
            New Season
          </button>
        ) : (
          <button
            onClick={onNextMatch}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
          >
            Next Match →
          </button>
        )}
        <button
          onClick={onHome}
          className="w-full py-3 rounded-2xl text-gray-300 font-semibold text-sm transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
