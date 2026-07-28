export type TeamRole = "p1" | "p2";

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
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(socketId: string, team: TeamSummary): Room {
  let code: string;
  do { code = generateCode(); } while (rooms.has(code));

  const room: Room = {
    code,
    p1: { socketId, team, submitted: false, commands: null, ready: false },
    p2: null,
    phase: "waiting",
    turn: 1,
    maxTurns: 40,
    score: { p1: 0, p2: 0 },
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return room;
}

export function joinRoom(
  socketId: string,
  code: string,
  team: TeamSummary,
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

  room.p2 = { socketId, team, submitted: false, commands: null, ready: false };
  room.phase = "planning";
  socketToRoom.set(socketId, upper);
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
): Room | null {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== "planning") return null;

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
  return Math.floor(Math.random() * 999983);
}

export function markReady(
  socketId: string,
  goalsDelta: { p1: number; p2: number },
): Room | null {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== "simulating") return null;

  if (room.p1?.socketId === socketId) {
    room.p1.ready = true;
    room.score.p1 += goalsDelta.p1;
    room.score.p2 += goalsDelta.p2;
  } else if (room.p2?.socketId === socketId) {
    room.p2.ready = true;
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
  room.phase = room.turn > room.maxTurns ? "finished" : "planning";
  if (room.p1) { room.p1.submitted = false; room.p1.commands = null; room.p1.ready = false; }
  if (room.p2) { room.p2.submitted = false; room.p2.commands = null; room.p2.ready = false; }
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
