import type { MoveDir } from '@lan-bomber/shared';

export type DiscoveryRoomInfo = {
  roomName: string;
  playerCount: number;
  wsPort: number;
  hostIpHint: string;
  mode: string;
  mapId: string;
  remoteAddress: string;
  lastSeen: number;
};

export type RendererElements = {
  lobbyScreen: HTMLDivElement;
  gameScreen: HTMLDivElement;

  nickname: HTMLInputElement;
  serverIp: HTMLInputElement;
  serverPort: HTMLInputElement;
  roomName: HTMLInputElement;

  btnHost: HTMLButtonElement;
  btnJoin: HTMLButtonElement;
  btnDisconnect: HTMLButtonElement;

  btnDiscovery: HTMLButtonElement;
  btnStopDiscovery: HTMLButtonElement;

  roomList: HTMLDivElement;
  roomState: HTMLDivElement;

  readyToggle: HTMLInputElement;
  hostControls: HTMLDivElement;
  modeSelect: HTMLSelectElement;
  mapSelect: HTMLSelectElement;
  btnStart: HTMLButtonElement;
  countdown: HTMLDivElement;

  log: HTMLPreElement;
  hostIpHint: HTMLDivElement;

  canvas: HTMLCanvasElement;
  hudTop: HTMLDivElement;
  debug: HTMLDivElement;
  btnLeave: HTMLButtonElement;
};

export type InputState = {
  preferredDir: MoveDir;
  placeQueued: boolean;
  needleSlotQueued: -1 | 0 | 1 | 2;
};
