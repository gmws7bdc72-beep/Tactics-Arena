import { useState } from "react";

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
  const [expanded, setExpanded] = useState(false);
  const progress = Math.round(((step + 1) / total) * 100);

  return (
    <div className="pointer-events-none absolute right-2 top-[54px] z-[70] flex justify-end sm:right-3 sm:top-[68px]">
      <div className="pointer-events-auto w-[82vw] max-w-[300px] overflow-hidden rounded-xl border border-cyan-300/25 bg-[#08111f]/94 shadow-xl backdrop-blur-xl">
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full transition-all"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg,#00e676,#22d3ee)",
            }}
          />
        </div>

        <div className="px-2.5 py-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-[#04120d]"
              style={{ background: "linear-gradient(145deg,#6ee7b7,#22d3ee)" }}
            >
              {step + 1}
            </div>

            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="min-w-0 flex-1 text-left"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse tutorial instructions" : "Expand tutorial instructions"}
            >
              <div className="truncate text-xs font-black text-white">{title}</div>
              {!expanded && (
                <p className="mt-0.5 max-h-8 overflow-hidden text-[10px] leading-4 text-gray-400">
                  {body}
                </p>
              )}
            </button>

            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[11px] font-black text-cyan-200"
              aria-label={expanded ? "Collapse tutorial" : "Expand tutorial"}
            >
              {expanded ? "−" : "+"}
            </button>

            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-1 py-1 text-[9px] font-bold text-gray-500 hover:text-white"
            >
              Exit
            </button>
          </div>

          {expanded && (
            <div className="mt-2 max-h-[30vh] overflow-y-auto border-t border-white/8 pt-2">
              <p className="text-[11px] leading-4 text-gray-300">{body}</p>
              {hint && (
                <div className="mt-2 rounded-lg border border-white/8 bg-white/[.045] px-2 py-1.5 text-[9px] font-semibold leading-4 text-cyan-200">
                  {hint}
                </div>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={step === 0}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-gray-400 disabled:opacity-25"
            >
              Back
            </button>

            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-600">
              {step + 1} / {total}
            </span>

            <button
              type="button"
              onClick={onNext}
              disabled={!canContinue}
              className="rounded-lg px-3 py-1.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                background: canContinue
                  ? "linear-gradient(135deg,#00e676,#0891b2)"
                  : "rgba(255,255,255,.08)",
              }}
            >
              {final ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
