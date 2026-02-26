export const MAX_PLAYERS = 6;

export const TICK_RATE = 60; // 60Hz simulation
export const SNAPSHOT_RATE = 20; // 20Hz snapshots
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_INTERVAL_TICKS = Math.round(TICK_RATE / SNAPSHOT_RATE); // 3

export const DEFAULT_WS_PORT = 3000;
export const DEFAULT_UDP_ANNOUNCE_PORT = 41234;

export const BALLOON_FUSE_MS = 2500;
export const BALLOON_FUSE_TICKS = Math.round(BALLOON_FUSE_MS / TICK_MS); // ~150

export const EXPLOSION_DURATION_MS = 500;
export const EXPLOSION_DURATION_TICKS = Math.max(1, Math.round(EXPLOSION_DURATION_MS / TICK_MS));

export const TRAP_DURATION_MS = 8000;
export const TRAP_DURATION_TICKS = Math.max(1, Math.round(TRAP_DURATION_MS / TICK_MS));

export const RESCUE_INVULN_MS = 1000;
export const RESCUE_INVULN_TICKS = Math.max(1, Math.round(RESCUE_INVULN_MS / TICK_MS));

export interface PlayerStats {
  speed: number; // tiles per second
  balloonCount: number;
  power: number;
  needle: number;
}

export const DEFAULT_STATS: PlayerStats = {
  speed: 3.0,
  balloonCount: 1,
  power: 1,
  needle: 0
};

export const STAT_CAPS: PlayerStats = {
  speed: 6.0,
  balloonCount: 6,
  power: 6,
  needle: 3
};

export const ITEM_DROP_CHANCE = 0.35;

export const SOFTBLOCK_FILL_PROB = 0.68;

export const NICKNAME_MAX_LEN = 16;
export const ROOM_NAME_MAX_LEN = 24;

export const INPUT_SEND_RATE = 60; // client sends input at 60Hz

export const PROTOCOL_VERSION = 1;

// Rendering helpers (client can override)
export const TILE_SIZE_PX = 40;

// Character color names (index 0-5)
export const CHAR_COLORS = ['blue', 'green', 'purple', 'red', 'white', 'yellow'] as const;
export type CharColor = (typeof CHAR_COLORS)[number];

// Game duration options (seconds)
export const GAME_DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300] as const;
