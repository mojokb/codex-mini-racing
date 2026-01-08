type StateCallback = (state: unknown) => void;

type ServerMessage = {
  type?: string;
  payload?: unknown;
};

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private stateCallback: StateCallback = () => undefined;
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 8000;
  private inputSequence = 0;

  connect(url: string): void {
    this.url = url;
    this.openSocket();
  }

  sendInput(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = { type: 'input', sequence: this.inputSequence, payload };
    this.socket.send(JSON.stringify(message));
    this.inputSequence += 1;
  }

  onState(callback: StateCallback): void {
    this.stateCallback = callback;
  }

  private openSocket(): void {
    if (!this.url) {
      return;
    }

    this.clearReconnect();
    if (this.socket) {
      this.socket.close();
    }

    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', this.handleOpen);
    this.socket.addEventListener('message', this.handleMessage);
    this.socket.addEventListener('close', this.handleClose);
    this.socket.addEventListener('error', this.handleError);
  }

  private handleOpen = (): void => {
    this.reconnectDelayMs = 1000;
    this.inputSequence = 0;
  };

  private handleMessage = (event: MessageEvent<string>): void => {
    let parsed: ServerMessage | null = null;
    try {
      parsed = JSON.parse(event.data) as ServerMessage;
    } catch {
      return;
    }

    if (parsed?.type === 'state') {
      this.stateCallback(parsed.payload ?? null);
    }
  };

  private handleClose = (): void => {
    if (!this.url) {
      return;
    }

    this.scheduleReconnect();
  };

  private handleError = (): void => {
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
}
