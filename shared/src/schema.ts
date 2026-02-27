import {
  type ClientToServerMessage,
  type GameMode,
  type MoveDir,
  type NetMessage,
  type ServerAnnounceMessage,
  type ServerToClientMessage
} from './messages';
import { NICKNAME_MAX_LEN, ROOM_NAME_MAX_LEN } from './constants';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isInt(v: unknown): v is number {
  return isNumber(v) && Number.isInteger(v);
}

function isMoveDir(v: unknown): v is MoveDir {
  return v === 'None' || v === 'Up' || v === 'Down' || v === 'Left' || v === 'Right';
}

function isGameMode(v: unknown): v is GameMode {
  return v === 'FFA' || v === 'TEAM';
}

function isNetMessage(v: unknown): v is NetMessage<string, unknown> {
  return isRecord(v) && isString(v.type) && 'payload' in v;
}

export function safeJsonParse(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function stringifyMessage(msg: NetMessage<string, any>): string {
  return JSON.stringify(msg);
}

export function parseClientMessage(raw: string): ClientToServerMessage | null {
  const v = safeJsonParse(raw);
  if (!isNetMessage(v)) return null;

  const { type, payload } = v;
  if (!isRecord(payload)) return null;

  switch (type) {
    case 'JoinRoom': {
      const name = payload.name;
      if (!isString(name)) return null;
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > NICKNAME_MAX_LEN) return null;
      const rn = isString(payload.roomName) ? payload.roomName.trim().slice(0, ROOM_NAME_MAX_LEN) : undefined;
      return { type: 'JoinRoom', payload: { name: trimmed, ...(rn ? { roomName: rn } : {}) } };
    }
    case 'Ready': {
      if (!isBoolean(payload.isReady)) return null;
      return { type: 'Ready', payload: { isReady: payload.isReady } };
    }
    case 'Input': {
      if (!isInt(payload.seq) || payload.seq < 0) return null;
      if (!isInt(payload.tick) || payload.tick < 0) return null;
      if (!isMoveDir(payload.moveDir)) return null;
      if (!isBoolean(payload.placeBalloon)) return null;
      const useNeedleSlotRaw = payload.useNeedleSlot;
      const useNeedleSlot =
        useNeedleSlotRaw === undefined
          ? -1
          : isInt(useNeedleSlotRaw) && useNeedleSlotRaw >= -1 && useNeedleSlotRaw <= 2
            ? useNeedleSlotRaw
            : null;
      if (useNeedleSlot === null) return null;
      return {
        type: 'Input',
        payload: {
          seq: payload.seq,
          tick: payload.tick,
          moveDir: payload.moveDir,
          placeBalloon: payload.placeBalloon,
          useNeedleSlot: useNeedleSlot as -1 | 0 | 1 | 2
        }
      };
    }
    case 'SetMode': {
      if (!isGameMode(payload.mode)) return null;
      return { type: 'SetMode', payload: { mode: payload.mode } };
    }
    case 'SetMap': {
      if (!isString(payload.mapId) || payload.mapId.trim().length < 1 || payload.mapId.length > ROOM_NAME_MAX_LEN) {
        return null;
      }
      return { type: 'SetMap', payload: { mapId: payload.mapId.trim() } };
    }
    case 'SetTeam': {
      if (!isInt(payload.team)) return null;
      return { type: 'SetTeam', payload: { team: payload.team } };
    }
    case 'SetGameDuration': {
      if (!isInt(payload.seconds)) return null;
      const secs = payload.seconds as number;
      const valid = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
      if (!valid.includes(secs)) return null;
      return { type: 'SetGameDuration', payload: { seconds: secs } };
    }
    case 'StartRequest': {
      return { type: 'StartRequest', payload: {} };
    }
    case 'ShuffleTeams': {
      return { type: 'ShuffleTeams', payload: {} };
    }
    case 'ChatSend': {
      if (!isString(payload.text)) return null;
      const text = payload.text.trim().slice(0, 100);
      if (text.length < 1) return null;
      return { type: 'ChatSend', payload: { text } };
    }
    case 'Ping': {
      if (!isNumber(payload.clientTime)) return null;
      return { type: 'Ping', payload: { clientTime: payload.clientTime } };
    }
    case 'SetSkin': {
      const skin = isString(payload.skin) ? payload.skin.trim().slice(0, 32) : '';
      return { type: 'SetSkin', payload: { skin } };
    }
    default:
      return null;
  }
}

