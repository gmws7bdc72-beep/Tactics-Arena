import { useState, useEffect } from "react";
import type { PlayerCard, TeamConfig } from "../engine/types";
import { PLAYERS_PER_TEAM } from "../engine/constants";
import { LEBRON_ONLINE_CARD } from "../game/onlineSpecialPlayers";
import type { TeamSummary } from "./OnlineMatch";
import { getSocket } from "../lib/socket";

interface Props {
  team: TeamConfig;
  onGameReady: (config: {
    myRole: "p1" | "p2";
    p1Team: TeamSummary;
    p2Team: TeamSummary;
    roomCode: string;
    turnDeadlineAt?: number;
  }) => void;
  onBack: () => void;
}

type LobbyState =
  | { stage: "idle" }
  | { stage: "waiting"; code: string }
  | { stage: "joining" }
  | { stage: "error"; message: string };

function toTeamSummary(team: TeamConfig, includeLeBron: boolean): TeamSummary {
  const players: PlayerCard[] = [...team.players];
  if (includeLeBron) {
    const activeLeBronIndex = players
      .slice(0, PLAYERS_PER_TEAM)
      .findIndex((player) => player.id === LEBRON_ONLINE_CARD.id);
    const replaceIndex = players
      .slice(0, PLAYERS_PER_TEAM)
      .findIndex((player) => player.role === "forward" || player.role === "striker");
    const targetIndex = replaceIndex >= 0 ? replaceIndex : PLAYERS_PER_TEAM - 1;
    const existingLeBronIndex = players.findIndex(
      (player) => player.id === LEBRON_ONLINE_CARD.id,
    );

    if (activeLeBronIndex < 0 && targetIndex < players.length) {
      const displacedPlayer = players[targetIndex];
      if (existingLeBronIndex >= 0) {
        [players[targetIndex], players[existingLeBronIndex]] = [
          players[existingLeBronIndex],
          players[targetIndex],
        ];
      } else {
        players[targetIndex] = LEBRON_ONLINE_CARD;
        players.push(displacedPlayer);
      }
    }
  }

  return {
    rulesVersion: 8,
    name: team.name,
    jerseyColor: team.jerseyColor ?? "#1565c0",
    secondaryColor: team.secondaryColor,
    kitStyle: team.kitStyle,
    sleeveStyle: team.sleeveStyle,
    crestIcon: team.crestIcon,
    formationId: team.formationId,
    players,
    tier: 1,
  };
}

export default function OnlineLobby({ team, onGameReady, onBack }: Props) {
  const [state, setState] = useState<LobbyState>({ stage: "idle" });
  const [joinCode, setJoinCode] = useState("");
  const [includeLeBron, setIncludeLeBron] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on("room:created", ({ code }: { code: string }) => {
      setState({ stage: "waiting", code });
    });

    socket.on("room:joined", () => {
      // acknowledged — room:ready will arrive next
    });

    socket.on("room:ready", ({
      p1Team,
      p2Team,
      turnDeadlineAt,
    }: {
      p1Team: TeamSummary;
      p2Team: TeamSummary;
      turnDeadlineAt?: number;
    }) => {
      const myRole: "p1" | "p2" =
        state.stage === "waiting" ? "p1" : "p2";
      onGameReady({
        myRole,
        p1Team,
        p2Team,
        roomCode: state.stage === "waiting" ? state.code : joinCode.toUpperCase(),
        turnDeadlineAt,
      });
    });

    socket.on("room:error", ({ message }: { message: string }) => {
      setState({ stage: "error", message });
    });

    return () => {
      socket.off("room:created");
      socket.off("room:joined");
      socket.off("room:ready");
      socket.off("room:error");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, joinCode, onGameReady]);

  const handleCreate = () => {
    const summary = toTeamSummary(team, includeLeBron);
    getSocket().emit("room:create", { team: summary });
  };

  const handleJoin = () => {
    if (!joinCode.trim()) return;
    setState({ stage: "joining" });
    const summary = toTeamSummary(team, includeLeBron);
    getSocket().emit("room:join", { code: joinCode.trim(), team: summary });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#070b14" }}>
      <div className="w-full max-w-sm">
        {/* Header */}
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-sm"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          ← Back
        </button>

        <h1 className="text-2xl font-bold text-white mb-1">Online Multiplayer</h1>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.4)" }}>
          Playing as <span style={{ color: team.jerseyColor ?? "#fff" }}>{team.name}</span>
        </p>

        {state.stage === "idle" && (
          <div className="flex flex-col gap-4">
            <label
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"
              style={{
                background: includeLeBron ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                borderColor: includeLeBron ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.1)",
              }}
            >
              <input
                type="checkbox"
                checked={includeLeBron}
                onChange={(event) => setIncludeLeBron(event.target.checked)}
                className="mt-1 h-4 w-4 accent-amber-400"
              />
              <span>
                <span className="block text-sm font-bold text-white">
                  Add LeBron James to my lineup
                </span>
                <span className="mt-1 block text-xs leading-5 text-white/55">
                  He takes a forward spot and can launch from behind halfway. Logo shots are wildly inaccurate.
                </span>
              </span>
            </label>

            {/* Create */}
            <button
              onClick={handleCreate}
              className="w-full py-4 rounded-xl font-bold text-white text-lg"
              style={{ background: "#22c55e" }}
            >
              🆕 Create Game
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
            </div>

            {/* Join */}
            <div className="flex flex-col gap-2">
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleJoin()}
                placeholder="Enter room code"
                maxLength={4}
                className="w-full px-4 py-3 rounded-xl text-center text-xl font-mono font-bold tracking-widest"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                  outline: "none",
                }}
              />
              <button
                onClick={handleJoin}
                disabled={!joinCode.trim()}
                className="w-full py-3 rounded-xl font-bold text-white"
                style={{
                  background: joinCode.trim() ? "#3b82f6" : "rgba(59,130,246,0.3)",
                  cursor: joinCode.trim() ? "pointer" : "not-allowed",
                }}
              >
                Join Game
              </button>
            </div>
          </div>
        )}

        {state.stage === "waiting" && (
          <div className="text-center">
            <div className="text-6xl mb-4">⏳</div>
            <p className="text-white text-lg font-semibold mb-2">Waiting for opponent…</p>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
              Share this code with your friend:
            </p>
            <div
              className="py-5 px-8 rounded-2xl text-5xl font-mono font-black tracking-widest mb-6"
              style={{ background: "rgba(255,255,255,0.07)", color: "#fbbf24", letterSpacing: "0.25em" }}
            >
              {state.code}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(state.code)}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
            >
              📋 Copy code
            </button>
          </div>
        )}

        {state.stage === "joining" && (
          <div className="text-center">
            <div className="text-5xl mb-4 animate-spin">⚽</div>
            <p className="text-white">Joining room <span className="font-mono font-bold">{joinCode}</span>…</p>
          </div>
        )}

        {state.stage === "error" && (
          <div className="flex flex-col gap-4">
            <div
              className="p-4 rounded-xl text-center"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <p className="text-red-400 font-semibold">{state.message}</p>
            </div>
            <button
              onClick={() => setState({ stage: "idle" })}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
