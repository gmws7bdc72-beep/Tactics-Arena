import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const MARK = 'FTA_NET1_RECONNECT_GRACE';
const GRACE_MS = 30000;

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s); }

function findRoots() {
  const cwd = process.cwd();
  const roots = [cwd, path.join(os.homedir(), 'workspace')];
  for (const root of roots) {
    const game = path.join(root, 'artifacts/fta-game');
    const api = path.join(root, 'artifacts/api-server');
    if (exists(path.join(game, 'src/lib/socket.ts')) && exists(path.join(api, 'src/online/socketServer.ts'))) {
      return { root: fs.realpathSync(root), game: fs.realpathSync(game), api: fs.realpathSync(api) };
    }
  }
  throw new Error('Could not find artifacts/fta-game + artifacts/api-server. Run from ~/workspace.');
}

function replaceOnce(text, oldText, newText, label) {
  const i = text.indexOf(oldText);
  if (i < 0) throw new Error(`${label}: anchor not found`);
  return text.slice(0, i) + newText + text.slice(i + oldText.length);
}

function patchClientSocket(file) {
  let text = read(file);
  if (text.includes(MARK)) {
    console.log('socket.ts already patched');
    return;
  }

  // Preserve imports and public API, but replace the tiny socket singleton implementation.
  const importMatch = text.match(/^import[^\n]+socket\.io-client[^\n]*;\s*/m);
  if (!importMatch) throw new Error('socket.ts: socket.io-client import not found');

  const replacement = `${importMatch[0].trim()}\n\n// ${MARK}\n// Socket.IO may briefly reconnect on mobile/Wi-Fi handoffs. Give every tab a stable\n// identity so the server can attach the new socket id back to the same match slot.\nconst ONLINE_CLIENT_ID_KEY = "fta_online_client_id_v1";\n\nfunction makeClientId(): string {\n  try {\n    const existing = window.sessionStorage.getItem(ONLINE_CLIENT_ID_KEY);\n    if (existing) return existing;\n    const created = typeof crypto !== "undefined" && "randomUUID" in crypto\n      ? crypto.randomUUID()\n      : \`fta-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2)}\`;\n    window.sessionStorage.setItem(ONLINE_CLIENT_ID_KEY, created);\n    return created;\n  } catch {\n    return \`fta-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2)}\`;\n  }\n}\n\nlet _socket: Socket | null = null;\n\nexport function getSocket(): Socket {\n  if (!_socket) {\n    _socket = io("/", {\n      path: "/api/socket.io",\n      transports: ["websocket", "polling"],\n      auth: { clientId: makeClientId() },\n      reconnection: true,\n      reconnectionAttempts: Infinity,\n      reconnectionDelay: 400,\n      reconnectionDelayMax: 3000,\n      timeout: 20000,\n    });\n  }\n  return _socket;\n}\n\nexport function disconnectSocket(): void {\n  if (_socket) {\n    _socket.disconnect();\n    _socket = null;\n  }\n}\n`;

  write(file, replacement);
  console.log('Patched game socket.ts');
}

