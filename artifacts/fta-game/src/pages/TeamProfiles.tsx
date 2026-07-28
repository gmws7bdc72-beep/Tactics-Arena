import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Banknote,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Goal,
  HandCoins,
  Medal,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import type {
  LeagueState,
  LeagueTeamEntry,
  PlayerCard,
  PlayerStats,
  TeamConfig,
  TeamTactic,
} from "../engine/types";
import {
  AI_TEAMS,
  TEAM_TACTICS,
  getLeagueStandings,
  getTeamPoints,
} from "../game/league";
import { ABILITIES, STAT_LABELS } from "../game/players";
import { getFormationById } from "../game/formations";
import { PLAYER_TEAM_ID_CONST } from "../game/persistence";
import { calculatePlayerOverall } from "../game/training";

interface Props {
  playerTeam: TeamConfig;
  league: LeagueState;
  initialTeamId?: string;
  onBack?: () => void;
}

type ViewTab = "overview" | "squad" | "tactics";

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

type FinanceRecord = {
  budget?: number;
  wageBill?: number;
  clubValue?: number;
};

type FutureLeagueState = LeagueState & {
  season?: number;
  clubFinances?: Record<string, FinanceRecord>;
};

const PLAYER_TACTIC: TeamTactic = {
  ...TEAM_TACTICS.balanced_build_up,
  name: "Custom Player Tactic",
  description:
    "Your club follows the formation and commands you choose. Player attributes still determine execution, duels, passing, shooting, long balls, and ball control.",
};

const ROLE_ORDER: Record<PlayerCard["role"], number> = {
  goalkeeper: 0,
  defender: 1,
  midfielder: 2,
  forward: 3,
  striker: 4,
};

const ROLE_LABEL: Record<PlayerCard["role"], string> = {
  goalkeeper: "Goalkeeper",
  defender: "Defender",
  midfielder: "Midfielder",
  forward: "Forward",
  striker: "Striker",
};

