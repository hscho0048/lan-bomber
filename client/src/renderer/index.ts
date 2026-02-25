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
import { drawGameFrame, preloadAssets } from './gameView';
import { createInputController } from './input';
import {
  renderRoomState,
  renderRooms,
  addChatMessage,
  addSystemMessage,
  renderResultScreen
} from './lobbyView';
import { createLogger } from './logger';

const el = getRendererElements();
const ctx = el.canvas.getContext('2d')!;

const logLine = createLogger(el.log, 'info');
const input = createInputController();

let ws: WebSocket | null = null;
let myId: string | null = null;
const hostedPorts = new Map<number, string>(); // port → roomName

let roomState: RoomStatePayload | null = null;
let startGame: StartGamePayload | null = null;
let currentRoomName = 'LAN Bomber 방';
let pendingHostRoomName: string | null = null; // set when hosting, sent in JoinRoom

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

// ========================
// Helpers
// ========================

function refreshRoomStateUI() {
  renderRoomState(el, roomState, myId, send, currentRoomName);
}

function renderHostedRooms() {
  const container = document.getElementById('hostedRoomList');
  if (!container) return;
  container.innerHTML = '';
  for (const [port, roomName] of hostedPorts.entries()) {
    const item = document.createElement('div');
    item.className = 'hosted-room-item';
    const info = document.createElement('span');
    info.className = 'hosted-room-info';
    info.textContent = `${roomName}  :${port}`;
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-secondary btn-sm';
    joinBtn.textContent = '접속';
    joinBtn.onclick = () => {
      el.serverIp.value = 'localhost';
      connect('localhost', port);
    };
    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn btn-danger btn-sm';
    stopBtn.textContent = '중지';
    stopBtn.onclick = async () => {
      await lanApi!.stopServer(port);
      hostedPorts.delete(port);
      renderHostedRooms();
      logLine('info', `포트 ${port} 서버 중지됨.`);
      if (ws && ws.url.includes(`:${port}`)) disconnect();
    };
    item.appendChild(info);
    item.appendChild(joinBtn);
    item.appendChild(stopBtn);
    container.appendChild(item);
  }
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
  if (ev.type === 'RoundEnded') {
    const ranking: Array<{ id: string; name: string; colorIndex: number }> = ev.payload.ranking ?? [];
    renderResultScreen(el, ranking, myId);
    setScreen(el, 'result');
    return;
  }
  if (ev.type === 'ServerNotice') {
    addSystemMessage(el, ev.payload.text ?? '');
  }
  if (ev.type === 'PlayerDied') {
    const playerId: string = ev.payload.playerId ?? '';
    const player = roomState?.players.find(p => p.id === playerId);
    if (player) addSystemMessage(el, `${player.name} 탈락!`);
  }
}

// ========================
// Connection
// ========================

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
    const payload: { name: string; roomName?: string } = { name: el.nickname.value.trim() || 'Player' };
    if (pendingHostRoomName) {
      payload.roomName = pendingHostRoomName;
      pendingHostRoomName = null;
    }
    send({ type: 'JoinRoom', payload });
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

        // If we were in game and got room state, game ended → show result screen handled by RoundEnded event
        // If already on result screen, don't go back to room automatically
        // But if we're on game screen, return to room screen
        break;
      }
      case 'StartGame': {
        startGame = msg.payload;
        snapshotPrev = null;
        snapshotCurr = null;
        snapshotInterpStart = performance.now();
        snapshotInterpDuration = 1000 / SNAPSHOT_RATE;
        serverTickEstimate = startGame.startTick;
        logLine('info', `StartGame: map=${startGame.mapId} mode=${startGame.mode} duration=${startGame.gameDurationSeconds}s`);
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
      case 'Chat': {
        const chat = msg.payload;
        addChatMessage(el, chat.playerName, chat.colorIndex, chat.text);
        break;
      }
      case 'Pong': {
        pingMs = Math.max(0, performance.now() - msg.payload.clientTime);
        serverTickEstimate = msg.payload.tick;
        break;
      }
      case 'ServerError': {
        logLine('info', `ServerError: ${msg.payload.message}`);
        addSystemMessage(el, `오류: ${msg.payload.message}`);
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
    setScreen(el, 'main');
  };

  ws.onerror = () => {
    logLine('info', 'WebSocket error.');
  };

  // Transition to room screen when connected
  setScreen(el, 'room');
  // Clear chat
  el.chatMessages.innerHTML = '';
  addSystemMessage(el, `${ip}:${port} 에 연결 중...`);
}

