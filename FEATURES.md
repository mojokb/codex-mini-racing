# Features

## Client Gameplay
- Canvas 2D pixel racer rendered at 320x240 and scaled with nearest-neighbor.
- Local driving model with acceleration/brake, steering, handbrake drift grip, and wall collision bounce.
- Track surface detection (road/grass/wall/checkpoint) that affects speed, grip, and collisions.
- Lap timing with checkpoints, current lap time, and best lap tracking.
- Reset to spawn on demand.

## UI / HUD
- HUD showing lap time, best time, and current speed.
- Player list with lap and ping when multiplayer state is available.
- Connection panel with WebSocket URL input and live status.
- Lobby panel with user list, available tracks, join buttons, and host-only start/restart controls.
- Race status messages for countdown, start, and winner announcement.

## Multiplayer Client
- Server-authoritative model with fixed 60Hz client tick and 20Hz state sync handling.
- Input snapshots include sequence numbers and are sent every tick.
- Local player ID syncs to server session ID for reconciliation.
- Auto reconnect with exponential backoff.
- Server events handled for lobby state, track state, race countdown/start/finish, and errors.

## Multiplayer Server
- WebSocket server with session tracking, lobby state broadcast, and per-track rooms.
- Track creation/join with capacity limits and host ownership.
- Countdown-based race start and race restart flow.
- Server-side physics simulation and checkpoint-based lap counting (5 laps to win).
- State sync at configurable rate with last processed input sequence for client ack.
- Winner detection and broadcast to players on the track.
