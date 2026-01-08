import { WebSocketServer, type WebSocket } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "./shared/messages";
import { randomUUID } from "crypto";

const port = Number(process.env.PORT) || 8080;
const maxConnections = Number(process.env.MAX_CONNECTIONS) || 0;

const server = new WebSocketServer({ port });
type Session = {
  id: string;
  connectedAt: number;
  inputQueue: Map<number, unknown>;
};

const sessions = new Map<WebSocket, Session>();

const isInputMessage = (value: unknown): value is ClientToServerMessage<unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown; sequence?: unknown; payload?: unknown };
  return (
    candidate.type === "input" &&
    typeof candidate.sequence === "number" &&
    Number.isFinite(candidate.sequence) &&
    "payload" in candidate
  );
};

server.on("connection", (socket) => {
  if (maxConnections > 0 && sessions.size >= maxConnections) {
    socket.close(1013, "Server full");
    return;
  }

  const session: Session = {
    id: randomUUID(),
    connectedAt: Date.now(),
    inputQueue: new Map(),
  };
  sessions.set(socket, session);

  socket.on("message", (data) => {
    let parsed: ClientToServerMessage<unknown> | null = null;
    try {
      parsed = JSON.parse(data.toString()) as ClientToServerMessage<unknown>;
    } catch {
      return;
    }

    if (isInputMessage(parsed)) {
      if (!session.inputQueue.has(parsed.sequence)) {
        session.inputQueue.set(parsed.sequence, parsed.payload);
      }

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
