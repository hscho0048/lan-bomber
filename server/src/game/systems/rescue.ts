import { RESCUE_INVULN_TICKS, type GameEventType, type MoveDir, type PlayerLifeState } from '@lan-bomber/shared';
import type { MoveStateLike } from './movement';

export interface PlayerLikeForRescue {
  id: string;
  state: PlayerLifeState;
  team: number;
  trappedUntilTick: number;
  invulnUntilTick: number;
  move: MoveStateLike;
  inputDir: MoveDir;
  placeBalloonQueued: number;
}

export interface RescueContext {
  tick: number;
  mode: string;
  players: Map<string, PlayerLikeForRescue>;
  deathOrder: string[];
  getPlayerOccupyTile: (p: PlayerLikeForRescue) => { x: number; y: number };
  sendEvent: (type: GameEventType, payload: any) => void;
}

/** TEAM/BOSS mode: alive teammate standing on same tile rescues a trapped player. */
export function checkRescues(ctx: RescueContext): void {
  if (ctx.mode !== 'TEAM' && ctx.mode !== 'BOSS') return;

  for (const trapped of ctx.players.values()) {
    if (trapped.state !== 'Trapped') continue;
    const tpos = ctx.getPlayerOccupyTile(trapped);

    for (const rescuer of ctx.players.values()) {
      if (rescuer.state !== 'Alive') continue;
      if (rescuer.team !== trapped.team) continue;
      const rpos = ctx.getPlayerOccupyTile(rescuer);
      if (rpos.x === tpos.x && rpos.y === tpos.y) {
        trapped.state = 'Alive';
        trapped.invulnUntilTick = ctx.tick + RESCUE_INVULN_TICKS;
        trapped.trappedUntilTick = -1;
        ctx.sendEvent('PlayerRescued', { playerId: trapped.id, byPlayerId: rescuer.id });
        break;
      }
    }
  }
}

/** Kill trapped players instantly when an enemy walks onto their tile. */
export function checkTrapDeaths(ctx: RescueContext): void {
  for (const trapped of ctx.players.values()) {
    if (trapped.state !== 'Trapped') continue;
    const tpos = ctx.getPlayerOccupyTile(trapped);

    for (const other of ctx.players.values()) {
      if (other.id === trapped.id) continue;
      if (other.state !== 'Alive') continue;
      // In TEAM or BOSS mode, same-team players never kill trapped allies
      if ((ctx.mode === 'TEAM' || ctx.mode === 'BOSS') && other.team === trapped.team) continue;
      const opos = ctx.getPlayerOccupyTile(other);
      if (opos.x === tpos.x && opos.y === tpos.y) {
        trapped.state = 'Dead';
        if (!ctx.deathOrder.includes(trapped.id)) ctx.deathOrder.push(trapped.id);
        ctx.sendEvent('PlayerDied', { playerId: trapped.id });
        break;
      }
    }
  }
}

/** Kill trapped players whose 8-second timer has expired. */
export function checkTrapExpiry(ctx: RescueContext): void {
  for (const p of ctx.players.values()) {
    if (p.state !== 'Trapped') continue;
    if (p.trappedUntilTick >= 0 && ctx.tick >= p.trappedUntilTick) {
      p.state = 'Dead';
      if (!ctx.deathOrder.includes(p.id)) ctx.deathOrder.push(p.id);
      ctx.sendEvent('PlayerDied', { playerId: p.id });
    }
  }
}
