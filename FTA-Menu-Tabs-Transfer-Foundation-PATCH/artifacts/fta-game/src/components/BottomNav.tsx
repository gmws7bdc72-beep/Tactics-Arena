export type MenuTab =
  | "team-profiles"
  | "team-setup"
  | "home"
  | "transfer-market"
  | "customize";

interface Props {
  activeTab: MenuTab;
  onNavigate: (tab: MenuTab) => void;
}

const items: Array<{
  id: MenuTab;
  label: string;
  icon: string;
}> = [
  { id: "team-profiles", label: "Teams", icon: "♜" },
  { id: "team-setup", label: "Setup", icon: "▦" },
  { id: "home", label: "Play", icon: "⚽" },
  { id: "transfer-market", label: "Market", icon: "⇄" },
  { id: "customize", label: "Customize", icon: "✦" },
];

export default function BottomNav({ activeTab, onNavigate }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 grid-cols-5 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2"
      style={{
        background: "rgba(7,11,20,0.97)",
        borderTop: "1px solid rgba(96,165,250,0.18)",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.35)",
        backdropFilter: "blur(16px)",
      }}
      aria-label="Main menu"
    >
      {items.map((item) => {
        const active = activeTab === item.id;
        const isCenter = item.id === "home";

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="flex min-w-0 flex-col items-center justify-end gap-1 rounded-xl px-1 py-1.5 active:scale-95"
            style={{ color: active ? "#7dd3fc" : "rgba(255,255,255,0.48)" }}
            aria-current={active ? "page" : undefined}
          >
            <span
              className={isCenter ? "flex h-11 w-11 items-center justify-center rounded-full text-2xl" : "flex h-7 items-center justify-center text-xl"}
              style={
                isCenter
                  ? {
                      marginTop: "-22px",
                      background: active
                        ? "linear-gradient(145deg, rgba(14,165,233,0.34), rgba(37,99,235,0.24))"
                        : "rgba(15,23,42,0.96)",
                      border: `2px solid ${active ? "#38bdf8" : "rgba(96,165,250,0.45)"}`,
                      boxShadow: active
                        ? "0 0 0 4px rgba(14,165,233,0.10), 0 6px 18px rgba(14,165,233,0.24)"
                        : "0 6px 18px rgba(0,0,0,0.35)",
                    }
                  : undefined
              }
            >
              {item.icon}
            </span>
            <span className="w-full truncate text-[10px] font-bold tracking-tight">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
