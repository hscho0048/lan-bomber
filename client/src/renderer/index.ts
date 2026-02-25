import {
  DEFAULT_UDP_ANNOUNCE_PORT,
  DEFAULT_WS_PORT,
  INPUT_SEND_RATE,
  SNAPSHOT_RATE,
  TICK_RATE,
  parseServerMessage,
  stringifyMessage,
  type ClientToServerMessage,
  type EventMessagePayload,
  type GameMode,
  type RoomStatePayload,
  type SnapshotPayload,
  type StartGamePayload
} from '@lan-bomber/shared';
import { getRendererElements, setScreen } from './dom';
import { drawGameFrame } from './gameView';
import { createInputController } from './input';
import { renderRoomState, renderRooms } from './lobbyView';
import { createLogger } from './logger';

const el = getRendererElements();
const ctx = el.canvas.getContext('2d')!;

const logLine = createLogger(el.log, 'info');
const input = createInputController();

let ws: WebSocket | null = null;
let myId: string | null = null;
let isHostingLocalServer = false;

let roomState: RoomStatePayload | null = null;
let startGame: StartGamePayload | null = null;

let snapshotPrev: SnapshotPayload | null = null;
let snapshotCurr: SnapshotPayload | null = null;
let snapshotInterpStart = 0;
let snapshotInterpDuration = 1000 / SNAPSHOT_RATE;

let serverTickEstimate = 0;
let pingMs = 0;
let inputSeq = 0;

let discoveryUnsub: (() => void) | null = null;
const lanApi = window.lanApi;
const isElectronClient = !!lanApi;

function refreshRoomStateUI() {
  renderRoomState(el, roomState, myId, send);
}

function send(msg: ClientToServerMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(stringifyMessage(msg));
}

function onSnapshot(snap: SnapshotPayload) {
  serverTickEstimate = snap.tick;

  if (!snapshotCurr) {
    snapshotCurr = snap;
    snapshotPrev = null;
    snapshotInterpStart = performance.now();
    snapshotInterpDuration = 1000 / SNAPSHOT_RATE;
    return;
  }

  snapshotPrev = snapshotCurr;
  snapshotCurr = snap;
  snapshotInterpStart = performance.now();

  const dtTicks = Math.max(1, snapshotCurr.tick - snapshotPrev.tick);
  snapshotInterpDuration = (dtTicks * 1000) / TICK_RATE;
}

function onEvent(ev: EventMessagePayload) {
  if (ev.type !== 'RoundEnded') return;

  if (ev.payload.mode === 'FFA') {
    logLine('info', `RoundEnded (FFA). winnerId=${ev.payload.winnerId ?? '(none)'}`);
    return;
  }

  logLine('info', `RoundEnded (TEAM). winnerTeam=${ev.payload.winnerTeam}`);
}

function connect(ip: string, port: number) {
  if (ws) {
    ws.close();
    ws = null;
  }

  const url = `ws://${ip}:${port}`;
  logLine('info', `Connecting to ${url}...`);

  ws = new WebSocket(url);

  ws.onopen = () => {
    logLine('info', 'Connected.');
    el.btnDisconnect.disabled = false;
    send({ type: 'JoinRoom', payload: { name: el.nickname.value.trim() || 'Player' } });
  };

  ws.onmessage = (ev) => {
    const msg = parseServerMessage(String(ev.data));
    if (!msg) return;

    switch (msg.type) {
      case 'Welcome': {
        myId = msg.payload.playerId;
        logLine('info', `Welcome. id=${myId}`);
        break;
      }
      case 'RoomState': {
        roomState = msg.payload;
        refreshRoomStateUI();

        if (startGame && roomState) {
          setScreen(el, 'lobby');
          startGame = null;
          snapshotPrev = null;
          snapshotCurr = null;
          el.countdown.textContent = '';
        }
        break;
      }
      case 'StartGame': {
        startGame = msg.payload;
        snapshotPrev = null;
        snapshotCurr = null;
        snapshotInterpStart = performance.now();
        snapshotInterpDuration = 1000 / SNAPSHOT_RATE;
        serverTickEstimate = startGame.startTick;
        logLine('info', `StartGame: map=${startGame.mapId} mode=${startGame.mode} startTick=${startGame.startTick}`);
        setScreen(el, 'game');
        break;
      }
      case 'Snapshot': {
        onSnapshot(msg.payload);
        break;
      }
      case 'Event': {
        onEvent(msg.payload);
        break;
      }
      case 'Pong': {
        pingMs = Math.max(0, performance.now() - msg.payload.clientTime);
        serverTickEstimate = msg.payload.tick;
        break;
      }
      case 'ServerError': {
        logLine('info', `ServerError: ${msg.payload.message}`);
        break;
      }
    }
  };

  ws.onclose = () => {
    logLine('info', 'Disconnected.');
    ws = null;
    myId = null;
    roomState = null;
    startGame = null;
    snapshotPrev = null;
    snapshotCurr = null;
    el.btnDisconnect.disabled = true;
    refreshRoomStateUI();
    setScreen(el, 'lobby');
  };

  ws.onerror = () => {
    logLine('info', 'WebSocket error.');
  };
}

