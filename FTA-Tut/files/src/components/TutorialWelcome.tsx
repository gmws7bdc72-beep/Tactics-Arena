interface Props {
  onStart: () => void;
  onSkip: () => void;
}

export default function TutorialWelcome({ onStart, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(3,7,18,.82)", backdropFilter: "blur(10px)" }}>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#0d1424] shadow-2xl">
        <div className="relative px-6 pb-5 pt-7" style={{ background: "radial-gradient(circle at 75% 0%, rgba(34,211,238,.22), transparent 48%), linear-gradient(145deg,#101b31,#0b1120)" }}>
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-3xl" style={{ background: "linear-gradient(145deg,#00e676,#0891b2)", boxShadow: "0 12px 35px rgba(0,230,118,.22)" }}>⚽</div>
          <h2 className="text-2xl font-black text-white">Learn Football Tactics Arena</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">
            Play a guided match, then learn transfers, bids, selling, and the end-of-season transformation system.
          </p>
        </div>
        <div className="space-y-3 p-5">
          <button onClick={onStart} className="w-full rounded-2xl py-3.5 text-sm font-black text-white active:scale-[.98]" style={{ background: "linear-gradient(135deg,#00e676,#00a982)" }}>
            Start Tutorial
          </button>
          <button onClick={onSkip} className="w-full rounded-2xl border border-white/10 bg-white/[.04] py-3 text-sm font-bold text-gray-400 active:scale-[.98]">
            Skip for now
          </button>
          <p className="text-center text-[10px] text-gray-600">You can replay it anytime from the ? button on the home screen.</p>
        </div>
      </div>
    </div>
  );
}
