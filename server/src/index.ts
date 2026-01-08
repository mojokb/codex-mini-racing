import { WebSocketServer } from "ws";

const port = Number(process.env.PORT) || 8080;

const server = new WebSocketServer({ port });

server.on("connection", (socket) => {
  socket.on("message", (data) => {
    socket.send(data);
  });
});

console.log(`WebSocket server listening on ${port}`);
