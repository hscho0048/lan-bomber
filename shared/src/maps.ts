import type { MapPreset } from './messages';

// JSON imports (compiled via resolveJsonModule)
import map1 from './maps/map1.json';
import map2 from './maps/map2.json';

export const MAP_PRESETS: Record<string, MapPreset> = {
  [map1.id]: map1 as MapPreset,
  [map2.id]: map2 as MapPreset
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
