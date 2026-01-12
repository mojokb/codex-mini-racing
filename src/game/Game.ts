import { Car, CarPalette } from './Car';
import { Input, InputSnapshot } from './Input';
import { length } from './Math2D';
import { MultiplayerSpec } from './MultiplayerSpec';
import { Track, SurfaceType } from './Track';
import { Hud, PlayerSummary } from '../ui/Hud';

export type NetworkClient = {
  connect: (url: string) => void;
  sendInput: (payload: InputSnapshot) => boolean;
  onState: (callback: (state: unknown) => void) => void;
};

export type PlayerId = string;

export class Game {
  private static readonly PLAYER_PALETTES: CarPalette[] = [
    { bodyColor: '#e53935', roofColor: '#ffffff' },
    { bodyColor: '#1e88e5', roofColor: '#ffffff' },
    { bodyColor: '#43a047', roofColor: '#ffffff' },
    { bodyColor: '#fdd835', roofColor: '#1a1a1a' }
  ];

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private track: Track;
  private cars: Map<PlayerId, Car>;
  private localPlayerId: PlayerId;
  private hud: Hud;
  private networkClient?: NetworkClient;
  private lastTime = 0;
  private accumulator = 0;
  private lapStartTime = 0;
  private lapTime = 0;
  private bestTime: number | null = null;
  private nextCheckpoint = 1;
  private onCheckpoint = false;
  private lapActive = false;
  private lastAckedInputSequence = -1;
  private latestServerState: unknown = null;
  private running = false;
  private frameId: number | null = null;

  private static readonly STEP = MultiplayerSpec.tickSeconds;

  constructor(canvas: HTMLCanvasElement, networkClient?: NetworkClient) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.input = new Input();
    this.track = new Track(1024, 768);
    this.localPlayerId = 'local';
    const localPalette = this.getPaletteForPlayer(this.localPlayerId);
    this.cars = new Map([[this.localPlayerId, new Car(this.track.spawn, localPalette)]]);
    this.hud = new Hud();
    this.resetLap(performance.now());

