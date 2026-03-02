import { TICK_RATE, CHAR_COLORS, getMapPreset, type ItemType, type SnapshotPayload, type StartGamePayload, type PlayerSnapshot, type BossSnapshot } from '@lan-bomber/shared';
import type { RendererElements } from './types';
import type { Notification, BalloonKickAnim, BossLaserAnim } from './state';
import {
  GRID_BG, GRID_LINE,
  WALL_FILL, WALL_BORDER, WALL_HIGHLIGHT,
  SOFT_FILL, SOFT_BORDER, SOFT_CRATE,
  PLAYER_FALLBACK,
  TEAM_A_COLOR, TEAM_B_COLOR, TEAM_A_BG, TEAM_A_BORDER, TEAM_B_BG, TEAM_B_BORDER,
  S
} from './constants';

// ========================
// Image Cache
// ========================

type ImageCache = Map<string, HTMLImageElement>;
const imageCache: ImageCache = new Map();

// ========================
// Offscreen block canvas cache
// ========================

let blockOffscreen: HTMLCanvasElement | null = null;
let blockOffscreenKey = '';

export function invalidateBlockCache(): void {
  blockOffscreenKey = '';
}

// ========================
// SVG raster cache
// Converts SVG HTMLImageElements to pre-rasterized OffscreenCanvases so
// ctx.drawImage becomes a fast bitmap blit instead of re-rasterizing SVG each frame.
// ========================

const rasterCache = new Map<string, HTMLCanvasElement>();

function getRaster(src: string, w: number, h: number): HTMLCanvasElement | null {
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  const key = `${src}|${iw}|${ih}`;
  const cached = rasterCache.get(key);
  if (cached) return cached;
  const img = imageCache.get(src);
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = iw;
  canvas.height = ih;
  canvas.getContext('2d')!.drawImage(img, 0, 0, iw, ih);
  rasterCache.set(key, canvas);
  return canvas;
}

function loadImg(src: string): HTMLImageElement {
  if (imageCache.has(src)) return imageCache.get(src)!;
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return img;
}

const ALL_SKINS = [...CHAR_COLORS, 'Chiikawa'];

export function preloadAssets() {
  for (const skin of ALL_SKINS) {
    loadImg(`assests/images/characters/${skin}/idle.svg`);
    loadImg(`assests/images/characters/${skin}/panic.svg`);
  }
  const waterballs = ['waterball', 'waterball_green', 'waterball_purple', 'waterball_red', 'waterball_pink', 'waterball_yellow', 'waterball_black'];
  for (const w of waterballs) loadImg(`assests/images/waterball/${w}.svg`);
  loadImg('assests/images/item/item_balloon.svg');
  loadImg('assests/images/item/item_needle.svg');
  loadImg('assests/images/item/item_power.svg');
  loadImg('assests/images/item/item_speed.svg');
  loadImg('assests/images/item/item_glove.svg');
  loadImg('assests/images/item/item_shield.svg');
  loadImg('assests/images/item/item_switch.svg');
  loadImg('assests/action/explode_effects/splash_center.svg');
  loadImg('assests/action/explode_effects/splash_horizontal.svg');
  loadImg('assests/action/explode_effects/splahs_vertical.svg');
  loadImg('assests/images/boss/boss1.svg');
  loadImg('assests/images/boss/boss2.svg');
}

// ========================
// Small helpers
// ========================

const WATERBALL_SVGS = ['waterball', 'waterball_green', 'waterball_purple', 'waterball_red', 'waterball_pink', 'waterball_yellow'];

// Maps skin folder name → waterball colorIndex (fallback to slot colorIndex if not found)
const SKIN_TO_WATERBALL: Record<string, number> = {
  blue: 0, green: 1, purple: 2, red: 3, white: 4, yellow: 5,
};

function getWaterballSrc(colorIndex: number): string {
  return `assests/images/waterball/${WATERBALL_SVGS[colorIndex] ?? 'waterball'}.svg`;
}

function getWaterballSrcForPlayer(
  ownerId: string,
  playerColors: Record<string, number>,
  playerSkins: Record<string, string>
): string {
  if (ownerId === 'boss') return 'assests/images/waterball/waterball_black.svg';
  const skin = playerSkins[ownerId] ?? '';
  const skinIdx = SKIN_TO_WATERBALL[skin];
  const colorIndex = skinIdx !== undefined ? skinIdx : (playerColors[ownerId] ?? 0);
  return getWaterballSrc(colorIndex);
}

