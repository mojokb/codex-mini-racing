import type { InputSnapshot } from '../game/Input';
import type { ClientToServerMessage, ServerToClientMessage } from '../shared/messages';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'in-game';

type StateCallback = (state: unknown) => void;

type ServerMessage = ServerToClientMessage<unknown>;

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private stateCallback: StateCallback = () => undefined;
  private statusCallback: (status: ConnectionStatus) => void = () => undefined;
  private status: ConnectionStatus = 'idle';
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 8000;

  connect(url: string): void {
    this.url = url;
    this.openSocket();
  }

  sendInput(snapshot: InputSnapshot): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message: ClientToServerMessage<InputSnapshot['state']> = {
      type: 'input',
      sequence: snapshot.sequence,
      payload: snapshot.state,
    };
    this.socket.send(JSON.stringify(message));
    return true;
  }

  onState(callback: StateCallback): void {
    this.stateCallback = callback;
  }

  onStatus(callback: (status: ConnectionStatus) => void): void {
    this.statusCallback = callback;
    callback(this.status);
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
    }
  };

  private handleClose = (): void => {
    if (!this.url) {
      return;
    }

    this.updateStatus('failed');
    this.scheduleReconnect();
  };

  private handleError = (): void => {
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
