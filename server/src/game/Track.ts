type Vec2 = {
  x: number;
  y: number;
};

type Checkpoint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export class Track {
  readonly width: number;
  readonly height: number;
  readonly spawn: Vec2;
  readonly checkpoints: Checkpoint[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.spawn = { x: width * 0.5, y: height * 0.78 };
    this.checkpoints = [
      { x: width * 0.45, y: height * 0.72, width: width * 0.1, height: 8 },
      { x: width * 0.78, y: height * 0.45, width: 8, height: height * 0.12 },
      { x: width * 0.18, y: height * 0.34, width: 8, height: height * 0.12 }
    ];
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
}
