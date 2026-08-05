import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import type {
  PlayerCard as PlayerCardType,
  TeamConfig,
  TrainingFocus,
} from "../engine/types";
import { FORMATIONS } from "../game/formations";
import {
  calculatePlayerOverall,
  ensurePlayerDevelopment,
  ensureTeamDevelopment,
  focusStatsForPlayer,
  getTrainingEffectiveness,
  setPlayerTrainingFocus,
  TRAINING_FOCUSES,
} from "../game/training";
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  PLAYERS_PER_TEAM,
} from "../engine/constants";
import { formatMoney } from "../game/transferDatabase";
import { ABILITIES } from "../game/players";
import { validateStartingAbilityCaps } from "../game/abilityLimits";

interface Props {
  team: TeamConfig;
  onSave: (team: TeamConfig) => void;
  onBack: () => void;
  initialTab?: "lineup" | "formation" | "training";
}

const SLOT_LABELS = ["GK", "DEF", "DEF", "MID", "FWD", "ST"];

const STAT_SHORT: Record<string, string> = {
  attack: "ATK",
  defense: "DEF",
  passing: "PAS",
  speed: "SPD",
  movement: "MOV",
  shooting: "SHT",
  dribbling: "DRB",
  tackling: "TCK",
  marking: "MRK",
  stamina: "STA",
  strength: "STR",
  vision: "VIS",
  longPassing: "LNG",
  aerial: "AIR",
};

function toneForRating(value: number): string {
  if (value >= 9) return "#22c55e";
  if (value >= 7) return "#38bdf8";
  if (value >= 5) return "#fbbf24";
  return "#fb7185";
}

function moraleTone(value: number): string {
  if (value >= 80) return "#22c55e";
  if (value >= 60) return "#38bdf8";
  if (value >= 45) return "#fbbf24";
  return "#fb7185";
}

function focusLabel(focus: TrainingFocus): string {
  return TRAINING_FOCUSES.find((item) => item.id === focus)?.label ?? focus;
}

function availableFocuses(player: PlayerCardType) {
  if (player.role === "goalkeeper") {
    return TRAINING_FOCUSES.filter((item) =>
      [
        "balanced",
        "goalkeeping",
        "longPassing",
        "passing",
        "movement",
      ].includes(item.id),
    );
  }

  return TRAINING_FOCUSES.filter((item) => item.id !== "goalkeeping");
}

function statGainText(
  statGains: Partial<Record<keyof PlayerCardType["stats"], number>>,
): string {
  const entries = Object.entries(statGains).filter(
    ([, value]) => (value ?? 0) > 0,
  );

  if (entries.length === 0) return "Progress banked — no full stat point yet";

  return entries
    .map(([key, value]) => `${STAT_SHORT[key] ?? key.toUpperCase()} +${value}`)
    .join(" · ");
}


const STAT_ORDER = Object.keys(STAT_SHORT) as Array<
  keyof PlayerCardType["stats"]
>;

