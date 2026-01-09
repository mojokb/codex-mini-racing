import { WebSocket, WebSocketServer } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "./shared/messages";
import { randomUUID } from "crypto";
import { Game, type InputState } from "./game/Game";

const port = Number(process.env.PORT) || 8080;
const maxConnections = Number(process.env.MAX_CONNECTIONS) || 0;

const server = new WebSocketServer({ port });
const game = new Game();
type Session = {
  id: string;
  connectedAt: number;
  socket: WebSocket;
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

const isInputState = (value: unknown): value is InputState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<InputState>;
  return (
    typeof candidate.accelerate === "boolean" &&
    typeof candidate.brake === "boolean" &&
    typeof candidate.left === "boolean" &&
    typeof candidate.right === "boolean" &&
    typeof candidate.handbrake === "boolean" &&
    typeof candidate.reset === "boolean"
  );
};

const broadcastState = (): void => {
  sessions.forEach((session) => {
    if (session.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const state = game.getStateForPlayer(session.id);
    const response: ServerToClientMessage<typeof state> = {
      type: "state",
      payload: state,
    };
    session.socket.send(JSON.stringify(response));
  });
};

const tickMs = 1000 / Game.TICK_RATE;
const tickInterval = setInterval(() => {
  game.step(Game.STEP);
  broadcastState();
}, tickMs);

server.on("close", () => {
  clearInterval(tickInterval);
});

server.on("connection", (socket) => {
  if (maxConnections > 0 && sessions.size >= maxConnections) {
    socket.close(1013, "Server full");
    return;
  }

  const session: Session = {
    id: randomUUID(),
    connectedAt: Date.now(),
    socket,
  };
  sessions.set(socket, session);
  game.addPlayer(session.id);

  socket.on("message", (data) => {
    let parsed: ClientToServerMessage<unknown> | null = null;
    try {
      parsed = JSON.parse(data.toString()) as ClientToServerMessage<unknown>;
    } catch {
      return;
    }

    if (isInputMessage(parsed) && isInputState(parsed.payload)) {
      game.queueInput(session.id, parsed.sequence, parsed.payload);
    }
  });

  socket.on("close", () => {
    sessions.delete(socket);
    game.removePlayer(session.id);
  });
});

console.log(`WebSocket server listening on ${port}`);
