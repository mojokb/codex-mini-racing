export type PlayerSummary = {
  name: string;
  lap: number;
  ping: number | null;
};

export type HudRenderData = {
  lapTime: number;
  bestTime: number | null;
  speed: number;
  playerSummaries: PlayerSummary[];
};

export class Hud {
  render(ctx: CanvasRenderingContext2D, data: HudRenderData): void {
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

    if (data.playerSummaries.length > 0) {
      const lineHeight = 12;
      let y = 52;
      ctx.fillText('Players:', 8, y);
      y += lineHeight;
      data.playerSummaries.forEach((summary) => {
        const pingText = summary.ping !== null ? `${summary.ping}ms` : '--';
        ctx.fillText(`${summary.name}  L${summary.lap}  ${pingText}`, 8, y);
        y += lineHeight;
      });
    }
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
