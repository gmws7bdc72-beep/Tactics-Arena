import type { LeagueState, TeamConfig } from "../engine/types";

interface Props {
  team: TeamConfig;
  league: LeagueState;
}

export default function TransferMarket({ team, league }: Props) {
  const seasonFinished = league.currentMatchIndex >= league.schedule.length;

  return (
    <div
      className="min-h-screen px-4 pb-28 pt-6"
      style={{ background: "#0a0e1a" }}
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">
            Club recruitment
          </p>
          <h1 className="text-2xl font-black text-white">Transfer Market</h1>
        </div>
        <div
          className="rounded-xl px-3 py-2 text-right"
          style={{
            background: "rgba(56,189,248,0.08)",
            border: "1px solid rgba(56,189,248,0.18)",
          }}
        >
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Club</div>
          <div className="max-w-[130px] truncate text-sm font-bold text-white">
            {team.name}
          </div>
        </div>
      </div>

      {!seasonFinished ? (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "linear-gradient(145deg, rgba(30,41,59,0.82), rgba(15,23,42,0.82))",
            border: "1px solid rgba(96,165,250,0.18)",
          }}
        >
          <div className="mb-3 text-4xl">🔒</div>
          <h2 className="text-lg font-black text-white">Market locked for Season One</h2>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            Clubs begin without transfer funds. Prize money is paid after the first
            season, then offers, listings, negotiations, and bidding wars become active.
          </p>
          <div className="mt-4 rounded-xl bg-black/20 p-3 text-sm text-gray-300">
            Finish the current league and playoff to unlock club finances.
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.22)",
          }}
        >
          <div className="mb-2 text-3xl">⚙️</div>
          <h2 className="text-lg font-black text-white">Market foundation installed</h2>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            The navigation and season lock are ready. Player valuation, squad expansion,
            offers, AI bidding, and persistent finances are the next implementation layer.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          ["Available players", "Coming next"],
          ["Incoming offers", "None"],
          ["Active bids", "None"],
          ["Transfer list", "0 / 5"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl p-3"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="text-[11px] text-gray-500">{label}</div>
            <div className="mt-1 text-sm font-bold text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
