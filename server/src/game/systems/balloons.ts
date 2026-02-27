import {
  EXPLOSION_DURATION_TICKS,
  ITEM_DROP_CHANCE,
  TRAP_DURATION_TICKS,
  type GameEventType,
  type ItemType,
  type MoveDir,
  type PlayerLifeState,
  type XY
} from '@lan-bomber/shared';
import type { Tile } from './movement';

// ========================
// Structural interfaces
// ========================

export interface BalloonLike {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  explodeTick: number;
  power: number;
  passableBy: Set<string>;
}

export interface ExplosionLike {
  id: string;
  originX: number;
  originY: number;
  tiles: XY[];
  endTick: number;
}

export interface ItemLike {
  id: string;
  x: number;
  y: number;
  itemType: ItemType;
}

export interface PlayerLikeForBalloon {
  id: string;
  state: PlayerLifeState;
  invulnUntilTick: number;
  trappedUntilTick: number;
  inputDir: MoveDir;
  placeBalloonQueued: number;
  move: {
    moving: boolean;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    dir: MoveDir;
    t: number;
  };
}

export interface BalloonContext {
  tick: number;
  width: number;
  height: number;
  grid: Tile[][];
  balloons: Map<string, BalloonLike>;
  balloonsByPos: Map<string, string>;
  explosions: Map<string, ExplosionLike>;
  items: Map<string, ItemLike>;
  players: Map<string, PlayerLikeForBalloon>;
  nextExplosionId: () => string;
  nextItemId: () => string;
  sendEvent: (type: GameEventType, payload: any) => void;
  getPlayerOccupyTile: (p: PlayerLikeForBalloon) => XY;
  findItemAt: (x: number, y: number) => string | null;
  rollItemType: () => ItemType;
  random: () => number; // seeded RNG for determinism
  /** BOSS mode: if set, only balloons whose ownerId passes this check can trap players. */
  canTrapPlayer?: (ownerId: string) => boolean;
  /** BOSS mode: called for each explosion tile so server can apply boss HP damage.
   *  ownerId is the balloon owner — boss does not take damage from its own balloons. */
  checkBossHit?: (tile: XY, explosionId: string, ownerId: string) => void;
}

// ========================
// Pure utility
// ========================

function keyXY(x: number, y: number): string {
  return `${x},${y}`;
}

// ========================
// Exported functions
// ========================

export function computeExplosionTiles(
  grid: Tile[][],
  width: number,
  height: number,
  ox: number,
  oy: number,
  power: number
): XY[] {
  const tiles: XY[] = [{ x: ox, y: oy }];

  const dirs: Array<{ dx: number; dy: number }> = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 }
  ];

  for (const { dx, dy } of dirs) {
    for (let i = 1; i <= power; i++) {
      const x = ox + dx * i;
      const y = oy + dy * i;
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      const tile = grid[y][x];
      if (tile === 'SolidWall') break;
      tiles.push({ x, y });
      if (tile === 'SoftBlock') break;
    }
  }

  return tiles;
}

export function explodeBalloon(
  ctx: BalloonContext,
  balloon: BalloonLike,
  pending: string[],
  scheduled: Set<string>
): void {
  const { x: ox, y: oy } = balloon;

  ctx.balloons.delete(balloon.id);
  ctx.balloonsByPos.delete(keyXY(ox, oy));

  const tiles = computeExplosionTiles(ctx.grid, ctx.width, ctx.height, ox, oy, balloon.power);
  const exId = ctx.nextExplosionId();
  const explosion: ExplosionLike = {
    id: exId,
    originX: ox,
    originY: oy,
    tiles,
    endTick: ctx.tick + EXPLOSION_DURATION_TICKS
  };
  ctx.explosions.set(exId, explosion);

  ctx.sendEvent('BalloonExploded', { balloonId: balloon.id, x: ox, y: oy, tiles });

  // Apply effects: trap players, chain balloons, hit boss
  for (const t of tiles) {
    if (ctx.checkBossHit) ctx.checkBossHit(t, exId, balloon.ownerId);

    const itemId = ctx.findItemAt(t.x, t.y);
    if (itemId) ctx.items.delete(itemId);

    for (const p of ctx.players.values()) {
      if (p.state !== 'Alive') continue;
      if (ctx.tick < p.invulnUntilTick) continue;
      const occ = ctx.getPlayerOccupyTile(p);
      if (occ.x === t.x && occ.y === t.y) {
        // In BOSS mode, only boss-owned balloons can trap players
        if (ctx.canTrapPlayer && !ctx.canTrapPlayer(balloon.ownerId)) continue;
        p.state = 'Trapped';
        p.trappedUntilTick = ctx.tick + TRAP_DURATION_TICKS;
        p.inputDir = 'None';
        p.placeBalloonQueued = 0;
        const occ2 = ctx.getPlayerOccupyTile(p);
        p.move = { moving: false, fromX: occ2.x, fromY: occ2.y, toX: occ2.x, toY: occ2.y, dir: 'None', t: 0 };
        ctx.sendEvent('PlayerTrapped', { playerId: p.id, x: t.x, y: t.y });
      }
    }

    const bid = ctx.balloonsByPos.get(keyXY(t.x, t.y));
    if (bid) {
      const b2 = ctx.balloons.get(bid);
      if (b2 && !scheduled.has(b2.id)) {
        b2.explodeTick = ctx.tick;
        pending.push(b2.id);
        scheduled.add(b2.id);
      }
    }
  }

  // Destroy soft blocks and spawn items
  for (const t of tiles) {
    if (ctx.grid[t.y][t.x] === 'SoftBlock') {
      ctx.grid[t.y][t.x] = 'Empty';
      ctx.sendEvent('BlockDestroyed', { x: t.x, y: t.y });

      if (ctx.random() < ITEM_DROP_CHANCE) {
        const itemType = ctx.rollItemType();
        const itemId = ctx.nextItemId();
        const item: ItemLike = { id: itemId, x: t.x, y: t.y, itemType };
        ctx.items.set(itemId, item);
        ctx.sendEvent('ItemSpawned', { id: itemId, x: t.x, y: t.y, itemType });
      }
    }
  }
}

export function processBalloonExplosions(ctx: BalloonContext): void {
  const pending: string[] = [];
  const scheduled = new Set<string>();

  for (const b of ctx.balloons.values()) {
    if (b.explodeTick <= ctx.tick) {
      pending.push(b.id);
      scheduled.add(b.id);
    }
  }

  const sortPending = () => {
    pending.sort((a, b) => {
      const ba = ctx.balloons.get(a);
      const bb = ctx.balloons.get(b);
      if (!ba && !bb) return a.localeCompare(b);
      if (!ba) return 1;
      if (!bb) return -1;
      if (ba.y !== bb.y) return ba.y - bb.y;
      if (ba.x !== bb.x) return ba.x - bb.x;
      return ba.id.localeCompare(bb.id);
    });
  };

  while (pending.length > 0) {
    sortPending();
    const id = pending.shift()!;
    const balloon = ctx.balloons.get(id);
    if (!balloon) continue;
    explodeBalloon(ctx, balloon, pending, scheduled);
  }
}
