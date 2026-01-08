import { describe, expect, it } from 'vitest';
import { clamp, length, normalize, rotate, vec } from './Math2D';
import { Track, SurfaceType } from './Track';

describe('Math2D', () => {
  it('calculates vector length', () => {
    expect(length(vec(3, 4))).toBeCloseTo(5);
  });

  it('normalizes vectors safely', () => {
    const result = normalize(vec(0, 0));
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('rotates vectors', () => {
    const result = rotate(vec(1, 0), Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(1, 5);
  });

  it('clamps values', () => {
    expect(clamp(10, 0, 5)).toBe(5);
  });
});

describe('Track surface sampling', () => {
  it('returns grass at the center of the track', () => {
    const track = new Track(200, 150, { enableRender: false });
    const surface = track.getSurfaceAt({ x: 100, y: 75 });
    expect(surface).toBe(SurfaceType.Grass);
  });

  it('detects checkpoints', () => {
    const track = new Track(200, 150, { enableRender: false });
    const checkpoint = track.checkpoints[0];
    const surface = track.getSurfaceAt({
      x: checkpoint.x + checkpoint.width / 2,
      y: checkpoint.y + checkpoint.height / 2
    });
    expect(surface).toBe(SurfaceType.Checkpoint);
  });
});