export function parseServerMessage(raw: string): ServerToClientMessage | null {
  const v = safeJsonParse(raw);
  if (!isNetMessage(v)) return null;

  const { type, payload } = v;
  if (!isRecord(payload)) return null;

  switch (type) {
    case 'Welcome': {
      if (!isString(payload.playerId)) return null;
      if (!isInt(payload.protocol)) return null;
      return { type: 'Welcome', payload: { playerId: payload.playerId, protocol: payload.protocol } };
    }
    case 'RoomState': {
      if (!Array.isArray(payload.players)) return null;
      if (!isRecord(payload.readyStates)) return null;
      if (!isString(payload.hostId)) return null;
      if (!isGameMode(payload.mode)) return null;
      if (!isString(payload.mapId)) return null;

      for (const p of payload.players) {
        if (!isRecord(p)) return null;
        if (!isString(p.id) || !isString(p.name) || !isInt(p.team)) return null;
      }

      for (const [k, val] of Object.entries(payload.readyStates)) {
        if (!isString(k) || !isBoolean(val)) return null;
      }

      const gameDurationSeconds = isInt(payload.gameDurationSeconds) ? (payload.gameDurationSeconds as number) : 120;

      return {
        type: 'RoomState',
        payload: {
          players: payload.players.map((p) => ({
            id: (p as any).id,
            name: (p as any).name,
            team: (p as any).team,
            colorIndex: isInt((p as any).colorIndex) ? (p as any).colorIndex : 0,
            skin: isString((p as any).skin) ? (p as any).skin : ''
          })),
          readyStates: payload.readyStates as Record<string, boolean>,
          hostId: payload.hostId,
          mode: payload.mode,
          mapId: payload.mapId,
          gameDurationSeconds
        }
      };
    }
    case 'StartGame': {
      if (!isInt(payload.seed)) return null;
      if (!isString(payload.mapId)) return null;
      if (!isInt(payload.startTick)) return null;
      if (!isGameMode(payload.mode)) return null;
      const gameDurationSeconds = isInt(payload.gameDurationSeconds) ? (payload.gameDurationSeconds as number) : 120;
      const playerColors = isRecord(payload.playerColors) ? (payload.playerColors as Record<string, number>) : {};
      const playerSkins = isRecord(payload.playerSkins) ? (payload.playerSkins as Record<string, string>) : {};
      return {
        type: 'StartGame',
        payload: {
          seed: payload.seed,
          mapId: payload.mapId,
          startTick: payload.startTick,
          mode: payload.mode,
          gameDurationSeconds,
          playerColors,
          playerSkins
        }
      };
    }
    case 'Snapshot': {
      // Snapshot is big; validate minimally.
      if (!isInt(payload.tick)) return null;
      if (!Array.isArray(payload.players)) return null;
      if (!Array.isArray(payload.balloons)) return null;
      if (!Array.isArray(payload.explosions)) return null;
      if (!Array.isArray(payload.items)) return null;
      if (!Array.isArray(payload.blocks)) return null;
      return { type: 'Snapshot', payload: payload as any };
    }
    case 'Event': {
      if (!isInt(payload.tick)) return null;
      if (!isString(payload.type)) return null;
      return {
        type: 'Event',
        payload: {
          tick: payload.tick,
          type: payload.type as any,
          payload: (payload as any).payload
        }
      };
    }
    case 'Chat': {
      if (!isString(payload.playerId)) return null;
      if (!isString(payload.playerName)) return null;
      if (!isString(payload.text)) return null;
      const colorIndex = isInt(payload.colorIndex) ? (payload.colorIndex as number) : 0;
      return {
        type: 'Chat',
        payload: {
          playerId: payload.playerId,
          playerName: payload.playerName,
          colorIndex,
          text: payload.text
        }
      };
    }
    case 'Pong': {
      if (!isNumber(payload.clientTime)) return null;
      if (!isNumber(payload.serverTime)) return null;
      if (!isInt(payload.tick)) return null;
      return {
        type: 'Pong',
        payload: {
          clientTime: payload.clientTime,
          serverTime: payload.serverTime,
          tick: payload.tick
        }
      };
    }
    case 'ServerError': {
      if (!isString(payload.message)) return null;
      return { type: 'ServerError', payload: { message: payload.message } };
    }
    default:
      return null;
  }
}

export function parseServerAnnounceMessage(raw: string): ServerAnnounceMessage | null {
  const v = safeJsonParse(raw);
  if (!isNetMessage(v)) return null;
  if (v.type !== 'ServerAnnounce') return null;
  const payload = v.payload;
  if (!isRecord(payload)) return null;

  if (!isString(payload.roomName) || payload.roomName.length < 1 || payload.roomName.length > ROOM_NAME_MAX_LEN) return null;
  if (!isInt(payload.playerCount) || payload.playerCount < 0) return null;
  if (!isInt(payload.wsPort) || payload.wsPort < 1 || payload.wsPort > 65535) return null;
  if (!isString(payload.hostIpHint)) return null;
  if (!isGameMode(payload.mode)) return null;
  if (!isString(payload.mapId)) return null;

  return {
    type: 'ServerAnnounce',
    payload: {
      roomName: payload.roomName,
      playerCount: payload.playerCount,
      wsPort: payload.wsPort,
      hostIpHint: payload.hostIpHint,
      mode: payload.mode,
      mapId: payload.mapId
    }
  };
}
