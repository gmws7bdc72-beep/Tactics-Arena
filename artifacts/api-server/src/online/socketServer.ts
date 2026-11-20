import type { Server, Socket } from "socket.io";
import { logger } from "../lib/logger.js";
import * as rm from "./roomManager.js";

// FTA_NET1_RECONNECT_GRACE
// A brief transport drop is NOT a forfeit. Mobile browsers and proxies can
// rotate a Socket.IO connection while the user is still actively in the match.
const RECONNECT_GRACE_MS = 30000;
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TURN_TIMEOUT_GRACE_MS = 750;
const SIMULATION_READY_TIMEOUT_MS = 15000;
const FINISHED_ROOM_RETENTION_MS = 10 * 60 * 1000;
const planningTimers = new Map<string, ReturnType<typeof setTimeout>>();
const simulationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const finishedRoomTimers = new Map<string, ReturnType<typeof setTimeout>>();

function socketClientId(socket: Socket): string {
  const raw = socket.handshake.auth?.clientId;
  return typeof raw === "string" && raw.length > 0 ? raw : socket.id;
}

function cancelDisconnectTimer(clientId: string): void {
  const timer = disconnectTimers.get(clientId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(clientId);
}

function clearRoomTimer(
  timers: Map<string, ReturnType<typeof setTimeout>>,
  roomCode: string,
): void {
  const timer = timers.get(roomCode);
  if (timer) clearTimeout(timer);
  timers.delete(roomCode);
}

function startSimulation(io: Server, room: rm.Room): void {
  const seed = rm.startSimulation(room);
  clearRoomTimer(planningTimers, room.code);
  io.to(room.code).emit("turn:simulate", {
    p1Commands: room.p1?.commands ?? [],
    p2Commands: room.p2?.commands ?? [],
    seed,
    turn: room.turn,
  });

  clearRoomTimer(simulationTimers, room.code);
  simulationTimers.set(
    room.code,
    setTimeout(() => {
      simulationTimers.delete(room.code);
      if (room.phase !== "simulating") return;
      rm.completeMissingReady(room);
      finishTurnIfReady(io, room);
    }, SIMULATION_READY_TIMEOUT_MS),
  );
}

function schedulePlanningTimeout(io: Server, room: rm.Room): void {
  clearRoomTimer(planningTimers, room.code);
  if (room.phase !== "planning") return;
  const deadline = room.turnDeadlineAt ?? Date.now() + rm.ONLINE_TURN_TIME_MS;
  const timeout = Math.max(0, deadline - Date.now()) + TURN_TIMEOUT_GRACE_MS;

  planningTimers.set(
    room.code,
    setTimeout(() => {
      planningTimers.delete(room.code);
      if (!rm.expireMissingSubmissions(room)) return;
      startSimulation(io, room);
    }, timeout),
  );
}

function finishTurnIfReady(io: Server, room: rm.Room): void {
  if (!rm.bothReady(room)) return;
  clearRoomTimer(simulationTimers, room.code);

  if (room.turn >= room.maxTurns) {
    rm.markFinished(room, "full_time");
    io.to(room.code).emit("game:over", {
      score: room.score,
      winner: room.winner ?? "draw",
      endReason: room.endReason,
      turn: room.turn,
      maxTurns: room.maxTurns,
    });
    logger.info({ code: room.code, score: room.score, winner: room.winner }, "Game over");
    return;
  }

  rm.startNextTurn(room);
  io.to(room.code).emit("turn:done", {
    score: room.score,
    turn: room.turn,
    maxTurns: room.maxTurns,
    turnDeadlineAt: room.turnDeadlineAt,
  });
  schedulePlanningTimeout(io, room);
}

function releaseFinishedRoom(socket: Socket, clientId: string): void {
  const previousRoom = rm.getRoomByClient(clientId);
  if (!previousRoom || previousRoom.phase !== "finished") return;
  socket.leave(previousRoom.code);
  clearRoomTimer(planningTimers, previousRoom.code);
  clearRoomTimer(simulationTimers, previousRoom.code);
  clearRoomTimer(finishedRoomTimers, previousRoom.code);
  rm.removeRoom(previousRoom.code);
}

export function setupSocketServer(io: Server): void {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    const clientId = socketClientId(socket);
    const resumed = rm.resumeClient(clientId, socket.id);
    if (resumed) {
      cancelDisconnectTimer(clientId);
      clearRoomTimer(finishedRoomTimers, resumed.room.code);
      socket.join(resumed.room.code);
      const you = resumed.role === "p1" ? resumed.room.p1 : resumed.room.p2;
      const opponent = resumed.role === "p1" ? resumed.room.p2 : resumed.room.p1;
      socket.emit("room:resumed", {
        yourRole: resumed.role,
        turn: resumed.room.turn,
        maxTurns: resumed.room.maxTurns,
        score: resumed.room.score,
        phase: resumed.room.phase,
        turnDeadlineAt: resumed.room.turnDeadlineAt,
        youSubmitted: !!you?.submitted,
        opponentSubmitted: !!opponent?.submitted,
        winner: resumed.room.winner,
        endReason: resumed.room.endReason,
      });

      // If the reconnect happened exactly while turn:simulate was emitted,
      // replay that deterministic event to this socket only. Duplicate ready
      // packets are idempotent in roomManager, so this is safe.
      if (
        resumed.room.phase === "simulating" &&
        resumed.room.simulationSeed != null &&
        resumed.room.p1?.commands &&
        resumed.room.p2?.commands
      ) {
        socket.emit("turn:simulate", {
          p1Commands: resumed.room.p1.commands,
          p2Commands: resumed.room.p2.commands,
          seed: resumed.room.simulationSeed,
          turn: resumed.room.turn,
        });
      }

      logger.info({ code: resumed.room.code, role: resumed.role, socketId: socket.id }, "Socket resumed online room");
    }

    socket.on("room:create", (data: { team: rm.TeamSummary }) => {
      try {
        releaseFinishedRoom(socket, clientId);
        const room = rm.createRoom(socket.id, data.team, clientId);
        socket.join(room.code);
        socket.emit("room:created", { code: room.code, yourRole: "p1" });
        logger.info({ code: room.code }, "Room created");
      } catch (err) {
        logger.error({ err }, "room:create error");
        socket.emit("room:error", { message: "Failed to create room." });
      }
    });

    socket.on("room:join", (data: { code: string; team: rm.TeamSummary }) => {
      try {
        releaseFinishedRoom(socket, clientId);
        const result = rm.joinRoom(socket.id, data.code, data.team, clientId);
        if ("error" in result) {
          socket.emit("room:error", { message: result.error });
          return;
        }
        const { room } = result;
        socket.join(room.code);
        socket.emit("room:joined", { yourRole: "p2" });

        io.to(room.code).emit("room:ready", {
          p1Team: room.p1!.team,
          p2Team: room.p2!.team,
          turnDeadlineAt: room.turnDeadlineAt,
        });
        io.to(room.code).emit("turn:start", {
          turn: room.turn,
          maxTurns: room.maxTurns,
          score: room.score,
          turnDeadlineAt: room.turnDeadlineAt,
        });
        schedulePlanningTimeout(io, room);
        logger.info({ code: room.code }, "Room ready — both players joined");
      } catch (err) {
        logger.error({ err }, "room:join error");
        socket.emit("room:error", { message: "Failed to join room." });
      }
    });

    socket.on("turn:commands", (data: { commands: unknown[]; turn?: number }) => {
      try {
        const room = rm.submitCommands(socket.id, data.commands, data.turn);
        if (!room) return;

        const isP1 = room.p1?.socketId === socket.id;
        const opponentId = isP1 ? room.p2?.socketId : room.p1?.socketId;
        if (opponentId) io.to(opponentId).emit("turn:opponent-submitted");

        if (rm.bothSubmitted(room)) {
          logger.info({ code: room.code, turn: room.turn }, "Both players submitted");
          startSimulation(io, room);
        }
      } catch (err) {
        logger.error({ err }, "turn:commands error");
      }
    });

    socket.on("turn:ready", (data: {
      goalsDelta: { p1: number; p2: number };
      turn?: number;
    }) => {
      try {
        const room = rm.markReady(socket.id, data.goalsDelta, data.turn);
        if (!room) return;
        finishTurnIfReady(io, room);
      } catch (err) {
        logger.error({ err }, "turn:ready error");
      }
    });
    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "Socket disconnected; holding room slot for reconnect grace");
      const result = rm.markSocketDisconnected(socket.id);
      if (!result) return;

      const { clientId: disconnectedClientId } = result;
      cancelDisconnectTimer(disconnectedClientId);
      const timer = setTimeout(() => {
        disconnectTimers.delete(disconnectedClientId);
        const finalized = rm.finalizeDisconnectedClient(disconnectedClientId);
        if (!finalized) return; // player reconnected during grace

        const { room } = finalized;
        clearRoomTimer(planningTimers, room.code);
        clearRoomTimer(simulationTimers, room.code);
        const wasAlreadyFinished = room.phase === "finished";
        if (!wasAlreadyFinished) {
          rm.markFinished(room, "opponent_left");
          room.winner = finalized.role === "p1" ? "p2" : "p1";
        }
        const remaining = room.p1?.connected ? room.p1.socketId : room.p2?.connected ? room.p2.socketId : null;
        if (remaining && !wasAlreadyFinished) {
          io.to(remaining).emit("room:opponent-left", {
            message: "Your opponent disconnected.",
            score: room.score,
            winner: room.winner,
            endReason: room.endReason,
          });
        }

        clearRoomTimer(finishedRoomTimers, room.code);
        finishedRoomTimers.set(
          room.code,
          setTimeout(() => {
            finishedRoomTimers.delete(room.code);
            clearRoomTimer(planningTimers, room.code);
            clearRoomTimer(simulationTimers, room.code);
            rm.removeRoom(room.code);
          }, FINISHED_ROOM_RETENTION_MS),
        );
      }, RECONNECT_GRACE_MS);
      disconnectTimers.set(disconnectedClientId, timer);
    });
  });
}
