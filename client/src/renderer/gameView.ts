import { TICK_RATE, CHAR_COLORS, getMapPreset, type ItemType, type PlayerLifeState, type SnapshotPayload, type StartGamePayload } from '@lan-bomber/shared';
import type { RendererElements } from './types';

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

// Pre-warm all assets
export function preloadAssets() {
  const colors = CHAR_COLORS;
  for (const color of colors) {
    loadImg(`assests/images/characters/${color}/idle.svg`);
    loadImg(`assests/images/characters/${color}/panic.svg`);
  }
  const waterballs = ['waterball', 'waterball_green', 'waterball_purple', 'waterball_red', 'waterball_pink', 'waterball_yellow'];
  for (const w of waterballs) {
    loadImg(`assests/images/waterball/${w}.svg`);
  }
  loadImg('assests/images/item/item_balloon.svg');
  loadImg('assests/images/item/item_needle.svg');
  loadImg('assests/images/item/item_power.svg');
  loadImg('assests/images/item/item_speed.svg');
  loadImg('assests/action/explode_effects/splash_center.svg');
  loadImg('assests/action/explode_effects/stream_body.svg');
  loadImg('assests/action/explode_effects/stream_end.svg');
}

// Waterball SVG by colorIndex
const WATERBALL_SVGS = [
  'waterball',          // 0: blue
  'waterball_green',    // 1: green
  'waterball_purple',   // 2: purple
  'waterball_red',      // 3: red
  'waterball_pink',     // 4: white -> pink
  'waterball_yellow'    // 5: yellow
];

function getWaterballSrc(colorIndex: number): string {
  return `assests/images/waterball/${WATERBALL_SVGS[colorIndex] ?? 'waterball'}.svg`;
}

function getItemSrc(type: ItemType): string {
  switch (type) {
    case 'Speed': return 'assests/images/item/item_speed.svg';
    case 'Balloon': return 'assests/images/item/item_balloon.svg';
    case 'Power': return 'assests/images/item/item_power.svg';
    case 'Needle': return 'assests/images/item/item_needle.svg';
  }
}

// ========================
// Draw Options
// ========================

