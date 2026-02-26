import { SNAPSHOT_RATE } from '@lan-bomber/shared';
import type { RoomStatePayload, SnapshotPayload, StartGamePayload } from '@lan-bomber/shared';

export type Notification = {
  text: string;
  createdAt: number;
  ttl: number; // milliseconds
};

export type SnapState = {
  prev: SnapshotPayload | null;
  curr: SnapshotPayload | null;
  interpStart: number;
  interpDuration: number;
};

export type GameState = {
  ws: WebSocket | null;
  myId: string | null;
  roomState: RoomStatePayload | null;
  startGame: StartGamePayload | null;
  snap: SnapState;
  serverTick: number;
  pingMs: number;
  inputSeq: number;
  lastSentTime: number;
  lastSnapTick: number;
  lastSnapArrival: number;
  currentRoomName: string;
  pendingHostRoomName: string | null;
  notifications: Notification[];
};

export function createGameState(): GameState {
  return {
    ws: null,
    myId: null,
    roomState: null,
    startGame: null,
    snap: {
      prev: null,
      curr: null,
      interpStart: 0,
      interpDuration: 1000 / SNAPSHOT_RATE
    },
    serverTick: 0,
    pingMs: 0,
    inputSeq: 0,
    lastSentTime: 0,
    lastSnapTick: 0,
    lastSnapArrival: 0,
    currentRoomName: 'LAN Bomber 방',
    pendingHostRoomName: null,
    notifications: []
  };
}
