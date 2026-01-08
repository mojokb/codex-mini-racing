export type InputState = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  reset: boolean;
};

export type InputSnapshot = {
  sequence: number;
  state: InputState;
};

const KEY_MAP: Record<string, keyof InputState> = {
  ArrowUp: 'accelerate',
  KeyW: 'accelerate',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'handbrake',
  KeyR: 'reset'
};

export class Input {
  private state: InputState = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    reset: false
  };
  private sequence = 0;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  get snapshot(): InputState {
    return { ...this.state };
  }

  createSnapshot(): InputSnapshot {
    return {
      sequence: this.sequence,
      state: { ...this.state }
    };
  }

  advanceSequence(): void {
    this.sequence += 1;
  }

  clearReset(): void {
    this.state.reset = false;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const mapped = KEY_MAP[event.code];
    if (mapped) {
      event.preventDefault();
      this.state[mapped] = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const mapped = KEY_MAP[event.code];
    if (mapped) {
      event.preventDefault();
      this.state[mapped] = false;
    }
  };

  private onBlur = (): void => {
    this.state = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      handbrake: false,
      reset: false
    };
  };
}
