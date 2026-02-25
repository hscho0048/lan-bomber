# LAN Bomber

A minimal Bomberman-style LAN multiplayer game for up to 6 players.

- Client: TypeScript + HTML Canvas (served as static web app)
- Server: Node.js + TypeScript (Express + WebSocket)
- Optional LAN discovery: UDP broadcast

## Requirements

- Node.js 18+ (recommended 20+)
- npm 9+

## Install

From repository root:

```bash
npm install
```

## Run (Browser mode)

### 1) Start server

```bash
npm run dev:server
```

Server serves both:

- Web app: `http://<HOST_LAN_IP>:8080`
- WebSocket game server: `ws://<HOST_LAN_IP>:8080`

Default ports:

- TCP 8080 (HTTP + WS)
- UDP 41234 (discovery announce)

### 2) Friends join in browser

From another PC on same LAN:

1. Open `http://<HOST_LAN_IP>:8080`
2. Enter nickname
3. Click `Join`
4. Toggle `Ready`

Host starts the round after all players are ready.

## Dev scripts

```bash
npm run dev:server   # build shared/client then run server
npm run dev:client   # watch/rebuild client web assets only
```

## Server options

```bash
npm --prefix server run dev -- --port 8080 --room "My Room" --udpPort 41234
```

Disable UDP announce:

```bash
npm --prefix server run dev -- --no-udp
```

## Troubleshooting

- If clients cannot connect, verify firewall allows:
  - TCP 8080
  - UDP 41234 (only if using discovery)
- Ensure all devices are on same LAN and AP/client isolation is disabled.
- If UDP discovery is blocked, connect by direct host IP.

## Project structure

- `shared/`: protocol, constants, schema, maps
- `server/`: authoritative simulation server + HTTP static hosting
- `client/`: browser UI and canvas renderer

## License

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES`.
