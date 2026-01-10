import { WebSocket, WebSocketServer } from "ws";
import type {
  ClientToServerMessage,
  LobbyState,
  ServerToClientMessage,
} from "./shared/messages";
import { randomUUID } from "crypto";
import { Game, type InputState } from "./game/Game";
import dotenv from "dotenv";

dotenv.config();

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const logLevelInput = (process.env.LOG_LEVEL ?? "info").toLowerCase();
const logLevel: LogLevel = LOG_LEVELS.includes(logLevelInput as LogLevel)
  ? (logLevelInput as LogLevel)
  : "info";
const logRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const shouldLog = (level: LogLevel): boolean => logRank[level] >= logRank[logLevel];
const log = (level: LogLevel, message: string): void => {
  if (!shouldLog(level)) {
    return;
  }

  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.log(message);
  }
};

const port = Number(process.env.PORT) || 8080;
const maxConnections = Number(process.env.MAX_CONNECTIONS) || 0;

const server = new WebSocketServer({ port });
const game = new Game();
type Session = {
  id: string;
  connectedAt: number;
  socket: WebSocket;
  trackId: string | null;
};

const sessions = new Map<WebSocket, Session>();
const trackCapacity = 2;
type TrackRoom = {
  id: string;
  players: string[];
  capacity: number;
};
const tracks = new Map<string, TrackRoom>();

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

const isCreateTrackMessage = (
  value: unknown,
): value is ClientToServerMessage<{ trackId?: string }> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown; payload?: unknown };
  if (candidate.type !== "track:create") {
    return false;
  }

  if (candidate.payload === undefined) {
    return true;
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return false;
  }

  const payload = candidate.payload as { trackId?: unknown };
  return payload.trackId === undefined || typeof payload.trackId === "string";
};

const isJoinTrackMessage = (
  value: unknown,
): value is ClientToServerMessage<{ trackId: string }> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown; payload?: unknown };
  if (candidate.type !== "track:join") {
    return false;
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return false;
  }

  const payload = candidate.payload as { trackId?: unknown };
  return typeof payload.trackId === "string";
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

const buildLobbyState = (): LobbyState<TrackRoom> => ({
  users: Array.from(sessions.values()).map((session) => ({ id: session.id })),
  tracks: Array.from(tracks.values()),
});

const broadcastLobbyState = (): void => {
  const payload = buildLobbyState();
  const response: ServerToClientMessage<unknown, TrackRoom> = {
    type: "lobby:state",
    payload,
  };
  sessions.forEach((session) => {
    if (session.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    session.socket.send(JSON.stringify(response));
  });
};

const sendTrackState = (trackId: string): void => {
  const track = tracks.get(trackId);
  if (!track) {
    return;
  }
  const response: ServerToClientMessage<unknown, TrackRoom> = {
    type: "track:state",
    payload: track,
  };
  track.players.forEach((playerId) => {
    const session = Array.from(sessions.values()).find((item) => item.id === playerId);
    if (!session || session.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    session.socket.send(JSON.stringify(response));
  });
};

const sendError = (session: Session, message: string): void => {
  if (session.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const response: ServerToClientMessage = {
    type: "error",
    payload: { message },
  };
  session.socket.send(JSON.stringify(response));
};

const leaveTrack = (session: Session): void => {
  if (!session.trackId) {
    return;
  }
  const track = tracks.get(session.trackId);
  if (track) {
    track.players = track.players.filter((playerId) => playerId !== session.id);
    if (track.players.length === 0) {
      tracks.delete(track.id);
    }
  }
  const previousTrackId = session.trackId;
  session.trackId = null;
  if (previousTrackId) {
    sendTrackState(previousTrackId);
  }
  broadcastLobbyState();
};

const createTrackForSession = (session: Session, requestedId?: string): void => {
  const trackId = requestedId ?? randomUUID();
  if (tracks.has(trackId)) {
    sendError(session, "Track already exists.");
    return;
  }

  leaveTrack(session);
  const track: TrackRoom = {
    id: trackId,
    players: [session.id],
    capacity: trackCapacity,
  };
  tracks.set(trackId, track);
  session.trackId = trackId;
  broadcastLobbyState();
  sendTrackState(trackId);
};

const joinTrackForSession = (session: Session, trackId: string): void => {
  const track = tracks.get(trackId);
  if (!track) {
    sendError(session, "Track not found.");
    return;
  }
  if (track.players.length >= track.capacity) {
    sendError(session, "Track is full.");
    return;
  }

  leaveTrack(session);
  track.players = [...track.players, session.id];
  session.trackId = trackId;
  broadcastLobbyState();
  sendTrackState(trackId);
};

const stateSyncRateHz = Number(process.env.STATE_SYNC_RATE_HZ) || 20;
const stateSyncIntervalTicks = Math.max(1, Math.round(Game.TICK_RATE / stateSyncRateHz));
const tickMs = 1000 / Game.TICK_RATE;
let tickCount = 0;
const tickInterval = setInterval(() => {
  game.step(Game.STEP);
  tickCount += 1;
  if (tickCount % stateSyncIntervalTicks === 0) {
    broadcastState();
  }
}, tickMs);

server.on("close", () => {
  clearInterval(tickInterval);
});

server.on("connection", (socket) => {
  if (maxConnections > 0 && sessions.size >= maxConnections) {
    socket.close(1013, "Server full");
    log("warn", "Connection rejected: server full.");
    return;
  }

  const session: Session = {
    id: randomUUID(),
    connectedAt: Date.now(),
    socket,
    trackId: null,
  };
  sessions.set(socket, session);
  game.addPlayer(session.id);
  log("debug", `Player connected: ${session.id}. Total: ${sessions.size}.`);
  broadcastLobbyState();

  socket.on("message", (data) => {
    let parsed: ClientToServerMessage<unknown> | null = null;
    try {
      parsed = JSON.parse(data.toString()) as ClientToServerMessage<unknown>;
    } catch {
      return;
    }

    if (isInputMessage(parsed) && isInputState(parsed.payload)) {
      game.queueInput(session.id, parsed.sequence, parsed.payload);
      return;
    }

    if (isCreateTrackMessage(parsed)) {
      createTrackForSession(session, parsed.payload?.trackId);
      return;
    }

    if (isJoinTrackMessage(parsed)) {
      joinTrackForSession(session, parsed.payload.trackId);
    }
  });

  socket.on("close", () => {
    leaveTrack(session);
    sessions.delete(socket);
    game.removePlayer(session.id);
    log("debug", `Player disconnected: ${session.id}. Total: ${sessions.size}.`);
    broadcastLobbyState();
  });
});

log("info", `WebSocket server listening on ${port}`);
