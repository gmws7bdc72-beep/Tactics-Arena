import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { setupSocketServer } from "./online/socketServer.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const SOCKET_PATH = "/api/socket.io";

const app = createApp();

// Create the HTTP server with express as the request listener.
// Engine.io (socket.io's transport layer) will intercept /api/socket.io
// requests BEFORE they ever reach express, so pino-http never touches
// socket.io long-poll responses.
const httpServer = createServer(app);

// Attach socket.io to the HTTP server. Internally, engine.io saves the
// current "request" listeners (express), removes them, and adds its own.
// Socket.io paths → handleRequest directly; everything else → express.
const io = new SocketIOServer(httpServer, {
  path: SOCKET_PATH,
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});

setupSocketServer(io);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
