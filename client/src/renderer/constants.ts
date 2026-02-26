// ========================
// Grid / Block colours
// ========================
export const GRID_BG       = '#070e1a';
export const GRID_LINE     = '#0d1a2e';
export const WALL_FILL     = '#1a2740';
export const WALL_BORDER   = '#111e30';
export const WALL_HIGHLIGHT = '#2a3d58';
export const SOFT_FILL     = '#4a3118';
export const SOFT_BORDER   = '#3a2410';
export const SOFT_CRATE    = '#5a3c20';

// ========================
// Player fallback colours (by colorIndex)
// ========================
export const PLAYER_FALLBACK = [
  '#3b82f6', // 0 blue
  '#22c55e', // 1 green
  '#a855f7', // 2 purple
  '#ef4444', // 3 red
  '#f1f5f9', // 4 white
  '#eab308'  // 5 yellow
] as const;

// ========================
// Team colours
// ========================
export const TEAM_A_COLOR  = '#93c5fd';
export const TEAM_B_COLOR  = '#fca5a5';
export const TEAM_A_BG     = 'rgba(30,58,95,0.92)';
export const TEAM_A_BORDER = '#60a5fa';
export const TEAM_B_BG     = 'rgba(74,26,26,0.92)';
export const TEAM_B_BORDER = '#f87171';

// ========================
// Sprite-size ratios (× tileSize)
// ========================
export const S = {
  SPRITE:        0.45,  // character radius (half-size of drawn sprite)
  ITEM_PAD:      0.12,
  BALLOON_PAD:   0.05,
  BADGE_R:       0.16,
  BADGE_X:       0.33,
  BADGE_Y:       0.35,
  RING_TRAPPED:  0.46,
  RING_INVULN:   0.52,
  NAME_Y:        0.48,
  STATS_Y:       0.48,
} as const;

// ========================
// Fuse / explosion
// ========================
export const FUSE_WARN = 0.3; // switch to red below this fuse-remaining ratio