    if (networkClient) {
      this.networkClient = networkClient;
      this.networkClient.onState(this.handleNetworkState);
    }
  }

  /**
   * 게임 루프를 시작합니다.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTime = 0;
    this.frameId = requestAnimationFrame(this.frame);
  }

  /**
   * 게임 루프를 정지합니다.
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.lastTime = 0;
    this.accumulator = 0;
  }

  /**
   * 캔버스 표시 여부를 설정합니다.
   * @param isVisible 표시 여부.
   */
  setVisible(isVisible: boolean): void {
    this.canvas.style.display = isVisible ? 'block' : 'none';
  }

  private resetLap(timestamp: number): void {
    this.lapStartTime = timestamp;
    this.lapTime = 0;
    this.nextCheckpoint = 1;
    this.onCheckpoint = false;
    this.lapActive = false;
  }

  private frame = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const delta = this.lastTime === 0 ? 0 : Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    this.accumulator += delta;

    // Multiplayer model: server-authoritative. Clients send inputs per tick and
    // receive periodic state syncs; the fixed-step loop here defines the tick
    // (60Hz) while state snapshots arrive at 20Hz.
    while (this.accumulator >= Game.STEP) {
      this.update(Game.STEP, timestamp);
      this.accumulator -= Game.STEP;
    }

    this.render();
    this.frameId = requestAnimationFrame(this.frame);
  };

  private update(dt: number, timestamp: number): void {
    const snapshot = this.input.createSnapshot();
    const input = snapshot.state;
    const sent = this.networkClient?.sendInput(snapshot) ?? false;
    if (sent) {
      this.input.advanceSequence();
    }
    const localCar = this.getLocalCar();
    if (input.reset && localCar) {
      localCar.reset(this.track.spawn);
      this.resetLap(timestamp);
      this.input.clearReset();
      return;
    }

    if (!localCar) {
      return;
    }

    const prevPos = { ...localCar.position };
    const surfaceBefore = this.track.getSurfaceAt(localCar.position);
    localCar.update(dt, input, surfaceBefore);

    const surfaceAfter = this.track.getSurfaceAt(localCar.position);
    if (surfaceAfter === SurfaceType.Wall) {
      localCar.position = prevPos;
      localCar.handleWallCollision();
    }

    const checkpointIndex = this.track.getCheckpointIndex(localCar.position);
    if (checkpointIndex === -1) {
      this.onCheckpoint = false;
    } else if (!this.onCheckpoint) {
      this.onCheckpoint = true;
      if (checkpointIndex === this.nextCheckpoint) {
        if (checkpointIndex === 0 && this.lapActive) {
          const lap = timestamp - this.lapStartTime;
          this.bestTime = this.bestTime === null ? lap : Math.min(this.bestTime, lap);
          this.resetLap(timestamp);
        } else {
          this.nextCheckpoint = (this.nextCheckpoint + 1) % this.track.checkpoints.length;
          if (checkpointIndex === 1) {
            this.lapActive = true;
          }
        }
      }
    }

    this.lapTime = timestamp - this.lapStartTime;
  }

  private render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#0b0b0b';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const localCar = this.getLocalCar();
    const cameraX = Math.round(localCar?.position.x ?? 0);
    const cameraY = Math.round(localCar?.position.y ?? 0);

    this.ctx.save();
    this.ctx.translate(Math.floor(this.canvas.width / 2), Math.floor(this.canvas.height / 2));
    this.ctx.translate(-cameraX, -cameraY);
    this.track.render(this.ctx);
    this.cars.forEach((car) => {
      car.render(this.ctx);
    });
    this.ctx.restore();

    this.hud.render(this.ctx, {
      lapTime: this.lapTime,
      bestTime: this.bestTime,
      speed: localCar ? length(localCar.velocity) : 0,
      playerSummaries: this.readPlayerSummaries(this.latestServerState)
    });
  }

  private handleNetworkState = (state: unknown): void => {
    this.latestServerState = state;
    const lastProcessedInputSequence = this.readLastProcessedSequence(state);
    if (lastProcessedInputSequence === null) {
      return;
    }

    if (lastProcessedInputSequence <= this.lastAckedInputSequence) {
      return;
    }

    // Matching rule: server state acknowledges inputs up to the reported
    // sequence. Inputs above this sequence remain candidates for replay when
    // prediction/reconciliation is implemented.
    this.lastAckedInputSequence = lastProcessedInputSequence;
  };

  private readLastProcessedSequence(state: unknown): number | null {
    if (!state || typeof state !== 'object') {
      return null;
    }

    const candidate = (state as { lastProcessedInputSequence?: unknown }).lastProcessedInputSequence;
    return typeof candidate === 'number' ? candidate : null;
  }

  private readPlayerSummaries(state: unknown): PlayerSummary[] {
    if (!state || typeof state !== 'object') {
      return [];
    }

    const payload = state as {
      players?: unknown;
      playerSummaries?: unknown;
    };
    const rawList = payload.playerSummaries ?? payload.players;
    if (!Array.isArray(rawList)) {
      return [];
    }

    return rawList.reduce<PlayerSummary[]>((summaries, entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return summaries;
      }
      const record = entry as {
        name?: unknown;
        id?: unknown;
        lap?: unknown;
        lapCount?: unknown;
        ping?: unknown;
        pingMs?: unknown;
      };
      const nameCandidate = typeof record.name === 'string' ? record.name : record.id;
      const name = typeof nameCandidate === 'string' ? nameCandidate : `Player ${index + 1}`;
      const lapCandidate = typeof record.lap === 'number' ? record.lap : record.lapCount;
      const lap = typeof lapCandidate === 'number' ? lapCandidate : 0;
      const pingCandidate = typeof record.ping === 'number' ? record.ping : record.pingMs;
      const ping = typeof pingCandidate === 'number' ? Math.round(pingCandidate) : null;
      summaries.push({ name, lap, ping });
      return summaries;
    }, []);
  }

  private getLocalCar(): Car | undefined {
    return this.cars.get(this.localPlayerId);
  }

  private getPaletteForPlayer(playerId: PlayerId): CarPalette {
    const palettes = Game.PLAYER_PALETTES;
    if (playerId === this.localPlayerId) {
      return palettes[0];
    }
    const index = Math.abs(this.hashPlayerId(playerId)) % palettes.length;
    return palettes[index];
  }

  private hashPlayerId(playerId: PlayerId): number {
    let hash = 0;
    for (let i = 0; i < playerId.length; i += 1) {
      hash = (hash << 5) - hash + playerId.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}
