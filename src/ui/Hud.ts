export class Hud {
  render(ctx: CanvasRenderingContext2D, data: { lapTime: number; bestTime: number | null; speed: number }): void {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText(`Lap: ${this.formatTime(data.lapTime)}`, 8, 12);
    ctx.fillText(
      `Best: ${data.bestTime !== null ? this.formatTime(data.bestTime) : '--:--.--'}`,
      8,
      24
    );
    ctx.fillText(`Speed: ${Math.round(data.speed)}`, 8, 36);
    ctx.restore();
  }

  private formatTime(timeMs: number): string {
    const totalSeconds = timeMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const secondsText = seconds.toFixed(2).padStart(5, '0');
    return `${minutes}:${secondsText}`;
  }
}
