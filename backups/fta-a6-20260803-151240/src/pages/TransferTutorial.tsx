import { useMemo, useState } from "react";
import type { TeamConfig } from "../engine/types";
import { formatMoney, getPlayerOverall } from "../game/transferDatabase";

interface Props {
  team: TeamConfig;
  onBack: () => void;
  onComplete: () => void;
}

const slides = [
  {
    title: "Read the whole player card",
    text: "Open a player to compare role, ability, every stat, age, potential, market value, wage, and transfer status. Overall is only a summary; the stat sheet tells you whether the player fits your tactic.",
  },
  {
    title: "Buying a player",
    text: "Choose a player, make an offer, and wait for the selling club. AI clubs may accept, reject, counter, or wait at least a week while checking whether a higher bid arrives. Squad capacity, transfer budget, and wage space still apply.",
  },
  {
    title: "Selling your players",
    text: "In Team Setup, open Manage, transfer-list the player, and choose an asking-price level. Incoming offers can be accepted, rejected, or countered. Remove the listing whenever you change your mind.",
  },
  {
    title: "Use statuses deliberately",
    text: "Listed players are actively for sale. Untouchable players are protected. Asking prices can be automatic, low, market, or high. AI clubs recruit for actual squad needs instead of buying completely at random.",
  },
  {
    title: "The ten-player transformation pool",
    text: "At season end, the game randomly selects up to 10 players who are still transfer-listed and were not sold. Only those eligible unsold listed players can be transformed. If fewer than 10 qualify, only the qualifying players are changed.",
  },
  {
    title: "Read the transformation news",
    text: "The news report identifies the old player, the newly generated replacement, and whether the replacement is better, worse, or approximately equal. Leaving someone listed through the season end intentionally puts them at risk.",
  },
];

export default function TransferTutorial({ team, onBack, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const sample = useMemo(() => team.players[0], [team.players]);
  const slide = slides[index];
  const final = index === slides.length - 1;

  return (
    <div className="min-h-[100dvh] bg-[#070b14] px-4 pb-8 pt-5 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <button onClick={onBack} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-gray-400">← Back</button>
          <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-400">Tutorial</div><div className="text-sm font-black">Transfer Market</div></div>
        </div>

        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full transition-all" style={{ width: `${((index + 1) / slides.length) * 100}%`, background: "linear-gradient(90deg,#00e676,#22d3ee)" }} /></div>

        <div className="rounded-3xl border border-white/10 bg-white/[.035] p-5 shadow-2xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: "linear-gradient(145deg,#0ea5e9,#6d28d9)" }}>{["📊","🤝","🏷️","🛡️","🔄","📰"][index]}</div>
          <div className="text-xs font-black uppercase tracking-[.18em] text-gray-500">Lesson {index + 1} of {slides.length}</div>
          <h1 className="mt-2 text-2xl font-black">{slide.title}</h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">{slide.text}</p>

          {index === 0 && sample && (
            <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-black/20 p-4">
              <div className="flex items-center justify-between"><div><div className="font-black">{sample.name}</div><div className="text-xs capitalize text-gray-500">{sample.role} · {sample.ability.replaceAll("_", " ")}</div></div><div className="rounded-xl bg-white/10 px-3 py-2 text-xl font-black">{getPlayerOverall(sample)}</div></div>
              <div className="mt-3 grid grid-cols-4 gap-2">{Object.entries(sample.stats).map(([key,value]) => <div key={key} className="rounded-lg bg-white/[.045] px-1.5 py-2 text-center"><div className="truncate text-[7px] font-bold uppercase text-gray-500">{key.replace(/([A-Z])/g," $1")}</div><div className="text-sm font-black">{value}</div></div>)}</div>
              <div className="mt-3 flex justify-between text-[10px] text-gray-500"><span>Value {formatMoney(sample.marketValue ?? 0)}</span><span>Potential {sample.potential ?? "—"}</span></div>
            </div>
          )}

          {index === 4 && (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4">
              <div className="text-xs font-black text-amber-200">ELIGIBILITY CHECK</div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-y-2 text-xs"><span className="text-gray-300">Still transfer-listed?</span><span className="font-black text-emerald-300">Required</span><span className="text-gray-300">Unsold at season end?</span><span className="font-black text-emerald-300">Required</span><span className="text-gray-300">Randomly selected among eligible players?</span><span className="font-black text-emerald-300">Up to 10</span></div>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button disabled={index === 0} onClick={() => setIndex((v) => Math.max(0, v - 1))} className="w-24 rounded-2xl border border-white/10 bg-white/[.04] py-3 text-sm font-bold text-gray-400 disabled:opacity-25">Back</button>
          <button onClick={() => final ? onComplete() : setIndex((v) => v + 1)} className="flex-1 rounded-2xl py-3 text-sm font-black" style={{ background: "linear-gradient(135deg,#00e676,#0891b2)" }}>{final ? "Open Transfer Market" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
