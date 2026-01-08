import type { InputState } from './Input';
import type { Vec2 } from './Math2D';
import { add, clamp, dot, rotate, scale } from './Math2D';
import { SurfaceType } from './Track';

const SPRITE_SIZE = 16;

export type CarPalette = {
  bodyColor: string;
  roofColor: string;
};

const DEFAULT_PALETTE: CarPalette = {
  bodyColor: '#e53935',
  roofColor: '#ffffff'
};

const createCarSprite = (palette: CarPalette): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create car sprite');
  }
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  // Body silhouette
  ctx.fillStyle = palette.bodyColor;
  ctx.fillRect(2, 2, 12, 12);
  ctx.fillRect(3, 1, 10, 14);

  // Roof
  ctx.fillStyle = palette.roofColor;
  ctx.fillRect(4, 4, 8, 6);

  // Windows
  ctx.fillStyle = '#a9c7ff';
  ctx.fillRect(5, 5, 6, 3);

  // Stripes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(7, 2, 1, 12);
  ctx.fillRect(9, 2, 1, 12);

  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(2, 3, 2, 3);
  ctx.fillRect(12, 3, 2, 3);
  ctx.fillRect(2, 10, 2, 3);
  ctx.fillRect(12, 10, 2, 3);

  return canvas;
};

export class Car {
  position: Vec2;
  velocity: Vec2;
  heading: number;
  private sprite: HTMLCanvasElement;

  maxSpeed = 180;
  acceleration = 220;
  brakeDecel = 260;
  drag = 0.985;
  lateralGrip = 0.86;
  handbrakeGrip = 0.65;
  turnRate = 2.6;

  constructor(position: Vec2, palette: CarPalette = DEFAULT_PALETTE) {
    this.position = { ...position };
    this.velocity = { x: 0, y: 0 };
    this.heading = -Math.PI / 2;
    this.sprite = createCarSprite(palette);
  }

  reset(position: Vec2): void {
    this.position = { ...position };
    this.velocity = { x: 0, y: 0 };
    this.heading = -Math.PI / 2;
  }

  update(dt: number, input: InputState, surface: SurfaceType): void {
    const forward = { x: Math.cos(this.heading), y: Math.sin(this.heading) };
    const right = rotate(forward, Math.PI / 2);

    let accel = 0;
    if (input.accelerate) accel += this.acceleration;
    if (input.brake) accel -= this.brakeDecel;

    const speed = dot(this.velocity, forward);
    const steering = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const steerStrength = clamp(Math.abs(speed) / this.maxSpeed, 0.2, 1);
    if (steering !== 0) {
      this.heading += steering * this.turnRate * steerStrength * dt;
    }

    const surfaceDrag = surface === SurfaceType.Grass ? 0.9 : 1;
    const maxSpeed = surface === SurfaceType.Grass ? this.maxSpeed * 0.6 : this.maxSpeed;
    const accelScale = surface === SurfaceType.Grass ? 0.6 : 1;

    const accelVector = scale(forward, accel * accelScale * dt);
    this.velocity = add(this.velocity, accelVector);

    const forwardSpeed = dot(this.velocity, forward);
    const lateralSpeed = dot(this.velocity, right);
    const grip = input.handbrake ? this.handbrakeGrip : this.lateralGrip;
    const newForward = forwardSpeed * this.drag * surfaceDrag;
    const newLateral = lateralSpeed * grip;
    this.velocity = add(scale(forward, newForward), scale(right, newLateral));

    const clampedSpeed = clamp(dot(this.velocity, forward), -maxSpeed * 0.5, maxSpeed);
    this.velocity = add(scale(forward, clampedSpeed), scale(right, newLateral));

    this.position = add(this.position, scale(this.velocity, dt));
  }

  handleWallCollision(): void {
    this.velocity = scale(this.velocity, -0.35);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.heading + Math.PI / 2);
    ctx.drawImage(this.sprite, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2);
    ctx.restore();
  }
}
