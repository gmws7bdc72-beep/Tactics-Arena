import type { Server, Socket } from "socket.io";
import { logger } from "../lib/logger.js";
import * as rm from "./roomManager.js";

// FTA_NET1_RECONNECT_GRACE
// A brief transport drop is NOT a forfeit. Mobile browsers and proxies can
// rotate a Socket.IO connection while the user is still actively in the match.
const RECONNECT_GRACE_MS = 30000;
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function socketClientId(socket: Socket): string {
  const raw = socket.handshake.auth?.clientId;
  return typeof raw === "string" && raw.length > 0 ? raw : socket.id;
}

function cancelDisconnectTimer(clientId: string): void {
  const timer = disconnectTimers.get(clientId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(clientId);
}

export function setupSocketServer(io: Server): void {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    const clientId = socketClientId(socket);
    const resumed = rm.resumeClient(clientId, socket.id);
    if (resumed) {
      cancelDisconnectTimer(clientId);
      socket.join(resumed.room.code);
      socket.emit("room:resumed", {
        yourRole: resumed.role,
        turn: resumed.room.turn,
        maxTurns: resumed.room.maxTurns,
        score: resumed.room.score,
        phase: resumed.room.phase,
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
        });
      }

      logger.info({ code: resumed.room.code, role: resumed.role, socketId: socket.id }, "Socket resumed online room");
    }

    socket.on("room:create", (data: { team: rm.TeamSummary }) => {
      try {
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
        });
        io.to(room.code).emit("turn:start", {
          turn: room.turn,
          maxTurns: room.maxTurns,
          score: room.score,
        });
        logger.info({ code: room.code }, "Room ready — both players joined");
      } catch (err) {
        logger.error({ err }, "room:join error");
        socket.emit("room:error", { message: "Failed to join room." });
      }
    });

    socket.on("turn:commands", (data: { commands: unknown[] }) => {
      try {
        const room = rm.submitCommands(socket.id, data.commands);
        if (!room) return;

        const isP1 = room.p1?.socketId === socket.id;
        const opponentId = isP1 ? room.p2?.socketId : room.p1?.socketId;
        if (opponentId) io.to(opponentId).emit("turn:opponent-submitted");

        if (rm.bothSubmitted(room)) {
          const seed = rm.startSimulation(room);
          io.to(room.code).emit("turn:simulate", {
            p1Commands: room.p1!.commands,
            p2Commands: room.p2!.commands,
            seed,
          });
          logger.info({ code: room.code, turn: room.turn, seed }, "Simulation triggered");
        }
      } catch (err) {
        logger.error({ err }, "turn:commands error");
      }
    });

    socket.on("turn:ready", (data: { goalsDelta: { p1: number; p2: number } }) => {
      try {
        const room = rm.markReady(socket.id, data.goalsDelta);
        if (!room) return;

        if (rm.bothReady(room)) {
          if (room.turn >= room.maxTurns) {
            room.phase = "finished";
            const { p1, p2 } = room.score;
            const winner = p1 > p2 ? "p1" : p2 > p1 ? "p2" : "draw";
            io.to(room.code).emit("game:over", { score: room.score, winner });
            logger.info({ code: room.code, score: room.score, winner }, "Game over");
          } else {
            rm.startNextTurn(room);
            io.to(room.code).emit("turn:done", {
              score: room.score,
              turn: room.turn,
              maxTurns: room.maxTurns,
            });
          }
        }
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
        const remaining = room.p1?.connected ? room.p1.socketId : room.p2?.connected ? room.p2.socketId : null;
        if (remaining) {
          io.to(remaining).emit("room:opponent-left", {
            message: "Your opponent disconnected.",
          });
        }
      }, RECONNECT_GRACE_MS);
      disconnectTimers.set(disconnectedClientId, timer);
    });
  });
}