function getItemSrc(type: ItemType): string {
  switch (type) {
    case 'Speed':   return 'assests/images/item/item_speed.svg';
    case 'Balloon': return 'assests/images/item/item_balloon.svg';
    case 'Power':   return 'assests/images/item/item_power.svg';
    case 'Needle':  return 'assests/images/item/item_needle.svg';
    case 'Glove':   return 'assests/images/item/item_glove.svg';
    case 'Shield':  return 'assests/images/item/item_shield.svg';
    case 'Switch':  return 'assests/images/item/item_switch.svg';
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function interpolatePlayerPos(
  playerId: string,
  curr: SnapshotPayload,
  prev: SnapshotPayload | null,
  alpha: number
): { x: number; y: number } {
  const c = curr.players.find(p => p.id === playerId);
  if (!c) return { x: 0, y: 0 };
  if (!prev) return { x: c.x, y: c.y };
  const p = prev.players.find(p => p.id === playerId);
  if (!p) return { x: c.x, y: c.y };
  return { x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha };
}

// ========================
// Draw sub-functions
// ========================

function drawBackground(ctx: CanvasRenderingContext2D, mapW: number, mapH: number, tileSize: number): void {
  ctx.fillStyle = GRID_BG;
  ctx.fillRect(0, 0, mapW * tileSize, mapH * tileSize);

  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 0.5;
  for (let y = 0; y <= mapH; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * tileSize); ctx.lineTo(mapW * tileSize, y * tileSize); ctx.stroke();
  }
  for (let x = 0; x <= mapW; x++) {
    ctx.beginPath(); ctx.moveTo(x * tileSize, 0); ctx.lineTo(x * tileSize, mapH * tileSize); ctx.stroke();
  }
}

function drawBlocks(ctx: CanvasRenderingContext2D, blocks: SnapshotPayload['blocks'], tileSize: number): void {
  for (const b of blocks) {
    if (b.kind === 'SolidWall') {
      ctx.fillStyle = WALL_FILL;
      ctx.fillRect(b.x * tileSize, b.y * tileSize, tileSize, tileSize);
      ctx.strokeStyle = WALL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * tileSize + 0.5, b.y * tileSize + 0.5, tileSize - 1, tileSize - 1);
      ctx.fillStyle = WALL_HIGHLIGHT;
      ctx.fillRect(b.x * tileSize + 2, b.y * tileSize + 2, tileSize - 4, 3);
      ctx.fillRect(b.x * tileSize + 2, b.y * tileSize + 2, 3, tileSize - 4);
    } else {
      ctx.fillStyle = SOFT_FILL;
      ctx.fillRect(b.x * tileSize, b.y * tileSize, tileSize, tileSize);
      ctx.strokeStyle = SOFT_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * tileSize + 0.5, b.y * tileSize + 0.5, tileSize - 1, tileSize - 1);
      ctx.strokeStyle = SOFT_CRATE;
      const cx = b.x * tileSize + tileSize / 2;
      const cy = b.y * tileSize + tileSize / 2;
      const p = tileSize * 0.15;
      ctx.strokeRect(b.x * tileSize + p, b.y * tileSize + p, tileSize - p * 2, tileSize - p * 2);
      ctx.beginPath(); ctx.moveTo(cx, b.y * tileSize + p); ctx.lineTo(cx, b.y * tileSize + tileSize - p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x * tileSize + p, cy); ctx.lineTo(b.x * tileSize + tileSize - p, cy); ctx.stroke();
    }
  }
}