function patchRoomManager(file) {
  let text = read(file);
  if (text.includes(MARK)) {
    console.log('roomManager.ts already patched');
    return;
  }

  // Player connection identity/state.
  text = replaceOnce(
    text,
    'interface RoomPlayer {\n  socketId: string;',
    `interface RoomPlayer {\n  socketId: string;\n  // ${MARK}\n  clientId: string;\n  connected: boolean;`,
    'roomManager RoomPlayer',
  );

  // Remember the simulation seed so a reconnecting player can safely replay a missed simulate event.
  if (!text.includes('simulationSeed?: number;')) {
    text = text.replace(
      /(export interface Room \{[\s\S]*?score:\s*\{ p1: number; p2: number \};)/,
      '$1\n  simulationSeed?: number;',
    );
  }

  text = replaceOnce(
    text,
    'const socketToRoom = new Map<string, string>();',
    `const socketToRoom = new Map<string, string>();\nconst clientToRoom = new Map<string, string>();`,
    'roomManager maps',
  );

  // createRoom signature + player construction + client map.
  text = text.replace(
    /export function createRoom\(socketId: string, team: TeamSummary\): Room \{/,
    'export function createRoom(socketId: string, team: TeamSummary, clientId = socketId): Room {',
  );
  text = text.replace(
    /p1:\s*\{ socketId, team, submitted: false, commands: null, ready: false \}/,
    'p1: { socketId, clientId, connected: true, team, submitted: false, commands: null, ready: false }',
  );
  const createSet = '  socketToRoom.set(socketId, code);\n  return room;';
  if (text.includes(createSet)) {
    text = replaceOnce(text, createSet, '  socketToRoom.set(socketId, code);\n  clientToRoom.set(clientId, code);\n  return room;', 'roomManager create map');
  } else if (!text.includes('clientToRoom.set(clientId, code)')) {
    throw new Error('roomManager: createRoom mapping anchor not found');
  }

  // joinRoom signature + construction + client map.
  text = text.replace(
    /export function joinRoom\(\s*socketId: string,\s*code: string,\s*team: TeamSummary,?\s*\)/s,
    'export function joinRoom(\n  socketId: string,\n  code: string,\n  team: TeamSummary,\n  clientId = socketId,\n)',
  );
  text = text.replace(
    /room\.p2 = \{ socketId, team, submitted: false, commands: null, ready: false \};/,
    'room.p2 = { socketId, clientId, connected: true, team, submitted: false, commands: null, ready: false };',
  );
  const joinSet = '  socketToRoom.set(socketId, upper);\n  return { room, role: "p2" };';
  if (text.includes(joinSet)) {
    text = replaceOnce(text, joinSet, '  socketToRoom.set(socketId, upper);\n  clientToRoom.set(clientId, upper);\n  return { room, role: "p2" };', 'roomManager join map');
  } else if (!text.includes('clientToRoom.set(clientId, upper)')) {
    throw new Error('roomManager: joinRoom mapping anchor not found');
  }

  // Do not let duplicate ready packets double-count a goal after reconnect/replay.
  text = text.replace(
    /if \(room\.p1\?\.socketId === socketId\) \{\s*room\.p1\.ready = true;\s*room\.score\.p1 \+= goalsDelta\.p1;\s*room\.score\.p2 \+= goalsDelta\.p2;\s*\} else if \(room\.p2\?\.socketId === socketId\) \{\s*room\.p2\.ready = true;\s*\}/s,
    `if (room.p1?.socketId === socketId) {\n    if (!room.p1.ready) {\n      room.p1.ready = true;\n      room.score.p1 += goalsDelta.p1;\n      room.score.p2 += goalsDelta.p2;\n    }\n  } else if (room.p2?.socketId === socketId) {\n    if (!room.p2.ready) room.p2.ready = true;\n  }`,
  );

  // Seed persistence.
  text = text.replace(
    /export function startSimulation\(room: Room\): number \{\s*room\.phase = "simulating";\s*return Math\.floor\(Math\.random\(\) \* 999983\);\s*\}/s,
    `export function startSimulation(room: Room): number {\n  room.phase = "simulating";\n  const seed = Math.floor(Math.random() * 999983);\n  room.simulationSeed = seed;\n  return seed;\n}`,
  );
  if (!text.includes('room.simulationSeed = undefined;')) {
    text = text.replace(
      /(export function startNextTurn\(room: Room\): void \{\s*room\.turn \+= 1;)/s,
      '$1\n  room.simulationSeed = undefined;',
    );
  }

  // Helpers are additive, so existing room/turn logic is preserved.
  const insertBefore = 'export function removeSocket(socketId: string):';
  const idx = text.indexOf(insertBefore);
  if (idx < 0) throw new Error('roomManager: removeSocket anchor not found');
  const helpers = `// ${MARK}\nexport function bothConnected(room: Room): boolean {\n  return !!(room.p1?.connected && room.p2?.connected);\n}\n\nexport function resumeClient(\n  clientId: string,\n  newSocketId: string,\n): { room: Room; role: TeamRole } | null {\n  const code = clientToRoom.get(clientId);\n  if (!code) return null;\n  const room = rooms.get(code);\n  if (!room) {\n    clientToRoom.delete(clientId);\n    return null;\n  }\n\n  const candidates: Array<[TeamRole, RoomPlayer | null]> = [["p1", room.p1], ["p2", room.p2]];\n  for (const [role, player] of candidates) {\n    if (!player || player.clientId !== clientId) continue;\n    socketToRoom.delete(player.socketId);\n    player.socketId = newSocketId;\n    player.connected = true;\n    socketToRoom.set(newSocketId, code);\n    return { room, role };\n  }\n  return null;\n}\n\nexport function markSocketDisconnected(\n  socketId: string,\n): { room: Room; role: TeamRole; clientId: string } | null {\n  const code = socketToRoom.get(socketId);\n  if (!code) return null;\n  socketToRoom.delete(socketId);\n  const room = rooms.get(code);\n  if (!room) return null;\n\n  if (room.p1?.socketId === socketId) {\n    room.p1.connected = false;\n    return { room, role: "p1", clientId: room.p1.clientId };\n  }\n  if (room.p2?.socketId === socketId) {\n    room.p2.connected = false;\n    return { room, role: "p2", clientId: room.p2.clientId };\n  }\n  return null;\n}\n\nexport function finalizeDisconnectedClient(\n  clientId: string,\n): { room: Room; role: TeamRole } | null {\n  const code = clientToRoom.get(clientId);\n  if (!code) return null;\n  const room = rooms.get(code);\n  if (!room) {\n    clientToRoom.delete(clientId);\n    return null;\n  }\n\n  if (room.p1?.clientId === clientId) {\n    if (room.p1.connected) return null;\n    clientToRoom.delete(clientId);\n    room.p1 = null;\n    if (!room.p2) rooms.delete(code);\n    return { room, role: "p1" };\n  }\n  if (room.p2?.clientId === clientId) {\n    if (room.p2.connected) return null;\n    clientToRoom.delete(clientId);\n    room.p2 = null;\n    if (!room.p1) rooms.delete(code);\n    return { room, role: "p2" };\n  }\n  return null;\n}\n\n`;
  text = text.slice(0, idx) + helpers + text.slice(idx);

  write(file, text);
  console.log('Patched api roomManager.ts');
}

function patchSocketServer(file) {
  let text = read(file);
  if (text.includes(MARK)) {
    console.log('socketServer.ts already patched');
    return;
  }

  // Top-level reconnect grace state.
  const importAnchor = 'import * as rm from "./roomManager.js";';
  if (!text.includes(importAnchor)) throw new Error('socketServer: roomManager import not found');
  text = replaceOnce(
    text,
    importAnchor,
    `${importAnchor}\n\n// ${MARK}\n// A brief transport drop is NOT a forfeit. Mobile browsers and proxies can\n// rotate a Socket.IO connection while the user is still actively in the match.\nconst RECONNECT_GRACE_MS = ${GRACE_MS};\nconst disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();\n\nfunction socketClientId(socket: Socket): string {\n  const raw = socket.handshake.auth?.clientId;\n  return typeof raw === "string" && raw.length > 0 ? raw : socket.id;\n}\n\nfunction cancelDisconnectTimer(clientId: string): void {\n  const timer = disconnectTimers.get(clientId);\n  if (timer) clearTimeout(timer);\n  disconnectTimers.delete(clientId);\n}`,
    'socketServer reconnect globals',
  );

  // Client id + automatic resume at each socket connection.
  const connAnchor = '    logger.info({ socketId: socket.id }, "Socket connected");';
  if (!text.includes(connAnchor)) throw new Error('socketServer: connection logger anchor not found');
  const resumeBlock = `${connAnchor}\n\n    const clientId = socketClientId(socket);\n    const resumed = rm.resumeClient(clientId, socket.id);\n    if (resumed) {\n      cancelDisconnectTimer(clientId);\n      socket.join(resumed.room.code);\n      socket.emit("room:resumed", {\n        yourRole: resumed.role,\n        turn: resumed.room.turn,\n        maxTurns: resumed.room.maxTurns,\n        score: resumed.room.score,\n        phase: resumed.room.phase,\n      });\n\n      // If the reconnect happened exactly while turn:simulate was emitted,\n      // replay that deterministic event to this socket only. Duplicate ready\n      // packets are idempotent in roomManager, so this is safe.\n      if (\n        resumed.room.phase === "simulating" &&\n        resumed.room.simulationSeed != null &&\n        resumed.room.p1?.commands &&\n        resumed.room.p2?.commands\n      ) {\n        socket.emit("turn:simulate", {\n          p1Commands: resumed.room.p1.commands,\n          p2Commands: resumed.room.p2.commands,\n          seed: resumed.room.simulationSeed,\n        });\n      }\n\n      logger.info({ code: resumed.room.code, role: resumed.role, socketId: socket.id }, "Socket resumed online room");\n    }`;
  text = replaceOnce(text, connAnchor, resumeBlock, 'socketServer resume block');

  // Pass stable client id when initially creating/joining.
  text = text.replace(
    /rm\.createRoom\(socket\.id, data\.team\)/,
    'rm.createRoom(socket.id, data.team, clientId)',
  );
  text = text.replace(
    /rm\.joinRoom\(socket\.id, data\.code, data\.team\)/,
    'rm.joinRoom(socket.id, data.code, data.team, clientId)',
  );

  // Replace immediate-forfeit disconnect with grace period.
  const disconnectRegex = /\n\s*socket\.on\("disconnect", \(\) => \{[\s\S]*?\n\s*\}\);\n(?=\s*\}\);\n\})/;
  const m = text.match(disconnectRegex);
  if (!m) throw new Error('socketServer: disconnect handler block not found');
  const disconnectBlock = `\n    socket.on("disconnect", (reason) => {\n      logger.info({ socketId: socket.id, reason }, "Socket disconnected; holding room slot for reconnect grace");\n      const result = rm.markSocketDisconnected(socket.id);\n      if (!result) return;\n\n      const { clientId: disconnectedClientId } = result;\n      cancelDisconnectTimer(disconnectedClientId);\n      const timer = setTimeout(() => {\n        disconnectTimers.delete(disconnectedClientId);\n        const finalized = rm.finalizeDisconnectedClient(disconnectedClientId);\n        if (!finalized) return; // player reconnected during grace\n\n        const { room } = finalized;\n        const remaining = room.p1?.connected ? room.p1.socketId : room.p2?.connected ? room.p2.socketId : null;\n        if (remaining) {\n          io.to(remaining).emit("room:opponent-left", {\n            message: "Your opponent disconnected.",\n          });\n        }\n      }, RECONNECT_GRACE_MS);\n      disconnectTimers.set(disconnectedClientId, timer);\n    });\n`;
  text = text.replace(disconnectRegex, disconnectBlock);

  write(file, text);
  console.log('Patched api socketServer.ts');
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function typecheck(dir) {
  const cmd = exists(path.join(dir, 'node_modules/.bin/tsc')) ? path.join(dir, 'node_modules/.bin/tsc') : 'tsc';
  const args = ['-p', 'tsconfig.json', '--noEmit'];
  const res = spawnSync(cmd, args, { cwd: dir, stdio: 'inherit', shell: false });
  return res.status === 0;
}

function main() {
  const { root, game, api } = findRoots();
  console.log('FTA NET1 - online false-disconnect/reconnect fix');
  console.log(`Workspace: ${root}`);

  const targets = [
    path.join(game, 'src/lib/socket.ts'),
    path.join(api, 'src/online/roomManager.ts'),
    path.join(api, 'src/online/socketServer.ts'),
  ];
  for (const file of targets) if (!exists(file)) throw new Error(`Missing file: ${file}`);

  const backup = path.join(root, 'backups', `fta-net1-${stamp()}`);
  for (const src of targets) {
    const rel = path.relative(root, src);
    const dst = path.join(backup, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  try {
    patchClientSocket(targets[0]);
    patchRoomManager(targets[1]);
    patchSocketServer(targets[2]);

    console.log('Checking game TypeScript...');
    if (!typecheck(game)) throw new Error('Game typecheck failed.');
    console.log('Checking API TypeScript...');
    if (!typecheck(api)) throw new Error('API typecheck failed.');
  } catch (error) {
    console.error('Patch/check failed; restoring files...');
    for (const src of targets) {
      const rel = path.relative(root, src);
      fs.copyFileSync(path.join(backup, rel), src);
    }
    throw error;
  }

  console.log('FTA NET1 applied successfully.');
  console.log('Transient Socket.IO drops now get a 30-second reconnect grace period instead of an instant Opponent Left.');
  console.log(`Backup: ${backup}`);
}

try { main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
