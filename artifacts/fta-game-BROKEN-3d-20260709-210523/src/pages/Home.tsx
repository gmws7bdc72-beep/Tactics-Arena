import type { TeamConfig, LeagueState, PlayoffBracket, PlayoffMatch } from "../engine/types";
import { getLeagueStandings, getTeamPoints } from "../game/league";

interface Props {
  team: TeamConfig;
  league: LeagueState;
  isLeagueComplete: boolean;
  onStartMatch: () => void;
  onGoToTeamSetup: () => void;
  onGoToCustomize: () => void;
  onGoToProfiles: (teamId?: string) => void;
  onResetSeason: () => void;
  onTwoPlayer: () => void;
  onOnline: () => void;
}

const TIER_LABEL: Record<number, string> = { 1: "Elite", 2: "Mid", 3: "Easy" };
const TIER_COLOR: Record<number, string> = { 1: "#ff5252", 2: "#ffeb3b", 3: "#00e676" };
const PLAYER_ID = "player_team";

function PlayoffMatchRow({
  match,
  playerTeamName,
  jerseyColor,
  label,
  isCurrent,
}: {
  match: PlayoffMatch;
  playerTeamName: string;
  jerseyColor: string;
  label: string;
  isCurrent: boolean;
}) {
  const isDone = match.winnerId !== undefined;
  const playerIsHome = match.homeId === PLAYER_ID;
  const playerIsAway = match.awayId === PLAYER_ID;
  const playerInvolved = playerIsHome || playerIsAway;

  const homeName = playerIsHome ? playerTeamName : match.homeName;
  const awayName = playerIsAway ? playerTeamName : match.awayName;

  const homeColor = playerIsHome ? jerseyColor : "#d1d5db";
  const awayColor = playerIsAway ? jerseyColor : "#d1d5db";

  const homeWon = isDone && match.winnerId === match.homeId;
  const awayWon = isDone && match.winnerId === match.awayId;

  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: isCurrent
          ? playerInvolved ? "rgba(0,230,118,0.07)" : "rgba(255,255,255,0.05)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${isCurrent ? (playerInvolved ? "rgba(0,230,118,0.25)" : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
        {isDone && (
          <span className="text-[10px] text-gray-500">FT</span>
        )}
        {!isDone && isCurrent && (
          <span className="text-[10px] font-bold" style={{ color: playerInvolved ? "#00e676" : "#9ca3af" }}>
            {playerInvolved ? "YOUR MATCH" : "UPCOMING"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="flex-1 text-xs font-semibold truncate"
          style={{ color: homeWon ? "#fff" : isDone ? "#6b7280" : homeColor, fontWeight: homeWon ? 800 : 600 }}
        >
          {homeName}
        </span>
        <span className="text-gray-500 text-xs font-mono shrink-0">
          {isDone ? `${match.homeGoals} – ${match.awayGoals}` : "vs"}
        </span>
        <span
          className="flex-1 text-xs font-semibold truncate text-right"
          style={{ color: awayWon ? "#fff" : isDone ? "#6b7280" : awayColor, fontWeight: awayWon ? 800 : 600 }}
        >
          {awayName}
        </span>
      </div>
    </div>
  );
}

export default function Home({
  team,
  league,
  isLeagueComplete,
  onStartMatch,
  onGoToTeamSetup,
  onGoToCustomize,
  onGoToProfiles,
  onResetSeason,
  onTwoPlayer,
  onOnline,
}: Props) {
  const standings = getLeagueStandings(league.teams);
  const playerEntry = league.teams.find(t => t.id === PLAYER_ID)!;
  const playerRank = standings.findIndex(t => t.id === PLAYER_ID) + 1;
  const nextMatch = league.schedule[league.currentMatchIndex] ?? null;
  const totalMatches = league.schedule.length;
  const played = league.currentMatchIndex;

  const po = league.playoff;
  const isPlayoffActive = isLeagueComplete && po && po.stage !== "complete";
  const isPlayoffComplete = po?.stage === "complete";

  // Determine the call-to-action state for the main button
  const playerInCurrentPlayoffStage = po && isPlayoffActive
    ? (po.stage === "sf1" && (po.sf1.homeId === PLAYER_ID || po.sf1.awayId === PLAYER_ID))
      || (po.stage === "sf2" && (po.sf2.homeId === PLAYER_ID || po.sf2.awayId === PLAYER_ID))
      || (po.stage === "final" && po.final && (po.final.homeId === PLAYER_ID || po.final.awayId === PLAYER_ID))
    : false;

  const playerEliminated = isLeagueComplete && po && po.stage !== "complete" && !playerInCurrentPlayoffStage;

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
            <div className="text-[10px] text-cyan-400 font-bold tracking-wide">Build: Clean Rebuild 6v6</div>
            <p className="text-gray-400 text-xs">Football Tactics Arena · League Season</p>
          </div>
          <button
            onClick={onOnline}
            className="px-2 py-1.5 rounded-xl text-xs font-black tracking-wide transition-all active:scale-95 hover:brightness-110"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "1px solid rgba(14,165,233,0.5)" }}
          >
            🌐
          </button>
          <button
            onClick={onTwoPlayer}
            className="px-3 py-1.5 rounded-xl text-xs font-black tracking-wide transition-all active:scale-95 hover:brightness-110"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", border: "1px solid rgba(124,58,237,0.5)" }}
          >
            2P
          </button>
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
            <span>{isLeagueComplete ? "League complete" : `Match ${played + 1} of ${totalMatches}`}</span>
            <span>{getTeamPoints(playerEntry)} pts</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (played / totalMatches) * 100)}%`,
                background: "linear-gradient(90deg, #00e676, #00b4d8)",
              }}
            />
          </div>
        </div>

        {/* ── Playoff bracket ────────────────────────────────────────────── */}
        {isLeagueComplete && po && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-white text-sm font-bold">🏆 Playoff</div>
              {isPlayoffComplete && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,215,0,0.15)", color: "#ffd700" }}>
                  Champion: {po.championName ?? po.champion}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {/* SF1 */}
              <PlayoffMatchRow
                match={po.sf1}
                playerTeamName={team.name}
                jerseyColor={team.jerseyColor}
                label="SF1 · 1st vs 2nd"
                isCurrent={po.stage === "sf1"}
              />

              {/* SF2 */}
              <PlayoffMatchRow
                match={po.sf2}
                playerTeamName={team.name}
                jerseyColor={team.jerseyColor}
                label="SF2 · 3rd vs 4th"
                isCurrent={po.stage === "sf2"}
              />

              {/* Final */}
              {(po.final || po.stage === "final" || po.stage === "complete") && po.final && (
                <PlayoffMatchRow
                  match={po.final}
                  playerTeamName={team.name}
                  jerseyColor={team.jerseyColor}
                  label="Final"
                  isCurrent={po.stage === "final"}
                />
              )}
              {!po.final && (po.stage === "sf1" || po.stage === "sf2") && (
                <div
                  className="rounded-xl px-3 py-2.5 text-center"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
                >
                  <span className="text-gray-600 text-xs">Final · TBD</span>
                </div>
              )}
            </div>

            {/* CTA */}
            {isPlayoffComplete ? (
              <button
                onClick={onResetSeason}
                className="w-full mt-3 py-3.5 rounded-xl text-white font-black text-base tracking-wide transition-all active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg, #ffd700, #ff9800)" }}
              >
                🏆 New Season
              </button>
            ) : playerEliminated ? (
              <button
                onClick={onStartMatch}
                className="w-full mt-3 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
              >
                Watch Playoff Results →
              </button>
            ) : (
              <button
                onClick={onStartMatch}
                className="w-full mt-3 py-3.5 rounded-xl text-white font-black text-base tracking-wide transition-all active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)" }}
              >
                ▶ {po.stage === "final" ? "Play Final" : "Play Semi-Final"}
              </button>
            )}
          </div>
        )}

        {/* ── Regular season next match card ───────────────────────────── */}
        {!isLeagueComplete && nextMatch && (
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Next Match</div>
              <div
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={nextMatch.isHome !== false
                  ? { background: "rgba(0,230,118,0.15)", color: "#00e676" }
                  : { background: "rgba(0,180,216,0.15)", color: "#00b4d8" }}
              >
                {nextMatch.isHome !== false ? "🏠 Home" : "✈️ Away"}
              </div>
            </div>
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
        )}

        {/* Season complete but playoff not yet initialized */}
        {isLeagueComplete && !po && (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)" }}
          >
            <div className="text-3xl mb-1">🏆</div>
            <div className="text-[#ffd700] font-black text-lg">League Complete!</div>
            <div className="text-gray-400 text-sm mt-1">
              #{playerRank} · {getTeamPoints(playerEntry)} pts
              {playerRank <= 4 ? " · You qualified for the Playoff!" : ""}
            </div>
            <button
              onClick={onStartMatch}
              className="w-full mt-4 py-3.5 rounded-xl text-white font-black text-base tracking-wide transition-all active:scale-95"
              style={{ background: playerRank <= 4 ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.08)" }}
            >
              {playerRank <= 4 ? "🏆 Start Playoff" : "View Playoff"}
            </button>
          </div>
        )}

        {/* League Table */}
        <div>
          <div className="text-white text-sm font-bold mb-2">League Table</div>
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-0 px-3 py-1.5 text-gray-500 text-[10px] font-semibold uppercase border-b border-white/5">
              <span>Club</span>
              <span className="text-right w-6">PL</span>
              <span className="text-right w-6">W</span>
              <span className="text-right w-6">D</span>
              <span className="text-right w-6">L</span>
              <span className="text-right w-8">Pts</span>
            </div>
            {standings.map((t, i) => {
              const isPlayer = t.id === PLAYER_ID;
              const isNext = nextMatch?.opponentId === t.id;
              const inTop4 = i < 4 && isLeagueComplete;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onGoToProfiles(isPlayer ? PLAYER_ID : t.id)}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-0 px-3 py-2 border-b border-white/5 last:border-0 w-full text-left transition-all hover:bg-white/5 active:scale-[0.99]"
                  style={{
                    background: isPlayer
                      ? `${team.jerseyColor}18`
                      : isNext
                      ? "rgba(0,180,255,0.06)"
                      : "transparent",
                  }}
                  aria-label={`View ${isPlayer ? team.name : t.name} profile`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-600 text-[10px] w-3 flex-shrink-0">{i + 1}</span>
                    <span
                      className="text-xs font-semibold truncate"
                      style={{ color: isPlayer ? team.jerseyColor : isNext ? "#00b4d8" : "#d1d5db" }}
                    >
                      {isPlayer ? `${team.crestIcon} ${t.name}` : t.name}
                    </span>
                    {inTop4 && <span className="text-[9px] font-bold shrink-0" style={{ color: "#ffd700" }}>PO</span>}
                    {isNext && !inTop4 && <span className="text-[9px] text-[#00b4d8] font-bold flex-shrink-0">NEXT</span>}
                  </div>
                  <span className="text-gray-400 text-xs text-right w-6">{t.played}</span>
                  <span className="text-gray-300 text-xs text-right w-6">{t.won}</span>
                  <span className="text-gray-300 text-xs text-right w-6">{t.drawn}</span>
                  <span className="text-gray-300 text-xs text-right w-6">{t.lost}</span>
                  <span
                    className="text-xs font-bold text-right w-8"
                    style={{ color: isPlayer ? "#00e676" : "#d1d5db" }}
                  >
                    {getTeamPoints(t)}
                  </span>
                </button>
              );
            })}
          </div>
          {isLeagueComplete && (
            <p className="text-[10px] text-gray-600 mt-1 text-center">PO = Playoff qualified (Top 4)</p>
          )}
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

        {/* Last matchday — other results */}
        {league.lastMatchdayResults && league.lastMatchdayResults.length > 0 && (
          <div>
            <div className="text-white text-sm font-bold mb-2">
              Last Matchday · Other Results
            </div>
            <div className="rounded-xl overflow-hidden space-y-px" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {league.lastMatchdayResults.map((r, i) => {
                const homeWon = r.homeGoals > r.awayGoals;
                const awayWon = r.awayGoals > r.homeGoals;
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs border-b border-white/5 last:border-0">
                    <span
                      className="flex-1 text-right truncate"
                      style={{ color: homeWon ? "#d1d5db" : "#6b7280", fontWeight: homeWon ? 700 : 400 }}
                    >
                      {r.homeName}
                    </span>
                    <span className="font-black text-white text-sm tabular-nums shrink-0 px-1">
                      {r.homeGoals} – {r.awayGoals}
                    </span>
                    <span
                      className="flex-1 truncate"
                      style={{ color: awayWon ? "#d1d5db" : "#6b7280", fontWeight: awayWon ? 700 : 400 }}
                    >
                      {r.awayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

        <button
          onClick={() => onGoToProfiles()}
          className="w-full py-3 rounded-xl text-white text-sm font-bold transition-all hover:bg-white/10 active:scale-95"
          style={{ background: "rgba(0,180,216,0.10)", border: "1px solid rgba(0,180,216,0.25)", color: "#67e8f9" }}
        >
          Team Profiles · Stats + Tactics
        </button>

        {/* Restart season */}
        <button
          onClick={() => {
            if (confirm("Restart the season? All current progress will be lost.")) onResetSeason();
          }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: "rgba(255,82,82,0.10)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.20)" }}
        >
          ↺ Restart Season
        </button>
      </div>
    </div>
  );
}
