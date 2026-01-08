import { Car } from './Car';
import { Input, InputSnapshot } from './Input';
import { length } from './Math2D';
import { MultiplayerSpec } from './MultiplayerSpec';
import { Track, SurfaceType } from './Track';
import { Hud } from '../ui/Hud';

export type NetworkClient = {
  connect: (url: string) => void;
  sendInput: (payload: InputSnapshot) => boolean;
  onState: (callback: (state: unknown) => void) => void;
};

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private track: Track;
  private car: Car;
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
    this.car = new Car(this.track.spawn);
    this.hud = new Hud();
    this.resetLap(performance.now());

    if (networkClient) {
      this.networkClient = networkClient;
      this.networkClient.onState(this.handleNetworkState);
    }
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private resetLap(timestamp: number): void {
    this.lapStartTime = timestamp;
    this.lapTime = 0;
    this.nextCheckpoint = 1;
    this.onCheckpoint = false;
    this.lapActive = false;
  }

  private frame = (timestamp: number): void => {
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
    requestAnimationFrame(this.frame);
  };

  private update(dt: number, timestamp: number): void {
    const snapshot = this.input.createSnapshot();
    const input = snapshot.state;
    const sent = this.networkClient?.sendInput(snapshot) ?? false;
    if (sent) {
      this.input.advanceSequence();
    }
    if (input.reset) {
      this.car.reset(this.track.spawn);
      this.resetLap(timestamp);
      this.input.clearReset();
      return;
    }

    const prevPos = { ...this.car.position };
    const surfaceBefore = this.track.getSurfaceAt(this.car.position);
    this.car.update(dt, input, surfaceBefore);

    const surfaceAfter = this.track.getSurfaceAt(this.car.position);
    if (surfaceAfter === SurfaceType.Wall) {
      this.car.position = prevPos;
      this.car.handleWallCollision();
    }

    const checkpointIndex = this.track.getCheckpointIndex(this.car.position);
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

    const cameraX = Math.round(this.car.position.x);
    const cameraY = Math.round(this.car.position.y);

    this.ctx.save();
    this.ctx.translate(Math.floor(this.canvas.width / 2), Math.floor(this.canvas.height / 2));
    this.ctx.translate(-cameraX, -cameraY);
    this.track.render(this.ctx);
    this.car.render(this.ctx);
    this.ctx.restore();

    this.hud.render(this.ctx, {
      lapTime: this.lapTime,
      bestTime: this.bestTime,
      speed: length(this.car.velocity)
    });
  }

  private handleNetworkState = (state: unknown): void => {
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
}
