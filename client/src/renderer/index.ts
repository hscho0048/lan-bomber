import {
  DEFAULT_UDP_ANNOUNCE_PORT,
  DEFAULT_WS_PORT,
  INPUT_SEND_RATE,
  SNAPSHOT_RATE,
  TICK_RATE,
  TICK_MS,
  parseServerMessage,
  stringifyMessage,
  type ClientToServerMessage,
  type EventMessagePayload,
  type GameMode,
  type SnapshotPayload
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
import { createGameState, type GameState, type Notification } from './state';

const el = getRendererElements();
const ctx = el.canvas.getContext('2d')!;
const logLine = createLogger(el.log, 'info');
const input = createInputController();

const state: GameState = createGameState();

const hostedPorts = new Map<number, string>(); // port → roomName (Electron only)
let discoveryUnsub: (() => void) | null = null;
let webScanInterval: ReturnType<typeof setInterval> | null = null;

const lanApi = window.lanApi;
const isElectronClient = !!lanApi;

const INPUT_INTERVAL_MS = 1000 / INPUT_SEND_RATE;

// ========================
// Helpers
// ========================

function send(msg: ClientToServerMessage) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(stringifyMessage(msg));
}

function refreshRoomStateUI() {
  renderRoomState(el, state.roomState, state.myId, send, state.currentRoomName);
}

function buildPlayerTeams(gs: GameState): Record<string, number> {
  const map: Record<string, number> = {};
  if (gs.startGame?.mode === 'TEAM' && gs.roomState) {
    for (const p of gs.roomState.players) map[p.id] = p.team;
  }
  return map;
}

function pushNotification(gs: GameState, text: string, ttl = 2500): void {
  const n: Notification = { text, createdAt: performance.now(), ttl };
  gs.notifications.push(n);
  // Expire old ones eagerly (keep at most 10)
  if (gs.notifications.length > 10) gs.notifications.shift();
}

// ========================
// Snapshot handler
// ========================

function onSnapshot(snap: SnapshotPayload, gs: GameState): void {
  const now = performance.now();
  gs.lastSnapTick = snap.tick;
  gs.lastSnapArrival = now;
  gs.serverTick = snap.tick;

  if (!gs.snap.curr) {
    gs.snap.curr = snap;
    gs.snap.prev = null;
    gs.snap.interpStart = now;
    gs.snap.interpDuration = 1000 / SNAPSHOT_RATE;
    return;
  }

  gs.snap.prev = gs.snap.curr;
  gs.snap.curr = snap;
  gs.snap.interpStart = now;

  const dtTicks = Math.max(1, gs.snap.curr.tick - gs.snap.prev.tick);
  gs.snap.interpDuration = (dtTicks * 1000) / TICK_RATE;
}

// ========================
// Event handler
// ========================

function onEvent(ev: EventMessagePayload, gs: GameState): void {
  if (ev.type === 'RoundEnded') {
    const ranking: Array<{ id: string; name: string; colorIndex: number; team?: number; skin?: string }> = ev.payload.ranking ?? [];

    // Determine overlay message
    let endMsg = '게임 종료';
    if (ev.payload.mode === 'BOSS') {
      endMsg = ev.payload.victory ? '보스 격파! 🎉' : '게임 오버';
    } else if (ev.payload.mode === 'TEAM') {
      const myTeam = gs.roomState?.players.find(p => p.id === gs.myId)?.team;
      endMsg = myTeam !== undefined && myTeam === ev.payload.winnerTeam ? '승리! 🎉' : '패배...';
    } else {
      endMsg = ev.payload.winnerId === gs.myId ? '우승! 🎉' : '게임 종료';
    }

    gs.roundEnd = { msg: endMsg, at: performance.now() };

    // Prepare result screen in background
    if (ev.payload.mode === 'BOSS') {
      renderResultScreen(el, ranking, gs.myId, false, undefined, ev.payload.victory as boolean);
    } else if (ev.payload.mode === 'TEAM') {
      renderResultScreen(el, ranking, gs.myId, false, ev.payload.winnerTeam as number);
    } else {
      renderResultScreen(el, ranking, gs.myId, !ev.payload.winnerId);
    }

    // Switch to result screen after a short delay
    setTimeout(() => {
      gs.roundEnd = null;
      setScreen(el, 'result');
    }, 2800);
    return;
  }

  if (ev.type === 'ServerNotice') {
    addSystemMessage(el, ev.payload.text ?? '');
  }

  if (ev.type === 'PlayerDied') {
    const playerId: string = ev.payload.playerId ?? '';
    const player = gs.roomState?.players.find(p => p.id === playerId);
    if (player) {
      addSystemMessage(el, `${player.name} 탈락!`);
      pushNotification(gs, `💀 ${player.name} 탈락!`);
    }
  }

  if (ev.type === 'PlayerRescued') {
    const rescuedId: string = ev.payload.playerId ?? '';
    const rescuerId: string = ev.payload.byPlayerId ?? '';
    const rescued = gs.roomState?.players.find(p => p.id === rescuedId);
    const rescuer = gs.roomState?.players.find(p => p.id === rescuerId);
    if (rescued && rescuer) {
      if (rescuedId !== rescuerId) {
        addSystemMessage(el, `${rescuer.name}가 ${rescued.name}를 구출했습니다!`);
        pushNotification(gs, `💪 ${rescuer.name}→${rescued.name} 구출!`);
      }
    }
  }
}