function drawItems(ctx: CanvasRenderingContext2D, items: SnapshotPayload['items'], tileSize: number): void {
  for (const it of items) {
    const src = getItemSrc(it.itemType);
    const pad = tileSize * S.ITEM_PAD;
    const sz = tileSize - pad * 2;
    const bmp = getRaster(src, sz, sz);
    if (bmp) {
      ctx.drawImage(bmp, it.x * tileSize + pad, it.y * tileSize + pad, sz, sz);
    } else {
      ctx.fillStyle = '#1f7a5a';
      ctx.beginPath();
      ctx.arc(it.x * tileSize + tileSize / 2, it.y * tileSize + tileSize / 2, tileSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawExplosions(ctx: CanvasRenderingContext2D, explosions: SnapshotPayload['explosions'], tileSize: number): void {
  const centerSrc     = 'assests/action/explode_effects/splash_center.svg';
  const horizontalSrc = 'assests/action/explode_effects/splash_horizontal.svg';
  const verticalSrc   = 'assests/action/explode_effects/splahs_vertical.svg';
  const dirs = ['right', 'down', 'left', 'up'] as const;

  // horizontal SVG 40×28, vertical SVG 28×40 — preserve natural aspect ratio, center on tile
  const short = tileSize * (28 / 40);
  const horizW = tileSize, horizH = short;
  const vertW  = short,    vertH  = tileSize;
  const horizOffY = (tileSize - short) / 2;
  const vertOffX  = (tileSize - short) / 2;

  // Pre-fetch rasterized bitmaps once per call (cached per tileSize)
  const centerBmp = getRaster(centerSrc, tileSize, tileSize);
  const horizBmp  = getRaster(horizontalSrc, horizW, horizH);
  const vertBmp   = getRaster(verticalSrc, vertW, vertH);

  for (const ex of explosions) {
    const dirTiles = new Map<string, Array<{ x: number; y: number }>>();
    for (const t of ex.tiles) {
      if (t.x === ex.originX && t.y === ex.originY) continue;
      const dx = t.x - ex.originX;
      const dy = t.y - ex.originY;
      const dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
      if (!dirTiles.has(dir)) dirTiles.set(dir, []);
      dirTiles.get(dir)!.push({ x: t.x, y: t.y });
    }

    // Center tile
    if (centerBmp) {
      ctx.drawImage(centerBmp, ex.originX * tileSize, ex.originY * tileSize, tileSize, tileSize);
    } else {
      ctx.fillStyle = 'rgba(0,150,255,0.5)';
      ctx.fillRect(ex.originX * tileSize, ex.originY * tileSize, tileSize, tileSize);
    }

    for (const dir of dirs) {
      const tiles = dirTiles.get(dir);
      if (!tiles || tiles.length === 0) continue;
      const isHoriz = dir === 'left' || dir === 'right';
      const bmp = isHoriz ? horizBmp : vertBmp;
      const drawW  = isHoriz ? horizW : vertW;
      const drawH  = isHoriz ? horizH : vertH;
      const offX   = isHoriz ? 0         : vertOffX;
      const offY   = isHoriz ? horizOffY : 0;
      for (const t of tiles) {
        if (bmp) {
          ctx.drawImage(bmp, t.x * tileSize + offX, t.y * tileSize + offY, drawW, drawH);
        } else {
          ctx.fillStyle = 'rgba(0,150,255,0.4)';
          ctx.fillRect(t.x * tileSize, t.y * tileSize, tileSize, tileSize);
        }
      }
    }
  }
}

// Stable per-balloon phase offset so each balloon breathes independently.
const BREATHE_PERIOD = 700; // ms

function balloonPhaseOffset(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % BREATHE_PERIOD);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function drawBalloons(
  ctx: CanvasRenderingContext2D,
  balloons: SnapshotPayload['balloons'],
  tick: number,
  tileSize: number,
  playerColors: Record<string, number>,
  playerSkins: Record<string, string>,
  now: number,
  kickAnims: Map<string, BalloonKickAnim>
): void {
  for (const b of balloons) {
    const balloonSrc = getWaterballSrcForPlayer(b.ownerId, playerColors, playerSkins);
    const pad = tileSize * S.BALLOON_PAD;

    // Kick animation: interpolate render position
    let rx = b.x;
    let ry = b.y;
    const anim = kickAnims.get(b.id);
    if (anim) {
      const progress = (now - anim.startTime) / anim.duration;
      if (progress >= 1) {
        kickAnims.delete(b.id);
      } else {
        const ease = easeOutCubic(progress);
        rx = anim.fromX + (anim.toX - anim.fromX) * ease;
        ry = anim.fromY + (anim.toY - anim.fromY) * ease;
      }
    }

    const breatheT = ((now + balloonPhaseOffset(b.id)) % BREATHE_PERIOD) / BREATHE_PERIOD;
    const factor = (1 - Math.cos(breatheT * Math.PI * 2)) / 2;
    const scaleX = 1 + factor * 0.18;
    const scaleY = 1 - factor * 0.18;

    const size = tileSize - pad * 2;
    const pivotX = rx * tileSize + pad + size * 0.5;
    const pivotY = ry * tileSize + pad + size * 0.9;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-pivotX, -pivotY);

    const balloonBmp = getRaster(balloonSrc, size, size);
    if (balloonBmp) {
      ctx.drawImage(balloonBmp, rx * tileSize + pad, ry * tileSize + pad, size, size);
    } else {
      ctx.fillStyle = '#1b74d1';
      ctx.beginPath();
      ctx.arc(rx * tileSize + tileSize / 2, ry * tileSize + tileSize / 2, tileSize * 0.33, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/** Countdown arc drawn under a trapped player's feet. */
function drawTrapCountdown(
  ctx: CanvasRenderingContext2D,
  player: PlayerSnapshot,
  cx: number,
  cy: number,
  tick: number,
  tileSize: number
): void {
  if (!player.trappedUntilTick) return;
  const remaining = player.trappedUntilTick - tick;
  const total = 8 * TICK_RATE; // TRAP_DURATION_TICKS
  const ratio = clamp01(remaining / total);

  const r = tileSize * S.RING_TRAPPED + 4;
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + ratio * Math.PI * 2;

  // Background ring (dark)
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Remaining time arc (blue → red)
  const hue = Math.round(ratio * 220); // 220=blue, 0=red
  ctx.strokeStyle = `hsl(${hue},90%,60%)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.stroke();
}

function drawPlayers(
  ctx: CanvasRenderingContext2D,
  players: PlayerSnapshot[],
  prevSnap: SnapshotPayload | null,
  currSnap: SnapshotPayload,
  alpha: number,
  tileSize: number,
  startGame: StartGamePayload,
  playerTeams: Record<string, number> | undefined,
  myId: string | null,
  tick: number
): void {
  for (const p of players) {
    const pos = interpolatePlayerPos(p.id, currSnap, prevSnap, alpha);
    const cx = pos.x * tileSize;
    const cy = pos.y * tileSize;
    const colorIndex = (startGame.playerColors ?? {})[p.id] ?? 0;
    const colorName = CHAR_COLORS[colorIndex] ?? 'blue';
    const skinName = p.skin || colorName;

    const spriteSize = tileSize * S.SPRITE * 2;
    if (p.state === 'Dead') {
      ctx.globalAlpha = 0.4;
      const bmpDead = getRaster(`assests/images/characters/${skinName}/idle.svg`, spriteSize, spriteSize);
      if (bmpDead) {
        ctx.drawImage(bmpDead, cx - tileSize * S.SPRITE, cy - tileSize * S.SPRITE, spriteSize, spriteSize);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#cc2222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - tileSize * 0.25, cy - tileSize * 0.25);
      ctx.lineTo(cx + tileSize * 0.25, cy + tileSize * 0.25);
      ctx.moveTo(cx + tileSize * 0.25, cy - tileSize * 0.25);
      ctx.lineTo(cx - tileSize * 0.25, cy + tileSize * 0.25);
      ctx.stroke();
    } else {
      const charSrc = p.state === 'Trapped'
        ? `assests/images/characters/${skinName}/panic.svg`
        : `assests/images/characters/${skinName}/idle.svg`;
      const charBmp = getRaster(charSrc, spriteSize, spriteSize);
      if (charBmp) {
        ctx.drawImage(charBmp, cx - tileSize * S.SPRITE, cy - tileSize * S.SPRITE, spriteSize, spriteSize);
      } else {
        ctx.fillStyle = PLAYER_FALLBACK[colorIndex] ?? PLAYER_FALLBACK[0];
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.state === 'Trapped') {
        ctx.strokeStyle = 'rgba(100, 220, 255, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * S.RING_TRAPPED, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawTrapCountdown(ctx, p, cx, cy, tick, tileSize);
      }

      if (p.invulnerable) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * S.RING_INVULN, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shield ring (golden, thicker than invuln ring)
      if ((p as any).shieldUntilTick !== undefined) {
        ctx.strokeStyle = 'rgba(255, 210, 50, 0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * (S.RING_INVULN + 0.06), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Switch icon (⇄) above player name
      if ((p as any).switchUntilTick !== undefined) {
        ctx.fillStyle = 'rgba(120, 220, 255, 0.95)';
        ctx.font = `bold ${Math.max(10, tileSize * 0.22)}px ui-sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('⇄', cx, cy - tileSize * (S.NAME_Y + 0.18));
      }

      // Team badge
      if (playerTeams) {
        const team = playerTeams[p.id];
        const bFill   = team === 0 ? TEAM_A_BG  : TEAM_B_BG;
        const bStroke = team === 0 ? TEAM_A_BORDER : TEAM_B_BORDER;
        const bx = cx + tileSize * S.BADGE_X;
        const by = cy - tileSize * S.BADGE_Y;
        const br = Math.max(6, tileSize * S.BADGE_R);
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = bFill; ctx.fill();
        ctx.strokeStyle = bStroke; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = bStroke;
        ctx.font = `bold ${Math.max(8, tileSize * 0.17)}px ui-sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(team === 0 ? 'A' : 'B', bx, by);
      }
    }

    // Player name
    const teamColor = playerTeams
      ? (playerTeams[p.id] === 0 ? TEAM_A_COLOR : TEAM_B_COLOR)
      : null;
    ctx.fillStyle = p.state === 'Dead' ? '#666' : (teamColor ?? '#e6edf3');
    ctx.font = `bold ${Math.max(10, tileSize * 0.2)}px ui-sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(p.name, cx, cy - tileSize * S.NAME_Y);

    // Stats (own player only)
    if (p.id === myId && p.state !== 'Dead') {
      ctx.fillStyle = 'rgba(230, 237, 243, 0.7)';
      ctx.font = `${Math.max(9, tileSize * 0.18)}px ui-monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(
        `SPD:${p.stats.speed.toFixed(1)} B:${p.stats.balloonCount} P:${p.stats.power}`,
        cx, cy + tileSize * S.STATS_Y
      );
    }
  }
}

/** Canvas-drawn notification stack (top-centre of the canvas). */
function drawNotifications(
  ctx: CanvasRenderingContext2D,
  notifications: Notification[],
  now: number,
  canvasW: number
): void {
  const active = notifications.filter(n => now - n.createdAt < n.ttl);
  if (active.length === 0) return;
  const toShow = active.slice(-3); // max 3

  const lineH = 28;
  const startY = 12;

  ctx.save();
  ctx.font = 'bold 14px ui-sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  toShow.forEach((n, i) => {
    const age = now - n.createdAt;
    const fadeStart = n.ttl - 1000;
    const alpha = age > fadeStart ? clamp01(1 - (age - fadeStart) / 1000) : 1;

    ctx.globalAlpha = alpha * 0.88;
    const y = startY + i * lineH;
    const textW = ctx.measureText(n.text).width + 24;
    const x = canvasW / 2 - textW / 2;

    ctx.fillStyle = 'rgba(10,15,30,0.85)';
    roundRect(ctx, x, y, textW, 22, 6);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(n.text, canvasW / 2, y + 4);
  });

  ctx.globalAlpha = 1;
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ========================
// Boss rendering
// ========================

function drawBoss(
  ctx: CanvasRenderingContext2D,
  boss: BossSnapshot,
  tileSize: number,
  now: number
): void {
  const skinName = boss.skin ?? 'boss1';
  const bossSrc = `assests/images/boss/${skinName}.svg`;
  // Footprint: 2×2 tiles at (boss.x, boss.y)
  // Draw visually larger: 6 tiles wide × 5.5 tiles tall, bottom-aligned, centered
  const footprintCenterX = (boss.x + 1) * tileSize;
  const footprintBottomY = (boss.y + 2) * tileSize;
  const w = tileSize * 6;
  const h = tileSize * 5.5;
  const bx = footprintCenterX - w / 2;
  const by = footprintBottomY - h;

  ctx.save();

  // Breathing animation (more intense in phase 3 or rage)
  const breatheAmp = (boss.phase === 3 || boss.raging) ? 0.06 : 0.015;
  const breatheT = (now % 900) / 900;
  const breathe = 1 + Math.sin(breatheT * Math.PI * 2) * breatheAmp;
  const pivotX = footprintCenterX;
  const pivotY = footprintBottomY;
  ctx.translate(pivotX, pivotY);
  ctx.scale(breathe, breathe);
  ctx.translate(-pivotX, -pivotY);

  const bossBmp = getRaster(bossSrc, Math.round(w), Math.round(h));
  if (boss.state === 'Dead') {
    ctx.globalAlpha = 0.25;
    if (bossBmp) ctx.drawImage(bossBmp, bx, by, w, h);
  } else if (boss.raging) {
    const flashAlpha = 0.35 * Math.abs(Math.sin((now / 150) * Math.PI));
    if (bossBmp) ctx.drawImage(bossBmp, bx, by, w, h);
    ctx.fillStyle = `rgba(255,0,0,${flashAlpha})`;
    ctx.fillRect(bx, by, w, h);
  } else if (boss.phase === 3 && boss.state === 'Alive') {
    const flashAlpha = 0.18 * Math.abs(Math.sin((now / 250) * Math.PI));
    if (bossBmp) ctx.drawImage(bossBmp, bx, by, w, h);
    ctx.fillStyle = `rgba(255,30,30,${flashAlpha})`;
    ctx.fillRect(bx, by, w, h);
  } else {
    if (bossBmp) {
      ctx.drawImage(bossBmp, bx, by, w, h);
    } else {
      ctx.fillStyle = '#552222';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${tileSize * 2}px ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👾', footprintCenterX, by + h / 2);
    }
  }

  ctx.restore();

  if (boss.state !== 'Alive') return;

  // HP bar
  const hpBarW = tileSize * 6;
  const hpBarH = 10;
  const hpBarX = bx + w / 2 - hpBarW / 2;
  const hpBarY = by - hpBarH - 22;

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(hpBarX - 2, hpBarY - 2, hpBarW + 4, hpBarH + 4);

  const hpRatio = Math.max(0, boss.hp / boss.maxHp);
  const hpColor = boss.raging ? '#ff2200' : (hpRatio > 0.6 ? '#33ee44' : hpRatio > 0.3 ? '#eebb22' : '#ee3322');
  ctx.fillStyle = hpColor;
  ctx.fillRect(hpBarX, hpBarY, hpBarW * hpRatio, hpBarH);
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 1;
  ctx.strokeRect(hpBarX - 2, hpBarY - 2, hpBarW + 4, hpBarH + 4);

  // Boss label
  const phaseColors = ['', '#55ee88', '#eecc33', '#ff5533'];
  ctx.save();
  ctx.font = `bold ${Math.max(10, tileSize * 0.23)}px ui-sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = boss.raging ? '#ff4400' : (phaseColors[boss.phase] ?? '#fff');
  const rageLabel = boss.raging ? '  💢RAGE!' : '';
  ctx.fillText(`👾 BOSS  Phase ${boss.phase}  HP:${boss.hp}/${boss.maxHp}${rageLabel}`, bx + w / 2, hpBarY - 4);
  ctx.restore();
}

// ========================
// Boss laser stream rendering
// ========================

function drawBossLasers(
  ctx: CanvasRenderingContext2D,
  lasers: BossLaserAnim[],
  tileSize: number,
  now: number
): void {
  const horizontalSrc = 'assests/action/explode_effects/splash_horizontal.svg';
  const verticalSrc   = 'assests/action/explode_effects/splahs_vertical.svg';

  // Match drawExplosions sizing: horizontal SVG 40×28, vertical SVG 28×40
  const short    = tileSize * (28 / 40);
  const horizW   = tileSize; const horizH = short;
  const vertW    = short;    const vertH  = tileSize;
  const horizOffY = (tileSize - short) / 2;
  const vertOffX  = (tileSize - short) / 2;

  const horizBmp = getRaster(horizontalSrc, horizW, horizH);
  const vertBmp  = getRaster(verticalSrc,   vertW,  vertH);

  for (const laser of lasers) {
    const progress = (now - laser.startTimeMs) / (laser.endTimeMs - laser.startTimeMs);
    const alpha = Math.max(0, 1 - progress);
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (const t of laser.hTiles) {
      const px = t.x * tileSize;
      const py = t.y * tileSize;
      if (horizBmp) ctx.drawImage(horizBmp, px, py + horizOffY, horizW, horizH);
      else { ctx.fillStyle = 'rgba(0,120,255,0.6)'; ctx.fillRect(px, py, tileSize, tileSize); }
    }
    for (const t of laser.vTiles) {
      const px = t.x * tileSize;
      const py = t.y * tileSize;
      if (vertBmp) ctx.drawImage(vertBmp, px + vertOffX, py, vertW, vertH);
      else { ctx.fillStyle = 'rgba(0,120,255,0.6)'; ctx.fillRect(px, py, tileSize, tileSize); }
    }

    ctx.restore();
  }
}

// ========================
// HUD updaters
// ========================

// DOM write caches — only update elements when their value actually changes
let _hudTopText = '';
let _hudTimerText = '';
let _hudTimerClass = '';
let _hudInventoryKey = '';
let _hudDebugText = '';

const INV_KEYS = ['z', 'x', 'c', 'v', 'b'] as const;

function setTextContent(el: HTMLElement, v: string): void {
  if (el.textContent !== v) el.textContent = v;
}

function setClassName(el: HTMLElement, v: string): void {
  if (el.className !== v) el.className = v;
}

function updateHUD(
  el: RendererElements,
  snap: SnapshotPayload | null,
  startGame: StartGamePayload,
  playerTeams: Record<string, number> | undefined,
  serverTick: number,
  pingMs: number,
  myId: string | null
): void {
  // Timer
  let timerText: string;
  let timerClass: string;
  if (snap && snap.timeLeftSeconds >= 0) {
    const t = snap.timeLeftSeconds;
    timerText = formatTimer(t);
    timerClass = 'hud-timer' + (t <= 10 ? ' danger' : t <= 30 ? ' warning' : '');
  } else if (startGame.gameDurationSeconds > 0) {
    timerText = formatTimer(startGame.gameDurationSeconds);
    timerClass = 'hud-timer';
  } else {
    timerText = '';
    timerClass = 'hud-timer';
  }
  if (timerText !== _hudTimerText) { _hudTimerText = timerText; el.hudTimer.textContent = timerText; }
  if (timerClass !== _hudTimerClass) { _hudTimerClass = timerClass; el.hudTimer.className = timerClass; }

  if (!snap) {
    setTextContent(el.hudTop, `${startGame.mode} · 스냅샷 대기 중...`);
    setTextContent(el.debug, `tick=${serverTick}\nping=${pingMs.toFixed(0)}ms`);
    return;
  }

  // Top bar (changes at most every snapshot, ~20Hz)
  let topText: string;
  if (startGame.mode === 'BOSS') {
    const alive = snap.players.filter(p => p.state !== 'Dead').length;
    const boss = snap.boss;
    topText = `보스전 · 생존: ${alive}/${snap.players.length}` + (boss ? `  👾 HP:${boss.hp}/${boss.maxHp} Phase${boss.phase}` : '');
  } else if (startGame.mode === 'TEAM' && playerTeams) {
    let aAlive = 0, bAlive = 0;
    for (const p of snap.players) {
      if (p.state !== 'Dead') { if (playerTeams[p.id] === 0) aAlive++; else bAlive++; }
    }
    topText = `TEAM · A팀 ${aAlive}  |  B팀 ${bAlive}`;
  } else {
    let alive = 0;
    for (const p of snap.players) { if (p.state !== 'Dead') alive++; }
    topText = `${startGame.mode} · 생존: ${alive}/${snap.players.length}`;
  }
  if (topText !== _hudTopText) { _hudTopText = topText; el.hudTop.textContent = topText; }

  // 5-slot inventory — only rebuild HTML when inventory state changes
  const me = snap.players.find(p => p.id === myId);
  if (me && me.state !== 'Dead') {
    const inv = (me as any).inventory as ItemType[] | undefined ?? [];
    const newKey = inv.join(',') + '|' + String((me as any).hasGlove ?? false);
    if (newKey !== _hudInventoryKey) {
      _hudInventoryKey = newKey;
      let html = '<div class="hud-inventory">';
      for (let i = 0; i < 5; i++) {
        const item = inv[i];
        if (item) {
          html += `<div class="hud-inv-slot hud-inv-slot--filled" title="${item}[${INV_KEYS[i]}]"><img src="${getItemSrc(item)}" alt="${item}"><span class="hud-inv-key">${INV_KEYS[i]}</span></div>`;
        } else {
          html += `<div class="hud-inv-slot hud-inv-slot--empty"><span class="hud-inv-key">${INV_KEYS[i]}</span></div>`;
        }
      }
      if ((me as any).hasGlove) html += '<span class="hud-glove-icon" title="글러브 보유">🥊</span>';
      html += '</div>';
      el.hudNeedle.innerHTML = html;
    }
  } else if (_hudInventoryKey !== '') {
    _hudInventoryKey = '';
    el.hudNeedle.innerHTML = '';
  }

  // Debug (ping changes every 500ms, tick every snapshot)
  const debugText = `tick=${snap.tick} ping=${pingMs.toFixed(0)}ms\nme=${myId?.slice(0, 8) ?? '?'} state=${me?.state ?? 'Dead'}`;
  if (debugText !== _hudDebugText) { _hudDebugText = debugText; el.debug.textContent = debugText; }
}

// Cache: compact key of player states — rebuild HTML only when states change
let _playerStatusKey = '';

export function updatePlayerStatusPanel(
  el: RendererElements,
  snap: SnapshotPayload | null,
  startGame: StartGamePayload,
  playerTeams: Record<string, number> | undefined
): void {
  const panel = el.playerStatusPanel;
  if (!panel) return;
  if (!snap) {
    if (_playerStatusKey !== '') { _playerStatusKey = ''; panel.innerHTML = ''; }
    return;
  }

  // Build compact state key — only player states change during a game
  const newKey = snap.players.map(p => p.id[0] + p.state[0]).join('');
  if (newKey === _playerStatusKey) return;
  _playerStatusKey = newKey;

  const isTeam = startGame.mode === 'TEAM' && playerTeams;
  const groups: Array<{ header?: string; headerColor?: string; players: typeof snap.players }> = [];

  if (isTeam) {
    const teamA = snap.players.filter(p => (playerTeams![p.id] ?? 0) === 0);
    const teamB = snap.players.filter(p => (playerTeams![p.id] ?? 0) === 1);
    groups.push({ header: 'A팀', headerColor: TEAM_A_COLOR, players: teamA });
    groups.push({ header: 'B팀', headerColor: TEAM_B_COLOR, players: teamB });
  } else {
    groups.push({ players: snap.players });
  }

  const groupHtmlParts: string[] = [];
  for (const g of groups) {
    let groupHtml = '<div class="psp-team-group">';
    if (g.header) {
      groupHtml += `<span class="psp-team-header" style="color:${g.headerColor}">${g.header}</span>`;
    }
    for (const p of g.players) {
      const colorIndex = (startGame.playerColors ?? {})[p.id] ?? 0;
      const color = PLAYER_FALLBACK[colorIndex] ?? PLAYER_FALLBACK[0];
      let icon: string;
      let iconClass: string;
      if (p.state === 'Dead') {
        icon = '✕'; iconClass = 'psp-icon-dead';
      } else if (p.state === 'Trapped') {
        icon = '○'; iconClass = 'psp-icon-trapped';
      } else {
        icon = '●'; iconClass = 'psp-icon-alive';
      }
      groupHtml += `<div class="psp-entry">
        <span class="${iconClass}" style="${p.state === 'Alive' ? `color:${color}` : ''}">${icon}</span>
        <span style="color:#c9d1d9;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.name}">${p.name}</span>
      </div>`;
    }
    groupHtml += '</div>';
    groupHtmlParts.push(groupHtml);
  }
  panel.innerHTML = groupHtmlParts.join('<div class="psp-team-divider"></div>');
}

// ========================
// Draw Options type (kept for index.ts compatibility)
// ========================

export type DrawOptions = {
  ctx: CanvasRenderingContext2D;
  el: RendererElements;
  startGame: StartGamePayload;
  snapshotCurr: SnapshotPayload | null;
  snapshotPrev: SnapshotPayload | null;
  snapshotInterpStart: number;
  snapshotInterpDuration: number;
  serverTickEstimate: number;
  pingMs: number;
  myId: string | null;
  playerTeams?: Record<string, number>;
  notifications: Notification[];
  now: number;
  playerSkins: Record<string, string>;
  boss?: BossSnapshot;
  roundEnd?: { msg: string; at: number } | null;
  balloonKickAnims: Map<string, BalloonKickAnim>;
  bossLasers?: BossLaserAnim[];
};

// ========================
// Orchestrator
// ========================

export function drawGameFrame(opts: DrawOptions): void {
  const {
    ctx, el, startGame,
    snapshotCurr, snapshotPrev, snapshotInterpStart, snapshotInterpDuration,
    serverTickEstimate, pingMs, myId, playerTeams, notifications, now, playerSkins, boss, roundEnd,
    balloonKickAnims, bossLasers
  } = opts;

  const preset = getMapPreset(startGame.mapId);
  const mapW = preset.width;
  const mapH = preset.height;
  const tileSize = Math.floor(Math.min(el.canvas.width / mapW, el.canvas.height / mapH));
  const offsetX = Math.floor((el.canvas.width - tileSize * mapW) / 2);
  const offsetY = Math.floor((el.canvas.height - tileSize * mapH) / 2);

  const ticksLeft = Math.max(0, startGame.startTick - serverTickEstimate);
  el.countdown.textContent = ticksLeft > 0 ? `${(ticksLeft / TICK_RATE).toFixed(1)}초 후 시작` : '';

  let alpha = 1;
  if (snapshotPrev && snapshotCurr) {
    alpha = clamp01((performance.now() - snapshotInterpStart) / snapshotInterpDuration);
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);

  drawBackground(ctx, mapW, mapH, tileSize);

  if (snapshotCurr) {
    // Blocks: render to offscreen canvas once, blit every frame
    const blockKey = `${snapshotCurr.blocks.length}|${mapW}|${mapH}|${tileSize}`;
    if (blockKey !== blockOffscreenKey || !blockOffscreen) {
      blockOffscreenKey = blockKey;
      blockOffscreen = document.createElement('canvas');
      blockOffscreen.width = mapW * tileSize;
      blockOffscreen.height = mapH * tileSize;
      const bCtx = blockOffscreen.getContext('2d')!;
      drawBlocks(bCtx, snapshotCurr.blocks, tileSize);
    }
    ctx.drawImage(blockOffscreen, 0, 0);
    drawItems(ctx, snapshotCurr.items, tileSize);
    drawExplosions(ctx, snapshotCurr.explosions, tileSize);
    if (bossLasers && bossLasers.length > 0) drawBossLasers(ctx, bossLasers, tileSize, now);
    drawBalloons(ctx, snapshotCurr.balloons, snapshotCurr.tick, tileSize, startGame.playerColors ?? {}, playerSkins, now, balloonKickAnims);
    const bossToDraw = boss ?? snapshotCurr.boss;
    if (bossToDraw) drawBoss(ctx, bossToDraw, tileSize, now);
    drawPlayers(ctx, snapshotCurr.players, snapshotPrev, snapshotCurr, alpha, tileSize, startGame, playerTeams, myId, snapshotCurr.tick);
  }

  ctx.restore();

  // Notifications are drawn in canvas-space (not tile-space)
  if (snapshotCurr) {
    drawNotifications(ctx, notifications, now, el.canvas.width);
  }

  // Round-end overlay: fade in over 600ms, show centered message
  if (roundEnd) {
    const elapsed = now - roundEnd.at;
    const alpha = Math.min(1, elapsed / 600) * 0.72;
    const cw = el.canvas.width;
    const ch = el.canvas.height;

    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, cw, ch);

    const textAlpha = Math.min(1, Math.max(0, (elapsed - 150) / 500));
    ctx.globalAlpha = textAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 24;
    ctx.font = `bold ${Math.round(ch * 0.12)}px ui-sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(roundEnd.msg, cw / 2, ch / 2);

    ctx.shadowBlur = 0;
    ctx.globalAlpha = textAlpha * 0.65;
    ctx.font = `${Math.round(ch * 0.045)}px ui-sans-serif`;
    ctx.fillStyle = '#cccccc';
    ctx.fillText('잠시 후 결과 화면으로 이동합니다', cw / 2, ch / 2 + Math.round(ch * 0.11));
    ctx.restore();
  }

  updateHUD(el, snapshotCurr, startGame, playerTeams, serverTickEstimate, pingMs, myId);
  updatePlayerStatusPanel(el, snapshotCurr, startGame, playerTeams);
}
