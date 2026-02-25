import { TICK_RATE, getMapPreset, type ItemType, type PlayerLifeState, type SnapshotPayload, type StartGamePayload } from '@lan-bomber/shared';
import type { RendererElements } from './types';

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

function itemLabel(type: ItemType): string {
  switch (type) {
    case 'Speed':
      return '+SPD';
    case 'Balloon':
      return '+BAL';
    case 'Power':
      return '+PWR';
    case 'Needle':
      return '+NDL';
  }
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
  el.countdown.textContent = ticksLeft > 0 ? `Starting in ${(ticksLeft / TICK_RATE).toFixed(1)}s` : '';

  let alpha = 1;
  if (snapshotPrev && snapshotCurr) {
    const elapsed = performance.now() - snapshotInterpStart;
    alpha = clamp01(elapsed / snapshotInterpDuration);
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);

  ctx.strokeStyle = '#142033';
  ctx.lineWidth = 1;
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
    for (const b of snapshotCurr.blocks) {
      ctx.fillStyle = b.kind === 'SolidWall' ? '#2b394d' : '#3a2f1f';
      ctx.fillRect(b.x * tileSize, b.y * tileSize, tileSize, tileSize);
    }

    for (const it of snapshotCurr.items) {
      ctx.fillStyle = '#1f7a5a';
      const cx = it.x * tileSize + tileSize / 2;
      const cy = it.y * tileSize + tileSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e6edf3';
      ctx.font = `${Math.max(10, tileSize * 0.22)}px ui-monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(itemLabel(it.itemType), cx, cy);
    }

    for (const ex of snapshotCurr.explosions) {
      ctx.fillStyle = 'rgba(0, 153, 255, 0.35)';
      for (const t of ex.tiles) {
        ctx.fillRect(t.x * tileSize, t.y * tileSize, tileSize, tileSize);
      }
    }

    for (const b of snapshotCurr.balloons) {
      const cx = b.x * tileSize + tileSize / 2;
      const cy = b.y * tileSize + tileSize / 2;
      ctx.fillStyle = '#1b74d1';
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.33, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of snapshotCurr.players) {
      const pos = interpolatePlayerPos(p.id, snapshotCurr, snapshotPrev, alpha);
      const cx = pos.x * tileSize;
      const cy = pos.y * tileSize;
      const baseColor = p.team === 0 ? '#d46b08' : '#2f54eb';

      if (p.state === 'Dead') {
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - tileSize * 0.25, cy - tileSize * 0.25);
        ctx.lineTo(cx + tileSize * 0.25, cy + tileSize * 0.25);
        ctx.moveTo(cx + tileSize * 0.25, cy - tileSize * 0.25);
        ctx.lineTo(cx - tileSize * 0.25, cy + tileSize * 0.25);
        ctx.stroke();
      } else {
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(cx, cy, tileSize * 0.28, 0, Math.PI * 2);
        ctx.fill();

        if (p.state === 'Trapped') {
          ctx.strokeStyle = 'rgba(102, 217, 255, 0.85)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.38, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (p.invulnerable) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, tileSize * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.fillStyle = '#e6edf3';
      ctx.font = `${Math.max(10, tileSize * 0.22)}px ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, cx, cy - tileSize * 0.35);

      if (p.id === myId) {
        ctx.textBaseline = 'top';
        ctx.font = `${Math.max(10, tileSize * 0.2)}px ui-monospace`;
        ctx.fillText(
          `SPD:${p.stats.speed.toFixed(1)} B:${p.stats.balloonCount} P:${p.stats.power} N:${p.stats.needle}`,
          cx,
          cy + tileSize * 0.35
        );
      }
    }

    const me = snapshotCurr.players.find((p) => p.id === myId);
    const meNeedles = me?.stats.needle ?? 0;
    el.hudTop.textContent = `${startGame.mode} | Tick ${snapshotCurr.tick} | Needle[ZXC]: ${needleSlots(meNeedles)}`;

    const alive = snapshotCurr.players.filter((p) => p.state !== 'Dead').length;
    const trapped = snapshotCurr.players.filter((p) => p.state === 'Trapped').length;
    const myState: PlayerLifeState = me?.state ?? 'Dead';

    el.debug.textContent = [
      `tick=${snapshotCurr.tick}`,
      `ping=${pingMs.toFixed(0)}ms`,
      `players=${snapshotCurr.players.length} aliveOrTrapped=${alive} trapped=${trapped}`,
      `me=${myId ?? '(no id)'} state=${myState}`
    ].join('\n');
  } else {
    el.hudTop.textContent = `${startGame.mode} | Waiting for snapshot...`;
    el.debug.textContent = `tick=${serverTickEstimate}\nping=${pingMs.toFixed(0)}ms`;
  }

  ctx.restore();
}
