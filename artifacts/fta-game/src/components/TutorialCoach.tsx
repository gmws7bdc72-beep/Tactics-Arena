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
    <section className="border-t border-cyan-300/15 bg-[#07101c] px-3 pb-2.5 pt-2">
      <div className="mx-auto w-full max-w-2xl">
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg,#00e676,#22d3ee)",
            }}
          />
        </div>

        <div className="mt-2 flex items-start gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-[#04120d]"
            style={{ background: "linear-gradient(145deg,#6ee7b7,#22d3ee)" }}
          >
            {step + 1}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[13px] font-black leading-4 text-white">{title}</h2>
              <button
                type="button"
                onClick={onSkip}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-gray-500 transition-colors hover:text-white"
              >
                Exit
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-[15px] text-gray-300">{body}</p>
            {hint && (
              <p className="mt-1 text-[9px] font-semibold leading-[13px] text-cyan-200/85">
                {hint}
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={step === 0}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-bold text-gray-400 disabled:opacity-25"
          >
            Back
          </button>

          <div className="flex-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-gray-600">
            {step + 1} of {total}
          </div>

          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="min-w-[72px] rounded-lg px-3 py-1.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-30"
            style={{
              background: canContinue
                ? "linear-gradient(135deg,#00e676,#0891b2)"
                : "rgba(255,255,255,.08)",
            }}
          >
            {final ? "Finish" : canContinue ? "Next" : "Do task"}
          </button>
        </div>
      </div>
    </section>
  );
}