// ========================
// WebSocket message handler
// ========================

function handleServerMessage(rawData: string, gs: GameState): void {
  const msg = parseServerMessage(rawData);
  if (!msg) return;

  switch (msg.type) {
    case 'Welcome': {
      gs.myId = msg.payload.playerId;
      logLine('info', `Welcome. id=${gs.myId}`);
      break;
    }
    case 'RoomState': {
      gs.roomState = msg.payload;
      refreshRoomStateUI();
      break;
    }
    case 'StartGame': {
      gs.startGame = msg.payload;
      gs.snap.prev = null;
      gs.snap.curr = null;
      gs.snap.interpStart = performance.now();
      gs.snap.interpDuration = 1000 / SNAPSHOT_RATE;
      gs.serverTick = gs.startGame.startTick;
      gs.notifications = [];
      logLine('info', `StartGame: map=${gs.startGame.mapId} mode=${gs.startGame.mode} duration=${gs.startGame.gameDurationSeconds}s`);
      setScreen(el, 'game');
      break;
    }
    case 'Snapshot': {
      onSnapshot(msg.payload, gs);
      break;
    }
    case 'Event': {
      onEvent(msg.payload, gs);
      break;
    }
    case 'Chat': {
      const chat = msg.payload;
      addChatMessage(el, chat.playerName, chat.colorIndex, chat.text);
      break;
    }
    case 'Pong': {
      gs.pingMs = Math.max(0, performance.now() - msg.payload.clientTime);
      gs.serverTick = msg.payload.tick;
      break;
    }
    case 'ServerError': {
      logLine('info', `ServerError: ${msg.payload.message}`);
      addSystemMessage(el, `오류: ${msg.payload.message}`);
      break;
    }
  }
}

// ========================
// Connection
// ========================

function connect(ip: string, port: number): void {
  if (state.ws) { state.ws.close(); state.ws = null; }

  const url = `ws://${ip}:${port}`;
  logLine('info', `Connecting to ${url}...`);
  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    logLine('info', 'Connected.');
    el.btnDisconnect.disabled = false;
    const payload: { name: string; roomName?: string } = { name: el.nickname.value.trim() || 'Player' };
    if (state.pendingHostRoomName) {
      payload.roomName = state.pendingHostRoomName;
      state.pendingHostRoomName = null;
    }
    send({ type: 'JoinRoom', payload });
    const savedSkin = localStorage.getItem('playerSkin');
    if (savedSkin) send({ type: 'SetSkin', payload: { skin: savedSkin } });
  };

  state.ws.onmessage = (ev) => handleServerMessage(String(ev.data), state);

  state.ws.onclose = () => {
    logLine('info', 'Disconnected.');
    state.ws = null;
    state.myId = null;
    state.roomState = null;
    state.startGame = null;
    state.snap.prev = null;
    state.snap.curr = null;
    el.btnDisconnect.disabled = true;
    refreshRoomStateUI();
    setScreen(el, 'main');
  };

  state.ws.onerror = () => logLine('info', 'WebSocket error.');

  setScreen(el, 'room');
  el.chatMessages.innerHTML = '';
  addSystemMessage(el, `${ip}:${port} 에 연결 중...`);
}

