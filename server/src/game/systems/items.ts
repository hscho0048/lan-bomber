import type { ItemType } from '@lan-bomber/shared';

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function rollItemType(nextRand: () => number): ItemType {
  const r = nextRand();
  if (r < 0.25) return 'Speed';
  if (r < 0.5) return 'Balloon';
  if (r < 0.75) return 'Power';
  return 'Needle';
}

export function findItemAt<T extends { x: number; y: number }>(
  items: Map<string, T>,
  x: number,
  y: number
): string | null {
  for (const [id, it] of items.entries()) {
    if (it.x === x && it.y === y) return id;
  }
  return null;
}

export function applyItem(
  player: { stats: { speed: number; balloonCount: number; power: number; needle: number } },
  item: { itemType: ItemType }
): void {
  switch (item.itemType) {
    case 'Speed':
      player.stats.speed = clamp(player.stats.speed + 0.5, 1.0, 6.0);
      break;
    case 'Balloon':
      player.stats.balloonCount = clamp(player.stats.balloonCount + 1, 1, 6);
      break;
    case 'Power':
      player.stats.power = clamp(player.stats.power + 1, 1, 6);
      break;
    case 'Needle':
      player.stats.needle = clamp(player.stats.needle + 1, 0, 3);
      break;
  }
}
