import type { RendererElements } from './types';

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
}

export function getRendererElements(): RendererElements {
  return {
    lobbyScreen: mustGet<HTMLDivElement>('lobbyScreen'),
    gameScreen: mustGet<HTMLDivElement>('gameScreen'),

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
    roomState: mustGet<HTMLDivElement>('roomState'),

    readyToggle: mustGet<HTMLInputElement>('readyToggle'),
    hostControls: mustGet<HTMLDivElement>('hostControls'),
    modeSelect: mustGet<HTMLSelectElement>('modeSelect'),
    mapSelect: mustGet<HTMLSelectElement>('mapSelect'),
    btnStart: mustGet<HTMLButtonElement>('btnStart'),
    countdown: mustGet<HTMLDivElement>('countdown'),

    log: mustGet<HTMLPreElement>('log'),
    hostIpHint: mustGet<HTMLDivElement>('hostIpHint'),

    canvas: mustGet<HTMLCanvasElement>('gameCanvas'),
    hudTop: mustGet<HTMLDivElement>('hudTop'),
    debug: mustGet<HTMLDivElement>('debug'),
    btnLeave: mustGet<HTMLButtonElement>('btnLeave')
  };
}

export function setScreen(el: RendererElements, screen: 'lobby' | 'game') {
  if (screen === 'lobby') {
    el.lobbyScreen.classList.remove('hidden');
    el.gameScreen.classList.add('hidden');
    return;
  }
  el.lobbyScreen.classList.add('hidden');
  el.gameScreen.classList.remove('hidden');
}
