import {
  DEFAULT_UDP_ANNOUNCE_PORT,
  DEFAULT_WS_PORT,
  INPUT_SEND_RATE,
  SNAPSHOT_RATE,
  TICK_RATE,
  TICK_MS,
  getMapPreset,
  parseServerMessage,
  stringifyMessage,
  type ClientToServerMessage,
  type GameMode,
  type MoveDir,
  type RoomStatePayload,
  type SnapshotPayload,
  type StartGamePayload,
  type EventMessagePayload,
  type PlayerLifeState,
  type ItemType
} from '@lan-bomber/shared';

type DiscoveryRoomInfo = {
  roomName: string;
  playerCount: number;
  wsPort: number;
  hostIpHint: string;
  mode: string;
  mapId: string;
  remoteAddress: string;
  lastSeen: number;
};

const el = {
  lobbyScreen: document.getElementById('lobbyScreen') as HTMLDivElement,
  gameScreen: document.getElementById('gameScreen') as HTMLDivElement,

  nickname: document.getElementById('nickname') as HTMLInputElement,
  serverIp: document.getElementById('serverIp') as HTMLInputElement,
  serverPort: document.getElementById('serverPort') as HTMLInputElement,
  roomName: document.getElementById('roomName') as HTMLInputElement,

  btnHost: document.getElementById('btnHost') as HTMLButtonElement,
  btnJoin: document.getElementById('btnJoin') as HTMLButtonElement,
  btnDisconnect: document.getElementById('btnDisconnect') as HTMLButtonElement,

  btnDiscovery: document.getElementById('btnDiscovery') as HTMLButtonElement,
  btnStopDiscovery: document.getElementById('btnStopDiscovery') as HTMLButtonElement,

  roomList: document.getElementById('roomList') as HTMLDivElement,
  roomState: document.getElementById('roomState') as HTMLDivElement,

  readyToggle: document.getElementById('readyToggle') as HTMLInputElement,
  hostControls: document.getElementById('hostControls') as HTMLDivElement,
  modeSelect: document.getElementById('modeSelect') as HTMLSelectElement,
  mapSelect: document.getElementById('mapSelect') as HTMLSelectElement,
  btnStart: document.getElementById('btnStart') as HTMLButtonElement,
  countdown: document.getElementById('countdown') as HTMLDivElement,

  log: document.getElementById('log') as HTMLPreElement,
  hostIpHint: document.getElementById('hostIpHint') as HTMLDivElement,

  canvas: document.getElementById('gameCanvas') as HTMLCanvasElement,
  hudTop: document.getElementById('hudTop') as HTMLDivElement,
  debug: document.getElementById('debug') as HTMLDivElement,
  btnLeave: document.getElementById('btnLeave') as HTMLButtonElement
};

const ctx = el.canvas.getContext('2d')!;

type LogLevel = 'info' | 'debug';
const LOG_LEVEL: LogLevel = 'info';

function logLine(level: LogLevel, msg: string) {
  if (level === 'debug' && LOG_LEVEL !== 'debug') return;
  const time = new Date().toLocaleTimeString();
  el.log.textContent = `[${time}] ${msg}\n` + (el.log.textContent ?? '');
}

function setScreen(screen: 'lobby' | 'game') {
  if (screen === 'lobby') {
    el.lobbyScreen.classList.remove('hidden');
    el.gameScreen.classList.add('hidden');
  } else {
    el.lobbyScreen.classList.add('hidden');
    el.gameScreen.classList.remove('hidden');
  }
}

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
let placeQueued = false;
let preferredDir: MoveDir = 'None';
const keyDown = new Set<string>();

