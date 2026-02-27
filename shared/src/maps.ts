import type { MapPreset } from './messages';

// JSON imports (compiled via resolveJsonModule)
import map1 from './maps/map1.json';
import map2 from './maps/map2.json';
import map3 from './maps/map3.json';
import map4 from './maps/map4.json';
import map5 from './maps/map5.json';
import map6 from './maps/map6.json';
import boss_arena from './maps/boss_arena.json';

export const MAP_PRESETS: Record<string, MapPreset> = {
  [map1.id]: map1 as MapPreset,
  [map2.id]: map2 as MapPreset,
  [map3.id]: map3 as MapPreset,
  [map4.id]: map4 as MapPreset,
  [map5.id]: map5 as MapPreset,
  [map6.id]: map6 as MapPreset,
  [boss_arena.id]: boss_arena as MapPreset
};

export const MAP_PRESET_LIST: MapPreset[] = Object.values(MAP_PRESETS);

export function getMapPreset(mapId: string): MapPreset {
  const preset = MAP_PRESETS[mapId];
  if (!preset) {
    const ids = Object.keys(MAP_PRESETS);
    throw new Error(`Unknown mapId '${mapId}'. Available: ${ids.join(', ')}`);
  }
  return preset;
}