function disconnect(): void {
  if (!state.ws) return;
  state.ws.close();
  state.ws = null;
}

// ========================
// Hosted room list (Electron)
// ========================

function renderHostedRooms(): void {
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
    joinBtn.onclick = () => { el.serverIp.value = 'localhost'; connect('localhost', port); };
    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn btn-danger btn-sm';
    stopBtn.textContent = '중지';
    stopBtn.onclick = async () => {
      await lanApi!.stopServer(port);
      hostedPorts.delete(port);
      renderHostedRooms();
      logLine('info', `포트 ${port} 서버 중지됨.`);
      if (state.ws && state.ws.url.includes(`:${port}`)) disconnect();
    };
    item.appendChild(info);
    item.appendChild(joinBtn);
    item.appendChild(stopBtn);
    container.appendChild(item);
  }
}

// ========================
// LAN discovery (Web mode)
// ========================

async function runWebLanScan(port: number): Promise<void> {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) return;

  const hostname = window.location.hostname;
  const prefixes: string[] = [];
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const parts = hostname.split('.');
    if (parts.length === 4) prefixes.push(parts.slice(0, 3).join('.') + '.');
  }
  if (prefixes.length === 0) prefixes.push('192.168.0.', '192.168.1.', '10.0.0.', '10.0.1.');

  const ips = prefixes.flatMap(p => Array.from({ length: 254 }, (_, i) => p + (i + 1)));
  const found: Array<{ ip: string; data: any }> = [];

  await Promise.allSettled(ips.map(async ip => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 400);
    try {
      const res = await fetch(`http://${ip}:${port}/api/room`, { signal: ctrl.signal });
      if (res.ok) found.push({ ip, data: await res.json() });
    } catch { /* unreachable */ } finally { clearTimeout(tid); }
  }));

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
  renderRooms(el, rooms, (ip, p) => { el.serverIp.value = ip; el.serverPort.value = String(p); connect(ip, p); });
}

function startWebRoomPolling(host: string, port: number): void {
  async function poll() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
    try {
      const res = await fetch(`http://${host}:${port}/api/room`);
      if (!res.ok) return;
      const data = await res.json();
      renderRooms(el, [{
        roomName: data.roomName ?? 'LAN Bomber 방',
        playerCount: data.playerCount ?? 0,
        wsPort: data.wsPort ?? port,
        hostIpHint: data.hostIpHint ?? '',
        mode: data.mode ?? 'FFA',
        mapId: data.mapId ?? 'map1',
        remoteAddress: host,
        lastSeen: Date.now()
      }], (ip, p) => { el.serverIp.value = ip; el.serverPort.value = String(p); connect(ip, p); });
    } catch { /* not reachable yet */ }
  }
  poll();
  setInterval(poll, 2000);
}

// ========================
// Character Picker
// ========================

const SKINS: Array<{ id: string; label: string; premium?: boolean }> = [
  { id: 'blue',     label: '파랑' },
  { id: 'green',    label: '초록' },
  { id: 'purple',   label: '보라' },
  { id: 'red',      label: '빨강' },
  { id: 'white',    label: '하양' },
  { id: 'yellow',   label: '노랑' },
  { id: 'Chiikawa', label: '치이카와', premium: true }
];