type DrawOptions = {
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
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function needleSlots(count: number): string {
  const clamped = Math.max(0, Math.min(3, Math.floor(count)));
  return `${clamped >= 1 ? '■' : '□'}${clamped >= 2 ? '■' : '□'}${clamped >= 3 ? '■' : '□'}`;
}

function interpolatePlayerPos(
  playerId: string,
  snapshotCurr: SnapshotPayload,
  snapshotPrev: SnapshotPayload | null,
  alpha: number
): { x: number; y: number } {
  const curr = snapshotCurr.players.find((p) => p.id === playerId);
  if (!curr) return { x: 0, y: 0 };
  if (!snapshotPrev) return { x: curr.x, y: curr.y };

  const prev = snapshotPrev.players.find((p) => p.id === playerId);
  if (!prev) return { x: curr.x, y: curr.y };

  return {
    x: prev.x + (curr.x - prev.x) * alpha,
    y: prev.y + (curr.y - prev.y) * alpha
  };
}

// Format seconds to MM:SS
function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function drawGameFrame(opts: DrawOptions) {
  const {
    ctx,
    el,
    startGame,
    snapshotCurr,
    snapshotPrev,
    snapshotInterpStart,
    snapshotInterpDuration,
    serverTickEstimate,
    pingMs,
    myId
  } = opts;

  const preset = getMapPreset(startGame.mapId);
  const mapW = preset.width;
  const mapH = preset.height;
  const tileSize = Math.floor(Math.min(el.canvas.width / mapW, el.canvas.height / mapH));
  const offsetX = Math.floor((el.canvas.width - tileSize * mapW) / 2);
  const offsetY = Math.floor((el.canvas.height - tileSize * mapH) / 2);

  const ticksLeft = Math.max(0, startGame.startTick - serverTickEstimate);
  el.countdown.textContent = ticksLeft > 0 ? `${(ticksLeft / TICK_RATE).toFixed(1)}초 후 시작` : '';

  // Timer HUD
  if (snapshotCurr && snapshotCurr.timeLeftSeconds >= 0) {
    const t = snapshotCurr.timeLeftSeconds;
    el.hudTimer.textContent = formatTimer(t);
    el.hudTimer.className = 'hud-timer' + (t <= 10 ? ' danger' : t <= 30 ? ' warning' : '');
  } else if (startGame.gameDurationSeconds > 0 && ticksLeft > 0) {
    el.hudTimer.textContent = formatTimer(startGame.gameDurationSeconds);
    el.hudTimer.className = 'hud-timer';
  } else {
    el.hudTimer.textContent = '';
  }

  let alpha = 1;
  if (snapshotPrev && snapshotCurr) {
    const elapsed = performance.now() - snapshotInterpStart;
    alpha = clamp01(elapsed / snapshotInterpDuration);
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // --- Grid background ---
  ctx.fillStyle = '#070e1a';
  ctx.fillRect(0, 0, mapW * tileSize, mapH * tileSize);

  // Subtle grid lines
  ctx.strokeStyle = '#0d1a2e';
  ctx.lineWidth = 0.5;
  for (let y = 0; y <= mapH; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(mapW * tileSize, y * tileSize);
    ctx.stroke();
  }
  for (let x = 0; x <= mapW; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, mapH * tileSize);
    ctx.stroke();
  }

  if (snapshotCurr) {
    // --- Blocks ---
    for (const b of snapshotCurr.blocks) {
      if (b.kind === 'SolidWall') {
        // Solid wall: dark blue-grey with border
        ctx.fillStyle = '#1a2740';
        ctx.fillRect(b.x * tileSize, b.y * tileSize, tileSize, tileSize);
        ctx.strokeStyle = '#111e30';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x * tileSize + 0.5, b.y * tileSize + 0.5, tileSize - 1, tileSize - 1);
        // Inner highlight
        ctx.fillStyle = '#2a3d58';
        ctx.fillRect(b.x * tileSize + 2, b.y * tileSize + 2, tileSize - 4, 3);
        ctx.fillRect(b.x * tileSize + 2, b.y * tileSize + 2, 3, tileSize - 4);
      } else {
        // Soft block: brown with crate pattern
        ctx.fillStyle = '#4a3118';
        ctx.fillRect(b.x * tileSize, b.y * tileSize, tileSize, tileSize);
        ctx.strokeStyle = '#3a2410';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x * tileSize + 0.5, b.y * tileSize + 0.5, tileSize - 1, tileSize - 1);
        // Crate lines
        ctx.strokeStyle = '#5a3c20';
        ctx.lineWidth = 1;
        const cx = b.x * tileSize + tileSize / 2;
        const cy = b.y * tileSize + tileSize / 2;
        const p = tileSize * 0.15;
        ctx.strokeRect(b.x * tileSize + p, b.y * tileSize + p, tileSize - p * 2, tileSize - p * 2);
        ctx.beginPath(); ctx.moveTo(cx, b.y * tileSize + p); ctx.lineTo(cx, b.y * tileSize + tileSize - p); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x * tileSize + p, cy); ctx.lineTo(b.x * tileSize + tileSize - p, cy); ctx.stroke();
      }
    }

    // --- Items ---
    for (const it of snapshotCurr.items) {
      const img = loadImg(getItemSrc(it.itemType));
      const pad = tileSize * 0.12;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, it.x * tileSize + pad, it.y * tileSize + pad, tileSize - pad * 2, tileSize - pad * 2);
      } else {
        // Fallback
        ctx.fillStyle = '#1f7a5a';
        const cx = it.x * tileSize + tileSize / 2;
        const cy = it.y * tileSize + tileSize / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Explosions ---
    for (const ex of snapshotCurr.explosions) {
      const centerImg = loadImg('assests/action/explode_effects/splash_center.svg');
      const bodyImg   = loadImg('assests/action/explode_effects/stream_body.svg');
      const endImg    = loadImg('assests/action/explode_effects/stream_end.svg');

      // Group non-center tiles by direction and find max distance per direction
      // stream_end / stream_body SVGs are horizontal (left=open, right=rounded cap)
      // Rotation: right=0, down=90°, left=180°, up=-90°
      const dirs = ['right', 'down', 'left', 'up'] as const;
      const dirAngle: Record<string, number> = {
        right:  0,
        down:   Math.PI / 2,
        left:   Math.PI,
        up:    -Math.PI / 2
      };
      const dirTiles = new Map<string, Array<{ x: number; y: number; dist: number }>>();

      for (const t of ex.tiles) {
        if (t.x === ex.originX && t.y === ex.originY) continue;
        const dx = t.x - ex.originX;
        const dy = t.y - ex.originY;
        const dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
        const dist = Math.abs(dx) + Math.abs(dy);
        if (!dirTiles.has(dir)) dirTiles.set(dir, []);
        dirTiles.get(dir)!.push({ x: t.x, y: t.y, dist });
      }

      // Draw center
      if (centerImg.complete && centerImg.naturalWidth > 0) {
        ctx.drawImage(centerImg, ex.originX * tileSize, ex.originY * tileSize, tileSize, tileSize);
      } else {
        ctx.fillStyle = 'rgba(0,150,255,0.5)';
        ctx.fillRect(ex.originX * tileSize, ex.originY * tileSize, tileSize, tileSize);
      }

      // Draw each arm
      for (const dir of dirs) {
        const tiles = dirTiles.get(dir);
        if (!tiles || tiles.length === 0) continue;
        const maxDist = Math.max(...tiles.map(t => t.dist));
        const angle = dirAngle[dir];

        for (const t of tiles) {
          const isEnd = t.dist === maxDist;
          const img = isEnd ? endImg : bodyImg;
          if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(t.x * tileSize + tileSize / 2, t.y * tileSize + tileSize / 2);
            ctx.rotate(angle);
            ctx.drawImage(img, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
            ctx.restore();
          } else {
            ctx.fillStyle = 'rgba(0,150,255,0.4)';
            ctx.fillRect(t.x * tileSize, t.y * tileSize, tileSize, tileSize);
          }
        }
      }
    }

    // --- Balloons (Waterballs) ---
    for (const b of snapshotCurr.balloons) {
      // Get owner's color from playerColors map
      const colorIndex = (startGame.playerColors ?? {})[b.ownerId] ?? 0;
      const balloonSrc = getWaterballSrc(colorIndex);
      const img = loadImg(balloonSrc);

      const pad = tileSize * 0.05;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, b.x * tileSize + pad, b.y * tileSize + pad, tileSize - pad * 2, tileSize - pad * 2);
      } else {
        // Fallback: circle
        const cx = b.x * tileSize + tileSize / 2;
        const cy = b.y * tileSize + tileSize / 2;
        ctx.fillStyle = '#1b74d1';
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * 0.33, 0, Math.PI * 2);
        ctx.fill();
      }

      // Fuse timer indicator (small arc)
      const fuseProgress = Math.max(0, (b.explodeTick - snapshotCurr.tick) / (2.5 * TICK_RATE));
      if (fuseProgress > 0) {
        const cx = b.x * tileSize + tileSize / 2;
        const cy = b.y * tileSize + tileSize / 2;
        ctx.strokeStyle = fuseProgress < 0.3 ? '#ff4444' : '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * 0.4, -Math.PI / 2, -Math.PI / 2 + fuseProgress * Math.PI * 2);
        ctx.stroke();
      }
    }

    // --- Players ---
    for (const p of snapshotCurr.players) {
      const pos = interpolatePlayerPos(p.id, snapshotCurr, snapshotPrev, alpha);
      const cx = pos.x * tileSize;
      const cy = pos.y * tileSize;
      const colorIndex = (startGame.playerColors ?? {})[p.id] ?? 0;
      const colorName = CHAR_COLORS[colorIndex] ?? 'blue';

      if (p.state === 'Dead') {
        // Dead: faded X mark
        ctx.globalAlpha = 0.4;
        const imgDead = loadImg(`assests/images/characters/${colorName}/idle.svg`);
        if (imgDead.complete && imgDead.naturalWidth > 0) {
          ctx.drawImage(imgDead, cx - tileSize * 0.4, cy - tileSize * 0.4, tileSize * 0.8, tileSize * 0.8);
        }
        ctx.globalAlpha = 1;
        // X overlay
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
          ? `assests/images/characters/${colorName}/panic.svg`
          : `assests/images/characters/${colorName}/idle.svg`;
        const img = loadImg(imgSrc);

        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, cx - tileSize * 0.45, cy - tileSize * 0.45, tileSize * 0.9, tileSize * 0.9);
        } else {
          // Fallback circle
          ctx.fillStyle = `#${colorIndex === 0 ? '3b82f6' : colorIndex === 1 ? '22c55e' : colorIndex === 2 ? 'a855f7' : colorIndex === 3 ? 'ef4444' : colorIndex === 4 ? 'f1f5f9' : 'eab308'}`;
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Trapped bubble effect
        if (p.state === 'Trapped') {
          ctx.strokeStyle = 'rgba(100, 220, 255, 0.8)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.46, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Invulnerable glow
        if (p.invulnerable) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.52, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Player name label
      ctx.fillStyle = p.state === 'Dead' ? '#666' : '#e6edf3';
      ctx.font = `bold ${Math.max(10, tileSize * 0.2)}px ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, cx, cy - tileSize * 0.48);

      // Stats for own player
      if (p.id === myId && p.state !== 'Dead') {
        ctx.fillStyle = 'rgba(230, 237, 243, 0.7)';
        ctx.font = `${Math.max(9, tileSize * 0.18)}px ui-monospace`;
        ctx.textBaseline = 'top';
        ctx.fillText(
          `SPD:${p.stats.speed.toFixed(1)} B:${p.stats.balloonCount} P:${p.stats.power}`,
          cx,
          cy + tileSize * 0.48
        );
      }
    }

    // HUD top
    const alive = snapshotCurr.players.filter((p) => p.state !== 'Dead').length;
    el.hudTop.textContent = `${startGame.mode} · 생존: ${alive}/${snapshotCurr.players.length}`;

    // Needle HUD
    const me = snapshotCurr.players.find((p) => p.id === myId);
    if (me && me.state !== 'Dead') {
      el.hudNeedle.innerHTML = `<span class="hud-needle-label">바늘</span><span class="hud-needle-slots">${needleSlots(me.stats.needle)}</span>`;
    } else {
      el.hudNeedle.textContent = '';
    }

    // Debug info
    const myState: PlayerLifeState = me?.state ?? 'Dead';
    el.debug.textContent = [
      `tick=${snapshotCurr.tick} ping=${pingMs.toFixed(0)}ms`,
      `me=${myId?.slice(0, 8) ?? '?'} state=${myState}`
    ].join('\n');
  } else {
    el.hudTop.textContent = `${startGame.mode} · 스냅샷 대기 중...`;
    el.debug.textContent = `tick=${serverTickEstimate}\nping=${pingMs.toFixed(0)}ms`;
  }

  ctx.restore();
}
