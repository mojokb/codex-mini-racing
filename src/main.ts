import { Game } from './game/Game';

const LOGICAL_WIDTH = 320;
const LOGICAL_HEIGHT = 240;
const SCALE = 3;

const canvas = document.createElement('canvas');
canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;
canvas.style.width = `${LOGICAL_WIDTH * SCALE}px`;
canvas.style.height = `${LOGICAL_HEIGHT * SCALE}px`;

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Unable to get canvas context');
}
ctx.imageSmoothingEnabled = false;

document.body.appendChild(canvas);

const game = new Game(canvas);
game.start();
