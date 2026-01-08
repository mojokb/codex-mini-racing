import type { Vec2 } from './Math2D';

export enum SurfaceType {
  Road = 'road',
  Grass = 'grass',
  Wall = 'wall',
  Checkpoint = 'checkpoint'
}

type Checkpoint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const COLOR = {
  road: { r: 255, g: 255, b: 255 },
  grass: { r: 0, g: 255, b: 0 },
  wall: { r: 255, g: 0, b: 0 },
  checkpoint: { r: 0, g: 0, b: 255 }
};

const VISUAL = {
  road: { r: 120, g: 120, b: 120 },
  grass: { r: 25, g: 120, b: 25 },
  wall: { r: 140, g: 30, b: 30 },
  checkpoint: { r: 50, g: 90, b: 255 }
};

export class Track {
  readonly width: number;
  readonly height: number;
  readonly spawn: Vec2;
  readonly checkpoints: Checkpoint[];

  private maskData: Uint8ClampedArray;
  private renderCanvas: HTMLCanvasElement | null;

  constructor(width: number, height: number, options: { enableRender?: boolean } = {}) {
    this.width = width;
    this.height = height;
    this.spawn = { x: width * 0.5, y: height * 0.78 };
    this.checkpoints = [
      { x: width * 0.45, y: height * 0.72, width: width * 0.1, height: 8 },
      { x: width * 0.78, y: height * 0.45, width: 8, height: height * 0.12 },
      { x: width * 0.18, y: height * 0.34, width: 8, height: height * 0.12 }
    ];

    this.maskData = this.buildMask();
    this.renderCanvas = options.enableRender === false ? null : this.buildRenderCanvas();
  }

  getSurfaceAt(position: Vec2): SurfaceType {
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return SurfaceType.Wall;
    }
    const index = (y * this.width + x) * 4;
    const r = this.maskData[index];
    const g = this.maskData[index + 1];
    const b = this.maskData[index + 2];
    if (r === COLOR.wall.r && g === COLOR.wall.g && b === COLOR.wall.b) {
      return SurfaceType.Wall;
    }
    if (r === COLOR.checkpoint.r && g === COLOR.checkpoint.g && b === COLOR.checkpoint.b) {
      return SurfaceType.Checkpoint;
    }
    if (r === COLOR.road.r && g === COLOR.road.g && b === COLOR.road.b) {
      return SurfaceType.Road;
    }
    return SurfaceType.Grass;
  }

  getCheckpointIndex(position: Vec2): number {
    const { x, y } = position;
    return this.checkpoints.findIndex(
      (checkpoint) =>
        x >= checkpoint.x &&
        x <= checkpoint.x + checkpoint.width &&
        y >= checkpoint.y &&
        y <= checkpoint.y + checkpoint.height
    );
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.renderCanvas) return;
    ctx.drawImage(this.renderCanvas, 0, 0);
  }

  private buildMask(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(this.width * this.height * 4);
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const outerX = this.width * 0.38;
    const outerY = this.height * 0.32;
    const innerX = this.width * 0.23;
    const innerY = this.height * 0.18;
    const wallThreshold = 0.03;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const dx = x - centerX;
        const dy = y - centerY;
        const outerDist = (dx * dx) / (outerX * outerX) + (dy * dy) / (outerY * outerY);
        const innerDist = (dx * dx) / (innerX * innerX) + (dy * dy) / (innerY * innerY);

        let color = COLOR.grass;
        if (outerDist <= 1 && innerDist >= 1) {
          color = COLOR.road;
          if (Math.abs(outerDist - 1) <= wallThreshold || Math.abs(innerDist - 1) <= wallThreshold) {
            color = COLOR.wall;
          }
        }

        const index = (y * this.width + x) * 4;
        data[index] = color.r;
        data[index + 1] = color.g;
        data[index + 2] = color.b;
        data[index + 3] = 255;
      }
    }

    this.paintCheckpoints(data);
    return data;
  }

  private paintCheckpoints(data: Uint8ClampedArray): void {
    for (const checkpoint of this.checkpoints) {
      for (let y = Math.floor(checkpoint.y); y < checkpoint.y + checkpoint.height; y += 1) {
        for (let x = Math.floor(checkpoint.x); x < checkpoint.x + checkpoint.width; x += 1) {
          const index = (y * this.width + x) * 4;
          data[index] = COLOR.checkpoint.r;
          data[index + 1] = COLOR.checkpoint.g;
          data[index + 2] = COLOR.checkpoint.b;
          data[index + 3] = 255;
        }
      }
    }
  }

  private buildRenderCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create track canvas');
    }
    const imageData = ctx.createImageData(this.width, this.height);
    for (let i = 0; i < this.maskData.length; i += 4) {
      const r = this.maskData[i];
      const g = this.maskData[i + 1];
      const b = this.maskData[i + 2];
      let color = VISUAL.grass;
      if (r === COLOR.wall.r && g === COLOR.wall.g && b === COLOR.wall.b) {
        color = VISUAL.wall;
      } else if (r === COLOR.checkpoint.r && g === COLOR.checkpoint.g && b === COLOR.checkpoint.b) {
        color = VISUAL.checkpoint;
      } else if (r === COLOR.road.r && g === COLOR.road.g && b === COLOR.road.b) {
        color = VISUAL.road;
      }
      imageData.data[i] = color.r;
      imageData.data[i + 1] = color.g;
      imageData.data[i + 2] = color.b;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}
