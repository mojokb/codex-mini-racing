import { Game } from './game/Game';
import { MultiplayerClient } from './net/MultiplayerClient';
import { ConnectionPanel } from './ui/ConnectionPanel';
import { LobbyPanel } from './ui/LobbyPanel';

const LOGICAL_WIDTH = 320;
const LOGICAL_HEIGHT = 240;
const SCALE = 3;
const DEFAULT_SERVER_URL = 'ws://localhost:8080';

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

const multiplayerClient = new MultiplayerClient();
new ConnectionPanel(multiplayerClient, DEFAULT_SERVER_URL);
new LobbyPanel(multiplayerClient);
multiplayerClient.connect(DEFAULT_SERVER_URL);

document.body.appendChild(canvas);

const game = new Game(canvas, multiplayerClient);
game.start();
