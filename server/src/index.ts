import { WebSocketServer, type WebSocket } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "./shared/messages";
import { randomUUID } from "crypto";

const port = Number(process.env.PORT) || 8080;
const maxConnections = Number(process.env.MAX_CONNECTIONS) || 0;

const server = new WebSocketServer({ port });
const sessions = new Map<WebSocket, { id: string; connectedAt: number }>();

server.on("connection", (socket) => {
  if (maxConnections > 0 && sessions.size >= maxConnections) {
    socket.close(1013, "Server full");
    return;
  }

  const session = { id: randomUUID(), connectedAt: Date.now() };
  sessions.set(socket, session);

  socket.on("message", (data) => {
    let parsed: ClientToServerMessage<unknown> | null = null;
    try {
      parsed = JSON.parse(data.toString()) as ClientToServerMessage<unknown>;
    } catch {
      return;
    }

    if (parsed?.type === "input") {
      const response: ServerToClientMessage<unknown> = {
        type: "state",
        payload: parsed.payload,
      };
      socket.send(JSON.stringify(response));
    }
  });

  socket.on("close", () => {
    sessions.delete(socket);
  });
});

console.log(`WebSocket server listening on ${port}`);