function openCharPicker(): void {
  const modal = document.getElementById('charPickerModal')!;
  const grid  = document.getElementById('charPickerGrid')!;
  const current = localStorage.getItem('playerSkin') ?? '';
  grid.innerHTML = '';

  for (const skin of SKINS) {
    const card = document.createElement('div');
    card.className = 'char-card' + (current === skin.id ? ' selected' : '');
    const img = document.createElement('img');
    img.src = `assests/images/characters/${skin.id}/idle.svg`;
    img.alt = skin.label;
    const nameEl = document.createElement('div');
    nameEl.className = 'char-card-name';
    nameEl.textContent = skin.label;
    card.appendChild(img);
    card.appendChild(nameEl);
    if (skin.premium) {
      const badge = document.createElement('div');
      badge.className = 'char-card-premium';
      badge.textContent = '⭐ 프리미엄';
      card.appendChild(badge);
    }
    card.onclick = () => {
      if (skin.premium) { alert('호성이한테 1만원을 주면 적용'); return; }
      localStorage.setItem('playerSkin', skin.id);
      send({ type: 'SetSkin', payload: { skin: skin.id } });
      closeCharPicker();
      refreshRoomStateUI();
    };
    grid.appendChild(card);
  }
  modal.classList.remove('hidden');
}

function closeCharPicker(): void {
  document.getElementById('charPickerModal')!.classList.add('hidden');
}

// ========================
// UI Binding (split by screen)
// ========================

function sendChat(): void {
  const text = el.chatInput.value.trim();
  if (!text) return;
  send({ type: 'ChatSend', payload: { text } });
  el.chatInput.value = '';
}

function bindMainScreen(): void {
  el.btnJoin.onclick = () => {
    const ip = el.serverIp.value.trim() || window.location.hostname || 'localhost';
    const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
    connect(ip, port);
  };

  el.btnDisconnect.onclick = () => disconnect();

  el.btnHost.onclick = async () => {
    if (!lanApi) {
      const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
      const host = window.location.hostname || 'localhost';
      state.currentRoomName = el.roomName.value.trim() || 'LAN Bomber 방';
      state.pendingHostRoomName = state.currentRoomName;
      connect(host, port);
      return;
    }
    const port = Number(el.serverPort.value || DEFAULT_WS_PORT);
    const roomName = el.roomName.value.trim() || 'LAN Bomber 방';
    if (hostedPorts.has(port)) { logLine('info', `포트 ${port}는 이미 실행 중입니다.`); return; }
    state.currentRoomName = roomName;
    const res = await lanApi.startServer({ port, roomName, udpPort: DEFAULT_UDP_ANNOUNCE_PORT, logLevel: 'info' });
    if (!res.ok) { logLine('info', `Host failed: ${res.error}`); return; }
    hostedPorts.set(port, roomName);
    logLine('info', `방 "${roomName}" (포트 ${port}) 시작됨.`);
    renderHostedRooms();
    el.serverIp.value = 'localhost';
    connect('localhost', port);
  };

  el.btnDiscovery.onclick = async () => {
    if (lanApi) {
      const res = await lanApi.startDiscovery(DEFAULT_UDP_ANNOUNCE_PORT);
      if (!res.ok) return;
      el.btnDiscovery.disabled = true;
      el.btnStopDiscovery.disabled = false;
      logLine('info', 'LAN discovery started.');
      return;
    }
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
    if (webScanInterval !== null) { clearInterval(webScanInterval); webScanInterval = null; }
    el.btnDiscovery.disabled = false;
    el.btnStopDiscovery.disabled = true;
    logLine('info', 'LAN 탐색 중지.');
  };
}

