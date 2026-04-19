import type { Server, Socket } from "socket.io";
import { logger } from "../lib/logger.js";
import * as rm from "./roomManager.js";

export function setupSocketServer(io: Server): void {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("room:create", (data: { team: rm.TeamSummary }) => {
      try {
        const room = rm.createRoom(socket.id, data.team);
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
        const result = rm.joinRoom(socket.id, data.code, data.team);
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

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
      const result = rm.removeSocket(socket.id);
      if (result) {
        const { room } = result;
        const remaining = room.p1?.socketId ?? room.p2?.socketId;
        if (remaining) {
          io.to(remaining).emit("room:opponent-left", {
            message: "Your opponent disconnected.",
          });
        }
      }
    });
  });
}
