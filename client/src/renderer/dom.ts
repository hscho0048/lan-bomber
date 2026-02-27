import type { RendererElements } from './types';

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
}

export function getRendererElements(): RendererElements {
  const playerSlots: HTMLDivElement[] = [];
  const slotImgs: HTMLDivElement[] = [];
  const slotNames: HTMLDivElement[] = [];
  const slotBadges: HTMLDivElement[] = [];

  for (let i = 0; i < 6; i++) {
    playerSlots.push(mustGet<HTMLDivElement>(`slot${i}`));
    slotImgs.push(mustGet<HTMLDivElement>(`slotImg${i}`));
    slotNames.push(mustGet<HTMLDivElement>(`slotName${i}`));
    slotBadges.push(mustGet<HTMLDivElement>(`slotBadge${i}`));
  }

  return {
    // Screens
    mainScreen: mustGet<HTMLDivElement>('mainScreen'),
    roomScreen: mustGet<HTMLDivElement>('roomScreen'),
    gameScreen: mustGet<HTMLDivElement>('gameScreen'),
    resultScreen: mustGet<HTMLDivElement>('resultScreen'),

    // Main screen
    nickname: mustGet<HTMLInputElement>('nickname'),
    serverIp: mustGet<HTMLInputElement>('serverIp'),
    serverPort: mustGet<HTMLInputElement>('serverPort'),
    roomName: mustGet<HTMLInputElement>('roomName'),
    btnHost: mustGet<HTMLButtonElement>('btnHost'),
    btnJoin: mustGet<HTMLButtonElement>('btnJoin'),
    btnDisconnect: mustGet<HTMLButtonElement>('btnDisconnect'),
    btnDiscovery: mustGet<HTMLButtonElement>('btnDiscovery'),
    btnStopDiscovery: mustGet<HTMLButtonElement>('btnStopDiscovery'),
    roomList: mustGet<HTMLDivElement>('roomList'),
    hostIpHint: mustGet<HTMLDivElement>('hostIpHint'),
    log: mustGet<HTMLPreElement>('log'),

    // Room screen
    roomTitle: mustGet<HTMLSpanElement>('roomTitle'),
    btnLeaveRoom: mustGet<HTMLButtonElement>('btnLeaveRoom'),
    playerSlots,
    slotImgs,
    slotNames,
    slotBadges,
    readyToggle: mustGet<HTMLInputElement>('readyToggle'),
    btnCharPicker: mustGet<HTMLButtonElement>('btnCharPicker'),
    hostControls: mustGet<HTMLDivElement>('hostControls'),
    timerSelect: mustGet<HTMLSelectElement>('timerSelect'),
    modeSelect: mustGet<HTMLSelectElement>('modeSelect'),
    mapSelect: mustGet<HTMLSelectElement>('mapSelect'),
    btnStart: mustGet<HTMLButtonElement>('btnStart'),
    chatMessages: mustGet<HTMLDivElement>('chatMessages'),
    chatInput: mustGet<HTMLInputElement>('chatInput'),
    btnChatSend: mustGet<HTMLButtonElement>('btnChatSend'),
    btnSwitchTeam: mustGet<HTMLButtonElement>('btnSwitchTeam'),
    btnShuffleTeams: mustGet<HTMLButtonElement>('btnShuffleTeams'),
    teamCountDisplay: mustGet<HTMLDivElement>('teamCountDisplay'),

    // Game screen
    canvas: mustGet<HTMLCanvasElement>('gameCanvas'),
    hudTop: mustGet<HTMLDivElement>('hudTop'),
    hudTimer: mustGet<HTMLDivElement>('hudTimer'),
    countdown: mustGet<HTMLDivElement>('countdown'),
    debug: mustGet<HTMLDivElement>('debug'),
    hudNeedle: mustGet<HTMLDivElement>('hudNeedle'),
    playerStatusPanel: mustGet<HTMLDivElement>('playerStatusPanel'),
    btnLeave: mustGet<HTMLButtonElement>('btnLeave'),

    // Result screen
    resultTitle: mustGet<HTMLHeadingElement>('resultTitle'),
    resultList: mustGet<HTMLDivElement>('resultList'),
    btnReturnLobby: mustGet<HTMLButtonElement>('btnReturnLobby'),
  };
}

export type AppScreen = 'main' | 'room' | 'game' | 'result';

export function setScreen(el: RendererElements, screen: AppScreen) {
  el.mainScreen.classList.add('hidden');
  el.roomScreen.classList.add('hidden');
  el.gameScreen.classList.add('hidden');
  el.resultScreen.classList.add('hidden');

  switch (screen) {
    case 'main': el.mainScreen.classList.remove('hidden'); break;
    case 'room': el.roomScreen.classList.remove('hidden'); break;
    case 'game': el.gameScreen.classList.remove('hidden'); break;
    case 'result': el.resultScreen.classList.remove('hidden'); break;
  }
}
