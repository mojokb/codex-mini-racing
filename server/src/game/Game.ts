import { Track } from './Track';

export type InputState = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  reset: boolean;
};

export type PlayerState = {
  id: string;
  name: string;
  position: { x: number; y: number };
  heading: number;
  speed: number;
  lap: number;
  lastProcessedInputSequence: number;
};

export type GameState = {
  tick: number;
  players: PlayerState[];
  lastProcessedInputSequence: number;
  raceFinished: boolean;
  winner: { id: string; name: string } | null;
};

type PlayerInternal = PlayerState & {
  inputQueue: Map<number, InputState>;
  lastInput: InputState;
  spawn: { x: number; y: number };
  nextCheckpoint: number;
  onCheckpoint: boolean;
  lapActive: boolean;
};

const DEFAULT_INPUT: InputState = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
  reset: false
};

const ACCELERATION = 28;
const BRAKE = 36;
const TURN_RATE = 3.6;
const DRAG = 2.2;
const MAX_SPEED = 55;
const MAX_REVERSE = -20;
const LAPS_TO_WIN = 5;

export class Game {
  static readonly TICK_RATE = 60;
  static readonly STEP = 1 / Game.TICK_RATE;

  private players = new Map<string, PlayerInternal>();
  private tick = 0;
  private track = new Track(1024, 768);
  private raceFinished = false;
  private winner: { id: string; name: string } | null = null;

  addPlayer(id: string, name = `Player ${this.players.size + 1}`): void {
    if (this.players.has(id)) {
      return;
    }

    const offset = this.players.size * 90;
    const spawn = { x: this.track.spawn.x + offset, y: this.track.spawn.y };
    this.players.set(id, {
      id,
      name,
      position: { ...spawn },
      heading: 0,
      speed: 0,
      lap: 0,
      lastProcessedInputSequence: -1,
      inputQueue: new Map(),
      lastInput: { ...DEFAULT_INPUT },
      spawn,
      nextCheckpoint: 1,
      onCheckpoint: false,
      lapActive: false
    });
  }

  /**
   * 플레이어 이름을 갱신합니다.
   * @param id 플레이어 ID.
   * @param name 갱신할 이름.
   */
  updatePlayerName(id: string, name: string): void {
    const player = this.players.get(id);
    if (!player) {
      return;
    }
    player.name = name;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  queueInput(id: string, sequence: number, input: InputState): void {
    const player = this.players.get(id);
    if (!player) {
      return;
    }

    if (!player.inputQueue.has(sequence)) {
      player.inputQueue.set(sequence, input);
    }
  }

  step(dt: number): void {
    this.tick += 1;
    if (this.raceFinished) {
      return;
    }
    this.players.forEach((player) => {
      this.consumeNextInput(player);
      this.updatePlayer(player, dt);
      this.updateCheckpointProgress(player);
    });
  }

  getStateForPlayer(id: string): GameState {
    const player = this.players.get(id);
    return {
      tick: this.tick,
      players: Array.from(this.players.values()).map((entry) => ({
        id: entry.id,
        name: entry.name,
        position: { ...entry.position },
        heading: entry.heading,
        speed: entry.speed,
        lap: entry.lap,
        lastProcessedInputSequence: entry.lastProcessedInputSequence
      })),
      lastProcessedInputSequence: player?.lastProcessedInputSequence ?? -1,
      raceFinished: this.raceFinished,
      winner: this.winner
    };
  }

  private consumeNextInput(player: PlayerInternal): void {
    const candidateSequences = Array.from(player.inputQueue.keys())
      .filter((sequence) => sequence > player.lastProcessedInputSequence)
      .sort((a, b) => a - b);

    if (candidateSequences.length === 0) {
      return;
    }

    const nextSequence = candidateSequences[0];
    const input = player.inputQueue.get(nextSequence);
    if (!input) {
      return;
    }

    player.inputQueue.delete(nextSequence);
    player.lastProcessedInputSequence = nextSequence;
    player.lastInput = input;
  }

  private updatePlayer(player: PlayerInternal, dt: number): void {
    if (player.lastInput.reset) {
      player.position = { ...player.spawn };
      player.speed = 0;
      player.heading = 0;
      player.nextCheckpoint = 1;
      player.onCheckpoint = false;
      player.lapActive = false;
      player.lastInput = { ...player.lastInput, reset: false };
      return;
    }

    if (player.lastInput.left) {
      player.heading -= TURN_RATE * dt;
    }
    if (player.lastInput.right) {
      player.heading += TURN_RATE * dt;
    }

    if (player.lastInput.accelerate) {
      player.speed += ACCELERATION * dt;
    }
    if (player.lastInput.brake) {
      player.speed -= BRAKE * dt;
    }
    if (player.lastInput.handbrake) {
      player.speed *= 0.86;
    }

    const drag = Math.max(0, 1 - DRAG * dt);
    player.speed *= drag;
    player.speed = Math.min(MAX_SPEED, Math.max(MAX_REVERSE, player.speed));

    player.position.x += Math.cos(player.heading) * player.speed * dt;
    player.position.y += Math.sin(player.heading) * player.speed * dt;
  }

  private updateCheckpointProgress(player: PlayerInternal): void {
    const checkpointIndex = this.track.getCheckpointIndex(player.position);
    if (checkpointIndex === -1) {
      player.onCheckpoint = false;
      return;
    }

    if (player.onCheckpoint) {
      return;
    }

    player.onCheckpoint = true;
    if (checkpointIndex !== player.nextCheckpoint) {
      return;
    }

    if (checkpointIndex === 0 && player.lapActive) {
      player.lap += 1;
      player.lapActive = false;
      player.nextCheckpoint = 1;
      if (!this.raceFinished && player.lap >= LAPS_TO_WIN) {
        this.raceFinished = true;
        this.winner = { id: player.id, name: player.name };
      }
      return;
    }

    player.nextCheckpoint = (player.nextCheckpoint + 1) % this.track.checkpoints.length;
    if (checkpointIndex === 1) {
      player.lapActive = true;
    }
  }
}
