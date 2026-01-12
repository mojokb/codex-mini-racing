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
  getSessionId?: () => string | null;
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
  private isInTrack = false;

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

  /**
   * 트랙 입장 상태로 전환합니다.
   * @returns 반환값 없음.
   */
  enterTrack(): void {
    this.isInTrack = true;
  }

  /**
   * 트랙 입장 상태를 해제합니다.
   * @returns 반환값 없음.
   */
  leaveTrack(): void {
    this.isInTrack = false;
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
    if (!this.isInTrack) {
      return;
    }
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

    if (!this.isInTrack) {
      return;
    }

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
    this.syncLocalPlayerId();
    const players = this.readPlayerStates(state);
    if (players.length > 0) {
      this.syncCars(players);
    }
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

  /**
   * 서버 상태에서 플레이어 목록을 추출합니다.
   * @param state 서버 상태 데이터.
   * @returns 플레이어 상태 배열.
   */
  private readPlayerStates(state: unknown): Array<{
    id: string;
    position: { x: number; y: number };
    heading: number;
    speed: number;
  }> {
    if (!state || typeof state !== 'object') {
      return [];
    }

    const payload = state as { players?: unknown };
    if (!Array.isArray(payload.players)) {
      return [];
    }

    return payload.players.reduce<Array<{
      id: string;
      position: { x: number; y: number };
      heading: number;
      speed: number;
    }>>((list, entry) => {
      if (!entry || typeof entry !== 'object') {
        return list;
      }
      const record = entry as {
        id?: unknown;
        position?: unknown;
        heading?: unknown;
        speed?: unknown;
      };
      if (typeof record.id !== 'string') {
        return list;
      }
      if (
        !record.position ||
        typeof record.position !== 'object' ||
        typeof (record.position as { x?: unknown }).x !== 'number' ||
        typeof (record.position as { y?: unknown }).y !== 'number'
      ) {
        return list;
      }
      if (typeof record.heading !== 'number' || typeof record.speed !== 'number') {
        return list;
      }
      list.push({
        id: record.id,
        position: record.position as { x: number; y: number },
        heading: record.heading,
        speed: record.speed
      });
      return list;
    }, []);
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

  /**
   * 세션 ID 기준으로 로컬 플레이어 ID를 동기화합니다.
   */
  private syncLocalPlayerId(): void {
    const sessionId = this.networkClient?.getSessionId?.() ?? null;
    if (!sessionId || sessionId === this.localPlayerId) {
      return;
    }
    const localCar = this.cars.get(this.localPlayerId);
    if (localCar) {
      this.cars.delete(this.localPlayerId);
      this.cars.set(sessionId, localCar);
    }
    this.localPlayerId = sessionId;
  }

  /**
   * 서버 플레이어 상태에 맞춰 차량 정보를 동기화합니다.
   * @param players 서버에서 전달된 플레이어 상태 배열.
   */
  private syncCars(
    players: Array<{
      id: string;
      position: { x: number; y: number };
      heading: number;
      speed: number;
    }>
  ): void {
    const activeIds = new Set(players.map((player) => player.id));
    players.forEach((player) => {
      const car = this.cars.get(player.id);
      if (player.id === this.localPlayerId) {
        if (!car) {
          const palette = this.getPaletteForPlayer(player.id);
          const newCar = new Car(player.position, palette);
          this.applyServerState(newCar, player);
          this.cars.set(player.id, newCar);
        }
        if (car && this.shouldReconcileLocal(car.position, player.position)) {
          this.reconcileLocalCar(car, player);
        }
        return;
      }
      if (car) {
        this.applyServerState(car, player);
        return;
      }
      const palette = this.getPaletteForPlayer(player.id);
      const newCar = new Car(player.position, palette);
      this.applyServerState(newCar, player);
      this.cars.set(player.id, newCar);
    });

    this.cars.forEach((_car, id) => {
      if (id !== this.localPlayerId && !activeIds.has(id)) {
        this.cars.delete(id);
      }
    });
  }

  private shouldReconcileLocal(
    localPos: { x: number; y: number },
    serverPos: { x: number; y: number }
  ): boolean {
    const dx = localPos.x - serverPos.x;
    const dy = localPos.y - serverPos.y;
    return dx * dx + dy * dy > 144;
  }

  private reconcileLocalCar(
    car: Car,
    player: {
      position: { x: number; y: number };
      heading: number;
      speed: number;
    }
  ): void {
    const alpha = 0.2;
    car.position = {
      x: car.position.x + (player.position.x - car.position.x) * alpha,
      y: car.position.y + (player.position.y - car.position.y) * alpha
    };
    car.heading = car.heading + (player.heading - car.heading) * alpha;
    const targetVelocity = {
      x: Math.cos(player.heading) * player.speed,
      y: Math.sin(player.heading) * player.speed
    };
    car.velocity = {
      x: car.velocity.x + (targetVelocity.x - car.velocity.x) * alpha,
      y: car.velocity.y + (targetVelocity.y - car.velocity.y) * alpha
    };
  }

  /**
   * 서버 상태를 차량 인스턴스에 반영합니다.
   * @param car 대상 차량.
   * @param player 서버 플레이어 상태.
   */
  private applyServerState(
    car: Car,
    player: {
      position: { x: number; y: number };
      heading: number;
      speed: number;
    }
  ): void {
    car.position = { ...player.position };
    car.heading = player.heading;
    car.velocity = {
      x: Math.cos(player.heading) * player.speed,
      y: Math.sin(player.heading) * player.speed
    };
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
