import type { ItemType } from '@lan-bomber/shared';

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function rollItemType(nextRand: () => number): ItemType {
  // Speed 18% / Balloon 18% / Power 18% / Needle 12% / Glove 13% / Shield 12% / Switch 9%
  const r = nextRand();
  if (r < 0.18) return 'Speed';
  if (r < 0.36) return 'Balloon';
  if (r < 0.54) return 'Power';
  if (r < 0.66) return 'Needle';
  if (r < 0.79) return 'Glove';
  if (r < 0.91) return 'Shield';
  return 'Switch';
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
  player: { stats: { speed: number; balloonCount: number; power: number } },
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
    // Needle, Glove, Shield, Switch are handled by the server directly
  }
}