function bindRoomScreen(): void {
  el.btnCharPicker.onclick = openCharPicker;
  document.getElementById('btnCloseCharPicker')!.onclick = closeCharPicker;
  document.getElementById('charPickerModal')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCharPicker();
  });

  el.btnLeaveRoom.onclick = () => {
    disconnect();
    state.startGame = null;
    state.snap.prev = null;
    state.snap.curr = null;
    setScreen(el, 'main');
  };

  el.readyToggle.onchange = () => {
    send({ type: 'Ready', payload: { isReady: el.readyToggle.checked } });
  };

  el.btnSwitchTeam.onclick = () => {
    const myPlayer = state.myId ? state.roomState?.players.find(p => p.id === state.myId) : null;
    if (!myPlayer) return;
    send({ type: 'SetTeam', payload: { team: myPlayer.team === 0 ? 1 : 0 } });
  };

  el.btnShuffleTeams.onclick = () => {
    send({ type: 'ShuffleTeams', payload: {} });
  };

  el.modeSelect.onchange = () => {
    const mode = el.modeSelect.value as GameMode;
    send({ type: 'SetMode', payload: { mode } });
    // Auto-select boss arena for BOSS mode, restore map1 when switching away
    if (mode === 'BOSS' && el.mapSelect.value !== 'boss_arena') {
      el.mapSelect.value = 'boss_arena';
      send({ type: 'SetMap', payload: { mapId: 'boss_arena' } });
    } else if (mode !== 'BOSS' && el.mapSelect.value === 'boss_arena') {
      el.mapSelect.value = 'map1';
      send({ type: 'SetMap', payload: { mapId: 'map1' } });
    }
  };

  el.mapSelect.onchange = () => {
    send({ type: 'SetMap', payload: { mapId: el.mapSelect.value } });
  };

  el.timerSelect.onchange = () => {
    send({ type: 'SetGameDuration', payload: { seconds: Number(el.timerSelect.value) } });
  };

  el.btnStart.onclick = () => {
    send({ type: 'StartRequest', payload: {} });
  };

  el.btnChatSend.onclick = sendChat;
  el.chatInput.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
  };
}

function bindGameScreen(): void {
  el.btnLeave.onclick = () => {
    disconnect();
    state.startGame = null;
    state.snap.prev = null;
    state.snap.curr = null;
    el.countdown.textContent = '';
    setScreen(el, 'main');
  };
}

function bindResultScreen(): void {
  el.btnReturnLobby.onclick = () => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.startGame = null;
      state.snap.prev = null;
      state.snap.curr = null;
      setScreen(el, 'room');
      refreshRoomStateUI();
    } else {
      setScreen(el, 'main');
    }
  };
}

function bindUI(): void {
  bindMainScreen();
  bindRoomScreen();
  bindGameScreen();
  bindResultScreen();
}

// ========================
// Ping loop
// ========================

function startPingLoop(): void {
  setInterval(() => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    send({ type: 'Ping', payload: { clientTime: performance.now() } });
  }, 500);
}

// ========================
// Draw loop
// ========================

function draw(): void {
  requestAnimationFrame(draw);

  const now = performance.now();

  if (state.ws && state.ws.readyState === WebSocket.OPEN && state.startGame) {
    if (now - state.lastSentTime >= INPUT_INTERVAL_MS) {
      state.lastSentTime = now;
      const elapsedTicks = Math.floor((now - state.lastSnapArrival) / TICK_MS);
      const tickEstimate = state.lastSnapTick + elapsedTicks;
      send({
        type: 'Input',
        payload: {
          seq: state.inputSeq++,
          tick: tickEstimate,
          moveDir: input.computeMoveDir(),
          placeBalloon: input.consumePlaceQueued(),
          useNeedleSlot: input.consumeNeedleSlotQueued()
        }
      });
    }
  }

  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

  if (!state.startGame) {
    el.hudTop.textContent = '';
    el.hudTimer.textContent = '';
    el.debug.textContent = '';
    return;
  }

  const playerTeams = state.startGame.mode === 'TEAM' ? buildPlayerTeams(state) : undefined;

  // Prune expired notifications
  state.notifications = state.notifications.filter(n => now - n.createdAt < n.ttl);

  drawGameFrame({
    ctx,
    el,
    startGame: state.startGame,
    snapshotCurr: state.snap.curr,
    snapshotPrev: state.snap.prev,
    snapshotInterpStart: state.snap.interpStart,
    snapshotInterpDuration: state.snap.interpDuration,
    serverTickEstimate: state.serverTick,
    pingMs: state.pingMs,
    myId: state.myId,
    playerTeams,
    notifications: state.notifications,
    now,
    playerSkins: state.startGame.playerSkins ?? {},
    boss: state.snap.curr?.boss,
    roundEnd: state.roundEnd
  });
}

// ========================
// Init
// ========================

async function init(): Promise<void> {
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
    el.btnStopDiscovery.disabled = true;
    startWebRoomPolling(host, Number(port));
  }

  startPingLoop();
  draw();
}

window.addEventListener('beforeunload', () => {
  discoveryUnsub?.();
  input.unbind();
});

init();
