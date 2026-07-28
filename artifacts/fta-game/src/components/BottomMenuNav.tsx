import { Palette, Settings2, Shield, ShoppingCart } from "lucide-react";

export type MenuTab = "team-profiles" | "team-setup" | "home" | "transfer-market" | "customize";

interface Props {
  active: MenuTab;
  onChange: (tab: MenuTab) => void;
}

const items: Array<{
  id: MenuTab;
  label: string;
  icon: typeof Shield;
}> = [
  { id: "team-profiles", label: "Teams", icon: Shield },
  { id: "team-setup", label: "Setup", icon: Settings2 },
  { id: "home", label: "Play", icon: Shield },
  { id: "transfer-market", label: "Market", icon: ShoppingCart },
  { id: "customize", label: "Customize", icon: Palette },
];

function FootballIcon({ active }: { active: boolean }) {
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full text-[25px] transition-all"
      style={{
        marginTop: "-20px",
        background: active ? "linear-gradient(145deg, #082f49, #0c4a6e)" : "#111827",
        border: active ? "2px solid #38bdf8" : "2px solid rgba(255,255,255,0.14)",
        boxShadow: active ? "0 0 0 4px rgba(56,189,248,0.13), 0 8px 22px rgba(0,0,0,0.45)" : "0 8px 18px rgba(0,0,0,0.35)",
      }}
      aria-hidden="true"
    >
      ⚽
    </div>
  );
}

export default function BottomMenuNav({ active, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2"
      style={{
        background: "linear-gradient(180deg, rgba(8,12,24,0.94), rgba(5,8,17,0.99))",
        borderTop: "1px solid rgba(56,189,248,0.18)",
        backdropFilter: "blur(18px)",
      }}
      aria-label="Main menu"
    >
      <div className="grid grid-cols-5 items-end gap-1">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const isPlay = id === "home";

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="flex min-w-0 flex-col items-center justify-end rounded-xl px-1 py-1.5 active:scale-95"
              style={{ color: isActive ? "#38bdf8" : "#7d889c" }}
              aria-current={isActive ? "page" : undefined}
            >
              {isPlay ? (
                <FootballIcon active={isActive} />
              ) : (
                <Icon size={21} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              )}
              <span className="mt-1 max-w-full truncate text-[9px] font-bold tracking-tight">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
