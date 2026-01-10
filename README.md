# Pixel Racer (Mini)

Vite + TypeScript + Canvas 2D 기반의 픽셀 레이싱 미니 게임입니다. 화면은 nearest-neighbor로 확대되어 도트 느낌을 유지합니다.

## 설치/실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 바로 플레이할 수 있습니다.

## 멀티플레이어 서버 실행

기본 WebSocket 서버는 `ws://localhost:8080`으로 동작합니다. 게임 화면 상단의 입력창에 해당 주소를 넣고 연결하세요.

```bash
npm run server
```

`.env` 파일로 포트와 로그 레벨을 지정할 수 있습니다.

```bash
# .env
PORT=8080
LOG_LEVEL=info
```

### 서버 디렉터리 안내

멀티플레이어 서버 코드는 `server/` 하위에 있으며 진입점은 `server/src/index.ts`입니다. 루트에서 `npm install`을 실행하면 `postinstall` 스크립트가 서버 의존성을 함께 설치하며, 실행은 루트의 `npm run server` 스크립트를 사용합니다.

`npm run server` 실행 시 `ERR_MODULE_NOT_FOUND: Cannot find package 'ts-node'` 오류가 나오면 루트에서 `npm install`을 실행해 devDependencies까지 설치했는지 확인하세요.

## 조작

- 가속: ↑ / W
- 브레이크/후진: ↓ / S
- 좌회전: ← / A
- 우회전: → / D
- 핸드브레이크(드리프트): Space
- 리셋: R

## 트랙 마스크 색 규칙

트랙 판정은 오프스크린 마스크 픽셀 색을 읽어 결정합니다.

- ROAD: `#ffffff`
- GRASS: `#00ff00`
- WALL: `#ff0000`
- CHECKPOINT: `#0000ff`

## 튜닝 파라미터

`src/game/Car.ts`에서 조정할 수 있습니다.

- `maxSpeed`: 최고 속도
- `acceleration`: 가속도
- `brakeDecel`: 감속/후진 힘
- `drag`: 전진 감속 비율
- `lateralGrip`: 기본 횡방향 그립
- `handbrakeGrip`: 핸드브레이크 시 횡방향 그립
- `turnRate`: 회전 민감도

## 테스트

```bash
npm run test
```

## Docker

```bash
docker build -t pixel-racer .
docker run --rm -p 8080:80 pixel-racer
```

브라우저에서 `http://localhost:8080` 로 접속하세요.
