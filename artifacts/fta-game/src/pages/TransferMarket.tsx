import type { LeagueState, TeamConfig } from "../engine/types";

interface Props {
  team: TeamConfig;
  league: LeagueState;
}

export default function TransferMarket({ team, league }: Props) {
  const seasonNumber = Math.max(1, Number((league as LeagueState & { season?: number }).season ?? 1));
  const locked = seasonNumber <= 1;

  return (
    <div className="min-h-screen px-4 pb-28 pt-6" style={{ background: "#0a0e1a" }}>
      <div className="mb-5 flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
          style={{ background: `${team.jerseyColor}2b`, border: `1px solid ${team.jerseyColor}55` }}
        >
          🛒
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Transfer Market</h1>
          <p className="text-xs text-gray-400">Recruit, sell and build your squad</p>
        </div>
      </div>

      <div
        className="rounded-2xl p-5 text-center"
        style={{
          background: locked ? "rgba(56,189,248,0.06)" : "rgba(0,230,118,0.06)",
          border: locked ? "1px solid rgba(56,189,248,0.22)" : "1px solid rgba(0,230,118,0.22)",
        }}
      >
        <div className="mb-2 text-4xl">{locked ? "🔒" : "⚽"}</div>
        <div className="text-lg font-black text-white">
          {locked ? "Market Opens After Season One" : "Market Ready"}
        </div>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-gray-400">
          {locked
            ? "Clubs begin without transfer funds. Prize money awarded at the end of the first season will activate buying and selling."
            : "Player listings, offers and bidding activity will appear here in the transfer-system phase."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {["All Players", "Transfer Listed", "My Offers", "Incoming Offers"].map((label) => (
          <div
            key={label}
            className="rounded-xl px-3 py-4 text-center text-sm font-bold text-gray-500"
            style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