const ROLE_SHORT: Record<PlayerCard["role"], string> = {
  goalkeeper: "GK",
  defender: "DEF",
  midfielder: "MID",
  forward: "FWD",
  striker: "ST",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function statValue(stats: PlayerStats, key: keyof PlayerStats): number {
  const value = stats[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  switch (key) {
    case "shooting":
      return stats.attack;
    case "dribbling":
      return Math.round((stats.attack + stats.speed) / 2);
    case "tackling":
    case "marking":
      return stats.defense;
    case "stamina":
      return Math.round((stats.speed + stats.defense) / 2);
    case "strength":
    case "aerial":
      return Math.round((stats.attack + stats.defense) / 2);
    case "vision":
    case "longPassing":
      return stats.passing;
    default:
      return 5;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function overall(player: PlayerCard): number {
  return Math.round(calculatePlayerOverall(player));
}

function playerValueMillions(player: PlayerCard): number {
  const rating = overall(player);
  const roleMultiplier =
    player.role === "striker"
      ? 1.12
      : player.role === "forward"
        ? 1.08
        : player.role === "goalkeeper"
          ? 0.92
          : 1;
  const raw = Math.pow(Math.max(0.8, rating - 3.4), 2) * 1.55 * roleMultiplier;
  return Math.round(Math.max(1.2, raw) * 10) / 10;
}

function playerWeeklyWage(player: PlayerCard): number {
  const value = playerValueMillions(player);
  return Math.round((value * 3_400 + overall(player) * 2_600) / 1_000) * 1_000;
}

function normalizeMillions(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.abs(value) >= 100_000 ? value / 1_000_000 : value;
}

function formatMillions(value: number): string {
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  if (value >= 100) return `$${Math.round(value)}M`;
  if (value >= 10) return `$${value.toFixed(1)}M`;
  return `$${value.toFixed(1)}M`;
}

function formatWeeklyWage(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M/wk`;
  return `$${Math.round(value / 1_000)}K/wk`;
}

function projectedPrize(rank: number): number {
  return clamp(55 - rank * 5, 5, 50);
}

function getTeamEntry(league: LeagueState, id: string): LeagueTeamEntry {
  return (
    league.teams.find((team) => team.id === id) ?? {
      id,
      name: "Unknown Club",
      tier: 2,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    }
  );
}

function getCleanSheets(
  selectedId: string,
  entry: LeagueTeamEntry,
  league: LeagueState,
): number {
  if (selectedId === PLAYER_TEAM_ID_CONST) {
    return league.schedule.filter(
      (match) => match.played && match.opponentGoals === 0,
    ).length;
  }

  if (entry.played === 0) return 0;

  const estimated = Math.round(entry.played - entry.goalsAgainst * 0.55);
  return clamp(estimated, 0, entry.played);
}

function scorerWeight(player: PlayerCard): number {
  const roleBoost =
    player.role === "striker"
      ? 5
      : player.role === "forward"
        ? 3.5
        : player.role === "midfielder"
          ? 1.6
          : 0.4;

  return (
    roleBoost +
    statValue(player.stats, "shooting") * 1.8 +
    statValue(player.stats, "attack") * 1.25 +
    statValue(player.stats, "aerial") * 0.35
  );
}

function creatorWeight(player: PlayerCard): number {
  const roleBoost =
    player.role === "midfielder"
      ? 4
      : player.role === "forward"
        ? 2.2
        : player.role === "striker"
          ? 1.4
          : 0.8;

  return (
    roleBoost +
    statValue(player.stats, "passing") * 1.65 +
    statValue(player.stats, "vision") * 1.55 +
    statValue(player.stats, "longPassing") * 0.6
  );
}

function pickWeightedLeader(
  players: PlayerCard[],
  weight: (player: PlayerCard) => number,
): PlayerCard {
  return [...players].sort((a, b) => weight(b) - weight(a))[0] ?? players[0];
}

function leaderGoalTotal(goalsFor: number): number {
  if (goalsFor <= 0) return 0;
  return Math.max(1, Math.round(goalsFor * 0.46));
}

function leaderAssistTotal(goalsFor: number): number {
  if (goalsFor <= 1) return 0;
  return Math.max(1, Math.round(goalsFor * 0.34));
}

function strengthScores(players: PlayerCard[]): {
  attack: number;
  midfield: number;
  defense: number;
} {
  const attack = average(
    players.map((player) =>
      average([
        statValue(player.stats, "attack"),
        statValue(player.stats, "shooting"),
        statValue(player.stats, "dribbling"),
        statValue(player.stats, "speed"),
      ]),
    ),
  );

  const midfield = average(
    players.map((player) =>
      average([
        statValue(player.stats, "passing"),
        statValue(player.stats, "vision"),
        statValue(player.stats, "stamina"),
        statValue(player.stats, "longPassing"),
      ]),
    ),
  );

  const defense = average(
    players.map((player) =>
      average([
        statValue(player.stats, "defense"),
        statValue(player.stats, "tackling"),
        statValue(player.stats, "marking"),
        statValue(player.stats, "strength"),
      ]),
    ),
  );

  return {
    attack: Math.round(attack * 10) / 10,
    midfield: Math.round(midfield * 10) / 10,
    defense: Math.round(defense * 10) / 10,
  };
}

function recentForm(league: LeagueState): Array<"W" | "D" | "L"> {
  return league.schedule
    .filter((match) => match.played)
    .slice(-5)
    .map((match) => {
      if (match.playerGoals > match.opponentGoals) return "W";
      if (match.playerGoals === match.opponentGoals) return "D";
      return "L";
    });
}

function roleStatKeys(role: PlayerCard["role"]): Array<keyof PlayerStats> {
  switch (role) {
    case "goalkeeper":
      return ["defense", "marking", "aerial", "longPassing", "passing", "strength"];
    case "defender":
      return ["defense", "tackling", "marking", "strength", "aerial", "passing"];
    case "midfielder":
      return ["passing", "vision", "dribbling", "stamina", "longPassing", "defense"];
    case "forward":
      return ["attack", "shooting", "speed", "dribbling", "passing", "vision"];
    case "striker":
      return ["attack", "shooting", "speed", "dribbling", "aerial", "strength"];
  }
}

function toneForRating(value: number): string {
  if (value >= 9) return "#4ade80";
  if (value >= 7) return "#38bdf8";
  if (value >= 5) return "#fbbf24";
  return "#fb7185";
}

function tacticBar(label: string, value: number, color: string) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="font-bold text-slate-200">{value}/10</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamp(value, 0, 10) * 10}%`, background: color }}
        />
      </div>
    </div>
  );
}

function strengthBar(label: string, value: number, color: string) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300">{label}</span>
        <span className="text-sm font-black" style={{ color }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${clamp(value, 0, 10) * 10}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: `${accent}1f`, color: accent }}
        >
          {icon}
        </div>
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-xl font-black text-white">{value}</div>
      <div className="mt-1 text-[10px] text-slate-500">{note}</div>
    </div>
  );
}

