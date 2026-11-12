export type TeamRole = "p1" | "p2";

export const ONLINE_MAX_TURNS = 30;
export const ONLINE_TURN_TIME_MS = 25_000;

export interface TeamSummary {
  rulesVersion?: number;
  name: string;
  jerseyColor: string;
  secondaryColor?: string;
  crestIcon?: string;
  formationId: string;
  players: unknown[];
  tier?: number;
}

interface RoomPlayer {
  socketId: string;
  // FTA_NET1_RECONNECT_GRACE
  clientId: string;
  connected: boolean;
  team: TeamSummary;
  submitted: boolean;
  commands: unknown[] | null;
  ready: boolean;
}

export interface Room {
  code: string;
  p1: RoomPlayer | null;
  p2: RoomPlayer | null;
  phase: "waiting" | "planning" | "simulating" | "finished";
  turn: number;
  maxTurns: number;
  score: { p1: number; p2: number };
  turnDeadlineAt?: number;
  winner?: TeamRole | "draw";
  endReason?: "full_time" | "opponent_left";
  turnResultApplied: boolean;
  simulationSeed?: number;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();
const clientToRoom = new Map<string, string>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(socketId: string, team: TeamSummary, clientId = socketId): Room {
  let code: string;
  do { code = generateCode(); } while (rooms.has(code));

  const room: Room = {
    code,
    p1: { socketId, clientId, connected: true, team, submitted: false, commands: null, ready: false },
    p2: null,
    phase: "waiting",
    turn: 1,
    maxTurns: ONLINE_MAX_TURNS,
    score: { p1: 0, p2: 0 },
    turnResultApplied: false,
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  clientToRoom.set(clientId, code);
  return room;
}

export function joinRoom(
  socketId: string,
  code: string,
  team: TeamSummary,
  clientId = socketId,
): { room: Room; role: TeamRole } | { error: string } {
  const upper = code.toUpperCase();
  const room = rooms.get(upper);
  if (!room) return { error: "Room not found. Check the code and try again." };
  if (room.phase !== "waiting") return { error: "Game already in progress." };
  if (room.p2) return { error: "Room is full." };
  if (room.p1?.socketId === socketId) return { error: "You cannot join your own room." };
  if (room.p1?.team.rulesVersion !== team.rulesVersion) {
    return {
      error:
        "This room is using a different gameplay version. Both players need the same update.",
    };
  }

  room.p2 = { socketId, clientId, connected: true, team, submitted: false, commands: null, ready: false };
  room.phase = "planning";
  room.turnDeadlineAt = Date.now() + ONLINE_TURN_TIME_MS;
  socketToRoom.set(socketId, upper);
  clientToRoom.set(clientId, upper);
  return { room, role: "p2" };
}

export function getRoomBySocket(socketId: string): Room | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  return rooms.get(code) ?? null;
}

export function submitCommands(
  socketId: string,
  commands: unknown[],
  submittedTurn?: number,
): Room | null {
  const room = getRoomBySocket(socketId);
  if (
    !room ||
    room.phase !== "planning" ||
    (submittedTurn != null && submittedTurn !== room.turn)
  ) {
    return null;
  }

  if (room.p1?.socketId === socketId) {
    room.p1.submitted = true;
    room.p1.commands = commands;
  } else if (room.p2?.socketId === socketId) {
    room.p2.submitted = true;
    room.p2.commands = commands;
  } else {
    return null;
  }
  return room;
}

export function bothSubmitted(room: Room): boolean {
  return !!(room.p1?.submitted && room.p2?.submitted);
}

export function startSimulation(room: Room): number {
  room.phase = "simulating";
  room.turnDeadlineAt = undefined;
  room.turnResultApplied = false;
  const seed = Math.floor(Math.random() * 999983);
  room.simulationSeed = seed;
  return seed;
}

export function markReady(
  socketId: string,
  goalsDelta: { p1: number; p2: number },
  completedTurn?: number,
): Room | null {
  const room = getRoomBySocket(socketId);
  if (
    !room ||
    room.phase !== "simulating" ||
    (completedTurn != null && completedTurn !== room.turn)
  ) {
    return null;
  }

  if (room.p1?.socketId === socketId) {
    if (!room.p1.ready) {
      room.p1.ready = true;
      if (!room.turnResultApplied) {
        room.score.p1 += goalsDelta.p1;
        room.score.p2 += goalsDelta.p2;
        room.turnResultApplied = true;
      }
    }
  } else if (room.p2?.socketId === socketId) {
    if (!room.p2.ready) {
      room.p2.ready = true;
      if (!room.turnResultApplied) {
        room.score.p1 += goalsDelta.p1;
        room.score.p2 += goalsDelta.p2;
        room.turnResultApplied = true;
      }
    }
  } else {
    return null;
  }
  return room;
}

export function bothReady(room: Room): boolean {
  return !!(room.p1?.ready && room.p2?.ready);
}

export function startNextTurn(room: Room): void {
  room.turn += 1;
  room.simulationSeed = undefined;
  room.phase = room.turn > room.maxTurns ? "finished" : "planning";
  room.turnDeadlineAt =
    room.phase === "planning" ? Date.now() + ONLINE_TURN_TIME_MS : undefined;
  room.turnResultApplied = false;
  if (room.p1) { room.p1.submitted = false; room.p1.commands = null; room.p1.ready = false; }
  if (room.p2) { room.p2.submitted = false; room.p2.commands = null; room.p2.ready = false; }
}

export function expireMissingSubmissions(room: Room): boolean {
  if (room.phase !== "planning") return false;
  for (const player of [room.p1, room.p2]) {
    if (player && !player.submitted) {
      player.submitted = true;
      player.commands = [];
    }
  }
  return bothSubmitted(room);
}

export function completeMissingReady(room: Room): void {
  if (room.phase !== "simulating") return;
  if (room.p1) room.p1.ready = true;
  if (room.p2) room.p2.ready = true;
}

export function markFinished(room: Room, reason: "full_time" | "opponent_left"): void {
  room.phase = "finished";
  room.turnDeadlineAt = undefined;
  room.endReason = reason;
  if (reason === "full_time") {
    room.winner =
      room.score.p1 > room.score.p2
        ? "p1"
        : room.score.p2 > room.score.p1
          ? "p2"
          : "draw";
  }
}

// FTA_NET1_RECONNECT_GRACE
export function bothConnected(room: Room): boolean {
  return !!(room.p1?.connected && room.p2?.connected);
}

export function resumeClient(
  clientId: string,
  newSocketId: string,
): { room: Room; role: TeamRole } | null {
  const code = clientToRoom.get(clientId);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) {
    clientToRoom.delete(clientId);
    return null;
  }

