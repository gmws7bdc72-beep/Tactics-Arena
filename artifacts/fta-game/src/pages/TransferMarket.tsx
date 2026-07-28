import { useMemo, useState } from "react";
import type { LeagueState, PlayerCard, TeamConfig } from "../engine/types";
import { AI_TEAMS } from "../game/league";
import { enrichMarketPlayer, formatMoney, getPlayerOverall } from "../game/transferDatabase";

interface Props {
  team: TeamConfig;
  league: LeagueState;
}

type RoleFilter = "all" | PlayerCard["role"];
type StatusFilter = "all" | NonNullable<PlayerCard["marketStatus"]>;

const statusLabel: Record<NonNullable<PlayerCard["marketStatus"]>, string> = {
  available: "Available",
  listed: "Transfer Listed",
  not_for_sale: "Not for Sale",
  untouchable: "Untouchable",
};

const statusTone: Record<NonNullable<PlayerCard["marketStatus"]>, string> = {
  available: "#38bdf8",
  listed: "#22c55e",
  not_for_sale: "#fbbf24",
  untouchable: "#fb7185",
};

export default function TransferMarket({ team, league }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seasonNumber = Math.max(1, Number(league.season ?? 1));
  const locked = seasonNumber <= 1;

  const clubs = useMemo(() => {
    const playerClub = {
      id: "player_team",
      name: team.name,
      crestIcon: team.crestIcon,
      players: team.players.map((player) => enrichMarketPlayer(player, "player_team", seasonNumber)),
    };
    return [
      playerClub,
      ...AI_TEAMS.map((club) => ({
        id: club.id,
        name: club.name,
        crestIcon: club.crestIcon,
        players: (league.aiSquads?.[club.id] ?? club.players).map((player) =>
          enrichMarketPlayer(player, club.id, seasonNumber),
        ),
      })),
    ];
  }, [league.aiSquads, seasonNumber, team]);

  const allPlayers = useMemo(
    () => clubs.flatMap((club) => club.players.map((player) => ({ player, club }))),
    [clubs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPlayers
      .filter(({ player, club }) => !q || player.name.toLowerCase().includes(q) || club.name.toLowerCase().includes(q))
      .filter(({ player }) => role === "all" || player.role === role)
      .filter(({ player }) => status === "all" || player.marketStatus === status)
      .sort((a, b) => getPlayerOverall(b.player) - getPlayerOverall(a.player));
  }, [allPlayers, query, role, status]);

  const selected = selectedId ? allPlayers.find(({ player }) => player.id === selectedId) : null;
  const listedCount = allPlayers.filter(({ player }) => player.marketStatus === "listed").length;

  return (
    <div className="min-h-screen px-4 pb-28 pt-6" style={{ background: "#0a0e1a" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: `${team.jerseyColor}2b`, border: `1px solid ${team.jerseyColor}55` }}>🛒</div>
          <div>
            <h1 className="text-xl font-black text-white">Transfer Database</h1>
            <p className="text-xs text-gray-400">{allPlayers.length} players · {clubs.length} clubs</p>
          </div>
        </div>
        <div className="rounded-xl px-3 py-2 text-right" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Season</div>
          <div className="text-sm font-black text-white">{seasonNumber}</div>
        </div>
      </div>

      {locked && (
        <div className="mb-4 rounded-2xl p-4" style={{ background: "rgba(56,189,248,.06)", border: "1px solid rgba(56,189,248,.22)" }}>
          <div className="flex gap-3">
            <div className="text-2xl">🔒</div>
            <div>
              <div className="font-black text-white">Scouting database active</div>
              <p className="mt-1 text-xs leading-5 text-gray-400">You can browse every squad now. Buying, selling, offers and club budgets unlock with the AI transfer market and season-finance phase.</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}><div className="text-[10px] font-bold uppercase text-gray-500">Players</div><div className="text-lg font-black text-white">{allPlayers.length}</div></div>
        <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}><div className="text-[10px] font-bold uppercase text-gray-500">Listed</div><div className="text-lg font-black text-green-400">{listedCount}</div></div>
        <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}><div className="text-[10px] font-bold uppercase text-gray-500">Your squad</div><div className="text-lg font-black text-white">{team.players.length}/16</div></div>
      </div>

      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or club..." className="mb-2 w-full rounded-xl px-3 py-3 text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.1)" }} />

      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {(["all", "goalkeeper", "defender", "midfielder", "forward", "striker"] as RoleFilter[]).map((item) => (
          <button key={item} type="button" onClick={() => setRole(item)} className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize" style={{ background: role === item ? "rgba(0,230,118,.15)" : "rgba(255,255,255,.04)", color: role === item ? "#00e676" : "#9ca3af", border: `1px solid ${role === item ? "rgba(0,230,118,.3)" : "rgba(255,255,255,.07)"}` }}>{item}</button>
        ))}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(["all", "listed", "available", "not_for_sale", "untouchable"] as StatusFilter[]).map((item) => (
          <button key={item} type="button" onClick={() => setStatus(item)} className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold" style={{ background: status === item ? "rgba(56,189,248,.15)" : "rgba(255,255,255,.04)", color: status === item ? "#38bdf8" : "#9ca3af", border: `1px solid ${status === item ? "rgba(56,189,248,.3)" : "rgba(255,255,255,.07)"}` }}>{item === "all" ? "All status" : statusLabel[item]}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(({ player, club }) => {
          const marketStatus = player.marketStatus ?? "available";
          return (
            <button key={player.id} type="button" onClick={() => setSelectedId(selectedId === player.id ? null : player.id)} className="w-full rounded-xl p-3 text-left" style={{ background: selectedId === player.id ? "rgba(56,189,248,.08)" : "rgba(255,255,255,.035)", border: `1px solid ${selectedId === player.id ? "rgba(56,189,248,.3)" : "rgba(255,255,255,.07)"}` }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black" style={{ background: "rgba(255,255,255,.08)", color: "white" }}>{getPlayerOverall(player)}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-white">{player.name}</div><div className="truncate text-xs capitalize text-gray-400">{club.crestIcon} {club.name} · {player.role} · age {player.age}</div></div>
                <div className="text-right"><div className="text-sm font-black text-white">{formatMoney(player.marketValue ?? 0)}</div><div className="text-[10px] font-bold" style={{ color: statusTone[marketStatus] }}>{statusLabel[marketStatus]}</div></div>
              </div>
              {selectedId === player.id && (
                <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3">
                  <div><div className="text-[9px] uppercase text-gray-500">Potential</div><div className="text-xs font-black text-white">{player.potential}</div></div>
                  <div><div className="text-[9px] uppercase text-gray-500">Wage</div><div className="text-xs font-black text-white">{formatMoney(player.weeklyWage ?? 0)}/w</div></div>
                  <div><div className="text-[9px] uppercase text-gray-500">Ability</div><div className="truncate text-xs font-black capitalize text-white">{player.ability.replace(/_/g, " ")}</div></div>
                  <div><div className="text-[9px] uppercase text-gray-500">Squad</div><div className="text-xs font-black text-white">{club.players.length}/16</div></div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selected && !locked && <div className="mt-4 rounded-xl p-3 text-center text-xs font-bold text-gray-400" style={{ background: "rgba(255,255,255,.04)" }}>Offers become interactive in Phase 5.</div>}
    </div>
  );
}
