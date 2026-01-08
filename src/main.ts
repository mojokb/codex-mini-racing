import { Game } from './game/Game';
import { MultiplayerClient } from './net/MultiplayerClient';

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

const multiplayerClient = new MultiplayerClient();
multiplayerClient.connect('ws://localhost:8080');

const game = new Game(canvas, multiplayerClient);
game.start();