function PlayerStatsGrid({ player }: { player: PlayerCardType }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="mb-2 text-[9px] font-black uppercase tracking-wider text-gray-500">
        Player stats
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STAT_ORDER.map((key) => {
          const value = player.stats[key];
          return (
            <div
              key={key}
              className="rounded-lg bg-white/[0.045] px-2 py-2 text-center"
              title={key.replace(/([A-Z])/g, " $1")}
            >
              <div className="text-[8px] font-bold uppercase text-gray-500">
                {STAT_SHORT[key]}
              </div>
              <div
                className="mt-0.5 text-sm font-black"
                style={{ color: toneForRating(value) }}
              >
                {value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SquadManagementPanel({
  player,
  onUpdate,
}: {
  player: PlayerCardType;
  onUpdate: (
    status: NonNullable<PlayerCardType["marketStatus"]>,
    askingPrice?: number,
  ) => void;
}) {
  const value = player.marketValue ?? 1_000_000;
  const potential =
    player.development?.potential ??
    (player.potential && player.potential > 10
      ? player.potential / 10
      : player.potential) ??
    calculatePlayerOverall(player);
  const morale = player.development?.morale ?? 72;
  const listed = player.marketStatus === "listed";
  const debtLocked = player.forcedListedForDebt === true;
  const askingPrice = player.askingPrice;

  const preset =
    askingPrice === undefined
      ? "auto"
      : Math.abs(askingPrice - value * 0.9) < 10_000
        ? "low"
        : Math.abs(askingPrice - value) < 10_000
          ? "market"
          : Math.abs(askingPrice - value * 1.15) < 10_000
            ? "high"
            : "custom";

  const presets = [
    { id: "auto", label: "Auto", amount: undefined },
    { id: "low", label: "Low", amount: Math.round(value * 0.9) },
    { id: "market", label: "Market", amount: value },
    { id: "high", label: "High", amount: Math.round(value * 1.15) },
  ] as const;

  return (
    <div
      className="rounded-lg p-2"
      style={{ background: "rgba(255,255,255,.04)" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-gray-500">
          Squad management
        </span>
        <span
          className="text-[10px] font-bold"
          style={{
            color: debtLocked
              ? "#fbbf24"
              : player.marketStatus === "untouchable"
                ? "#38bdf8"
                : listed
                  ? "#22c55e"
                  : "#9ca3af",
          }}
        >
          {debtLocked
            ? "⚠️ Debt listed"
            : listed
              ? "🏷️ Listed"
              : player.marketStatus === "untouchable"
                ? "🔒 Untouchable"
                : "Available"}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-black/20 p-1.5">
          <div className="text-[8px] font-bold uppercase text-gray-500">
            Value
          </div>
          <div className="text-[10px] font-black text-white">
            {formatMoney(value)}
          </div>
        </div>
        <div className="rounded-md bg-black/20 p-1.5">
          <div className="text-[8px] font-bold uppercase text-gray-500">
            Potential
          </div>
          <div className="text-[10px] font-black text-white">
            {potential.toFixed(1)}/10
          </div>
        </div>
        <div className="rounded-md bg-black/20 p-1.5">
          <div className="text-[8px] font-bold uppercase text-gray-500">
            Morale
          </div>
          <div
            className="text-[10px] font-black"
            style={{ color: moraleTone(morale) }}
          >
            {morale}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={debtLocked}
          title={
            debtLocked
              ? "This player must remain listed until the club is out of debt."
              : undefined
          }
          onClick={() => onUpdate(listed ? "available" : "listed", undefined)}
          className="rounded-lg px-2 py-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: listed
              ? "rgba(251,113,133,.12)"
              : "rgba(34,197,94,.12)",
            color: listed ? "#fb7185" : "#22c55e",
          }}
        >
          {debtLocked ? "Debt locked" : listed ? "Remove listing" : "Transfer list"}
        </button>
        <button
          type="button"
          disabled={debtLocked}
          title={
            debtLocked
              ? "Debt-listed players cannot be made untouchable."
              : undefined
          }
          onClick={() =>
            onUpdate(
              player.marketStatus === "untouchable"
                ? "available"
                : "untouchable",
            )
          }
          className="rounded-lg px-2 py-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "rgba(56,189,248,.12)",
            color: "#38bdf8",
          }}
        >
          {player.marketStatus === "untouchable"
            ? "Make available"
            : "Mark untouchable"}
        </button>
      </div>

      {debtLocked && (
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-2 text-[9px] leading-4 text-amber-200">
          The club has been in debt for more than two paid weeks. This listing
          unlocks automatically once the balance returns to zero or above.
        </div>
      )}

      {listed && (
        <div className="mt-2">
          <div className="mb-1 text-[9px] font-bold uppercase text-gray-500">
            Asking price
          </div>
          <div className="grid grid-cols-4 gap-1">
            {presets.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onUpdate("listed", item.amount)}
                className="rounded-md px-1 py-1.5 text-[9px] font-black"
                style={{
                  background:
                    preset === item.id
                      ? "rgba(34,197,94,.18)"
                      : "rgba(255,255,255,.05)",
                  color: preset === item.id ? "#4ade80" : "#9ca3af",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] text-gray-500">Custom $M</span>
            <input
              type="number"
              min="1"
              max="250"
              value={
                askingPrice === undefined
                  ? ""
                  : Math.round(askingPrice / 1_000_000)
              }
              placeholder={String(Math.max(1, Math.round(value / 1_000_000)))}
              onChange={(event) => {
                const millions = Number(event.target.value);
                onUpdate(
                  "listed",
                  Number.isFinite(millions) && millions > 0
                    ? Math.round(millions * 1_000_000)
                    : undefined,
                );
              }}
              className="w-20 rounded bg-black/30 px-2 py-1 text-xs text-white outline-none"
            />
            <span className="ml-auto text-[9px] font-bold text-gray-400">
              {formatMoney(askingPrice ?? value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamSetup({
  team,
  onSave,
  onBack,
  initialTab = "lineup",
}: Props) {
  const [currentTeam, setCurrentTeam] = useState<TeamConfig>(() =>
    ensureTeamDevelopment({
      ...team,
      players: [...team.players],
    }),
  );
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [lineupError, setLineupError] = useState<string | null>(null);
  const [expandedTrainingId, setExpandedTrainingId] = useState<string | null>(
    null,
  );
  const [expandedReserveId, setExpandedReserveId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<"lineup" | "formation" | "training">(
    initialTab,
  );
  const onSaveRef = useRef(onSave);
  const latestTeamRef = useRef(currentTeam);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    latestTeamRef.current = currentTeam;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const check = validateStartingAbilityCaps(currentTeam.players);
    if (!check.valid) return;

    const timer = window.setTimeout(() => {
      onSaveRef.current(ensureTeamDevelopment(currentTeam));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [currentTeam]);

  useEffect(
    () => () => {
      const latest = latestTeamRef.current;
      const check = validateStartingAbilityCaps(latest.players);
      if (check.valid) {
        onSaveRef.current(ensureTeamDevelopment(latest));
      }
    },
    [],
  );

  const persistBeforeLeaving = () => {
    const check = validateStartingAbilityCaps(currentTeam.players);
    if (check.valid) {
      onSaveRef.current(ensureTeamDevelopment(currentTeam));
    }
    onBack();
  };

  const selectFormation = (formationId: string) => {
    const formation = FORMATIONS.find((item) => item.id === formationId);
    if (!formation) return;

    setCurrentTeam((previous) => ({
      ...previous,
      formationId: formation.id,
      startPositions: formation.positions.map((position) => ({ ...position })),
    }));
  };

  const swapPlayer = (slotIndex: number, newCard: PlayerCardType) => {
    setCurrentTeam((previous) => {
      const players = [...previous.players];
      const candidateIndex = players.findIndex(
        (player) => player.id === newCard.id,
      );
      if (candidateIndex < 0 || candidateIndex === slotIndex) return previous;
      [players[slotIndex], players[candidateIndex]] = [
        players[candidateIndex],
        players[slotIndex],
      ];
      const check = validateStartingAbilityCaps(players);
      if (!check.valid) {
        setLineupError(check.message ?? "That starting lineup exceeds an ability limit.");
        return previous;
      }
      setLineupError(null);
      return { ...previous, players };
    });
    setActiveSlot(null);
  };

  const renamePlayer = (slotIndex: number, newName: string) => {
    setCurrentTeam((previous) => ({
      ...previous,
      players: previous.players.map((player, index) =>
        index === slotIndex ? { ...player, name: newName } : player,
      ),
    }));
  };

  const setFocus = (playerId: string, focus: TrainingFocus) => {
    setCurrentTeam((previous) => ({
      ...previous,
      players: previous.players.map((player) =>
        player.id === playerId ? setPlayerTrainingFocus(player, focus) : player,
      ),
    }));
  };

  const updateMarketStatus = (
    playerId: string,
    status: NonNullable<PlayerCardType["marketStatus"]>,
    askingPrice?: number,
  ) => {
    setCurrentTeam((previous) => ({
      ...previous,
      players: previous.players.map((player) => {
        if (player.id !== playerId) return player;
        if (player.forcedListedForDebt && status !== "listed") return player;
        return { ...player, marketStatus: status, askingPrice };
      }),
    }));
  };

  const getAvailableForSlot = (slotIndex: number) => {
    return currentTeam.players.filter((player, index) => {
      if (index === slotIndex) return false;
      return slotIndex === 0
        ? player.role === "goalkeeper"
        : player.role !== "goalkeeper";
    });
  };

  const availableForSlot =
    activeSlot !== null ? getAvailableForSlot(activeSlot) : [];

  const trainingSummary = useMemo(() => {
    const players = currentTeam.players.map((player) =>
      ensurePlayerDevelopment(player),
    );
    const averageMorale = Math.round(
      players.reduce(
        (sum, player) => sum + (player.development?.morale ?? 72),
        0,
      ) / Math.max(1, players.length),
    );
    const seasonGrowth = players.reduce(
      (sum, player) => sum + (player.development?.seasonGrowth ?? 0),
      0,
    );
    const improving = players.filter(
      (player) =>
        calculatePlayerOverall(player) <
        (player.development?.potential ?? calculatePlayerOverall(player)),
    ).length;

    return { averageMorale, seasonGrowth, improving };
  }, [currentTeam.players]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0a0e1a" }}
    >
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          type="button"
          onClick={persistBeforeLeaving}
          className="text-gray-400 hover:text-white transition-colors text-lg"
        >
          ←
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-white text-lg font-bold">Team Setup</h1>
          <p className="text-gray-500 text-xs">
            Lineup, formation, and player development
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-300">
          Autosaves
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-2 px-4 mb-4"
        data-phase3-training-tabs="ready"
      >
        {(["lineup", "formation", "training"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className="min-w-0 rounded-lg px-2 py-2 text-xs font-black transition-all capitalize"
            style={{
              background:
                tab === item
                  ? "rgba(0,230,118,0.15)"
                  : "rgba(255,255,255,0.06)",
              color: tab === item ? "#00e676" : "#9ca3af",
              border:
                item === "training"
                  ? "1px solid rgba(0,230,118,0.28)"
                  : "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {item === "training" ? "⭐ Training" : item}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {tab === "lineup" && (
          <div>
            <p className="text-gray-400 text-xs mb-2">
              Tap a slot to change the player. Slot 1 is goalkeeper only.
            </p>
            <div className="mb-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.05] px-3 py-2 text-[10px] leading-4 text-violet-100/80">
              Starting lineup limits: 1 Ghost Run · 3 Bullet Pass. Extra ability players may remain in the reserves.
            </div>
            {lineupError && (
              <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-200">
                {lineupError}
              </div>
            )}

            <div className="space-y-2 mb-6">
              {currentTeam.players
                .slice(0, PLAYERS_PER_TEAM)
                .map((player, index) => {
                  const slotLabel = SLOT_LABELS[index] ?? `#${index + 1}`;
                  const isGoalkeeperSlot = index === 0;

                  return (
                    <div
                      key={`${player.id}-${index}`}
                      onClick={() =>
                        setActiveSlot(activeSlot === index ? null : index)
                      }
                      className="rounded-xl p-3 cursor-pointer transition-all"
                      style={{
                        background:
                          activeSlot === index
                            ? "rgba(0,230,118,0.06)"
                            : "rgba(255,255,255,0.04)",
                        outline:
                          activeSlot === index
                            ? "2px solid #00e676"
                            : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-center flex-shrink-0 w-10">
                          <div
                            className="text-xs font-bold"
                            style={{
                              color: isGoalkeeperSlot ? "#ffd700" : "#6b7280",
                            }}
                          >
                            {slotLabel}
                          </div>
                        </div>

                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{
                            background: currentTeam.jerseyColor,
                            color: currentTeam.secondaryColor,
                            outline: isGoalkeeperSlot
                              ? "2px solid #ffd700"
                              : "none",
                          }}
                        >
                          {player.jerseyNumber}
                        </div>

                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={player.name}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              renamePlayer(index, event.target.value)
                            }
                            onClick={(event: MouseEvent<HTMLInputElement>) =>
                              event.stopPropagation()
                            }
                            maxLength={16}
                            className="bg-transparent text-white text-sm font-semibold w-full outline-none border-b border-transparent focus:border-white/30 transition-colors"
                            placeholder="Player name"
                          />

                          <div className="text-gray-400 text-xs truncate capitalize">
                            {player.role} · ⚡{" "}
                            {ABILITIES[player.ability]?.name ?? "No Ability"}
                          </div>
                        </div>

                        <div className="text-xs text-right text-gray-400 flex-shrink-0">
                          <div>ATK {player.stats.attack}</div>
                          <div>MOV {player.stats.movement}</div>
                        </div>

                        {player.marketStatus === "listed" && (
                          <div
                            className="text-xs"
                            title="Transfer listed"
                            aria-label="Transfer listed"
                          >
                            🏷️
                          </div>
                        )}
                        {player.marketStatus === "untouchable" && (
                          <div
                            className="text-xs"
                            title="Untouchable"
                            aria-label="Untouchable"
                          >
                            🔒
                          </div>
                        )}

                        <div className="text-gray-400 text-xs">
                          {activeSlot === index ? "▼" : "▶"}
                        </div>
                      </div>

                      {activeSlot === index && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3">
                            <div className="text-[9px] font-black uppercase tracking-wider text-amber-300/80">
                              {ABILITIES[player.ability]?.name ?? "No Ability"}
                            </div>
                            <div className="mt-1 text-[10px] leading-4 text-gray-300">
                              {ABILITIES[player.ability]?.description ?? "No special ability."}
                            </div>
                          </div>

                          <div className="mb-3">
                            <PlayerStatsGrid player={player} />
                          </div>

                          <div className="mb-3">
                            <SquadManagementPanel
                              player={player}
                              onUpdate={(status, askingPrice) =>
                                updateMarketStatus(
                                  player.id,
                                  status,
                                  askingPrice,
                                )
                              }
                            />
                          </div>

                          <p className="text-xs text-gray-400 mb-2">
                            {isGoalkeeperSlot
                              ? "🧤 Goalkeepers only:"
                              : "Choose replacement:"}
                          </p>

                          {availableForSlot.length === 0 ? (
                            <div className="text-gray-600 text-xs italic">
                              No other{" "}
                              {isGoalkeeperSlot ? "goalkeepers" : "players"}{" "}
                              available
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                              {availableForSlot.map((candidate) => (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={(
                                    event: MouseEvent<HTMLButtonElement>,
                                  ) => {
                                    event.stopPropagation();
                                    swapPlayer(index, candidate);
                                  }}
                                  className="flex items-center gap-3 p-2 rounded-lg text-left transition-all hover:bg-white/10"
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                  }}
                                >
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{
                                      background: currentTeam.jerseyColor,
                                      color: currentTeam.secondaryColor,
                                    }}
                                  >
                                    {candidate.jerseyNumber}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="text-white text-xs font-semibold truncate">
                                      {candidate.name}
                                    </div>
                                    <div className="text-gray-400 text-[10px] truncate capitalize">
                                      {candidate.role} ·{" "}
                                      {ABILITIES[candidate.ability]?.name ?? "No Ability"}
                                    </div>
                                  </div>

                                  <div className="text-xs text-gray-400 flex-shrink-0">
                                    {candidate.stats.attack}·
                                    {candidate.stats.defense}·
                                    {candidate.stats.movement}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {currentTeam.players.length > PLAYERS_PER_TEAM && (
              <div className="mb-5">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">
                  Reserves
                </h3>
                <div className="space-y-2">
                  {currentTeam.players.slice(PLAYERS_PER_TEAM).map((player) => {
                    const open = expandedReserveId === player.id;

                    return (
                      <div
                        key={player.id}
                        className="rounded-xl p-3"
                        style={{
                          background: open
                            ? "rgba(0,230,118,.055)"
                            : "rgba(255,255,255,.04)",
                          border: `1px solid ${
                            open
                              ? "rgba(0,230,118,.22)"
                              : "rgba(255,255,255,.07)"
                          }`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReserveId(open ? null : player.id)
                          }
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                            style={{
                              background: currentTeam.jerseyColor,
                              color: currentTeam.secondaryColor,
                            }}
                          >
                            {player.jerseyNumber}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-black text-white">
                              {player.name}
                            </div>
                            <div className="text-[10px] capitalize text-gray-500">
                              {player.role} · {ABILITIES[player.ability]?.name ?? "No Ability"} ·{" "}
                              {player.marketStatus === "listed"
                                ? "🏷️ listed"
                                : player.marketStatus === "untouchable"
                                  ? "🔒 untouchable"
                                  : "available"}
                            </div>
                          </div>
                          <div className="text-[10px] font-bold text-gray-500">
                            {open ? "Close" : "Manage"}
                          </div>
                        </button>

                        {open && (
                          <div className="mt-3 border-t border-white/10 pt-3">
                            <div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3">
                              <div className="text-[9px] font-black uppercase tracking-wider text-amber-300/80">
                                {ABILITIES[player.ability]?.name ?? "No Ability"}
                              </div>
                              <div className="mt-1 text-[10px] leading-4 text-gray-300">
                                {ABILITIES[player.ability]?.description ?? "No special ability."}
                              </div>
                            </div>
                            <div className="mb-3">
                              <PlayerStatsGrid player={player} />
                            </div>
                            <SquadManagementPanel
                              player={player}
                              onUpdate={(status, askingPrice) =>
                                updateMarketStatus(
                                  player.id,
                                  status,
                                  askingPrice,
                                )
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className="p-3 rounded-xl text-xs text-gray-500"
              style={{
                background: "rgba(255,215,0,0.04)",
                border: "1px solid rgba(255,215,0,0.12)",
              }}
            >
              🧤 The goalkeeper slot stays locked to goalkeeper cards. Movement
              has replaced the old Luck attribute.
            </div>
          </div>
        )}

        {tab === "formation" && (
          <div>
            <p className="text-gray-400 text-xs mb-4">
              Choose your starting shape. All {FORMATIONS.length} legal 6v6
              formations are available.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {FORMATIONS.map((formation) => (
                <button
                  key={formation.id}
                  type="button"
                  onClick={() => selectFormation(formation.id)}
                  className="rounded-xl p-4 transition-all"
                  style={{
                    background:
                      currentTeam.formationId === formation.id
                        ? "rgba(0,230,118,0.1)"
                        : "rgba(255,255,255,0.04)",
                    border: `1px solid ${
                      currentTeam.formationId === formation.id
                        ? "#00e676"
                        : "rgba(255,255,255,0.1)"
                    }`,
                  }}
                >
                  <div
                    className="relative w-full mb-2"
                    style={{ paddingBottom: "60%" }}
                  >
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}
                    >
                      <rect
                        width={PITCH_WIDTH}
                        height={PITCH_HEIGHT}
                        fill="#1a4a2e"
                        rx="4"
                      />
                      <line
                        x1={PITCH_WIDTH / 2}
                        y1={0}
                        x2={PITCH_WIDTH / 2}
                        y2={PITCH_HEIGHT}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="2"
                      />

                      {formation.positions.map((position, index) => (
                        <g key={`${formation.id}-${index}`}>
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={index === 0 ? 32 : 24}
                            fill={currentTeam.jerseyColor}
                            opacity="0.9"
                            stroke={index === 0 ? "#ffd700" : "none"}
                            strokeWidth={index === 0 ? 3 : 0}
                          />
                          <text
                            x={position.x}
                            y={position.y + 5}
                            textAnchor="middle"
                            fill={currentTeam.secondaryColor}
                            fontSize="18"
                            fontWeight="bold"
                          >
                            {currentTeam.players[index]?.jerseyNumber ??
                              index + 1}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>

                  <div
                    className="text-sm font-bold"
                    style={{
                      color:
                        currentTeam.formationId === formation.id
                          ? "#00e676"
                          : "#9ca3af",
                    }}
                  >
                    {formation.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "training" && (
          <div className="space-y-4">
            <section
              className="rounded-2xl p-4"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,230,118,0.12), rgba(56,189,248,0.07))",
                border: "1px solid rgba(0,230,118,0.2)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-white text-sm font-black">
                    Development Centre
                  </h2>
                  <p className="mt-1 text-[10px] leading-4 text-gray-400">
                    Training is processed after every match week. Progress,
                    morale, potential, and stat gains are stored permanently.
                  </p>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-2 text-right">
                  <div className="text-[9px] uppercase tracking-wide text-gray-500">
                    Improving
                  </div>
                  <div className="text-lg font-black text-emerald-400">
                    {trainingSummary.improving}/{currentTeam.players.length}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-black/20 p-2.5 text-center">
                  <div
                    className="text-lg font-black"
                    style={{ color: moraleTone(trainingSummary.averageMorale) }}
                  >
                    {trainingSummary.averageMorale}%
                  </div>
                  <div className="text-[8px] uppercase text-gray-500">
                    Morale
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 p-2.5 text-center">
                  <div className="text-lg font-black text-sky-400">
                    +{trainingSummary.seasonGrowth}
                  </div>
                  <div className="text-[8px] uppercase text-gray-500">
                    Season gains
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 p-2.5 text-center">
                  <div className="text-lg font-black text-white">
                    {currentTeam.trainingIntensity === "intense"
                      ? "High"
                      : currentTeam.trainingIntensity === "light"
                        ? "Low"
                        : "Normal"}
                  </div>
                  <div className="text-[8px] uppercase text-gray-500">
                    Workload
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-gray-500">
                  Team workload
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "balanced", "intense"] as const).map(
                    (intensity) => {
                      const active =
                        currentTeam.trainingIntensity === intensity;
                      return (
                        <button
                          key={intensity}
                          type="button"
                          onClick={() =>
                            setCurrentTeam((previous) => ({
                              ...previous,
                              trainingIntensity: intensity,
                            }))
                          }
                          className="rounded-xl px-2 py-2 text-[10px] font-black capitalize transition active:scale-95"
                          style={{
                            background: active
                              ? "rgba(0,230,118,0.16)"
                              : "rgba(255,255,255,0.045)",
                            border: `1px solid ${
                              active
                                ? "rgba(0,230,118,0.45)"
                                : "rgba(255,255,255,0.07)"
                            }`,
                            color: active ? "#00e676" : "#94a3b8",
                          }}
                        >
                          {intensity}
                        </button>
                      );
                    },
                  )}
                </div>
                <p className="mt-2 text-[9px] leading-4 text-gray-500">
                  Intense training builds progress faster but slightly reduces
                  morale. Light training protects morale and develops players
                  more slowly.
                </p>
              </div>
            </section>

            <div className="space-y-3">
              {currentTeam.players.map((rawPlayer) => {
                const player = ensurePlayerDevelopment(rawPlayer);
                const development = player.development!;
                const overall = calculatePlayerOverall(player);
                const effectiveness = getTrainingEffectiveness(player);
                const focusStats = focusStatsForPlayer(
                  player,
                  development.focus,
                );
                const history = development.history.slice(-6);
                const expanded = expandedTrainingId === player.id;

                return (
                  <section
                    key={player.id}
                    className="overflow-hidden rounded-2xl"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="p-3.5">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black"
                          style={{
                            background: currentTeam.jerseyColor,
                            color: currentTeam.secondaryColor,
                            outline:
                              player.role === "goalkeeper"
                                ? "2px solid #ffd700"
                                : "none",
                          }}
                        >
                          {player.jerseyNumber}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-black text-white">
                              {player.name}
                            </h3>
                            {development.lastWeekGrowth > 0 && (
                              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[8px] font-black text-emerald-400">
                                IMPROVED
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] capitalize text-gray-500">
                            {player.role} · Age {player.age} ·{" "}
                            {focusLabel(development.focus)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-center">
                          <div className="rounded-lg bg-black/20 px-2 py-1.5">
                            <div className="text-[8px] text-gray-500">OVR</div>
                            <div
                              className="text-sm font-black"
                              style={{ color: toneForRating(overall) }}
                            >
                              {overall.toFixed(1)}
                            </div>
                          </div>
                          <div className="rounded-lg bg-black/20 px-2 py-1.5">
                            <div className="text-[8px] text-gray-500">POT</div>
                            <div className="text-sm font-black text-violet-300">
                              {development.potential.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-black/20 p-2.5">
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="font-bold text-gray-500">
                              Training progress
                            </span>
                            <span className="font-black text-white">
                              {development.progress}%
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${development.progress}%` }}
                            />
                          </div>
                        </div>
                        <div className="rounded-xl bg-black/20 p-2.5">
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="font-bold text-gray-500">
                              Effectiveness
                            </span>
                            <span className="font-black text-sky-300">
                              {effectiveness}%
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-sky-400 transition-all"
                              style={{ width: `${effectiveness}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5">
                        <div>
                          <div className="text-[8px] font-black uppercase tracking-wide text-gray-500">
                            Morale
                          </div>
                          <div
                            className="mt-0.5 text-xs font-black"
                            style={{ color: moraleTone(development.morale) }}
                          >
                            {development.morale}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[8px] font-black uppercase tracking-wide text-gray-500">
                            Season development
                          </div>
                          <div className="mt-0.5 text-xs font-black text-emerald-400">
                            +{development.seasonGrowth} stat point
                            {development.seasonGrowth === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.13em] text-gray-500">
                            Individual focus
                          </span>
                          <span className="text-[9px] text-gray-600">
                            Targets{" "}
                            {focusStats
                              .map((key) => STAT_SHORT[key])
                              .join(" · ")}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {availableFocuses(player).map((focus) => {
                            const active = development.focus === focus.id;
                            return (
                              <button
                                key={focus.id}
                                type="button"
                                title={focus.description}
                                onClick={() => setFocus(player.id, focus.id)}
                                className="rounded-lg px-2.5 py-1.5 text-[9px] font-black transition active:scale-95"
                                style={{
                                  background: active
                                    ? "rgba(0,230,118,0.15)"
                                    : "rgba(255,255,255,0.04)",
                                  border: `1px solid ${
                                    active
                                      ? "rgba(0,230,118,0.4)"
                                      : "rgba(255,255,255,0.07)"
                                  }`,
                                  color: active ? "#00e676" : "#94a3b8",
                                }}
                              >
                                {focus.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTrainingId(expanded ? null : player.id)
                        }
                        className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2 text-left"
                      >
                        <span className="text-[10px] font-bold text-gray-400">
                          Development history
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {expanded ? "▲" : "▼"}
                        </span>
                      </button>
                    </div>

                    {expanded && (
                      <div className="border-t border-white/8 bg-black/20 p-3.5">
                        {history.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-[10px] text-gray-500">
                            No match-week training has been processed yet.
                          </div>
                        ) : (
                          <>
                            <div className="mb-3 flex h-16 items-end gap-1.5 rounded-xl bg-black/20 px-2 py-2">
                              {history.map((entry) => (
                                <div
                                  key={`${entry.season}-${entry.week}`}
                                  className="flex flex-1 flex-col items-center justify-end gap-1"
                                  title={`Season ${entry.season}, week ${entry.week}: +${entry.progressGain}% progress`}
                                >
                                  <div
                                    className="w-full rounded-t bg-sky-400/70"
                                    style={{
                                      height: `${Math.max(7, Math.min(42, entry.progressGain * 1.55))}px`,
                                    }}
                                  />
                                  <span className="text-[7px] text-gray-600">
                                    W{entry.week}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-2">
                              {[...history].reverse().map((entry) => (
                                <div
                                  key={`row-${entry.season}-${entry.week}`}
                                  className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5"
                                >
                                  <div>
                                    <div className="text-[9px] font-black text-white">
                                      Season {entry.season} · Week {entry.week}
                                    </div>
                                    <div className="mt-1 text-[9px] text-gray-500">
                                      {focusLabel(entry.focus)} · +
                                      {entry.progressGain}% progress
                                    </div>
                                  </div>
                                  <div className="max-w-[48%] text-right text-[9px] font-bold text-emerald-400">
                                    {statGainText(entry.statGains)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