function LeaderCard({
  icon,
  title,
  player,
  total,
  totalLabel,
  accent,
}: {
  icon: ReactNode;
  title: string;
  player: PlayerCard;
  total: number;
  totalLabel: string;
  accent: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/6 bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2" style={{ color: accent }}>
        {icon}
        <span className="truncate text-[10px] font-black uppercase tracking-wide">
          {title}
        </span>
      </div>
      <div className="truncate text-sm font-black text-white">{player.name}</div>
      <div className="mt-1 text-[10px] text-slate-500">
        {total} {totalLabel}
      </div>
    </div>
  );
}

function StatTile({
  statKey,
  player,
}: {
  statKey: keyof PlayerStats;
  player: PlayerCard;
}) {
  const label = STAT_LABELS.find((item) => item.key === statKey)?.label ?? statKey;
  const value = statValue(player.stats, statKey);

  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-1.5 py-2 text-center">
      <div className="text-[9px] font-bold text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-black" style={{ color: toneForRating(value) }}>
        {value}
      </div>
    </div>
  );
}

export default function TeamProfiles({
  playerTeam,
  league,
  initialTeamId,
  onBack,
}: Props) {
  const teams = useMemo<ProfileTeam[]>(
    () => [
      {
        id: PLAYER_TEAM_ID_CONST,
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
        players: league.aiSquads?.[team.id] ?? team.players,
        tactic: team.tactic,
      })),
    ],
    [playerTeam, league.aiSquads],
  );

  const standings = useMemo(() => getLeagueStandings(league.teams), [league.teams]);
  const [selectedId, setSelectedId] = useState(
    initialTeamId ?? PLAYER_TEAM_ID_CONST,
  );
  const [view, setView] = useState<ViewTab>("overview");
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTeamId && teams.some((team) => team.id === initialTeamId)) {
      setSelectedId(initialTeamId);
    }
  }, [initialTeamId, teams]);

  useEffect(() => {
    setExpandedPlayerId(null);
    setView("overview");
  }, [selectedId]);

  const selected = teams.find((team) => team.id === selectedId) ?? teams[0];
  const entry = getTeamEntry(league, selected.id);
  const rankIndex = standings.findIndex((team) => team.id === selected.id);
  const rank = rankIndex >= 0 ? rankIndex + 1 : standings.length;
  const points = getTeamPoints(entry);
  const goalDifference = entry.goalsFor - entry.goalsAgainst;
  const formation = getFormationById(selected.formationId);
  const sortedPlayers = [...selected.players].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || overall(b) - overall(a),
  );
  const clubValueFallback = selected.players.reduce(
    (sum, player) => sum + playerValueMillions(player),
    0,
  );
  const wageFallback = selected.players.reduce(
    (sum, player) => sum + playerWeeklyWage(player),
    0,
  );
  const futureLeague = league as FutureLeagueState;
  const financeOverride = futureLeague.clubFinances?.[selected.id];
  const clubValue = normalizeMillions(financeOverride?.clubValue, clubValueFallback);
  const budget = normalizeMillions(financeOverride?.budget, 0);
  const wageBill =
    typeof financeOverride?.wageBill === "number" && Number.isFinite(financeOverride.wageBill)
      ? financeOverride.wageBill
      : wageFallback;
  const seasonNumber = Math.max(1, Math.round(futureLeague.season ?? 1));
  const scorer = pickWeightedLeader(selected.players, scorerWeight);
  const creator = pickWeightedLeader(selected.players, creatorWeight);
  const goalkeeper =
    selected.players.find((player) => player.role === "goalkeeper") ?? selected.players[0];
  const cleanSheets = getCleanSheets(selected.id, entry, league);
  const strengths = strengthScores(selected.players);
  const form = selected.isPlayer ? recentForm(league) : [];
  const playoffDistance = rank <= 4 ? 0 : rank - 4;
  const roleCounts = sortedPlayers.reduce<Record<PlayerCard["role"], number>>(
    (acc, player) => {
      acc[player.role] += 1;
      return acc;
    },
    { goalkeeper: 0, defender: 0, midfielder: 0, forward: 0, striker: 0 },
  );

  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 pb-28 pt-5 text-white">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-sky-400" />
            <h1 className="text-xl font-black tracking-tight">Club Profiles</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Every club, player, record, and financial snapshot
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-slate-400 transition active:scale-95"
          >
            PLAY
          </button>
        )}
      </header>

      <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1">
        <div className="flex min-w-max gap-2">
          {teams.map((team) => {
            const teamRank = standings.findIndex((entryItem) => entryItem.id === team.id) + 1;
            const active = team.id === selected.id;

            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedId(team.id)}
                className="min-w-[116px] rounded-2xl p-3 text-left transition active:scale-[0.98]"
                style={{
                  background: active ? `${team.jerseyColor}20` : "rgba(255,255,255,0.035)",
                  border: `1px solid ${active ? `${team.jerseyColor}aa` : "rgba(255,255,255,0.07)"}`,
                  boxShadow: active ? `0 0 22px ${team.jerseyColor}16` : "none",
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xl">{team.crestIcon}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-black"
                    style={{
                      background: active ? `${team.jerseyColor}28` : "rgba(255,255,255,0.05)",
                      color: active ? team.jerseyColor : "#64748b",
                    }}
                  >
                    #{teamRank > 0 ? teamRank : "—"}
                  </span>
                </div>
                <div className="max-w-[100px] truncate text-xs font-black text-white">
                  {team.name}
                </div>
                <div className="mt-0.5 truncate text-[9px] text-slate-500">
                  {team.isPlayer ? "Your club" : `Tier ${getTeamEntry(league, team.id).tier}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section
        className="relative mb-4 overflow-hidden rounded-[24px] border p-4"
        style={{
          borderColor: `${selected.jerseyColor}55`,
          background: `linear-gradient(135deg, ${selected.jerseyColor}2b 0%, rgba(15,23,42,0.94) 54%, ${selected.secondaryColor}10 100%)`,
        }}
      >
        <div
          className="absolute -right-10 -top-14 h-40 w-40 rounded-full blur-3xl"
          style={{ background: `${selected.jerseyColor}2b` }}
        />
        <div className="relative flex items-start gap-3">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border text-3xl shadow-xl"
            style={{
              background: `${selected.jerseyColor}24`,
              borderColor: `${selected.jerseyColor}66`,
            }}
          >
            {selected.crestIcon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-black">{selected.name}</h2>
              {selected.isPlayer && (
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
                  style={{ background: `${selected.jerseyColor}2b`, color: selected.jerseyColor }}
                >
                  Your club
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Season {seasonNumber} · {formation.name} · {selected.players.length} players
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                League #{rank}
              </span>
              <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                {points} pts
              </span>
              <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                {selected.tactic.name}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
              Position
            </div>
            <div className="mt-1 text-3xl font-black" style={{ color: selected.jerseyColor }}>
              {rank}
            </div>
            <div className="text-[9px] text-slate-500">of {standings.length}</div>
          </div>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-3 rounded-2xl border border-white/8 bg-white/[0.035] p-1">
        {(
          [
            ["overview", "Overview"],
            ["squad", "Squad"],
            ["tactics", "Tactics"],
          ] as Array<[ViewTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className="rounded-xl px-2 py-2.5 text-xs font-black transition active:scale-[0.98]"
            style={{
              background: view === id ? `${selected.jerseyColor}25` : "transparent",
              color: view === id ? selected.jerseyColor : "#64748b",
              boxShadow: view === id ? `inset 0 0 0 1px ${selected.jerseyColor}45` : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={<Trophy size={16} />}
              label="League"
              value={`#${rank}`}
              note={rank <= 4 ? "Inside playoff places" : `${playoffDistance} place${playoffDistance === 1 ? "" : "s"} from top four`}
              accent="#fbbf24"
            />
            <MetricCard
              icon={<Medal size={16} />}
              label="Points"
              value={`${points}`}
              note={`${entry.played} match${entry.played === 1 ? "" : "es"} played`}
              accent="#38bdf8"
            />
            <MetricCard
              icon={<WalletCards size={16} />}
              label="Budget"
              value={formatMillions(budget)}
              note={seasonNumber <= 1 ? "Locked until season prize money" : "Available transfer funds"}
              accent="#4ade80"
            />
            <MetricCard
              icon={<CircleDollarSign size={16} />}
              label="Club value"
              value={formatMillions(clubValue)}
              note="Estimated squad market value"
              accent="#c084fc"
            />
          </div>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Season Snapshot</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Current league record</p>
              </div>
              <BarChart3 size={18} style={{ color: selected.jerseyColor }} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["Won", entry.won, "#4ade80"],
                ["Drawn", entry.drawn, "#fbbf24"],
                ["Lost", entry.lost, "#fb7185"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-white/5 bg-black/20 p-3 text-center">
                  <div className="text-2xl font-black" style={{ color: String(color) }}>
                    {value}
                  </div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["Goals For", entry.goalsFor],
                ["Goals Against", entry.goalsAgainst],
                ["Goal Difference", `${goalDifference >= 0 ? "+" : ""}${goalDifference}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-white/[0.025] px-2 py-2.5 text-center">
                  <div className="text-sm font-black text-white">{value}</div>
                  <div className="mt-0.5 text-[8px] uppercase tracking-wide text-slate-600">{label}</div>
                </div>
              ))}
            </div>

            {form.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Recent form</span>
                <div className="flex gap-1.5">
                  {form.map((result, index) => (
                    <span
                      key={`${result}-${index}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black"
                      style={{
                        background:
                          result === "W"
                            ? "rgba(74,222,128,0.16)"
                            : result === "D"
                              ? "rgba(251,191,36,0.16)"
                              : "rgba(251,113,133,0.16)",
                        color: result === "W" ? "#4ade80" : result === "D" ? "#fbbf24" : "#fb7185",
                      }}
                    >
                      {result}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Club Finances</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Prepared for the transfer system</p>
              </div>
              <Banknote size={18} className="text-emerald-400" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <HandCoins size={15} /> Weekly wage bill
                </div>
                <span className="text-sm font-black text-white">{formatWeeklyWage(wageBill)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <CircleDollarSign size={15} /> Squad market value
                </div>
                <span className="text-sm font-black text-white">{formatMillions(clubValue)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <Trophy size={15} /> Current projected prize
                </div>
                <span className="text-sm font-black text-amber-300">{formatMillions(projectedPrize(rank))}</span>
              </div>
            </div>

            {seasonNumber <= 1 && (
              <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.05] px-3 py-2.5 text-[10px] leading-4 text-slate-400">
                Transfer budgets remain at $0 during the first season. The projected prize is released only after the season is completed.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Season Leaders</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Club leaders based on results and player roles</p>
              </div>
              <Sparkles size={18} style={{ color: selected.jerseyColor }} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <LeaderCard
                icon={<Goal size={14} />}
                title="Top scorer"
                player={scorer}
                total={leaderGoalTotal(entry.goalsFor)}
                totalLabel="goals"
                accent="#fb7185"
              />
              <LeaderCard
                icon={<Target size={14} />}
                title="Top assister"
                player={creator}
                total={leaderAssistTotal(entry.goalsFor)}
                totalLabel="assists"
                accent="#38bdf8"
              />
              <LeaderCard
                icon={<Shield size={14} />}
                title="Clean sheets"
                player={goalkeeper}
                total={cleanSheets}
                totalLabel="shutouts"
                accent="#4ade80"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Team Strength</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Average squad quality by phase</p>
              </div>
              <Users size={18} style={{ color: selected.jerseyColor }} />
            </div>
            <div className="space-y-2">
              {strengthBar("Attack", strengths.attack, "#fb7185")}
              {strengthBar("Midfield", strengths.midfield, "#38bdf8")}
              {strengthBar("Defense", strengths.defense, "#4ade80")}
            </div>
          </section>
        </div>
      )}

      {view === "squad" && (
        <div className="space-y-3">
          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">First-Team Squad</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {selected.players.length} players · maximum will become 16 in the transfer phase
                </p>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Average OVR</div>
                <div className="text-xl font-black" style={{ color: selected.jerseyColor }}>
                  {average(selected.players.map(overall)).toFixed(1)}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(Object.keys(roleCounts) as Array<PlayerCard["role"]>)
                .filter((role) => roleCounts[role] > 0)
                .map((role) => (
                  <span key={role} className="rounded-full border border-white/6 bg-black/20 px-2.5 py-1 text-[9px] font-bold text-slate-400">
                    {ROLE_SHORT[role]} {roleCounts[role]}
                  </span>
                ))}
            </div>
          </section>

          {sortedPlayers.map((player) => {
            const expanded = expandedPlayerId === player.id;
            const ability = ABILITIES[player.ability];
            const keyStats = roleStatKeys(player.role);
            const value = playerValueMillions(player);

            return (
              <article
                key={player.id}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]"
              >
                <button
                  type="button"
                  onClick={() => setExpandedPlayerId(expanded ? null : player.id)}
                  className="w-full p-3.5 text-left active:bg-white/[0.025]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black shadow-lg"
                      style={{
                        background: selected.jerseyColor,
                        color: selected.secondaryColor,
                        outline: player.role === "goalkeeper" ? "2px solid #fbbf24" : "2px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {player.jerseyNumber}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-black text-white">{player.name}</h4>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] font-black text-slate-500">
                          {ROLE_SHORT[player.role]}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{ability.name}</span>
                        <span>•</span>
                        <span>{formatMillions(value)}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] font-black uppercase tracking-wide text-slate-600">OVR</div>
                      <div className="text-2xl font-black" style={{ color: toneForRating(overall(player)) }}>
                        {overall(player)}
                      </div>
                    </div>
                    <div className="text-slate-500">{expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-6 gap-1.5">
                    {keyStats.map((statKey) => (
                      <StatTile key={statKey} statKey={statKey} player={player} />
                    ))}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-white/6 bg-black/15 px-3.5 pb-3.5 pt-3">
                    <div className="mb-3 rounded-xl border border-white/5 bg-black/20 p-3">
                      <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: selected.jerseyColor }}>
                        {ability.name}
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-400">{ability.description}</p>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {STAT_LABELS.map(({ key }) => (
                        <StatTile key={key} statKey={key} player={player} />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                      <span className="text-[10px] font-bold text-slate-500">Estimated weekly wage</span>
                      <span className="text-xs font-black text-white">{formatWeeklyWage(playerWeeklyWage(player))}</span>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {view === "tactics" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Identity</div>
                <h3 className="mt-1 text-lg font-black" style={{ color: selected.jerseyColor }}>
                  {selected.tactic.name}
                </h3>
              </div>
              <div className="rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-center">
                <div className="text-[8px] font-black uppercase tracking-wide text-slate-600">Formation</div>
                <div className="mt-0.5 text-sm font-black text-white">{formation.name}</div>
              </div>
            </div>
            <p className="text-xs leading-5 text-slate-400">{selected.tactic.description}</p>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">In Possession</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">How the club advances the ball</p>
              </div>
              <Target size={18} style={{ color: selected.jerseyColor }} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {tacticBar("Tempo", selected.tactic.tempo, selected.jerseyColor)}
              {tacticBar("Risk", selected.tactic.risk, "#fbbf24")}
              {tacticBar("Long balls", selected.tactic.longBallFrequency, "#c084fc")}
              {tacticBar("Rest defense", selected.tactic.restDefenseDepth, "#4ade80")}
            </div>
            <div className="mt-4 rounded-xl border border-white/5 bg-black/20 px-3 py-3">
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Progression</div>
              <div className="mt-1 text-sm font-black capitalize text-white">{selected.tactic.progression}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Out of Possession</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Defensive behavior and pressing</p>
              </div>
              <Shield size={18} className="text-slate-300" />
            </div>

            <div className="rounded-xl border border-white/5 bg-black/20 p-3">
              <div className="text-xs font-black" style={{ color: selected.jerseyColor }}>
                {selected.tactic.outOfPossessionName ?? "Balanced Defensive Shape"}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                {selected.tactic.outOfPossessionDescription ??
                  "The team protects central areas, tracks runners, and presses according to the current match situation."}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              {tacticBar("Press intensity", selected.tactic.pressIntensity, "#fb7185")}
              {tacticBar("Defensive line", selected.tactic.defensiveLine, "#38bdf8")}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/6 bg-black/20 px-2.5 py-1 text-[9px] font-bold text-slate-400">
                {selected.tactic.markingStyle === "man_marking"
                  ? "Man marking"
                  : selected.tactic.markingStyle === "hybrid"
                    ? "Hybrid marking"
                    : "Zonal marking"}
              </span>
              <span className="rounded-full border border-white/6 bg-black/20 px-2.5 py-1 text-[9px] font-bold text-slate-400">
                {selected.tactic.blockHeight === "high"
                  ? "High block"
                  : selected.tactic.blockHeight === "low"
                    ? "Low block"
                    : "Mid block"}
              </span>
              <span className="rounded-full border border-white/6 bg-black/20 px-2.5 py-1 text-[9px] font-bold text-slate-400">
                {selected.tactic.defensiveShape === "protect_box"
                  ? "Protect box"
                  : selected.tactic.defensiveShape === "aggressive"
                    ? "Aggressive shape"
                    : selected.tactic.defensiveShape === "wide"
                      ? "Wide shape"
                      : "Compact shape"}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Squad Fit</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">How the roster supports this tactic</p>
              </div>
              <Users size={18} style={{ color: selected.jerseyColor }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Attack", strengths.attack, "#fb7185"],
                ["Midfield", strengths.midfield, "#38bdf8"],
                ["Defense", strengths.defense, "#4ade80"],
              ].map(([label, score, color]) => (
                <div key={String(label)} className="rounded-xl border border-white/5 bg-black/20 p-3 text-center">
                  <div className="text-xl font-black" style={{ color: String(color) }}>
                    {Number(score).toFixed(1)}
                  </div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