function disconnect() {
  if (!ws) return;
  ws.close();
  ws = null;
}

// ========================
// Input / Ping loops
// ========================

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

function startWebRoomPolling(host: string, port: number) {
  const url = `http://${host}:${port}/api/room`;

  async function poll() {
    // Only show room list on main screen and when not connected
    if (ws && ws.readyState === WebSocket.OPEN) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const room = {
        roomName: data.roomName ?? 'LAN Bomber 방',
        playerCount: data.playerCount ?? 0,
        wsPort: data.wsPort ?? port,
        hostIpHint: data.hostIpHint ?? '',
        mode: data.mode ?? 'FFA',
        mapId: data.mapId ?? 'map1',
        remoteAddress: host,
        lastSeen: Date.now()
      };
      renderRooms(el, [room], (ip, p) => {
        el.serverIp.value = ip;
        el.serverPort.value = String(p);
        connect(ip, p);
      });
    } catch {
      // server not reachable yet; keep trying
    }
  }

  poll();
  setInterval(poll, 2000);
}

let webScanInterval: ReturnType<typeof setInterval> | null = null;

async function runWebLanScan(port: number): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  // Determine which subnet(s) to scan
  const hostname = window.location.hostname;
  const prefixes: string[] = [];
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const parts = hostname.split('.');
    if (parts.length === 4) {
      prefixes.push(parts.slice(0, 3).join('.') + '.');
    }
  }
  if (prefixes.length === 0) {
    // Common home router subnets
    prefixes.push('192.168.0.', '192.168.1.', '10.0.0.', '10.0.1.');
  }

  const ips = prefixes.flatMap(p =>
    Array.from({ length: 254 }, (_, i) => p + (i + 1))
  );

  const found: Array<{ ip: string; data: any }> = [];

  await Promise.allSettled(ips.map(async ip => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 400);
    try {
      const res = await fetch(`http://${ip}:${port}/api/room`, { signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        found.push({ ip, data });
      }
    } catch { /* no server at this IP */ } finally {
      clearTimeout(tid);
    }
  }));

  // If scan was stopped while running, discard results
  if (webScanInterval === null && !el.btnStopDiscovery.disabled) return;

  const rooms = found.map(({ ip, data }) => ({
    roomName: data.roomName ?? 'LAN Bomber 방',
    playerCount: data.playerCount ?? 0,
    wsPort: data.wsPort ?? port,
    hostIpHint: data.hostIpHint ?? ip,
    mode: data.mode ?? 'FFA',
    mapId: data.mapId ?? 'map1',
    remoteAddress: ip,
    lastSeen: Date.now()
  }));

  renderRooms(el, rooms, (ip, p) => {
    el.serverIp.value = ip;
    el.serverPort.value = String(p);
    connect(ip, p);
  });
}

// ========================
// Draw loop
// ========================

