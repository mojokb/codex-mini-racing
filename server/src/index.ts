import { WebSocketServer } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "./shared/messages";

const port = Number(process.env.PORT) || 8080;

const server = new WebSocketServer({ port });

server.on("connection", (socket) => {
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
});

console.log(`WebSocket server listening on ${port}`);
