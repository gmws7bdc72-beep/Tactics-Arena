import { io, type Socket } from "socket.io-client";

// FTA_NET1_RECONNECT_GRACE
// Socket.IO may briefly reconnect on mobile/Wi-Fi handoffs. Give every tab a stable
// identity so the server can attach the new socket id back to the same match slot.
const ONLINE_CLIENT_ID_KEY = "fta_online_client_id_v1";

function makeClientId(): string {
  try {
    const existing = window.sessionStorage.getItem(ONLINE_CLIENT_ID_KEY);
    if (existing) return existing;
    const created = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `fta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(ONLINE_CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `fta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io("/", {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      auth: { clientId: makeClientId() },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 3000,
      timeout: 20000,
    });
  }
  return _socket;
}

export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
