import { useMemo, useState } from "react";
import type { TeamConfig } from "../engine/types";

interface Props {
  team: TeamConfig;
  onComplete: (name: string) => void;
}

const DEFAULT_TEAM_NAMES = new Set(["", "My Team"]);

export default function TeamNameSetup({ team, onComplete }: Props) {
  const initialName = DEFAULT_TEAM_NAMES.has(team.name.trim()) ? "" : team.name.trim();
  const [name, setName] = useState(initialName);
  const normalizedName = useMemo(() => name.trim().replace(/\s+/g, " "), [name]);
  const canContinue = normalizedName.length > 0;

  const submit = () => {
    if (!canContinue) return;
    onComplete(normalizedName);
  };

  return (
    <div className="min-h-[100dvh] bg-[#070b14] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md items-center">
        <section className="w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] shadow-2xl">
          <div
            className="relative px-6 pb-7 pt-8 text-center"
            style={{
              background: `radial-gradient(circle at 50% 10%, ${team.jerseyColor}55, transparent 58%)`,
            }}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/15 bg-black/30 text-5xl shadow-xl">
              {team.crestIcon}
            </div>
            <div className="mt-5 text-[10px] font-black uppercase tracking-[.28em] text-emerald-300">
              Tutorial complete
            </div>
            <h1 className="mt-2 text-3xl font-black">Name your club</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-gray-300">
              This is the name that will appear in matches, the league table, transfers, and your club history.
            </p>
          </div>

          <div className="border-t border-white/10 px-5 pb-6 pt-5">
            <label
              htmlFor="first-club-name"
              className="mb-2 block text-xs font-black uppercase tracking-[.18em] text-gray-400"
            >
              Club name
            </label>
            <input
              id="first-club-name"
              autoFocus
              autoComplete="off"
              maxLength={28}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Enter your team name"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-black text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400"
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
              <span>You can still change it later in Kit Workshop.</span>
              <span>{name.length}/28</span>
            </div>

            <button
              type="button"
              disabled={!canContinue}
              onClick={submit}
              className="mt-5 w-full rounded-2xl py-4 text-sm font-black text-[#03150c] transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35"
              style={{ background: "linear-gradient(135deg,#00e676,#22d3ee)" }}
            >
              Begin Career
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