  const candidates: Array<[TeamRole, RoomPlayer | null]> = [["p1", room.p1], ["p2", room.p2]];
  for (const [role, player] of candidates) {
    if (!player || player.clientId !== clientId) continue;
    socketToRoom.delete(player.socketId);
    player.socketId = newSocketId;
    player.connected = true;
    socketToRoom.set(newSocketId, code);
    return { room, role };
  }
  return null;
}

export function getRoomByClient(clientId: string): Room | null {
  const code = clientToRoom.get(clientId);
  return code ? rooms.get(code) ?? null : null;
}

export function removeRoom(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  for (const player of [room.p1, room.p2]) {
    if (!player) continue;
    socketToRoom.delete(player.socketId);
    if (clientToRoom.get(player.clientId) === code) {
      clientToRoom.delete(player.clientId);
    }
  }
  rooms.delete(code);
}

export function markSocketDisconnected(
  socketId: string,
): { room: Room; role: TeamRole; clientId: string } | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  socketToRoom.delete(socketId);
  const room = rooms.get(code);
  if (!room) return null;

  if (room.p1?.socketId === socketId) {
    room.p1.connected = false;
    return { room, role: "p1", clientId: room.p1.clientId };
  }
  if (room.p2?.socketId === socketId) {
    room.p2.connected = false;
    return { room, role: "p2", clientId: room.p2.clientId };
  }
  return null;
}

export function finalizeDisconnectedClient(
  clientId: string,
): { room: Room; role: TeamRole } | null {
  const code = clientToRoom.get(clientId);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) {
    clientToRoom.delete(clientId);
    return null;
  }

  if (room.p1?.clientId === clientId) {
    if (room.p1.connected) return null;
    return { room, role: "p1" };
  }
  if (room.p2?.clientId === clientId) {
    if (room.p2.connected) return null;
    return { room, role: "p2" };
  }
  return null;
}

export function removeSocket(socketId: string): { room: Room; role: TeamRole } | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  socketToRoom.delete(socketId);

  const room = rooms.get(code);
  if (!room) return null;

  if (room.p1?.socketId === socketId) {
    room.p1 = null;
    if (!room.p2) rooms.delete(code);
    return { room, role: "p1" };
  }
  if (room.p2?.socketId === socketId) {
    room.p2 = null;
    if (!room.p1) rooms.delete(code);
    return { room, role: "p2" };
  }
  return null;
}
