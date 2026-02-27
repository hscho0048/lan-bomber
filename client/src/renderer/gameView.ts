import { TICK_RATE, CHAR_COLORS, getMapPreset, type ItemType, type SnapshotPayload, type StartGamePayload, type PlayerSnapshot } from '@lan-bomber/shared';
import type { RendererElements } from './types';
import type { Notification } from './state';
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
  const waterballs = ['waterball', 'waterball_green', 'waterball_purple', 'waterball_red', 'waterball_pink', 'waterball_yellow'];
  for (const w of waterballs) loadImg(`assests/images/waterball/${w}.svg`);
  loadImg('assests/images/item/item_balloon.svg');
  loadImg('assests/images/item/item_needle.svg');
  loadImg('assests/images/item/item_power.svg');
  loadImg('assests/images/item/item_speed.svg');
  loadImg('assests/action/explode_effects/splash_center.svg');
  loadImg('assests/action/explode_effects/splash_horizontal.svg');
  loadImg('assests/action/explode_effects/splahs_vertical.svg');
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
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function needleSlots(count: number): string {
  const c = Math.max(0, Math.min(3, Math.floor(count)));
  return `${c >= 1 ? '■' : '□'}${c >= 2 ? '■' : '□'}${c >= 3 ? '■' : '□'}`;
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
    const img = loadImg(getItemSrc(it.itemType));
    const pad = tileSize * S.ITEM_PAD;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, it.x * tileSize + pad, it.y * tileSize + pad, tileSize - pad * 2, tileSize - pad * 2);
    } else {
      ctx.fillStyle = '#1f7a5a';
      ctx.beginPath();
      ctx.arc(it.x * tileSize + tileSize / 2, it.y * tileSize + tileSize / 2, tileSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawExplosions(ctx: CanvasRenderingContext2D, explosions: SnapshotPayload['explosions'], tileSize: number): void {
  const centerImg     = loadImg('assests/action/explode_effects/splash_center.svg');
  const horizontalImg = loadImg('assests/action/explode_effects/splash_horizontal.svg');
  const verticalImg   = loadImg('assests/action/explode_effects/splahs_vertical.svg');
  const dirs = ['right', 'down', 'left', 'up'] as const;

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

    if (centerImg.complete && centerImg.naturalWidth > 0) {
      ctx.drawImage(centerImg, ex.originX * tileSize, ex.originY * tileSize, tileSize, tileSize);
    } else {
      ctx.fillStyle = 'rgba(0,150,255,0.5)';
      ctx.fillRect(ex.originX * tileSize, ex.originY * tileSize, tileSize, tileSize);
    }

    for (const dir of dirs) {
      const tiles = dirTiles.get(dir);
      if (!tiles || tiles.length === 0) continue;
      const isHoriz = dir === 'left' || dir === 'right';
      const img = isHoriz ? horizontalImg : verticalImg;
      // horizontal SVG: 40×28 → fill full width, center vertically
      // vertical SVG:   28×40 → fill full height, center horizontally
      const ratio = 28 / 40;
      const drawW = isHoriz ? tileSize        : tileSize * ratio;
      const drawH = isHoriz ? tileSize * ratio : tileSize;
      const offX  = isHoriz ? 0               : (tileSize - drawW) / 2;
      const offY  = isHoriz ? (tileSize - drawH) / 2 : 0;
      for (const t of tiles) {
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, t.x * tileSize + offX, t.y * tileSize + offY, drawW, drawH);
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

function drawBalloons(
  ctx: CanvasRenderingContext2D,
  balloons: SnapshotPayload['balloons'],
  tick: number,
  tileSize: number,
  playerColors: Record<string, number>,
  playerSkins: Record<string, string>,
  now: number
): void {
  for (const b of balloons) {
    const img = loadImg(getWaterballSrcForPlayer(b.ownerId, playerColors, playerSkins));
    const pad = tileSize * S.BALLOON_PAD;

    const t = ((now + balloonPhaseOffset(b.id)) % BREATHE_PERIOD) / BREATHE_PERIOD;
    const factor = (1 - Math.cos(t * Math.PI * 2)) / 2; // 0→1→0 ease-in-out
    const scaleX = 1 + factor * 0.18;
    const scaleY = 1 - factor * 0.18;

    // pivot at (50%, 90%) — bottom-centre so base stays grounded
    const size = tileSize - pad * 2;
    const pivotX = b.x * tileSize + pad + size * 0.5;
    const pivotY = b.y * tileSize + pad + size * 0.9;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-pivotX, -pivotY);

    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, b.x * tileSize + pad, b.y * tileSize + pad, size, size);
    } else {
      ctx.fillStyle = '#1b74d1';
      ctx.beginPath();
      ctx.arc(b.x * tileSize + tileSize / 2, b.y * tileSize + tileSize / 2, tileSize * 0.33, 0, Math.PI * 2);
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

    if (p.state === 'Dead') {
      ctx.globalAlpha = 0.4;
      const imgDead = loadImg(`assests/images/characters/${skinName}/idle.svg`);
      if (imgDead.complete && imgDead.naturalWidth > 0) {
        ctx.drawImage(imgDead, cx - tileSize * S.SPRITE, cy - tileSize * S.SPRITE, tileSize * S.SPRITE * 2, tileSize * S.SPRITE * 2);
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
      const imgSrc = p.state === 'Trapped'
        ? `assests/images/characters/${skinName}/panic.svg`
        : `assests/images/characters/${skinName}/idle.svg`;
      const img = loadImg(imgSrc);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, cx - tileSize * S.SPRITE, cy - tileSize * S.SPRITE, tileSize * S.SPRITE * 2, tileSize * S.SPRITE * 2);
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
// HUD updaters
// ========================

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
  if (snap && snap.timeLeftSeconds >= 0) {
    const t = snap.timeLeftSeconds;
    el.hudTimer.textContent = formatTimer(t);
    el.hudTimer.className = 'hud-timer' + (t <= 10 ? ' danger' : t <= 30 ? ' warning' : '');
  } else if (startGame.gameDurationSeconds > 0) {
    el.hudTimer.textContent = formatTimer(startGame.gameDurationSeconds);
    el.hudTimer.className = 'hud-timer';
  } else {
    el.hudTimer.textContent = '';
  }

  if (!snap) {
    el.hudTop.textContent = `${startGame.mode} · 스냅샷 대기 중...`;
    el.debug.textContent = `tick=${serverTick}\nping=${pingMs.toFixed(0)}ms`;
    return;
  }

  // Top bar
  if (startGame.mode === 'TEAM' && playerTeams) {
    const aAlive = snap.players.filter(p => p.state !== 'Dead' && playerTeams[p.id] === 0).length;
    const bAlive = snap.players.filter(p => p.state !== 'Dead' && playerTeams[p.id] === 1).length;
    el.hudTop.textContent = `TEAM · A팀 ${aAlive}  |  B팀 ${bAlive}`;
  } else {
    const alive = snap.players.filter(p => p.state !== 'Dead').length;
    el.hudTop.textContent = `${startGame.mode} · 생존: ${alive}/${snap.players.length}`;
  }

  // Needle
  const me = snap.players.find(p => p.id === myId);
  if (me && me.state !== 'Dead') {
    el.hudNeedle.innerHTML = `<span class="hud-needle-label">바늘</span><span class="hud-needle-slots">${needleSlots(me.stats.needle)}</span>`;
  } else {
    el.hudNeedle.textContent = '';
  }

  // Debug
  el.debug.textContent = [
    `tick=${snap.tick} ping=${pingMs.toFixed(0)}ms`,
    `me=${myId?.slice(0, 8) ?? '?'} state=${me?.state ?? 'Dead'}`
  ].join('\n');
}

export function updatePlayerStatusPanel(
  el: RendererElements,
  snap: SnapshotPayload | null,
  startGame: StartGamePayload,
  playerTeams: Record<string, number> | undefined
): void {
  const panel = el.playerStatusPanel;
  if (!panel) return;
  if (!snap) { panel.innerHTML = ''; return; }

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
};

// ========================
// Orchestrator
// ========================

export function drawGameFrame(opts: DrawOptions): void {
  const {
    ctx, el, startGame,
    snapshotCurr, snapshotPrev, snapshotInterpStart, snapshotInterpDuration,
    serverTickEstimate, pingMs, myId, playerTeams, notifications, now, playerSkins
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
    drawBlocks(ctx, snapshotCurr.blocks, tileSize);
    drawItems(ctx, snapshotCurr.items, tileSize);
    drawExplosions(ctx, snapshotCurr.explosions, tileSize);
    drawBalloons(ctx, snapshotCurr.balloons, snapshotCurr.tick, tileSize, startGame.playerColors ?? {}, playerSkins, now);
    drawPlayers(ctx, snapshotCurr.players, snapshotPrev, snapshotCurr, alpha, tileSize, startGame, playerTeams, myId, snapshotCurr.tick);
  }

  ctx.restore();

  // Notifications are drawn in canvas-space (not tile-space)
  if (snapshotCurr) {
    drawNotifications(ctx, notifications, now, el.canvas.width);
  }

  updateHUD(el, snapshotCurr, startGame, playerTeams, serverTickEstimate, pingMs, myId);
  updatePlayerStatusPanel(el, snapshotCurr, startGame, playerTeams);
}
