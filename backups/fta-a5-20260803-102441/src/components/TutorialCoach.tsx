export type TutorialFocus =
  | "pitch"
  | "pass"
  | "longPass"
  | "combo"
  | "shoot"
  | "dive"
  | "curve"
  | "confirm"
  | "none";

interface Props {
  step: number;
  total: number;
  title: string;
  body: string;
  hint?: string;
  canContinue: boolean;
  final?: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export default function TutorialCoach({
  step,
  total,
  title,
  body,
  hint,
  canContinue,
  final = false,
  onBack,
  onNext,
  onSkip,
}: Props) {
  const progress = Math.round(((step + 1) / total) * 100);
  return (
    <div className="pointer-events-none absolute left-2 right-2 top-[58px] z-[70] flex justify-center sm:top-[70px]">
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-cyan-300/25 bg-[#08111f]/95 shadow-2xl backdrop-blur-xl">
        <div className="h-1 bg-white/5"><div className="h-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#00e676,#22d3ee)" }} /></div>
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-[#04120d]" style={{ background: "linear-gradient(145deg,#6ee7b7,#22d3ee)" }}>{step + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white">{title}</div>
              <p className="mt-1 text-xs leading-5 text-gray-300">{body}</p>
              {hint && <div className="mt-2 rounded-lg border border-white/8 bg-white/[.045] px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200">{hint}</div>}
            </div>
            <button onClick={onSkip} className="rounded-lg px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-white">Exit</button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button onClick={onBack} disabled={step === 0} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-gray-400 disabled:opacity-25">Back</button>
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600">{step + 1} / {total}</span>
            <button onClick={onNext} disabled={!canContinue} className="rounded-xl px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-30" style={{ background: canContinue ? "linear-gradient(135deg,#00e676,#0891b2)" : "rgba(255,255,255,.08)" }}>
              {final ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
