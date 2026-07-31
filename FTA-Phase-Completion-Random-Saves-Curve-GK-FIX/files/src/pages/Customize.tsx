import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { TeamConfig } from "../engine/types";
import { JERSEY_COLORS, SECONDARY_COLORS } from "../game/persistence";
import {
  KIT_STYLES,
  SLEEVE_STYLES,
  normalizeKitStyle,
  normalizeSleeveStyle,
} from "../game/visuals";

interface Props {
  team: TeamConfig;
  onSave: (team: TeamConfig) => void;
  onBack: () => void;
}

function shirtBackground(team: TeamConfig): CSSProperties {
  const primary = team.jerseyColor;
  const secondary = team.secondaryColor;
  const style = normalizeKitStyle(team.kitStyle);

  if (style === "vertical-stripes") {
    return {
      backgroundColor: primary,
      backgroundImage: `repeating-linear-gradient(90deg, transparent 0 14px, ${secondary} 14px 27px)`,
    };
  }

  if (style === "horizontal-stripes") {
    return {
      backgroundColor: primary,
      backgroundImage: `repeating-linear-gradient(0deg, transparent 0 14px, ${secondary} 14px 27px)`,
    };
  }

  if (style === "diagonal-sash") {
    return {
      backgroundColor: primary,
      backgroundImage: `linear-gradient(125deg, transparent 0 38%, ${secondary} 39% 58%, transparent 59% 100%)`,
    };
  }

  return {
    backgroundColor: primary,
    backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.2), transparent 55%, rgba(0,0,0,0.2))`,
  };
}

function ColorPicker({
  label,
  colors,
  value,
  selectedBorder,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  selectedBorder: string;
  onChange: (color: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
          {label}
        </label>
        <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-gray-500">
          {value.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {colors.map((color) => {
          const selected = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`${label} ${color}`}
              onClick={() => onChange(color)}
              className="aspect-square rounded-2xl transition-all active:scale-90"
              style={{
                background: color,
                border: `3px solid ${selected ? selectedBorder : "rgba(255,255,255,0.1)"}`,
                boxShadow: selected ? `0 0 0 3px ${color}44, 0 10px 24px ${color}33` : "none",
                transform: selected ? "scale(1.08)" : "scale(1)",
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function Customize({ team, onSave, onBack }: Props) {
  const [current, setCurrent] = useState<TeamConfig>({
    ...team,
    kitStyle: normalizeKitStyle(team.kitStyle),
    sleeveStyle: normalizeSleeveStyle(team.sleeveStyle),
  });

  const previewStyle = useMemo(() => shirtBackground(current), [current]);
  const sleeveColor = current.sleeveStyle === "secondary"
    ? current.secondaryColor
    : current.sleeveStyle === "split"
      ? current.secondaryColor
      : current.jerseyColor;

  return (
    <div className="min-h-screen bg-[#080d18] text-white">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-[#080d18]/95 px-4 pb-4 pt-6 backdrop-blur">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-lg text-gray-400 transition-colors hover:text-white"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-black">Kit Workshop</h1>
          <p className="text-xs text-gray-500">Team identity and kit customization</p>
        </div>
      </header>

      <main className="space-y-7 px-4 pb-28 pt-5">
        <section>
          <label className="mb-3 block text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
            Team Name
          </label>
          <input
            type="text"
            value={current.name}
            maxLength={28}
            onChange={(event) => setCurrent((previous) => ({ ...previous, name: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white outline-none focus:border-emerald-400/60"
            placeholder="Team name"
          />
        </section>
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: `radial-gradient(circle at 50% 20%, ${current.jerseyColor}aa, transparent 55%)`,
            }}
          />

          <div className="relative flex flex-col items-center">
            <div className="mb-5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">
                Live Match Preview
              </div>
              <div className="mt-1 text-base font-black">{current.name}</div>
            </div>

            <div className="relative h-40 w-36 drop-shadow-[0_20px_22px_rgba(0,0,0,0.45)]">
              <div
                className="absolute left-0 top-5 h-16 w-11 -rotate-[18deg] rounded-l-2xl rounded-br-xl border border-black/30"
                style={{ background: sleeveColor }}
              />
              <div
                className="absolute right-0 top-5 h-16 w-11 rotate-[18deg] rounded-r-2xl rounded-bl-xl border border-black/30"
                style={{
                  background: current.sleeveStyle === "split"
                    ? current.jerseyColor
                    : sleeveColor,
                }}
              />
              <div
                className="absolute left-1/2 top-2 h-32 w-24 -translate-x-1/2 overflow-hidden rounded-b-3xl rounded-t-xl border-2 border-black/40"
                style={previewStyle}
              >
                <div className="absolute left-1/2 top-0 h-7 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#080d18] bg-[#080d18]" />
                <div className="absolute left-1/2 top-12 -translate-x-1/2 text-4xl font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]" style={{ color: current.secondaryColor }}>
                  7
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: current.secondaryColor }}>
                  FTA
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: current.jerseyColor }} />
              <span>{KIT_STYLES.find((style) => style.id === current.kitStyle)?.name}</span>
              <span className="text-gray-700">•</span>
              <span>{SLEEVE_STYLES.find((style) => style.id === current.sleeveStyle)?.name} sleeves</span>
            </div>
          </div>
        </section>

        <section>
          <label className="mb-3 block text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
            Shirt Pattern
          </label>
          <div className="grid grid-cols-2 gap-3">
            {KIT_STYLES.map((style) => {
              const selected = current.kitStyle === style.id;
              const miniTeam = { ...current, kitStyle: style.id };
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setCurrent((previous) => ({ ...previous, kitStyle: style.id }))}
                  className="rounded-2xl p-3 text-left transition-all active:scale-[0.98]"
                  style={{
                    background: selected ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? "#00e676" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  <div className="mb-3 h-14 overflow-hidden rounded-xl border border-black/30" style={shirtBackground(miniTeam)} />
                  <div className="text-sm font-black">{style.name}</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-gray-500">{style.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <label className="mb-3 block text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
            Sleeve Treatment
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SLEEVE_STYLES.map((style) => {
              const selected = current.sleeveStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setCurrent((previous) => ({ ...previous, sleeveStyle: style.id }))}
                  className="rounded-xl px-3 py-3 text-xs font-bold transition-all active:scale-95"
                  style={{
                    background: selected ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? "#00e676" : "rgba(255,255,255,0.1)"}`,
                    color: selected ? "#ffffff" : "#9ca3af",
                  }}
                >
                  {style.name}
                </button>
              );
            })}
          </div>
        </section>

        <ColorPicker
          label="Primary Shirt Color"
          colors={JERSEY_COLORS}
          value={current.jerseyColor}
          selectedBorder="#ffffff"
          onChange={(jerseyColor) => setCurrent((previous) => ({ ...previous, jerseyColor }))}
        />

        <ColorPicker
          label="Pattern / Number Color"
          colors={SECONDARY_COLORS}
          value={current.secondaryColor}
          selectedBorder="#00e676"
          onChange={(secondaryColor) => setCurrent((previous) => ({ ...previous, secondaryColor }))}
        />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/10 bg-[#080d18]/95 p-4 backdrop-blur">
        <button
          onClick={() => onSave(current)}
          className="w-full rounded-2xl py-4 text-sm font-black text-[#03110a] transition-transform active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #5cff9a, #00c77a)" }}
        >
          Save Team & Kit
        </button>
      </footer>
    </div>
  );
}