function draw() {
  requestAnimationFrame(draw);

  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

  if (!startGame) {
    el.hudTop.textContent = '';
    el.hudTimer.textContent = '';
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

// ========================
// UI Binding
// ========================

function sendChat() {
  const text = el.chatInput.value.trim();
  if (!text) return;
  send({ type: 'ChatSend', payload: { text } });
  el.chatInput.value = '';
}

function bindUI() {
  // Main screen
  el.btnJoin.onclick = () => {
    const ip = el.serverIp.value.trim() || window.location.hostname || 'localhost';
    const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
    connect(ip, port);
  };

  el.btnDisconnect.onclick = () => {
    disconnect();
  };

  el.btnHost.onclick = async () => {
    // Web mode: server is already running, just connect to it
    if (!lanApi) {
      const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
      const host = window.location.hostname || 'localhost';
      currentRoomName = el.roomName.value.trim() || 'LAN Bomber 방';
      pendingHostRoomName = currentRoomName; // will be sent in JoinRoom to update server name
      connect(host, port);
      return;
    }

    // Electron mode: always create a new server (no toggle)
    const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
    const roomName = el.roomName.value.trim() || 'LAN Bomber 방';
    if (hostedPorts.has(port)) {
      logLine('info', `포트 ${port}는 이미 실행 중입니다.`);
      return;
    }
    currentRoomName = roomName;
    const res = await lanApi.startServer({ port, roomName, udpPort: DEFAULT_UDP_ANNOUNCE_PORT, logLevel: 'info' });
    if (!res.ok) {
      logLine('info', `Host failed: ${res.error}`);
      return;
    }
    hostedPorts.set(port, roomName);
    logLine('info', `방 "${roomName}" (포트 ${port}) 시작됨.`);
    renderHostedRooms();
    el.serverIp.value = 'localhost';
    connect('localhost', port);
  };

  el.btnDiscovery.onclick = async () => {
    if (lanApi) {
      // Electron mode: UDP broadcast discovery
      const res = await lanApi.startDiscovery(DEFAULT_UDP_ANNOUNCE_PORT);
      if (!res.ok) return;
      el.btnDiscovery.disabled = true;
      el.btnStopDiscovery.disabled = false;
      logLine('info', 'LAN discovery started.');
      return;
    }
    // Web mode: subnet scan
    const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
    el.btnDiscovery.disabled = true;
    el.btnStopDiscovery.disabled = false;
    logLine('info', 'LAN 탐색 시작 (서브넷 스캔)...');
    await runWebLanScan(port);
    webScanInterval = setInterval(() => runWebLanScan(port), 5000);
  };

  el.btnStopDiscovery.onclick = async () => {
    if (lanApi) {
      await lanApi.stopDiscovery();
      el.btnDiscovery.disabled = false;
      el.btnStopDiscovery.disabled = true;
      logLine('info', 'LAN discovery stopped.');
      return;
    }
    // Web mode: stop subnet scan
    if (webScanInterval !== null) {
      clearInterval(webScanInterval);
      webScanInterval = null;
    }
    el.btnDiscovery.disabled = false;
    el.btnStopDiscovery.disabled = true;
    logLine('info', 'LAN 탐색 중지.');
  };

  // Room screen
  el.btnLeaveRoom.onclick = () => {
    disconnect();
    startGame = null;
    snapshotPrev = null;
    snapshotCurr = null;
    setScreen(el, 'main');
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

  el.timerSelect.onchange = () => {
    const seconds = Number(el.timerSelect.value);
    send({ type: 'SetGameDuration', payload: { seconds } });
  };

  el.btnStart.onclick = () => {
    send({ type: 'StartRequest', payload: {} });
  };

  el.btnChatSend.onclick = sendChat;
  el.chatInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  };

  // Game screen
  el.btnLeave.onclick = () => {
    disconnect();
    startGame = null;
    snapshotPrev = null;
    snapshotCurr = null;
    el.countdown.textContent = '';
    setScreen(el, 'main');
  };

  // Result screen
  el.btnReturnLobby.onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Still connected: go back to room screen
      startGame = null;
      snapshotPrev = null;
      snapshotCurr = null;
      setScreen(el, 'room');
      refreshRoomStateUI();
    } else {
      setScreen(el, 'main');
    }
  };
}

// ========================
// Init
// ========================

async function init() {
  preloadAssets();
  setScreen(el, 'main');
  bindUI();
  input.bind();

  if (isElectronClient && lanApi) {
    try {
      const ips = await lanApi.getLocalIps();
      el.hostIpHint.textContent = ips.length ? `LAN IP: ${ips.join(', ')}` : 'LAN IP를 찾을 수 없습니다.';
    } catch {
      el.hostIpHint.textContent = 'LAN IP를 찾을 수 없습니다.';
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
    const port = window.location.port || String(DEFAULT_WS_PORT);
    el.serverIp.value = host;
    el.serverPort.value = port;
    el.hostIpHint.textContent = `서버 주소: ${host}:${port}`;
    el.btnHost.textContent = '방 만들기';
    el.btnStopDiscovery.disabled = true; // enabled only while scanning

    // Web mode: poll current server's /api/room (for when accessing host's IP directly)
    startWebRoomPolling(host, Number(port));
  }

  startPingLoop();
  startInputLoop();
  draw();
}

window.addEventListener('beforeunload', () => {
  discoveryUnsub?.();
  input.unbind();
});

init();
