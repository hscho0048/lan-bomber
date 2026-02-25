import type { PlayerStats } from './constants';

export type PlayerId = string;

export type MoveDir = 'None' | 'Up' | 'Down' | 'Left' | 'Right';
export type GameMode = 'FFA' | 'TEAM';

export type PlayerLifeState = 'Alive' | 'Trapped' | 'Dead';

export type BlockKind = 'SolidWall' | 'SoftBlock';

export type ItemType = 'Speed' | 'Balloon' | 'Power' | 'Needle';

export interface XY {
  x: number;
  y: number;
}

export interface MapPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  grid: string[]; // length=height, string length=width; '#'=SolidWall '.'=Empty
  spawnPoints: XY[]; // at least 6 recommended
}

export type NetMessage<TType extends string, TPayload> = {
  type: TType;
  payload: TPayload;
};

// -------------------------
// Client -> Server
// -------------------------

export type JoinRoomPayload = { name: string };
export type ReadyPayload = { isReady: boolean };
export type InputPayload = {
  seq: number;
  tick: number;
  moveDir: MoveDir;
  placeBalloon: boolean;
  useNeedleSlot: -1 | 0 | 1 | 2;
};

export type SetModePayload = { mode: GameMode };
export type SetMapPayload = { mapId: string };
export type SetTeamPayload = { team: number };
export type StartRequestPayload = {};
export type PingPayload = { clientTime: number };

export type ClientToServerMessage =
  | NetMessage<'JoinRoom', JoinRoomPayload>
  | NetMessage<'Ready', ReadyPayload>
  | NetMessage<'Input', InputPayload>
  | NetMessage<'SetMode', SetModePayload>
  | NetMessage<'SetMap', SetMapPayload>
  | NetMessage<'SetTeam', SetTeamPayload>
  | NetMessage<'StartRequest', StartRequestPayload>
  | NetMessage<'Ping', PingPayload>;

// -------------------------
// Server -> Client
// -------------------------

export interface RoomPlayerInfo {
  id: PlayerId;
  name: string;
  team: number;
}

export interface RoomStatePayload {
  players: RoomPlayerInfo[];
  readyStates: Record<PlayerId, boolean>;
  hostId: PlayerId;
  mode: GameMode;
  mapId: string;
}

export interface StartGamePayload {
  seed: number;
  mapId: string;
  startTick: number;
  mode: GameMode;
}

export interface PlayerSnapshot {
  id: PlayerId;
  name: string;
  x: number; // tile-space (0..width), center-based
  y: number;
  tileX: number;
  tileY: number;
  state: PlayerLifeState;
  team: number;
  stats: PlayerStats;
  invulnerable: boolean;
}

export interface BalloonSnapshot {
  id: string;
  x: number;
  y: number;
  ownerId: PlayerId;
  explodeTick: number;
  power: number;
}

export interface ExplosionSnapshot {
  id: string;
  originX: number;
  originY: number;
  tiles: XY[];
  endTick: number;
}

export interface ItemSnapshot {
  id: string;
  x: number;
  y: number;
  itemType: ItemType;
}

export interface BlockSnapshot {
  x: number;
  y: number;
  kind: BlockKind;
}

export interface SnapshotPayload {
  tick: number;
  players: PlayerSnapshot[];
  balloons: BalloonSnapshot[];
  explosions: ExplosionSnapshot[];
  items: ItemSnapshot[];
  blocks: BlockSnapshot[];
}

export type GameEventType =
  | 'BalloonPlaced'
  | 'BalloonExploded'
  | 'BlockDestroyed'
  | 'ItemSpawned'
  | 'ItemPicked'
  | 'PlayerTrapped'
  | 'PlayerRescued'
  | 'PlayerDied'
  | 'RoundEnded'
  | 'ServerNotice';

export interface EventMessagePayload {
  tick: number;
  type: GameEventType;
  payload: any;
}

export type WelcomePayload = { playerId: PlayerId; protocol: number };
export type PongPayload = { clientTime: number; serverTime: number; tick: number };
export type ServerErrorPayload = { message: string };

export type ServerToClientMessage =
  | NetMessage<'Welcome', WelcomePayload>
  | NetMessage<'RoomState', RoomStatePayload>
  | NetMessage<'StartGame', StartGamePayload>
  | NetMessage<'Snapshot', SnapshotPayload>
  | NetMessage<'Event', EventMessagePayload>
  | NetMessage<'Pong', PongPayload>
  | NetMessage<'ServerError', ServerErrorPayload>;

// -------------------------
// UDP Discovery (optional)
// -------------------------
export interface ServerAnnouncePayload {
  roomName: string;
  playerCount: number;
  wsPort: number;
  hostIpHint: string; // e.g. "192.168.0.10"
  mode: GameMode;
  mapId: string;
}

export type ServerAnnounceMessage = NetMessage<'ServerAnnounce', ServerAnnouncePayload>;
