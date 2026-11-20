import type { GameEvent, LeagueState, TeamConfig, MatchStats } from "../engine/types";
import { GameEventType } from "../engine/types";
import { getLeagueStandings, getTeamPoints } from "../game/league";
import { possessionPercent } from "../game/matchStats";

const PLAYER_ID = "player_team";

interface Props {
  playerScore: number;
  aiScore: number;
  events: GameEvent[];
  team: TeamConfig;
  opponentName: string;
  league: LeagueState;
  isLeagueComplete: boolean;
  playoffStage?: "sf1" | "sf2" | "final" | null;
  isAutoSim?: boolean;
  autoSimHomeName?: string;
  autoSimAwayName?: string;
  autoSimHomeGoals?: number;
  autoSimAwayGoals?: number;
  penalties?: { player: number; ai: number };
  stats?: MatchStats;
  showNewSeason?: boolean;
  onNextMatch: () => void;
  onHome: () => void;
  onNewSeason: () => void;
}

const STAGE_LABEL: Record<string, string> = {
  sf1: "Semi-Final 1",
  sf2: "Semi-Final 2",
  final: "Final",
};

export default function PostMatch({
  playerScore,
  aiScore,
  events,
  team,
  opponentName,
  league,
  isLeagueComplete,
  playoffStage,
  isAutoSim,
  autoSimHomeName,
  autoSimAwayName,
  autoSimHomeGoals,
  autoSimAwayGoals,
  penalties,
  stats,
  showNewSeason,
  onNextMatch,
  onHome,
  onNewSeason,
}: Props) {
  const won = playerScore > aiScore;
  const draw = playerScore === aiScore;

  const playerEntry = league.teams.find(t => t.id === PLAYER_ID)!;
  const standings = getLeagueStandings(league.teams);
  const playerRank = standings.findIndex(t => t.id === PLAYER_ID) + 1;

  const keyEvents = events.filter(e =>
    e.type === GameEventType.GOAL ||
    e.type === GameEventType.SAVE ||
    e.type === GameEventType.SHOT_ON_GOAL
  ).slice(0, 6);

  const pointsGained = won ? 3 : draw ? 1 : 0;

  const isPlayoffMatch = !!playoffStage;
  const isPlayoffComplete = league.playoff?.stage === "complete";
  const champion = league.playoff?.championName ?? league.playoff?.champion;

  // Determine advancement from the bracket (handles penalty-decided draws)
  const playerAdvanced = (() => {
    if (!isPlayoffMatch || !league.playoff) return false;
    const po = league.playoff;
    if (playoffStage === "sf1") return po.sf1.winnerId === PLAYER_ID;
    if (playoffStage === "sf2") return po.sf2.winnerId === PLAYER_ID;
    if (playoffStage === "final") return po.final?.winnerId === PLAYER_ID;
    return false;
  })();
  const playerEliminated = isPlayoffMatch && !playerAdvanced;
  const nextStageLabel = playoffStage === "sf1" || playoffStage === "sf2" ? "Final" : null;
  const wonOnPenalties = !!penalties && playerAdvanced;
  const lostOnPenalties = !!penalties && playerEliminated;
  const displayWon = won || wonOnPenalties;
  const displayLost = (!draw && !won) || lostOnPenalties;
  const resultColor = displayWon ? "#00e676" : displayLost ? "#ff5252" : "#ffd700";
  const resultBg = displayWon
    ? "linear-gradient(135deg, rgba(0,230,118,0.15), rgba(0,178,136,0.08))"
    : displayLost
      ? "linear-gradient(135deg, rgba(255,82,82,0.15), rgba(211,47,47,0.08))"
      : "linear-gradient(135deg, rgba(255,235,59,0.15), rgba(255,152,0,0.08))";

  const statRows = stats ? [
    ["Possession", `${possessionPercent(stats, "player")}%`, `${possessionPercent(stats, "ai")}%`],
    ["Shots", stats.player.shots, stats.ai.shots],
    ["Shots on target", stats.player.shotsOnTarget, stats.ai.shotsOnTarget],
    ["Passes", `${stats.player.passesCompleted}/${stats.player.passesAttempted}`, `${stats.ai.passesCompleted}/${stats.ai.passesAttempted}`],
    ["Forward passes", stats.player.forwardPasses, stats.ai.forwardPasses],
    ["Interceptions", stats.player.interceptions, stats.ai.interceptions],
    ["Offsides", stats.player.offsides, stats.ai.offsides],
  ] as const : [];

  // Auto-sim display
  if (isAutoSim && autoSimHomeName && autoSimAwayName) {
    const homeWon = (autoSimHomeGoals ?? 0) > (autoSimAwayGoals ?? 0);
    const stageLabel = playoffStage ? STAGE_LABEL[playoffStage] : "Result";
    const winnerName = homeWon ? autoSimHomeName : autoSimAwayName;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
        <div className="px-6 py-6 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="text-3xl mb-1">⚽</div>
          <div className="text-gray-300 text-lg font-black">{stageLabel} Result</div>
          <div className="text-gray-500 text-xs mt-0.5">Simulated</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {/* Auto-sim result display */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <div className="text-white text-sm font-bold truncate">{autoSimHomeName}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-white">
                  {autoSimHomeGoals} – {autoSimAwayGoals}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">FT</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-white text-sm font-bold truncate">{autoSimAwayName}</div>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className="text-[#ffd700] text-xs font-bold">{winnerName} advances</span>
            </div>
          </div>

          {/* Playoff bracket summary */}
          {league.playoff && (
            <PlayoffProgressCard league={league} team={team} />
          )}
        </div>

        <div className="px-4 pb-6 space-y-2.5">
          {isPlayoffComplete ? (
            <button
              onClick={onNewSeason}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #ffd700, #ff9800)" }}
            >
              🏆 New Season
            </button>
          ) : (
            <button
              onClick={onNextMatch}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #00e676, #00b288)" }}
            >
              Continue Playoff →
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0e1a" }}>
      {/* Result banner */}
      <div className="px-6 py-6 text-center" style={{ background: resultBg }}>
        {/* Playoff stage label */}
        {isPlayoffMatch && (
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#ffd700" }}>
            🏆 {STAGE_LABEL[playoffStage!]}
          </div>
        )}
        <div className="text-4xl mb-1.5">{displayWon ? "🏆" : displayLost ? "💀" : "🤝"}</div>
        <div className="text-3xl font-black mb-0.5" style={{ color: resultColor }}>
          {displayWon ? "Victory!" : displayLost ? "Defeat" : "Draw"}
        </div>
        <div className="text-gray-300 text-2xl font-bold">{playerScore} — {aiScore}</div>
        {penalties && (
          <div className="mt-1 text-xs font-black uppercase tracking-wider text-cyan-300">
            Penalties {penalties.player} — {penalties.ai}
          </div>
        )}
        <div className="text-gray-500 text-xs mt-1">{team.name} vs {opponentName}</div>

        {isPlayoffMatch ? (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: "rgba(255,255,255,0.06)", color: playerAdvanced ? "#00e676" : "#ff5252" }}>
            {wonOnPenalties
              ? "Advanced on Penalties 🎯"
              : lostOnPenalties
              ? "Eliminated on Penalties"
              : playerAdvanced
              ? nextStageLabel ? `Advanced to ${nextStageLabel}!` : "🏆 Champion!"
              : "Eliminated"}
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: "rgba(255,255,255,0.06)", color: resultColor }}>
            {pointsGained > 0 ? `+${pointsGained} pts` : "0 pts"} · #{playerRank} in table
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {stats && (
          <section
            className="overflow-hidden rounded-2xl"
            style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-white/10 px-3 py-3">
              <div className="truncate text-left text-xs font-black text-white">{team.name}</div>
              <div className="px-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Match stats</div>
              <div className="truncate text-right text-xs font-black text-white">{opponentName}</div>
            </div>
            <div className="divide-y divide-white/5">
              {statRows.map(([label, playerValue, aiValue]) => {
                const playerNumber = typeof playerValue === "number" ? playerValue : Number.parseFloat(String(playerValue));
                const aiNumber = typeof aiValue === "number" ? aiValue : Number.parseFloat(String(aiValue));
                const playerLeads = Number.isFinite(playerNumber) && Number.isFinite(aiNumber) && playerNumber > aiNumber;
                const aiLeads = Number.isFinite(playerNumber) && Number.isFinite(aiNumber) && aiNumber > playerNumber;
                return (
                  <div key={label} className="grid grid-cols-[1fr_1.35fr_1fr] items-center px-3 py-2.5">
                    <div className={`text-left text-sm font-black ${playerLeads ? "text-emerald-300" : "text-gray-200"}`}>{playerValue}</div>
                    <div className="text-center text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
                    <div className={`text-right text-sm font-black ${aiLeads ? "text-rose-300" : "text-gray-200"}`}>{aiValue}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Playoff champion banner */}
        {isPlayoffComplete && champion && (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)" }}
          >
            <div className="text-2xl mb-1">🏆</div>
            <div className="text-[#ffd700] font-black text-base">Season Champion</div>
            <div className="text-white font-bold text-lg mt-0.5">{champion}</div>
          </div>
        )}

        {/* League complete banner (no playoff yet) */}
        {isLeagueComplete && !isPlayoffMatch && !league.playoff && (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)" }}
          >
            <div className="text-2xl mb-1">📋</div>
            <div className="text-[#ffd700] font-black text-base">League Season Complete!</div>
            <div className="text-gray-400 text-sm mt-1">
              Final: #{playerRank} · {getTeamPoints(playerEntry)} points
              {playerRank <= 4 ? " · Playoff qualified!" : ""}
            </div>
          </div>
        )}

        {/* Playoff bracket progress */}
        {isPlayoffMatch && league.playoff && (
          <PlayoffProgressCard league={league} team={team} />
        )}

        {/* League standings */}
        {!isPlayoffMatch && (
          <div>
            <div className="text-white text-sm font-bold mb-2">League Standings</div>
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {standings.slice(0, 6).map((t, i) => {
                const isPlayer = t.id === PLAYER_ID;
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
        )}

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

      </div>

      {/* Action buttons */}
      <div className="px-4 pb-6 space-y-2.5">
        {showNewSeason || isPlayoffComplete ? (
          <button
            onClick={onNewSeason}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #ffd700, #ff9800)" }}
          >
            🏆 New Season
          </button>
        ) : (
          <button
            onClick={onNextMatch}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
            style={{
              background: isPlayoffMatch
                ? "linear-gradient(135deg, #ffd700, #ff8c00)"
                : "linear-gradient(135deg, #00e676, #00b288)",
            }}
          >
            {isPlayoffMatch
              ? playerEliminated
                ? "Watch Remaining Playoff →"
                : nextStageLabel
                ? `Play ${nextStageLabel} →`
                : "Continue →"
              : "Next Match →"}
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

function PlayoffProgressCard({
  league,
  team,
}: {
  league: LeagueState;
  team: TeamConfig;
}) {
  const po = league.playoff!;
  const playerIsInSF1 = po.sf1.homeId === PLAYER_ID || po.sf1.awayId === PLAYER_ID;
  const playerIsInSF2 = po.sf2.homeId === PLAYER_ID || po.sf2.awayId === PLAYER_ID;
  const playerIsInFinal = po.final && (po.final.homeId === PLAYER_ID || po.final.awayId === PLAYER_ID);

  const matchRow = (
    match: {
      homeId: string;
      homeName: string;
      awayId: string;
      awayName: string;
      homeGoals?: number;
      awayGoals?: number;
      penaltyHomeGoals?: number;
      penaltyAwayGoals?: number;
      winnerId?: string;
    } | undefined,
    label: string,
    isCurrentStage: boolean
  ) => {
    if (!match) return (
      <div className="flex items-center gap-2 px-2 py-1.5" style={{ opacity: 0.4 }}>
        <span className="text-[10px] text-gray-500 w-12 shrink-0">{label}</span>
        <span className="text-xs text-gray-600">TBD</span>
      </div>
    );

    const playerIsHome = match.homeId === PLAYER_ID;
    const playerIsAway = match.awayId === PLAYER_ID;
    const homeName = playerIsHome ? `${team.crestIcon} ${team.name}` : match.homeName;
    const awayName = playerIsAway ? `${team.crestIcon} ${team.name}` : match.awayName;
    const isDone = match.winnerId !== undefined;
    const homeWon = isDone && match.winnerId === match.homeId;
    const awayWon = isDone && match.winnerId === match.awayId;

    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
        style={{ background: isCurrentStage ? "rgba(255,215,0,0.08)" : "transparent" }}
      >
        <span className="text-[10px] text-gray-500 w-12 shrink-0 font-bold">{label}</span>
        <span className="flex-1 text-xs truncate" style={{ color: homeWon ? "#fff" : isDone ? "#4b5563" : (playerIsHome ? team.jerseyColor : "#9ca3af"), fontWeight: homeWon ? 700 : 400 }}>
          {homeName}
        </span>
        <span className="text-gray-600 text-xs shrink-0 font-mono">
          {isDone
            ? match.penaltyHomeGoals !== undefined && match.penaltyAwayGoals !== undefined
              ? `${match.homeGoals}–${match.awayGoals} (${match.penaltyHomeGoals}–${match.penaltyAwayGoals}p)`
              : `${match.homeGoals}–${match.awayGoals}`
            : "vs"}
        </span>
        <span className="flex-1 text-xs truncate text-right" style={{ color: awayWon ? "#fff" : isDone ? "#4b5563" : (playerIsAway ? team.jerseyColor : "#9ca3af"), fontWeight: awayWon ? 700 : 400 }}>
          {awayName}
        </span>
      </div>
    );
  };

  return (
    <div>
      <div className="text-white text-sm font-bold mb-2">Playoff Bracket</div>
      <div
        className="rounded-xl p-2 space-y-0.5"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {matchRow(po.sf1, "SF1", po.stage === "sf1")}
        {matchRow(po.sf2, "SF2", po.stage === "sf2")}
        {matchRow(po.final, "Final", po.stage === "final")}
      </div>
    </div>
  );
}