function disconnect() {
  if (!ws) return;
  ws.close();
  ws = null;
}

function startInputLoop() {
  const intervalMs = 1000 / INPUT_SEND_RATE;
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !startGame) return;

    send({
      type: 'Input',
      payload: {
        seq: inputSeq++,
        tick: serverTickEstimate,
        moveDir: input.computeMoveDir(),
        placeBalloon: input.consumePlaceQueued(),
        useNeedleSlot: input.consumeNeedleSlotQueued()
      }
    });
  }, intervalMs);
}

function startPingLoop() {
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    send({ type: 'Ping', payload: { clientTime: performance.now() } });
  }, 1000);
}

function draw() {
  requestAnimationFrame(draw);

  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

  if (!startGame) {
    el.hudTop.textContent = '';
    el.debug.textContent = '';
    return;
  }

  drawGameFrame({
    ctx,
    el,
    startGame,
    snapshotCurr,
    snapshotPrev,
    snapshotInterpStart,
    snapshotInterpDuration,
    serverTickEstimate,
    pingMs,
    myId
  });
}

function bindUI() {
  el.btnJoin.onclick = () => {
    const ip = el.serverIp.value.trim() || window.location.hostname || 'localhost';
    const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
    connect(ip, port);
  };

  el.btnDisconnect.onclick = () => {
    disconnect();
  };

  el.btnHost.onclick = async () => {
    if (!lanApi) {
      logLine('info', 'Host mode is available only in Electron desktop client.');
      return;
    }

    if (!isHostingLocalServer) {
      const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
      const roomName = el.roomName.value.trim() || 'LAN Bomber Room';
      const res = await lanApi.startServer({ port, roomName, udpPort: DEFAULT_UDP_ANNOUNCE_PORT, logLevel: 'info' });
      if (!res.ok) {
        logLine('info', `Host failed: ${res.error}`);
        return;
      }

      isHostingLocalServer = true;
      el.btnHost.textContent = 'Stop Local Server';
      logLine('info', 'Local server started.');
      el.serverIp.value = 'localhost';
      connect('localhost', port);
      return;
    }

    await lanApi.stopServer();
    isHostingLocalServer = false;
    el.btnHost.textContent = 'Host (Start Server)';
    logLine('info', 'Local server stopped.');
  };

  el.readyToggle.onchange = () => {
    send({ type: 'Ready', payload: { isReady: el.readyToggle.checked } });
  };

  el.modeSelect.onchange = () => {
    const mode = el.modeSelect.value as GameMode;
    send({ type: 'SetMode', payload: { mode } });
  };

  el.mapSelect.onchange = () => {
    send({ type: 'SetMap', payload: { mapId: el.mapSelect.value } });
  };

  el.btnStart.onclick = () => {
    send({ type: 'StartRequest', payload: {} });
  };

  el.btnLeave.onclick = () => {
    disconnect();
    setScreen(el, 'lobby');
    startGame = null;
    snapshotPrev = null;
    snapshotCurr = null;
  };

  el.btnDiscovery.onclick = async () => {
    if (!lanApi) {
      logLine('info', 'LAN discovery is available only in Electron desktop client.');
      return;
    }

    const res = await lanApi.startDiscovery(DEFAULT_UDP_ANNOUNCE_PORT);
    if (!res.ok) return;

    el.btnDiscovery.disabled = true;
    el.btnStopDiscovery.disabled = false;
    logLine('info', 'LAN discovery started.');
  };

  el.btnStopDiscovery.onclick = async () => {
    if (!lanApi) return;
    await lanApi.stopDiscovery();
    el.btnDiscovery.disabled = false;
    el.btnStopDiscovery.disabled = true;
    logLine('info', 'LAN discovery stopped.');
  };
}

async function init() {
  setScreen(el, 'lobby');
  bindUI();
  input.bind();

  if (isElectronClient && lanApi) {
    try {
      const ips = await lanApi.getLocalIps();
      el.hostIpHint.textContent = ips.length ? `Your LAN IP(s): ${ips.join(', ')}` : 'LAN IP not found.';
    } catch {
      el.hostIpHint.textContent = 'LAN IP not found.';
    }

    discoveryUnsub = lanApi.onDiscoveryUpdate((rooms) => {
      renderRooms(el, rooms, (ip, port) => {
        el.serverIp.value = ip;
        el.serverPort.value = String(port);
        connect(ip, port);
      });
    });
  } else {
    const host = window.location.hostname || 'localhost';
    el.serverIp.value = host;
    el.hostIpHint.textContent = `Web mode: server should run on ${host}:${DEFAULT_WS_PORT}.`;
    el.btnHost.disabled = true;
    el.btnDiscovery.disabled = true;
    el.btnStopDiscovery.disabled = true;
  }

  el.serverPort.value = String(window.location.port || DEFAULT_WS_PORT);

  startPingLoop();
  startInputLoop();
  draw();
}

window.addEventListener('beforeunload', () => {
  discoveryUnsub?.();
  input.unbind();
});

init();
