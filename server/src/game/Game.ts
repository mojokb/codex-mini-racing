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
};

type PlayerInternal = PlayerState & {
  inputQueue: Map<number, InputState>;
  lastInput: InputState;
  spawn: { x: number; y: number };
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

export class Game {
  static readonly TICK_RATE = 60;
  static readonly STEP = 1 / Game.TICK_RATE;

  private players = new Map<string, PlayerInternal>();
  private tick = 0;

  addPlayer(id: string, name = `Player ${this.players.size + 1}`): void {
    if (this.players.has(id)) {
      return;
    }

    const offset = this.players.size * 90;
    const spawn = { x: 300 + offset, y: 260 };
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
      spawn
    });
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
    this.players.forEach((player) => {
      this.consumeNextInput(player);
      this.updatePlayer(player, dt);
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
      lastProcessedInputSequence: player?.lastProcessedInputSequence ?? -1
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
}
