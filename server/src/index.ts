import { WebSocket, WebSocketServer } from "ws";
import type {
  ClientToServerMessage,
  LobbyState,
  ServerToClientMessage,
} from "./shared/messages";
import { randomInt, randomUUID } from "crypto";
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
  name: string;
  connectedAt: number;
  socket: WebSocket;
  trackId: string | null;
};

const sessions = new Map<WebSocket, Session>();
const trackCapacity = 2;
type TrackRoom = {
  id: string;
  players: Array<{ id: string; name: string }>;
  capacity: number;
  hostId: string;
};
const tracks = new Map<string, TrackRoom>();
const countdownTimers = new Map<string, NodeJS.Timeout>();

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

/**
 * 세션 초기 인사 메시지 여부를 확인합니다.
 * @param value 확인할 값.
 * @returns 세션 인사 메시지면 true.
 */
const isSessionHelloMessage = (
  value: unknown,
): value is ClientToServerMessage<{ browserName: string }> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown; payload?: unknown };
  if (candidate.type !== "session:hello") {
    return false;
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return false;
  }

  const payload = candidate.payload as { browserName?: unknown };
  return typeof payload.browserName === "string";
};

/**
 * 레이스 시작 메시지 여부를 확인합니다.
 * @param value 확인할 값.
 * @returns 레이스 시작 메시지면 true.
 */
const isStartRaceMessage = (value: unknown): value is ClientToServerMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown };
  return candidate.type === "race:start";
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

/**
 * 브라우저 이름과 4자리 suffix로 사용자명을 생성합니다.
 * @param browserName 클라이언트가 전달한 브라우저명.
 * @returns 생성된 사용자명.
 */
const buildPlayerName = (browserName: string): string => {
  const baseName = browserName.trim() || "Player";
  const suffix = randomInt(0, 10000).toString().padStart(4, "0");
  return `${baseName}-${suffix}`;
};

/**
 * 세션 정보를 클라이언트에 전송합니다.
 * @param session 대상 세션.
 */
const sendSessionInfo = (session: Session): void => {
  if (session.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const response: ServerToClientMessage = {
    type: "session:info",
    payload: { id: session.id },
  };
  session.socket.send(JSON.stringify(response));
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
  users: Array.from(sessions.values()).map((session) => ({
    id: session.id,
    name: session.name,
  })),
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
  track.players.forEach((player) => {
    const session = Array.from(sessions.values()).find((item) => item.id === player.id);
    if (!session || session.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    session.socket.send(JSON.stringify(response));
  });
};

/**
 * 레이스 카운트다운을 브로드캐스트합니다.
 * @param track 대상 트랙.
 * @param secondsLeft 남은 초.
 */
const sendRaceCountdown = (track: TrackRoom, secondsLeft: number): void => {
  const response: ServerToClientMessage = {
    type: "race:countdown",
    payload: { secondsLeft },
  };
  track.players.forEach((player) => {
    const session = Array.from(sessions.values()).find((item) => item.id === player.id);
    if (!session || session.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    session.socket.send(JSON.stringify(response));
  });
};

/**
 * 레이스 시작 이벤트를 브로드캐스트합니다.
 * @param track 대상 트랙.
 */
const sendRaceStarted = (track: TrackRoom): void => {
  const response: ServerToClientMessage = {
    type: "race:started",
  };
  track.players.forEach((player) => {
    const session = Array.from(sessions.values()).find((item) => item.id === player.id);
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
    track.players = track.players.filter((player) => player.id !== session.id);
    if (track.hostId === session.id) {
      track.hostId = track.players[0]?.id ?? track.hostId;
    }
    if (track.players.length === 0) {
      const timer = countdownTimers.get(track.id);
      if (timer) {
        clearInterval(timer);
        countdownTimers.delete(track.id);
      }
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
    players: [{ id: session.id, name: session.name }],
    capacity: trackCapacity,
    hostId: session.id,
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
  track.players = [...track.players, { id: session.id, name: session.name }];
  session.trackId = trackId;
  broadcastLobbyState();
  sendTrackState(trackId);
};

/**
 * 지정한 트랙에 레이스 카운트다운을 시작합니다.
 * @param track 대상 트랙.
 */
const startRaceForTrack = (track: TrackRoom): void => {
  if (countdownTimers.has(track.id)) {
    return;
  }

  let secondsLeft = 3;
  sendRaceCountdown(track, secondsLeft);
  const timer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      sendRaceCountdown(track, secondsLeft);
      return;
    }
    clearInterval(timer);
    countdownTimers.delete(track.id);
    sendRaceStarted(track);
  }, 1000);
  countdownTimers.set(track.id, timer);
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
    name: "Player",
    connectedAt: Date.now(),
    socket,
    trackId: null,
  };
  sessions.set(socket, session);
  game.addPlayer(session.id, session.name);
  log("debug", `Player connected: ${session.id}. Total: ${sessions.size}.`);
  sendSessionInfo(session);
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

    if (isSessionHelloMessage(parsed)) {
      session.name = buildPlayerName(parsed.payload.browserName);
      game.updatePlayerName(session.id, session.name);
      if (session.trackId) {
        const track = tracks.get(session.trackId);
        if (track) {
          track.players = track.players.map((player) =>
            player.id === session.id ? { ...player, name: session.name } : player,
          );
          sendTrackState(track.id);
        }
      }
      broadcastLobbyState();
      return;
    }

    if (isCreateTrackMessage(parsed)) {
      createTrackForSession(session, parsed.payload?.trackId);
      return;
    }

    if (isJoinTrackMessage(parsed)) {
      joinTrackForSession(session, parsed.payload.trackId);
      return;
    }

    if (isStartRaceMessage(parsed)) {
      if (!session.trackId) {
        return;
      }
      const track = tracks.get(session.trackId);
      if (!track || track.hostId !== session.id) {
        return;
      }
      startRaceForTrack(track);
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
