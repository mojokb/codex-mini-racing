import type { InputSnapshot } from '../game/Input';
import type { ClientToServerMessage, LobbyState, ServerToClientMessage } from '../shared/messages';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'in-game';

type StateCallback = (state: unknown) => void;
type TrackStateCallback = (state: unknown) => void;
type SessionCallback = (id: string) => void;
type RaceCountdownCallback = (secondsLeft: number) => void;
type RaceStartedCallback = () => void;

type ServerMessage = ServerToClientMessage<unknown>;

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private stateCallback: StateCallback = () => undefined;
  private statusCallback: (status: ConnectionStatus) => void = () => undefined;
  private lobbyStateCallback: (state: LobbyState<unknown>) => void = () => undefined;
  private trackStateCallback: TrackStateCallback = () => undefined;
  private sessionCallback: SessionCallback = () => undefined;
  private raceCountdownCallback: RaceCountdownCallback = () => undefined;
  private raceStartedCallback: RaceStartedCallback = () => undefined;
  private errorCallback: (message: string) => void = () => undefined;
  private status: ConnectionStatus = 'idle';
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 8000;
  private sessionId: string | null = null;

  connect(url: string): void {
    this.url = url;
    this.openSocket();
  }

  sendInput(snapshot: InputSnapshot): boolean {
    const message: ClientToServerMessage<InputSnapshot['state']> = {
      type: 'input',
      sequence: snapshot.sequence,
      payload: snapshot.state,
    };
    return this.sendMessage(message);
  }

  /**
   * 트랙 생성을 요청합니다.
   * @param trackId 요청할 트랙 ID(선택).
   * @returns 전송 성공 여부.
   */
  sendCreateTrack(trackId?: string): boolean {
    const message: ClientToServerMessage = {
      type: 'track:create',
      payload: trackId ? { trackId } : undefined,
    };
    return this.sendMessage(message);
  }

  /**
   * 트랙 입장을 요청합니다.
   * @param trackId 입장할 트랙 ID.
   * @returns 전송 성공 여부.
   */
  sendJoinTrack(trackId: string): boolean {
    const message: ClientToServerMessage = {
      type: 'track:join',
      payload: { trackId },
    };
    return this.sendMessage(message);
  }

  /**
   * 레이스 시작을 요청합니다.
   * @returns 전송 성공 여부.
   */
  sendStartRace(): boolean {
    const message: ClientToServerMessage = {
      type: 'race:start',
    };
    return this.sendMessage(message);
  }

  onState(callback: StateCallback): void {
    this.stateCallback = callback;
  }

  /**
   * 로비 상태 수신 콜백을 등록합니다.
   * @param callback 로비 상태를 처리할 함수.
   */
  onLobbyState(callback: (state: LobbyState<unknown>) => void): void {
    this.lobbyStateCallback = callback;
  }

  /**
   * 트랙 상태 수신 콜백을 등록합니다.
   * @param callback 트랙 상태를 처리할 함수.
   */
  onTrackState(callback: TrackStateCallback): void {
    this.trackStateCallback = callback;
  }

  /**
   * 세션 정보 수신 콜백을 등록합니다.
   * @param callback 세션 ID를 처리할 함수.
   */
  onSessionInfo(callback: SessionCallback): void {
    this.sessionCallback = callback;
  }

  /**
   * 레이스 카운트다운 수신 콜백을 등록합니다.
   * @param callback 남은 초를 처리할 함수.
   */
  onRaceCountdown(callback: RaceCountdownCallback): void {
    this.raceCountdownCallback = callback;
  }

  /**
   * 레이스 시작 수신 콜백을 등록합니다.
   * @param callback 시작 이벤트를 처리할 함수.
   */
  onRaceStarted(callback: RaceStartedCallback): void {
    this.raceStartedCallback = callback;
  }

  /**
   * 에러 메시지 수신 콜백을 등록합니다.
   * @param callback 에러 문자열을 처리할 함수.
   */
  onError(callback: (message: string) => void): void {
    this.errorCallback = callback;
  }

  onStatus(callback: (status: ConnectionStatus) => void): void {
    this.statusCallback = callback;
    callback(this.status);
  }

  /**
   * 세션 ID를 반환합니다.
   * @returns 세션 ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 메시지를 서버로 전송합니다.
   * @param message 전송할 메시지.
   * @returns 전송 성공 여부.
   */
  private sendMessage(message: ClientToServerMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private openSocket(): void {
    if (!this.url) {
      return;
    }

    this.clearReconnect();
    if (this.socket) {
      this.socket.close();
    }

    this.updateStatus('connecting');
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', this.handleOpen);
    this.socket.addEventListener('message', this.handleMessage);
    this.socket.addEventListener('close', this.handleClose);
    this.socket.addEventListener('error', this.handleError);
  }

  private handleOpen = (): void => {
    console.info('[multiplayer] connected', this.url);
    this.reconnectDelayMs = 1000;
    this.updateStatus('connected');
    this.sendSessionHello();
  };

  /**
   * 브라우저명을 서버에 전달합니다.
   */
  private sendSessionHello(): void {
    const message: ClientToServerMessage = {
      type: 'session:hello',
      payload: {
        browserName: this.getBrowserName(),
      },
    };
    this.sendMessage(message);
  }

  /**
   * 현재 브라우저명을 추정합니다.
   * @returns 브라우저명 문자열.
   */
  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Edg/')) {
      return 'Edge';
    }
    if (userAgent.includes('Chrome/')) {
      return 'Chrome';
    }
    if (userAgent.includes('Firefox/')) {
      return 'Firefox';
    }
    if (userAgent.includes('Safari/')) {
      return 'Safari';
    }
    return 'Browser';
  }

  private handleMessage = (event: MessageEvent<string>): void => {
    let parsed: ServerMessage | null = null;
    try {
      parsed = JSON.parse(event.data) as ServerMessage;
    } catch {
      return;
    }

    if (parsed?.type === 'state') {
      if (this.status !== 'in-game') {
        this.updateStatus('in-game');
      }
      this.stateCallback(parsed.payload ?? null);
      return;
    }

    if (parsed?.type === 'lobby:state') {
      this.lobbyStateCallback(parsed.payload);
      return;
    }

    if (parsed?.type === 'track:state') {
      this.trackStateCallback(parsed.payload);
      return;
    }

    if (parsed?.type === 'session:info') {
      this.sessionId = parsed.payload.id;
      this.sessionCallback(parsed.payload.id);
      return;
    }

    if (parsed?.type === 'race:countdown') {
      this.raceCountdownCallback(parsed.payload.secondsLeft);
      return;
    }

    if (parsed?.type === 'race:started') {
      this.raceStartedCallback();
      return;
    }

    if (parsed?.type === 'error') {
      const message = parsed.payload?.message ?? 'Unknown error';
      this.errorCallback(message);
    }
  };

  private handleClose = (): void => {
    if (!this.url) {
      return;
    }

    console.info('[multiplayer] disconnected', this.url);
    this.updateStatus('failed');
    this.scheduleReconnect();
  };

  private handleError = (): void => {
    console.error('[multiplayer] error');
    this.updateStatus('failed');
    this.socket?.close();
  };

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
    }, this.reconnectDelayMs);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.statusCallback(status);
  }
}
