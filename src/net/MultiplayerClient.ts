import type { InputSnapshot } from '../game/Input';
import type { ClientToServerMessage, LobbyState, ServerToClientMessage } from '../shared/messages';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'in-game';

type StateCallback = (state: unknown) => void;

type ServerMessage = ServerToClientMessage<unknown>;

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private stateCallback: StateCallback = () => undefined;
  private statusCallback: (status: ConnectionStatus) => void = () => undefined;
  private lobbyStateCallback: (state: LobbyState<unknown>) => void = () => undefined;
  private errorCallback: (message: string) => void = () => undefined;
  private status: ConnectionStatus = 'idle';
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 8000;

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
  };

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
