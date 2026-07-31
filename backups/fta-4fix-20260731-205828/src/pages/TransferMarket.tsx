import { useMemo, useState } from "react";
import type { LeagueState, PlayerCard, TeamConfig } from "../engine/types";
import { AI_TEAMS } from "../game/league";
import {
  enrichMarketPlayer,
  formatMoney,
  getPlayerOverall,
  MAX_SQUAD_SIZE,
} from "../game/transferDatabase";
import {
  placeUserOffer,
  respondToOffer,
  type OfferStatus,
  type TransferNewsKind,
  type TransferMarketState,
} from "../game/transferMarket";

interface Props {
  team: TeamConfig;
  league: LeagueState;
  market: TransferMarketState;
  onChange: (
    market: TransferMarketState,
    team?: TeamConfig,
    league?: LeagueState,
  ) => void;
}

type Tab = "market" | "offers" | "finance" | "news" | "reports";
type RoleFilter = "all" | PlayerCard["role"];
type StatusFilter = "all" | NonNullable<PlayerCard["marketStatus"]>;
type NewsFilter = "all" | TransferNewsKind;

const PLAYER_ID = "player_team";
const ACTIVE_STATUSES: OfferStatus[] = ["pending", "countered"];

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

const offerTone: Record<OfferStatus, string> = {
  pending: "#38bdf8",
  accepted: "#22c55e",
  rejected: "#fb7185",
  countered: "#fbbf24",
  completed: "#22c55e",
  withdrawn: "#9ca3af",
};

const newsTone: Record<TransferNewsKind, string> = {
  offer: "#38bdf8",
  negotiation: "#fbbf24",
  transfer: "#34d399",
  finance: "#c084fc",
  system: "#94a3b8",
};

const newsIcon: Record<TransferNewsKind, string> = {
  offer: "📩",
  negotiation: "🤝",
  transfer: "✅",
  finance: "💰",
  system: "📢",
};

function transferFee(player: PlayerCard): number {
  return player.askingPrice ?? player.marketValue ?? 1_000_000;
}