let discoveryUnsub: (() => void) | null = null;
const lanApi = window.lanApi;
const isElectronClient = !!lanApi;

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
        renderRoomState();
        // If game ended and server returned to lobby
        if (startGame && roomState) {
          // If any player ready false and no snapshots recently, assume lobby
          // (server sends RoomState only in lobby)
          setScreen('lobby');
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
        setScreen('game');
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
        const now = performance.now();
        const sent = msg.payload.clientTime;
        pingMs = Math.max(0, now - sent);
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
    renderRoomState();
    setScreen('lobby');
  };

  ws.onerror = () => {
    logLine('info', 'WebSocket error.');
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

function send(msg: ClientToServerMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(stringifyMessage(msg));
}

function renderRoomState() {
  if (!roomState) {
    el.roomState.textContent = '(Not in room)';
    el.hostControls.style.display = 'none';
    el.btnStart.disabled = true;
    el.readyToggle.checked = false;
    return;
  }
  const state = roomState;

  const isHost = myId && state.hostId === myId;
  el.hostControls.style.display = isHost ? 'block' : 'none';

  el.modeSelect.value = state.mode;
  el.mapSelect.value = state.mapId;

  // Player list
  const lines: HTMLElement[] = [];
  const container = document.createElement('div');

  for (const p of state.players) {
    const ready = !!state.readyStates[p.id];
    const row = document.createElement('div');
    row.className = 'playerRow';

    const name = document.createElement('div');
    name.textContent = `${p.name}${p.id === state.hostId ? ' (Host)' : ''}${p.id === myId ? ' (You)' : ''}`;

    const badge = document.createElement('span');
    badge.className = `badge ${ready ? 'ready' : 'notReady'}`;
    badge.textContent = ready ? 'Ready' : 'Not Ready';

    const teamCell = document.createElement('div');

    if (state.mode === 'TEAM') {
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="0">Team 0</option><option value="1">Team 1</option>`;
      sel.value = String(p.team);
      sel.disabled = p.id !== myId; // only change your own team
      sel.onchange = () => {
        const team = Number(sel.value);
        send({ type: 'SetTeam', payload: { team } });
      };
      teamCell.appendChild(sel);
    } else {
      teamCell.textContent = '-';
    }

    row.appendChild(name);
    row.appendChild(badge);
    row.appendChild(teamCell);
    container.appendChild(row);
    lines.push(row);
  }

  el.roomState.innerHTML = '';
  el.roomState.appendChild(container);

  // Ready checkbox reflects self
  if (myId) {
    el.readyToggle.checked = !!state.readyStates[myId];
  }

  // Start button enabled when host and all ready and >=2 players
  const allReady = state.players.length > 0 && state.players.every((p) => state.readyStates[p.id]);
  const enoughPlayers = state.players.length >= 2;
  el.btnStart.disabled = !(isHost && allReady && enoughPlayers);
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
    if (ev.payload.mode === 'FFA') {
      logLine('info', `RoundEnded (FFA). winnerId=${ev.payload.winnerId ?? '(none)'}`);
    } else {
      logLine('info', `RoundEnded (TEAM). winnerTeam=${ev.payload.winnerTeam}`);
    }
  }
}

function computeMoveDir(): MoveDir {
  const up = keyDown.has('ArrowUp') || keyDown.has('KeyW');
  const down = keyDown.has('ArrowDown') || keyDown.has('KeyS');
  const left = keyDown.has('ArrowLeft') || keyDown.has('KeyA');
  const right = keyDown.has('ArrowRight') || keyDown.has('KeyD');

  const isDirDown = (d: MoveDir) => {
    switch (d) {
      case 'Up':
        return up;
      case 'Down':
        return down;
      case 'Left':
        return left;
      case 'Right':
        return right;
      default:
        return false;
    }
  };

  if (preferredDir !== 'None' && isDirDown(preferredDir)) return preferredDir;

  if (up) return 'Up';
  if (down) return 'Down';
  if (left) return 'Left';
  if (right) return 'Right';
  return 'None';
}

function startInputLoop() {
  const intervalMs = 1000 / INPUT_SEND_RATE;
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!startGame) return;

    const moveDir = computeMoveDir();

    const msg: ClientToServerMessage = {
      type: 'Input',
      payload: {
        seq: inputSeq++,
        tick: serverTickEstimate,
        moveDir,
        placeBalloon: placeQueued
      }
    };

    placeQueued = false;
    send(msg);
  }, intervalMs);
}

function startPingLoop() {
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    send({ type: 'Ping', payload: { clientTime: performance.now() } });
  }, 1000);
}

function itemLabel(type: ItemType): string {
  switch (type) {
    case 'Speed':
      return '+SPD';
    case 'Balloon':
      return '+BAL';
    case 'Power':
      return '+PWR';
  }
}

function draw() {
  requestAnimationFrame(draw);

  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

  if (!startGame) {
    el.hudTop.textContent = '';
    el.debug.textContent = '';
    return;
  }

  const preset = getMapPreset(startGame.mapId);
  const mapW = preset.width;
  const mapH = preset.height;
  const tileSize = Math.floor(Math.min(el.canvas.width / mapW, el.canvas.height / mapH));
  const offsetX = Math.floor((el.canvas.width - tileSize * mapW) / 2);
  const offsetY = Math.floor((el.canvas.height - tileSize * mapH) / 2);

  // Countdown if before startTick
  const nowTick = serverTickEstimate;
  const ticksLeft = Math.max(0, startGame.startTick - nowTick);
  if (ticksLeft > 0) {
    el.countdown.textContent = `Starting in ${(ticksLeft / TICK_RATE).toFixed(1)}s`;
  } else {
    el.countdown.textContent = '';
  }

  // Interpolation alpha
  let alpha = 1;
  if (snapshotPrev && snapshotCurr) {
    const elapsed = performance.now() - snapshotInterpStart;
    alpha = clamp01(elapsed / snapshotInterpDuration);
  }

  const snap = snapshotCurr;

  // Draw background grid
  ctx.save();
  ctx.translate(offsetX, offsetY);

  ctx.strokeStyle = '#142033';
  ctx.lineWidth = 1;
  for (let y = 0; y <= mapH; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(mapW * tileSize, y * tileSize);
    ctx.stroke();
  }
  for (let x = 0; x <= mapW; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, mapH * tileSize);
    ctx.stroke();
  }

  if (snap) {
    // Blocks
    for (const b of snap.blocks) {
      if (b.kind === 'SolidWall') ctx.fillStyle = '#2b394d';
      else ctx.fillStyle = '#3a2f1f';
      ctx.fillRect(b.x * tileSize, b.y * tileSize, tileSize, tileSize);
    }

    // Items
    for (const it of snap.items) {
      ctx.fillStyle = '#1f7a5a';
      const cx = it.x * tileSize + tileSize / 2;
      const cy = it.y * tileSize + tileSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e6edf3';
      ctx.font = `${Math.max(10, tileSize * 0.22)}px ui-monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(itemLabel(it.itemType), cx, cy);
    }

    // Explosions
    for (const ex of snap.explosions) {
      ctx.fillStyle = 'rgba(0, 153, 255, 0.35)';
      for (const t of ex.tiles) {
        ctx.fillRect(t.x * tileSize, t.y * tileSize, tileSize, tileSize);
      }
    }

    // Balloons
    for (const b of snap.balloons) {
      const cx = b.x * tileSize + tileSize / 2;
      const cy = b.y * tileSize + tileSize / 2;
      ctx.fillStyle = '#1b74d1';
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.33, 0, Math.PI * 2);
      ctx.fill();
    }

    // Players
    for (const p of snap.players) {
      const pos = interpolatePlayerPos(p.id, alpha);
      const cx = pos.x * tileSize;
      const cy = pos.y * tileSize;

      const baseColor = p.team === 0 ? '#d46b08' : '#2f54eb';

      if (p.state === 'Dead') {
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - tileSize * 0.25, cy - tileSize * 0.25);
        ctx.lineTo(cx + tileSize * 0.25, cy + tileSize * 0.25);
        ctx.moveTo(cx + tileSize * 0.25, cy - tileSize * 0.25);
        ctx.lineTo(cx - tileSize * 0.25, cy + tileSize * 0.25);
        ctx.stroke();
      } else {
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * 0.28, 0, Math.PI * 2);
        ctx.fill();

        if (p.state === 'Trapped') {
          ctx.strokeStyle = 'rgba(102, 217, 255, 0.85)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.38, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (p.invulnerable) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Name
      ctx.fillStyle = '#e6edf3';
      ctx.font = `${Math.max(10, tileSize * 0.22)}px ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, cx, cy - tileSize * 0.35);

      if (p.id === myId) {
        // stats
        ctx.textBaseline = 'top';
        ctx.font = `${Math.max(10, tileSize * 0.2)}px ui-monospace`;
        ctx.fillText(`SPD:${p.stats.speed.toFixed(1)} B:${p.stats.balloonCount} P:${p.stats.power}`, cx, cy + tileSize * 0.35);
      }
    }

    // HUD summary
    el.hudTop.textContent = `${startGame.mode} | Tick ${snap.tick}`;

    const alive = snap.players.filter((p) => p.state !== 'Dead').length;
    const trapped = snap.players.filter((p) => p.state === 'Trapped').length;

    const me = snap.players.find((p) => p.id === myId);
    const myState: PlayerLifeState = me?.state ?? 'Dead';

    el.debug.textContent = [
      `tick=${snap.tick}`,
      `ping=${pingMs.toFixed(0)}ms`,
      `players=${snap.players.length} aliveOrTrapped=${alive} trapped=${trapped}`,
      `me=${myId ?? '(no id)'} state=${myState}`
    ].join('\n');
  } else {
    el.hudTop.textContent = `${startGame.mode} | Waiting for snapshot...`;
    el.debug.textContent = `tick=${serverTickEstimate}\nping=${pingMs.toFixed(0)}ms`;
  }

  ctx.restore();
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function interpolatePlayerPos(playerId: string, alpha: number): { x: number; y: number } {
  if (!snapshotCurr) return { x: 0, y: 0 };
  const curr = snapshotCurr.players.find((p) => p.id === playerId);
  if (!curr) return { x: 0, y: 0 };
  if (!snapshotPrev) return { x: curr.x, y: curr.y };
  const prev = snapshotPrev.players.find((p) => p.id === playerId);
  if (!prev) return { x: curr.x, y: curr.y };
  return {
    x: prev.x + (curr.x - prev.x) * alpha,
    y: prev.y + (curr.y - prev.y) * alpha
  };
}

// --------------------
// UI Bindings
// --------------------

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

    // Host joins using localhost
    el.serverIp.value = 'localhost';
    connect('localhost', port);
  } else {
    await lanApi.stopServer();
    isHostingLocalServer = false;
    el.btnHost.textContent = 'Host (Start Server)';
    logLine('info', 'Local server stopped.');
  }
};

el.readyToggle.onchange = () => {
  send({ type: 'Ready', payload: { isReady: el.readyToggle.checked } });
};

el.modeSelect.onchange = () => {
  const mode = el.modeSelect.value as GameMode;
  send({ type: 'SetMode', payload: { mode } });
};

el.mapSelect.onchange = () => {
  const mapId = el.mapSelect.value;
  send({ type: 'SetMap', payload: { mapId } });
};

el.btnStart.onclick = () => {
  send({ type: 'StartRequest', payload: {} });
};

el.btnLeave.onclick = () => {
  disconnect();
  setScreen('lobby');
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
  if (res.ok) {
    el.btnDiscovery.disabled = true;
    el.btnStopDiscovery.disabled = false;
    logLine('info', 'LAN discovery started.');
  }
};

el.btnStopDiscovery.onclick = async () => {
  if (!lanApi) return;
  await lanApi.stopDiscovery();
  el.btnDiscovery.disabled = false;
  el.btnStopDiscovery.disabled = true;
  logLine('info', 'LAN discovery stopped.');
};

function renderRooms(rooms: DiscoveryRoomInfo[]) {
  el.roomList.innerHTML = '';
  if (rooms.length === 0) {
    el.roomList.textContent = '(No rooms discovered yet)';
    return;
  }

  for (const r of rooms) {
    const card = document.createElement('div');
    card.className = 'roomCard';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `${r.roomName}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const ageMs = Date.now() - r.lastSeen;
    meta.textContent = `${r.remoteAddress}:${r.wsPort} | players=${r.playerCount} | mode=${r.mode} map=${r.mapId} | seen ${(ageMs / 1000).toFixed(1)}s ago`;

    const btn = document.createElement('button');
    btn.textContent = 'Join';
    btn.onclick = () => {
      el.serverIp.value = r.remoteAddress;
      el.serverPort.value = String(r.wsPort);
      connect(r.remoteAddress, r.wsPort);
    };

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(btn);
    el.roomList.appendChild(card);
  }
}

// Keyboard
window.addEventListener('keydown', (e) => {
  keyDown.add(e.code);

  if (e.code === 'ArrowUp' || e.code === 'KeyW') preferredDir = 'Up';
  if (e.code === 'ArrowDown' || e.code === 'KeyS') preferredDir = 'Down';
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') preferredDir = 'Left';
  if (e.code === 'ArrowRight' || e.code === 'KeyD') preferredDir = 'Right';

  if (e.code === 'Space') {
    placeQueued = true;
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  keyDown.delete(e.code);
});

async function init() {
  setScreen('lobby');

  if (isElectronClient && lanApi) {
    try {
      const ips = await lanApi.getLocalIps();
      el.hostIpHint.textContent = ips.length ? `Your LAN IP(s): ${ips.join(', ')}` : 'LAN IP not found.';
    } catch {
      el.hostIpHint.textContent = 'LAN IP not found.';
    }

    discoveryUnsub = lanApi.onDiscoveryUpdate((rooms) => renderRooms(rooms));
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

init();

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
