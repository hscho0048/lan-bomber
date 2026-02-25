import { TICK_RATE, type MoveDir } from '@lan-bomber/shared';

export type Tile = 'SolidWall' | 'SoftBlock' | 'Empty';

export interface MoveStateLike {
  moving: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  dir: MoveDir;
  t: number;
}

export interface PlayerLike {
  id: string;
  inputDir: MoveDir;
  stats: { speed: number };
  move: MoveStateLike;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function keyXY(x: number, y: number): string {
  return `${x},${y}`;
}

function dirToDelta(dir: MoveDir): { dx: number; dy: number } {
  switch (dir) {
    case 'Up':
      return { dx: 0, dy: -1 };
    case 'Down':
      return { dx: 0, dy: 1 };
    case 'Left':
      return { dx: -1, dy: 0 };
    case 'Right':
      return { dx: 1, dy: 0 };
    default:
      return { dx: 0, dy: 0 };
  }
}

export function canEnterTile(
  x: number,
  y: number,
  playerId: string,
  ctx: {
    width: number;
    height: number;
    grid: Tile[][];
    balloonsByPos: Map<string, string>;
    balloons: Map<string, { passableBy: Set<string> }>;
  }
): boolean {
  if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) return false;
  if (ctx.grid[y][x] !== 'Empty') return false;

  const bid = ctx.balloonsByPos.get(keyXY(x, y));
  if (!bid) return true;

  const balloon = ctx.balloons.get(bid);
  if (!balloon) return true;
  return balloon.passableBy.has(playerId);
}

export function getPlayerOccupyTile(p: { move: MoveStateLike }): { x: number; y: number } {
  if (!p.move.moving) return { x: p.move.fromX, y: p.move.fromY };
  return p.move.t >= 0.5 ? { x: p.move.toX, y: p.move.toY } : { x: p.move.fromX, y: p.move.fromY };
}

export function getPlayerRenderPos(p: { move: MoveStateLike }): { x: number; y: number } {
  const fx = p.move.fromX + 0.5;
  const fy = p.move.fromY + 0.5;
  if (!p.move.moving) return { x: fx, y: fy };
  const tx = p.move.toX + 0.5;
  const ty = p.move.toY + 0.5;
  const t = clamp(p.move.t, 0, 1);
  return { x: fx + (tx - fx) * t, y: fy + (ty - fy) * t };
}

export function simulateMovement(
  p: PlayerLike,
  ctx: {
    width: number;
    height: number;
    grid: Tile[][];
    balloonsByPos: Map<string, string>;
    balloons: Map<string, { passableBy: Set<string> }>;
  }
): void {
  const speedTilesPerSec = clamp(p.stats.speed, 1.0, 10.0);
  const step = speedTilesPerSec / TICK_RATE;

  if (p.move.moving) {
    p.move.t += step;

    while (p.move.moving && p.move.t >= 1) {
      const prevX = p.move.fromX;
      const prevY = p.move.fromY;
      p.move.fromX = p.move.toX;
      p.move.fromY = p.move.toY;
      p.move.t -= 1;

      const prevKey = keyXY(prevX, prevY);
      const balloonId = ctx.balloonsByPos.get(prevKey);
      if (balloonId) {
        const b = ctx.balloons.get(balloonId);
        if (b) b.passableBy.delete(p.id);
      }

      const dir = p.inputDir;
      if (dir === 'None') {
        p.move.moving = false;
        p.move.toX = p.move.fromX;
        p.move.toY = p.move.fromY;
        p.move.dir = 'None';
        p.move.t = 0;
        break;
      }

      const { dx, dy } = dirToDelta(dir);
      const nx = p.move.fromX + dx;
      const ny = p.move.fromY + dy;
      if (canEnterTile(nx, ny, p.id, ctx)) {
        p.move.toX = nx;
        p.move.toY = ny;
        p.move.dir = dir;
        p.move.moving = true;
      } else {
        p.move.moving = false;
        p.move.toX = p.move.fromX;
        p.move.toY = p.move.fromY;
        p.move.dir = 'None';
        p.move.t = 0;
        break;
      }
    }

    return;
  }

  const dir = p.inputDir;
  if (dir === 'None') return;
  const { dx, dy } = dirToDelta(dir);
  const nx = p.move.fromX + dx;
  const ny = p.move.fromY + dy;
  if (!canEnterTile(nx, ny, p.id, ctx)) return;

  p.move.moving = true;
  p.move.dir = dir;
  p.move.toX = nx;
  p.move.toY = ny;
  p.move.t = step;
}
