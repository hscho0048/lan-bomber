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
  // Screens
  mainScreen: HTMLDivElement;
  roomScreen: HTMLDivElement;
  gameScreen: HTMLDivElement;
  resultScreen: HTMLDivElement;

  // Main screen
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
  hostIpHint: HTMLDivElement;
  log: HTMLPreElement;

  // Room screen
  roomTitle: HTMLSpanElement;
  btnLeaveRoom: HTMLButtonElement;
  playerSlots: HTMLDivElement[];    // slot0 - slot5
  slotImgs: HTMLDivElement[];       // slotImg0 - slotImg5
  slotNames: HTMLDivElement[];      // slotName0 - slotName5
  slotBadges: HTMLDivElement[];     // slotBadge0 - slotBadge5
  readyToggle: HTMLInputElement;
  hostControls: HTMLDivElement;
  timerSelect: HTMLSelectElement;
  modeSelect: HTMLSelectElement;
  mapSelect: HTMLSelectElement;
  btnStart: HTMLButtonElement;
  chatMessages: HTMLDivElement;
  chatInput: HTMLInputElement;
  btnChatSend: HTMLButtonElement;

  // Game screen
  canvas: HTMLCanvasElement;
  hudTop: HTMLDivElement;
  hudTimer: HTMLDivElement;
  countdown: HTMLDivElement;
  debug: HTMLDivElement;
  hudNeedle: HTMLDivElement;
  btnLeave: HTMLButtonElement;

  // Result screen
  resultList: HTMLDivElement;
  btnReturnLobby: HTMLButtonElement;
};

export type InputState = {
  preferredDir: MoveDir;
  placeQueued: boolean;
  needleSlotQueued: -1 | 0 | 1 | 2;
};