function activeOffer(status: OfferStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export default function TransferMarket({
  team,
  league,
  market,
  onChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("market");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newsFilter, setNewsFilter] = useState<NewsFilter>("all");
  const [expandedReportSeason, setExpandedReportSeason] = useState<
    number | null
  >(market.seasonReports[0]?.season ?? null);

  const seasonNumber = Math.max(1, Number(league.season ?? 1));
  const locked = seasonNumber <= 1;

  const clubs = useMemo(
    () => [
      {
        id: PLAYER_ID,
        name: team.name,
        crestIcon: team.crestIcon,
        players: team.players.map((player) =>
          enrichMarketPlayer(player, PLAYER_ID, seasonNumber),
        ),
      },
      ...AI_TEAMS.map((club) => ({
        id: club.id,
        name: club.name,
        crestIcon: club.crestIcon,
        players: (league.aiSquads?.[club.id] ?? club.players).map((player) =>
          enrichMarketPlayer(player, club.id, seasonNumber),
        ),
      })),
    ],
    [league.aiSquads, seasonNumber, team],
  );

  const allPlayers = useMemo(
    () =>
      clubs.flatMap((club) => club.players.map((player) => ({ player, club }))),
    [clubs],
  );

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return allPlayers
      .filter(
        ({ player, club }) =>
          !normalizedQuery ||
          player.name.toLowerCase().includes(normalizedQuery) ||
          club.name.toLowerCase().includes(normalizedQuery),
      )
      .filter(({ player }) => role === "all" || player.role === role)
      .filter(
        ({ player }) => status === "all" || player.marketStatus === status,
      )
      .sort((a, b) => getPlayerOverall(b.player) - getPlayerOverall(a.player));
  }, [allPlayers, query, role, status]);

  const finance = market.finances[PLAYER_ID];
  const incoming = market.offers.filter(
    (offer) => offer.toClubId === PLAYER_ID && activeOffer(offer.status),
  );
  const outgoing = market.offers.filter(
    (offer) => offer.fromClubId === PLAYER_ID && activeOffer(offer.status),
  );
  const archivedOffers = market.offers
    .filter(
      (offer) =>
        (offer.fromClubId === PLAYER_ID || offer.toClubId === PLAYER_ID) &&
        !activeOffer(offer.status),
    )
    .slice(0, 16);
  const listedCount = allPlayers.filter(
    ({ player }) => player.marketStatus === "listed",
  ).length;
  const currentSeasonTransactions = market.transactions.filter(
    (transaction) => transaction.season === seasonNumber,
  );
  const playerPurchases = currentSeasonTransactions.filter(
    (transaction) => transaction.buyerId === PLAYER_ID,
  );
  const playerSales = currentSeasonTransactions.filter(
    (transaction) => transaction.sellerId === PLAYER_ID,
  );
  const seasonSpent = playerPurchases.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const seasonReceived = playerSales.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const netSpend = seasonSpent - seasonReceived;
  const wageSpace = Math.max(
    0,
    (finance?.wageBudget ?? 0) - (finance?.payroll ?? 0),
  );
  const visibleNews = market.newsFeed.filter(
    (item) => newsFilter === "all" || item.kind === newsFilter,
  );

  const submitOffer = (
    player: PlayerCard,
    clubId: string,
    clubName: string,
    amount: number,
  ) => {
    onChange(
      placeUserOffer(market, team, league, player, clubId, clubName, amount),
    );
  };

  const act = (
    id: string,
    action: "accept" | "reject" | "counter" | "withdraw",
    amount?: number,
  ) => {
    const result = respondToOffer(market, team, league, id, action, amount);
    onChange(result.state, result.team, result.league);
  };

  return (
    <div
      className="min-h-screen px-4 pb-28 pt-6"
      style={{ background: "#0a0e1a" }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
            style={{
              background: `${team.jerseyColor}2b`,
              border: `1px solid ${team.jerseyColor}55`,
            }}
          >
            🛒
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Transfer Market</h1>
            <p className="text-xs text-gray-400">
              Season {seasonNumber} · Week {league.trainingWeek ?? 0}
            </p>
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-2 text-right"
          style={{
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.08)",
          }}
        >
          <div className="text-[9px] uppercase text-gray-500">Budget</div>
          <div
            className="font-black"
            style={{ color: locked ? "#9ca3af" : "#34d399" }}
          >
            {locked ? "Locked" : formatMoney(finance?.budget ?? 0)}
          </div>
        </div>
      </div>

      {!locked && (
        <div className="mb-4 grid grid-cols-4 gap-2">
          {[
            {
              label: "Wage space",
              value: `${formatMoney(wageSpace)}/w`,
              color: "#38bdf8",
            },
            {
              label: "Bought",
              value: playerPurchases.length,
              color: "#ffffff",
            },
            {
              label: "Sold",
              value: playerSales.length,
              color: "#ffffff",
            },
            {
              label: "Net spend",
              value:
                netSpend === 0
                  ? formatMoney(0)
                  : `${netSpend < 0 ? "+" : "-"}${formatMoney(
                      Math.abs(netSpend),
                    )}`,
              color: netSpend <= 0 ? "#34d399" : "#fbbf24",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-xl px-2 py-2.5 text-center"
              style={{
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.07)",
              }}
            >
              <div className="truncate text-[8px] font-bold uppercase text-gray-500">
                {item.label}
              </div>
              <div
                className="mt-1 truncate text-[10px] font-black"
                style={{ color: item.color }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {(["market", "offers", "finance", "news", "reports"] as Tab[]).map(
          (item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className="rounded-lg px-1 py-2 text-[10px] font-black capitalize"
              style={{
                background:
                  tab === item
                    ? "rgba(0,230,118,.15)"
                    : "rgba(255,255,255,.05)",
                color: tab === item ? "#00e676" : "#9ca3af",
                border: `1px solid ${
                  tab === item ? "rgba(0,230,118,.3)" : "rgba(255,255,255,.06)"
                }`,
              }}
            >
              {item}
              {item === "offers" && incoming.length > 0
                ? ` (${incoming.length})`
                : ""}
            </button>
          ),
        )}
      </div>

      {locked && (
        <div
          className="mb-4 rounded-xl p-4"
          style={{
            background: "rgba(56,189,248,.08)",
            border: "1px solid rgba(56,189,248,.25)",
          }}
        >
          <div className="font-black text-white">🔒 Season 1 scouting-only</div>
          <p className="mt-1 text-xs leading-5 text-gray-400">
            Browse every club now. Prize money, offers and AI transfers unlock
            when Season 2 begins.
          </p>
        </div>
      )}

      {tab === "market" && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              {
                label: "Players",
                value: allPlayers.length,
                color: "#ffffff",
              },
              {
                label: "Listed",
                value: listedCount,
                color: "#4ade80",
              },
              {
                label: "Your squad",
                value: `${team.players.length}/${MAX_SQUAD_SIZE}`,
                color: "#ffffff",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl p-3"
                style={{
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.07)",
                }}
              >
                <div className="text-[9px] font-bold uppercase text-gray-500">
                  {item.label}
                </div>
                <div
                  className="text-lg font-black"
                  style={{ color: item.color }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player or club..."
            className="mb-2 w-full rounded-xl px-3 py-3 text-sm text-white outline-none"
            style={{
              background: "rgba(255,255,255,.055)",
              border: "1px solid rgba(255,255,255,.1)",
            }}
          />

          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                "all",
                "goalkeeper",
                "defender",
                "midfielder",
                "forward",
                "striker",
              ] as RoleFilter[]
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRole(item)}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize"
                style={{
                  background:
                    role === item
                      ? "rgba(0,230,118,.15)"
                      : "rgba(255,255,255,.04)",
                  color: role === item ? "#00e676" : "#9ca3af",
                  border: `1px solid ${
                    role === item
                      ? "rgba(0,230,118,.3)"
                      : "rgba(255,255,255,.07)"
                  }`,
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                "all",
                "listed",
                "available",
                "not_for_sale",
                "untouchable",
              ] as StatusFilter[]
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold"
                style={{
                  background:
                    status === item
                      ? "rgba(56,189,248,.15)"
                      : "rgba(255,255,255,.04)",
                  color: status === item ? "#38bdf8" : "#9ca3af",
                  border: `1px solid ${
                    status === item
                      ? "rgba(56,189,248,.3)"
                      : "rgba(255,255,255,.07)"
                  }`,
                }}
              >
                {item === "all" ? "All status" : statusLabel[item]}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredPlayers.map(({ player, club }) => {
              const open = selectedId === player.id;
              const marketStatus = player.marketStatus ?? "available";
              const ask = transferFee(player);
              const existingBid = outgoing.find(
                (offer) =>
                  offer.playerId === player.id && activeOffer(offer.status),
              );
              const career = market.playerCareers[player.id] ?? [];
              const isOwnPlayer = club.id === PLAYER_ID;
              const canBid =
                !locked &&
                !isOwnPlayer &&
                marketStatus !== "untouchable" &&
                marketStatus !== "not_for_sale" &&
                !existingBid;

              return (
                <div
                  key={player.id}
                  className="rounded-xl p-3"
                  style={{
                    background: open
                      ? "rgba(56,189,248,.08)"
                      : "rgba(255,255,255,.035)",
                    border: `1px solid ${
                      open ? "rgba(56,189,248,.3)" : "rgba(255,255,255,.07)"
                    }`,
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => setSelectedId(open ? null : player.id)}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white"
                      style={{ background: "rgba(255,255,255,.08)" }}
                    >
                      {getPlayerOverall(player)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white">
                        {player.name}
                      </div>
                      <div className="truncate text-xs capitalize text-gray-400">
                        {club.crestIcon} {club.name} · {player.role} · age{" "}
                        {player.age}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">
                        {formatMoney(player.marketValue ?? 0)}
                      </div>
                      <div
                        className="text-[10px] font-bold"
                        style={{ color: statusTone[marketStatus] }}
                      >
                        {statusLabel[marketStatus]}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="mb-3 grid grid-cols-4 gap-2">
                        <div>
                          <div className="text-[9px] uppercase text-gray-500">
                            Potential
                          </div>
                          <div className="text-xs font-black text-white">
                            {player.potential}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase text-gray-500">
                            Wage
                          </div>
                          <div className="text-xs font-black text-white">
                            {formatMoney(player.weeklyWage ?? 0)}/w
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase text-gray-500">
                            Asking
                          </div>
                          <div className="text-xs font-black text-white">
                            {formatMoney(ask)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase text-gray-500">
                            Squad
                          </div>
                          <div className="text-xs font-black text-white">
                            {club.players.length}/{MAX_SQUAD_SIZE}
                          </div>
                        </div>
                      </div>

                      {/* FTA_MARKET_STATS */}
                      <div className="mb-3 rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="mb-2 text-[9px] font-black uppercase tracking-wider text-gray-500">
                          Player Stats
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {Object.entries(player.stats).map(([key, value]) => (
                            <div
                              key={key}
                              className="rounded-lg bg-white/[0.045] px-2 py-2 text-center"
                            >
                              <div className="truncate text-[8px] font-bold uppercase text-gray-500">
                                {key.replace(/([A-Z])/g, " $1")}
                              </div>
                              <div className="mt-0.5 text-sm font-black text-white">
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div
                        className="mb-3 rounded-lg px-3 py-2"
                        style={{ background: "rgba(255,255,255,.035)" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[9px] font-black uppercase text-gray-500">
                            Career
                          </div>
                          <div className="truncate text-[10px] font-bold text-gray-300">
                            {career.length === 0
                              ? `${club.name} · current club`
                              : `${career.length} recorded event${
                                  career.length === 1 ? "" : "s"
                                }`}
                          </div>
                        </div>
                        {career.slice(0, 2).map((entry) => (
                          <div
                            key={entry.id}
                            className="mt-1.5 flex items-center justify-between gap-2 text-[9px]"
                          >
                            <span className="truncate text-gray-400">
                              S{entry.season} ·{" "}
                              {entry.type === "transfer"
                                ? `${entry.fromClubName} → ${entry.toClubName}`
                                : entry.clubName}
                            </span>
                            <span className="shrink-0 font-black text-white">
                              {entry.type === "transfer"
                                ? formatMoney(entry.fee ?? 0)
                                : `OVR ${entry.overall ?? getPlayerOverall(player)}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {isOwnPlayer ? (
                        <div
                          className="rounded-lg p-2 text-center text-[10px] font-bold text-gray-400"
                          style={{ background: "rgba(255,255,255,.04)" }}
                        >
                          Manage this player in Team Setup.
                        </div>
                      ) : existingBid ? (
                        <div
                          className="rounded-lg p-2 text-center text-[10px] font-black text-sky-400"
                          style={{ background: "rgba(56,189,248,.1)" }}
                        >
                          Active bid:{" "}
                          {formatMoney(
                            existingBid.counterAmount ?? existingBid.amount,
                          )}{" "}
                          · {existingBid.status}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {[0.9, 1, 1.12].map((multiplier, index) => (
                            <button
                              key={multiplier}
                              type="button"
                              disabled={!canBid}
                              onClick={() =>
                                submitOffer(
                                  player,
                                  club.id,
                                  club.name,
                                  Math.round(ask * multiplier),
                                )
                              }
                              className="rounded-lg px-2 py-2 text-[10px] font-black disabled:opacity-30"
                              style={{
                                background: "rgba(34,197,94,.13)",
                                color: "#22c55e",
                              }}
                            >
                              {index === 0
                                ? "Low"
                                : index === 1
                                  ? "Ask"
                                  : "Strong"}
                              <br />
                              {formatMoney(ask * multiplier)}
                            </button>
                          ))}
                        </div>
                      )}

                      {!canBid && !isOwnPlayer && !existingBid && !locked && (
                        <p className="mt-2 text-center text-[10px] text-gray-500">
                          {marketStatus === "untouchable" ||
                          marketStatus === "not_for_sale"
                            ? "The club will not negotiate for this player."
                            : "This bid is currently unavailable."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredPlayers.length === 0 && (
              <div
                className="rounded-xl p-5 text-center text-xs text-gray-500"
                style={{ background: "rgba(255,255,255,.04)" }}
              >
                No players match those filters.
              </div>
            )}
          </div>
        </>
      )}

      {tab === "offers" && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-xs font-black uppercase text-gray-500">
              Incoming offers
            </h2>

            {incoming.length === 0 ? (
              <div
                className="rounded-xl p-4 text-xs text-gray-500"
                style={{ background: "rgba(255,255,255,.04)" }}
              >
                No incoming offers.
              </div>
            ) : (
              incoming.map((offer) => {
                const waitingForAI =
                  offer.status === "countered" &&
                  offer.counteredByClubId === PLAYER_ID;
                const amount = offer.counterAmount ?? offer.amount;

                return (
                  <div
                    key={offer.id}
                    className="mb-2 rounded-xl p-3"
                    style={{
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.07)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-black text-white">
                          {offer.playerName}
                        </div>
                        <div className="text-xs text-gray-500">
                          Bid from {offer.fromClubName}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-emerald-400">
                          {formatMoney(amount)}
                        </div>
                        <div
                          className="text-[9px] font-black uppercase"
                          style={{ color: offerTone[offer.status] }}
                        >
                          {waitingForAI ? "Negotiating" : offer.status}
                        </div>
                      </div>
                    </div>

                    {waitingForAI ? (
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <div
                          className="rounded-lg px-2 py-2 text-[10px] font-bold text-amber-300"
                          style={{ background: "rgba(251,191,36,.08)" }}
                        >
                          Waiting for the AI club’s response next week.
                        </div>
                        <button
                          type="button"
                          onClick={() => act(offer.id, "withdraw")}
                          className="rounded-lg px-3 text-[10px] font-black text-gray-300"
                          style={{ background: "rgba(255,255,255,.07)" }}
                        >
                          Withdraw
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => act(offer.id, "accept")}
                          className="rounded bg-emerald-500/15 py-2 text-[10px] font-black text-emerald-400"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => act(offer.id, "reject")}
                          className="rounded bg-rose-500/15 py-2 text-[10px] font-black text-rose-400"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            act(
                              offer.id,
                              "counter",
                              Math.round(offer.amount * 1.15),
                            )
                          }
                          className="rounded bg-sky-500/15 py-2 text-[10px] font-black text-sky-400"
                        >
                          Negotiate +15%
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-black uppercase text-gray-500">
              Active bids
            </h2>

            {outgoing.length === 0 ? (
              <div
                className="rounded-xl p-4 text-xs text-gray-500"
                style={{ background: "rgba(255,255,255,.04)" }}
              >
                No active bids.
              </div>
            ) : (
              outgoing.map((offer) => {
                const sellerCountered =
                  offer.status === "countered" &&
                  offer.counteredByClubId === offer.toClubId;
                const amount = offer.counterAmount ?? offer.amount;

                return (
                  <div
                    key={offer.id}
                    className="mb-2 rounded-xl p-3"
                    style={{
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.07)",
                    }}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-black text-white">
                          {offer.playerName}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {offer.toClubName}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-white">
                          {formatMoney(amount)}
                        </div>
                        <div
                          className="text-[10px] font-black uppercase"
                          style={{ color: offerTone[offer.status] }}
                        >
                          {sellerCountered ? "Counteroffer" : offer.status}
                        </div>
                      </div>
                    </div>

                    {sellerCountered && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => act(offer.id, "accept")}
                          className="rounded bg-emerald-500/15 py-2 text-[10px] font-black text-emerald-400"
                        >
                          Accept counteroffer
                        </button>
                        <button
                          type="button"
                          onClick={() => act(offer.id, "withdraw")}
                          className="rounded bg-gray-500/15 py-2 text-[10px] font-black text-gray-300"
                        >
                          Withdraw
                        </button>
                      </div>
                    )}

                    {offer.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => act(offer.id, "withdraw")}
                        className="mt-2 w-full rounded bg-gray-500/15 py-2 text-[10px] font-black text-gray-300"
                      >
                        Withdraw bid
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-black uppercase text-gray-500">
              Offer archive
            </h2>
            {archivedOffers.length === 0 ? (
              <div
                className="rounded-xl p-4 text-xs text-gray-500"
                style={{ background: "rgba(255,255,255,.04)" }}
              >
                Completed, rejected and withdrawn offers will appear here.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/10">
                {archivedOffers.map((offer) => (
                  <div
                    key={`archive-${offer.id}`}
                    className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2.5 last:border-b-0"
                    style={{ background: "rgba(255,255,255,.03)" }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-white">
                        {offer.playerName}
                      </div>
                      <div className="truncate text-[9px] text-gray-500">
                        {offer.fromClubName} → {offer.toClubName} · S
                        {offer.createdSeason ?? seasonNumber} W
                        {offer.createdWeek}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-black text-gray-200">
                        {formatMoney(offer.counterAmount ?? offer.amount)}
                      </div>
                      <div
                        className="text-[8px] font-black uppercase"
                        style={{ color: offerTone[offer.status] }}
                      >
                        {offer.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "finance" && (
        <div className="space-y-4">
          <section
            className="rounded-2xl p-4"
            style={{
              background: `${team.jerseyColor}12`,
              border: `1px solid ${team.jerseyColor}44`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                  Your club · Season {seasonNumber}
                </div>
                <div className="mt-1 text-lg font-black text-white">
                  Financial summary
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-gray-500">Balance</div>
                <div className="font-black text-emerald-400">
                  {locked ? "Locked" : formatMoney(finance?.budget ?? 0)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/20 px-2 py-3">
                <div className="text-[8px] uppercase text-gray-500">Spent</div>
                <div className="mt-1 text-xs font-black text-rose-300">
                  {formatMoney(seasonSpent)}
                </div>
              </div>
              <div className="rounded-xl bg-black/20 px-2 py-3">
                <div className="text-[8px] uppercase text-gray-500">Income</div>
                <div className="mt-1 text-xs font-black text-emerald-300">
                  {formatMoney(seasonReceived)}
                </div>
              </div>
              <div className="rounded-xl bg-black/20 px-2 py-3">
                <div className="text-[8px] uppercase text-gray-500">
                  Net spend
                </div>
                <div
                  className="mt-1 text-xs font-black"
                  style={{ color: netSpend <= 0 ? "#6ee7b7" : "#fcd34d" }}
                >
                  {netSpend < 0 ? "+" : ""}
                  {formatMoney(Math.abs(netSpend))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[9px] text-gray-500">
                <span>Weekly payroll</span>
                <span className="font-bold text-gray-300">
                  {formatMoney(finance?.payroll ?? 0)} /{" "}
                  {formatMoney(finance?.wageBudget ?? 0)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      ((finance?.payroll ?? 0) /
                        Math.max(1, finance?.wageBudget ?? 1)) *
                        100,
                    )}%`,
                    background:
                      (finance?.payroll ?? 0) > (finance?.wageBudget ?? 1) * 0.9
                        ? "#fb7185"
                        : "#38bdf8",
                  }}
                />
              </div>
              <div className="mt-1.5 text-right text-[9px] text-sky-300">
                {formatMoney(wageSpace)}/w available
              </div>
            </div>
          </section>

          <h2 className="text-xs font-black uppercase text-gray-500">
            League finances
          </h2>
          <div className="space-y-3">
            {Object.values(market.finances)
              .sort((a, b) =>
                a.clubId === PLAYER_ID
                  ? -1
                  : b.clubId === PLAYER_ID
                    ? 1
                    : b.budget - a.budget,
              )
              .map((clubFinance) => {
                const club = clubs.find(
                  (item) => item.id === clubFinance.clubId,
                );
                const hidden = locked && clubFinance.clubId === PLAYER_ID;

                return (
                  <div
                    key={clubFinance.clubId}
                    className="rounded-xl p-3"
                    style={{
                      background:
                        clubFinance.clubId === PLAYER_ID
                          ? `${team.jerseyColor}12`
                          : "rgba(255,255,255,.04)",
                      border: `1px solid ${
                        clubFinance.clubId === PLAYER_ID
                          ? `${team.jerseyColor}44`
                          : "rgba(255,255,255,.07)"
                      }`,
                    }}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="font-black text-white">
                        {club?.crestIcon} {club?.name ?? clubFinance.clubId}
                      </div>
                      <div className="font-black text-emerald-400">
                        {hidden
                          ? "Unlocks S2"
                          : formatMoney(clubFinance.budget)}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[9px]">
                      <div>
                        <div className="text-gray-500">Payroll</div>
                        <div className="text-white">
                          {formatMoney(clubFinance.payroll)}/w
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Wage cap</div>
                        <div className="text-white">
                          {formatMoney(clubFinance.wageBudget)}/w
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Sales</div>
                        <div className="text-white">
                          {formatMoney(clubFinance.sales)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Spent</div>
                        <div className="text-white">
                          {formatMoney(clubFinance.purchases)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <section>
            <h2 className="mb-2 text-xs font-black uppercase text-gray-500">
              Transfer history
            </h2>
            {market.transactions.length === 0 ? (
              <div
                className="rounded-xl p-4 text-xs text-gray-500"
                style={{ background: "rgba(255,255,255,.04)" }}
              >
                No completed transfers yet.
              </div>
            ) : (
              market.transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="mb-2 rounded-xl p-3"
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.07)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white">
                        {transaction.playerName}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {transaction.sellerName} → {transaction.buyerName}
                      </div>
                      <div className="text-[9px] text-gray-600">
                        Season {transaction.season} · Week {transaction.week}
                      </div>
                    </div>
                    <div className="font-black text-emerald-400">
                      {formatMoney(transaction.amount)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {tab === "news" && (
        <div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                "all",
                "offer",
                "negotiation",
                "transfer",
                "finance",
                "system",
              ] as NewsFilter[]
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setNewsFilter(item)}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black capitalize"
                style={{
                  background:
                    newsFilter === item
                      ? "rgba(56,189,248,.15)"
                      : "rgba(255,255,255,.04)",
                  border: `1px solid ${
                    newsFilter === item
                      ? "rgba(56,189,248,.3)"
                      : "rgba(255,255,255,.07)"
                  }`,
                  color: newsFilter === item ? "#38bdf8" : "#9ca3af",
                }}
              >
                {item}
              </button>
            ))}
          </div>

          {visibleNews.length === 0 ? (
            <div
              className="rounded-xl p-4 text-xs text-gray-500"
              style={{ background: "rgba(255,255,255,.04)" }}
            >
              No news in this category yet.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNews.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-xl p-3"
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.06)",
                  }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                    style={{ background: `${newsTone[item.kind]}18` }}
                  >
                    {newsIcon[item.kind]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-5 text-gray-300">
                      {item.headline}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[9px]">
                      <span
                        className="font-black uppercase"
                        style={{ color: newsTone[item.kind] }}
                      >
                        {item.kind}
                      </span>
                      <span className="text-gray-600">
                        Season {item.season} · Week {item.week}
                      </span>
                      {item.amount !== undefined && (
                        <span className="ml-auto font-black text-gray-300">
                          {formatMoney(item.amount)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-3">
          {market.seasonReports.length === 0 ? (
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.07)",
              }}
            >
              <div className="text-2xl">📊</div>
              <div className="mt-2 text-sm font-black text-white">
                Season report pending
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Finish the current season and start the next one. The complete
                league, transfer and finance report will be archived here.
              </p>
            </div>
          ) : (
            market.seasonReports.map((report) => {
              const expanded = expandedReportSeason === report.season;
              const playerSummary = report.clubs.find(
                (club) => club.clubId === PLAYER_ID,
              );
              const playerNet = playerSummary
                ? playerSummary.transferSpent - playerSummary.transferReceived
                : 0;

              return (
                <section
                  key={report.id}
                  className="overflow-hidden rounded-2xl"
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: `1px solid ${
                      expanded ? "rgba(251,191,36,.3)" : "rgba(255,255,255,.07)"
                    }`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedReportSeason(expanded ? null : report.season)
                    }
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-wider text-amber-300">
                          Season {report.season} review
                        </div>
                        <div className="mt-1 text-base font-black text-white">
                          🏆 {report.championName}
                        </div>
                        <div className="mt-1 text-[10px] text-gray-500">
                          Your finish: #{report.playerFinish}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase text-gray-600">
                          Market volume
                        </div>
                        <div className="mt-1 font-black text-emerald-400">
                          {formatMoney(report.totalTransferValue)}
                        </div>
                        <div className="text-[9px] text-gray-500">
                          {report.transfersCompleted} deal
                          {report.transfersCompleted === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-black/20 p-2.5">
                        <div className="text-[8px] uppercase text-gray-600">
                          Prize
                        </div>
                        <div className="mt-1 text-[10px] font-black text-white">
                          {formatMoney(playerSummary?.prizeMoney ?? 0)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-black/20 p-2.5">
                        <div className="text-[8px] uppercase text-gray-600">
                          Net spend
                        </div>
                        <div
                          className="mt-1 text-[10px] font-black"
                          style={{
                            color: playerNet <= 0 ? "#6ee7b7" : "#fcd34d",
                          }}
                        >
                          {playerNet < 0 ? "+" : ""}
                          {formatMoney(Math.abs(playerNet))}
                        </div>
                      </div>
                      <div className="rounded-xl bg-black/20 p-2.5">
                        <div className="text-[8px] uppercase text-gray-600">
                          Final budget
                        </div>
                        <div className="mt-1 text-[10px] font-black text-white">
                          {formatMoney(playerSummary?.endingBudget ?? 0)}
                        </div>
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-white/10 px-4 pb-4 pt-3">
                      {report.biggestTransfer && (
                        <div className="mb-3 rounded-xl bg-emerald-400/[0.07] p-3">
                          <div className="text-[8px] font-black uppercase text-emerald-400">
                            Biggest transfer
                          </div>
                          <div className="mt-1 flex justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-black text-white">
                                {report.biggestTransfer.playerName}
                              </div>
                              <div className="truncate text-[9px] text-gray-500">
                                {report.biggestTransfer.sellerName} →{" "}
                                {report.biggestTransfer.buyerName}
                              </div>
                            </div>
                            <div className="shrink-0 text-xs font-black text-emerald-300">
                              {formatMoney(report.biggestTransfer.amount)}
                            </div>
                          </div>
                        </div>
                      )}

                      {report.standout && (
                        <div className="mb-3 rounded-xl bg-sky-400/[0.07] p-3">
                          <div className="text-[8px] font-black uppercase text-sky-400">
                            Development standout
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-black text-white">
                                {report.standout.playerName}
                              </div>
                              <div className="truncate text-[9px] text-gray-500">
                                {report.standout.clubName}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-black text-sky-300">
                                +{report.standout.seasonGrowth}
                              </div>
                              <div className="text-[8px] text-gray-600">
                                OVR {report.standout.overall}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="overflow-hidden rounded-xl border border-white/10">
                        {[...report.clubs]
                          .sort((a, b) => a.finalPosition - b.finalPosition)
                          .map((club) => (
                            <div
                              key={`${report.season}-${club.clubId}`}
                              className="grid grid-cols-[24px_1fr_auto] items-center gap-2 border-b border-white/5 px-2.5 py-2 last:border-b-0"
                              style={{
                                background:
                                  club.clubId === PLAYER_ID
                                    ? `${team.jerseyColor}12`
                                    : "rgba(0,0,0,.12)",
                              }}
                            >
                              <div className="text-center text-[10px] font-black text-gray-500">
                                {club.finalPosition}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-[10px] font-black text-white">
                                  {club.clubName}
                                </div>
                                <div className="text-[8px] text-gray-600">
                                  {club.won}W {club.drawn}D {club.lost}L · GD{" "}
                                  {club.goalDifference >= 0 ? "+" : ""}
                                  {club.goalDifference}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] font-black text-gray-300">
                                  {club.points} pts
                                </div>
                                <div
                                  className="text-[8px]"
                                  style={{
                                    color:
                                      club.outcome === "Champion"
                                        ? "#fbbf24"
                                        : "#64748b",
                                  }}
                                >
                                  {club.outcome}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
