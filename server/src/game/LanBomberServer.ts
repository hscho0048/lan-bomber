import os from 'node:os';
import dgram from 'node:dgram';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BALLOON_FUSE_TICKS,
  DEFAULT_STATS,
  EXPLOSION_DURATION_TICKS,
  ITEM_DROP_CHANCE,
  MAX_PLAYERS,
  RESCUE_INVULN_TICKS,
  SNAPSHOT_INTERVAL_TICKS,
  SOFTBLOCK_FILL_PROB,
  TICK_RATE,
  TRAP_DURATION_TICKS,
  createLogger,
  getMapPreset,
  type GameMode,
  type GameEventType,
  type ItemType,
  type MoveDir,
  type PlayerLifeState,
  type PlayerStats,
  stringifyMessage,
  type ServerToClientMessage,
  type RoomStatePayload,
  type SnapshotPayload,
  type EventMessagePayload,
  type BlockKind,
  type MapPreset,
  type XY,
  PROTOCOL_VERSION
} from '@lan-bomber/shared';
import { parseClientMessage } from '@lan-bomber/shared';
import { RNG } from '@lan-bomber/shared';
import {
  canEnterTile as canEnterTileSystem,
  getPlayerOccupyTile as getPlayerOccupyTileSystem,
  getPlayerRenderPos as getPlayerRenderPosSystem,
  simulateMovement as simulateMovementSystem
} from './systems/movement';
import { applyItem as applyItemSystem, findItemAt as findItemAtSystem, rollItemType as rollItemTypeSystem } from './systems/items';

type LogLevel = 'info' | 'debug';

type Tile = 'SolidWall' | 'SoftBlock' | 'Empty';

type Phase = 'lobby' | 'starting' | 'inGame' | 'postGame';

interface Balloon {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  explodeTick: number;
  power: number;
  passableBy: Set<string>;
}

interface Item {
  id: string;
  x: number;
  y: number;
  itemType: ItemType;
}

interface Explosion {
  id: string;
  originX: number;
  originY: number;
  tiles: XY[];
  endTick: number;
}

interface MoveState {
  moving: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  dir: MoveDir;
  t: number; // progress [0..1]
}

interface PlayerConn {
  id: string;
  ws: WebSocket;
  name: string;
  ready: boolean;
  team: number;
  state: PlayerLifeState;
  stats: PlayerStats;
  trappedUntilTick: number;
  invulnUntilTick: number;
  inputDir: MoveDir;
  lastInputSeq: number;
  placeBalloonQueued: number;
  move: MoveState;
}

interface ServerOptions {
  wsPort: number;
  roomName: string;
  udp: boolean;
  udpPort: number;
  logLevel: LogLevel;
}

function keyXY(x: number, y: number): string {
  return `${x},${y}`;
}

function getLocalIPv4(): string {
  const nets = os.networkInterfaces();
  const candidates: Array<{ name: string; ip: string }> = [];
  for (const name of Object.keys(nets)) {
    const list = nets[name];
    if (!list) continue;
    for (const net of list) {
      if (net.family !== 'IPv4') continue;
      if (net.internal) continue;
      // Skip link-local
      if (net.address.startsWith('169.254.')) continue;
      candidates.push({ name, ip: net.address });
    }
  }

  const isPrivateLan = (ip: string): boolean => {
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      const parts = ip.split('.');
      const second = Number(parts[1]);
      return second >= 16 && second <= 31;
    }
    return false;
  };

  const adapterScore = (name: string): number => {
    const n = name.toLowerCase();
    if (n.includes('wi-fi') || n.includes('wireless') || n.includes('wlan')) return 0;
    if (n.includes('ethernet')) return 1;
    if (n.includes('vpn') || n.includes('nord') || n.includes('tun') || n.includes('tap') || n.includes('vethernet')) return 3;
    return 2;
  };

  candidates.sort((a, b) => {
    const lanA = isPrivateLan(a.ip) ? 0 : 1;
    const lanB = isPrivateLan(b.ip) ? 0 : 1;
    if (lanA !== lanB) return lanA - lanB;
    const scoreA = adapterScore(a.name);
    const scoreB = adapterScore(b.name);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.name.localeCompare(b.name);
  });

  return candidates[0]?.ip ?? '0.0.0.0';
}

export class LanBomberServer {
  private readonly opts: ServerOptions;
  private readonly log;

  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private tickTimer: NodeJS.Timeout | null = null;

  private udpSocket: dgram.Socket | null = null;
  private udpTimer: NodeJS.Timeout | null = null;
  private hostIpHint: string = '0.0.0.0';

  private players = new Map<string, PlayerConn>();
  private hostId: string = '';

  private phase: Phase = 'lobby';
  private mode: GameMode = 'FFA';
  private mapId: string = 'map1';

  private tick: number = 0;
  private startTick: number = 0;
  private seed: number = 1;
  private rng: RNG = new RNG(1);

  private width: number = 0;
  private height: number = 0;
  private grid: Tile[][] = [];

  private items = new Map<string, Item>();
  private balloons = new Map<string, Balloon>();
  private balloonsByPos = new Map<string, string>();
  private explosions = new Map<string, Explosion>();

  private balloonCounter = 0;
  private explosionCounter = 0;
  private itemCounter = 0;

  constructor(opts: ServerOptions) {
    this.opts = opts;
    this.log = createLogger('server', opts.logLevel);
    this.hostIpHint = getLocalIPv4();
  }

  start(): void {
    if (this.wss) return;

    this.log.info(`Starting HTTP + WebSocket server on port ${this.opts.wsPort}...`);
    this.log.info(`Room name: ${this.opts.roomName}`);

    const app = express();
    const clientDist = path.resolve(__dirname, '../../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      const indexFile = path.join(clientDist, 'index.html');
      if (!fs.existsSync(indexFile)) {
        res.status(404).send('Client build not found. Run: npm --prefix client run build');
        return;
      }
      res.sendFile(indexFile);
    });

    this.httpServer = http.createServer(app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.log.info(`Port ${this.opts.wsPort} is already in use. Stop the other server or use --port <number>.`);
      } else {
        this.log.info(`Server bind error: ${err.message}`);
      }
      this.stop();
    });

    this.wss.on('error', (err: Error) => {
      this.log.info(`WebSocket server error: ${err.message}`);
    });

    this.httpServer.listen(this.opts.wsPort, () => {
      // Start simulation and discovery only after bind succeeds.
      const tickMs = 1000 / TICK_RATE;
      this.tickTimer = setInterval(() => this.step(), tickMs);

      if (this.opts.udp) {
        this.startUdpAnnounce();
      }

      this.log.info('Server started.');
      this.log.info(`Web client: http://${this.hostIpHint}:${this.opts.wsPort}`);
    });

    this.wss.on('connection', (ws: WebSocket, req: { socket: { remoteAddress?: string } }) => {
      if (this.players.size >= MAX_PLAYERS) {
        ws.send(stringifyMessage({ type: 'ServerError', payload: { message: 'Room is full (max 6).' } }));
        ws.close();
        return;
      }

      const id = randomUUID();
      const player: PlayerConn = {
        id,
        ws,
        name: 'Player',
        ready: false,
        team: this.assignTeamOnJoin(),
        state: 'Alive',
        stats: { ...DEFAULT_STATS },
        trappedUntilTick: -1,
        invulnUntilTick: 0,
        inputDir: 'None',
        lastInputSeq: -1,
        placeBalloonQueued: 0,
        move: { moving: false, fromX: 1, fromY: 1, toX: 1, toY: 1, dir: 'None', t: 0 }
      };

      this.players.set(id, player);
      if (!this.hostId) this.hostId = id;

      this.log.info(`Client connected (${req.socket.remoteAddress}). id=${id}`);

      ws.on('message', (data: Buffer | string) => {
        const str = typeof data === 'string' ? data : data.toString('utf8');
        const msg = parseClientMessage(str);
        if (!msg) {
          this.log.debug('Invalid message from client', id, str);
          return;
        }
        this.handleClientMessage(player, msg);
      });

      ws.on('close', () => {
        this.log.info(`Client disconnected id=${id}`);
        this.players.delete(id);
        this.onPlayerLeft(id);
      });

      ws.send(stringifyMessage({ type: 'Welcome', payload: { playerId: id, protocol: PROTOCOL_VERSION } }));
      this.sendRoomState();
    });
  }

  stop(): void {
    this.log.info('Stopping server...');
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.udpTimer) {
      clearInterval(this.udpTimer);
      this.udpTimer = null;
    }
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch {
        // ignore
      }
      this.udpSocket = null;
    }
    if (this.wss) {
      try {
        this.wss.close();
      } catch {
        // ignore
      }
      this.wss = null;
    }
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch {
        // ignore
      }
      this.httpServer = null;
    }
  }

  private startUdpAnnounce(): void {
    this.log.info(`UDP discovery enabled (broadcast port ${this.opts.udpPort}).`);

    this.udpSocket = dgram.createSocket('udp4');
    this.udpSocket.bind(() => {
      if (!this.udpSocket) return;
      this.udpSocket.setBroadcast(true);
    });

    this.udpTimer = setInterval(() => {
      if (!this.udpSocket) return;
      const payload = {
        roomName: this.opts.roomName,
        playerCount: this.players.size,
        wsPort: this.opts.wsPort,
        hostIpHint: this.hostIpHint,
        mode: this.mode,
        mapId: this.mapId
      };
      const msg = JSON.stringify({ type: 'ServerAnnounce', payload });
      const buf = Buffer.from(msg, 'utf8');
      this.udpSocket.send(buf, 0, buf.length, this.opts.udpPort, '255.255.255.255');
    }, 1000);
  }

  private assignTeamOnJoin(): number {
    if (this.mode === 'FFA') return 0;
    // TEAM: alternate teams to keep balanced
    const count = this.players.size;
    return count % 2;
  }

  private onPlayerLeft(leftId: string): void {
    if (this.hostId === leftId) {
      const next = this.players.values().next().value as PlayerConn | undefined;
      this.hostId = next?.id ?? '';
      this.log.info(`Host migrated to ${this.hostId || '(none)'}`);
    }

    // If game is in progress and all players left, reset
    if (this.players.size === 0) {
      this.resetToLobby();
      return;
    }

    this.sendRoomState();
  }

  private handleClientMessage(player: PlayerConn, msg: any): void {
    switch (msg.type) {
      case 'JoinRoom': {
        if (this.phase !== 'lobby' && this.phase !== 'starting') {
          this.sendTo(player.ws, { type: 'ServerError', payload: { message: 'Game already started.' } });
          return;
        }
        player.name = msg.payload.name;
        player.ready = false;
        this.sendRoomState();
        return;
      }
      case 'Ready': {
        if (this.phase !== 'lobby' && this.phase !== 'starting') return;
        player.ready = msg.payload.isReady;
        this.sendRoomState();
        return;
      }
      case 'SetMode': {
        if (player.id !== this.hostId) return;
        if (this.phase !== 'lobby') return;
        this.mode = msg.payload.mode;
        this.log.info(`Mode set to ${this.mode}`);
        // In FFA, force all teams to 0
        if (this.mode === 'FFA') {
          for (const p of this.players.values()) p.team = 0;
        }
        this.sendRoomState();
        return;
      }
      case 'SetMap': {
        if (player.id !== this.hostId) return;
        if (this.phase !== 'lobby') return;
        try {
          getMapPreset(msg.payload.mapId);
          this.mapId = msg.payload.mapId;
          this.log.info(`Map set to ${this.mapId}`);
          this.sendRoomState();
        } catch (e: any) {
          this.sendTo(player.ws, { type: 'ServerError', payload: { message: e?.message ?? 'Invalid map' } });
        }
        return;
      }
      case 'SetTeam': {
        if (this.mode !== 'TEAM') return;
        if (this.phase !== 'lobby') return;
        const team = msg.payload.team;
        if (team !== 0 && team !== 1) return;
        // Enforce 3v3 cap
        const teamCounts = this.countTeams();
        const currentTeam = player.team;
        if (team !== currentTeam) {
          if (teamCounts[team] >= 3) {
            this.sendTo(player.ws, { type: 'ServerError', payload: { message: 'Team is full (max 3).' } });
            return;
          }
          player.team = team;
          this.sendRoomState();
        }
        return;
      }
      case 'StartRequest': {
        if (player.id !== this.hostId) return;
        if (this.phase !== 'lobby') return;
        const everyoneReady = this.areAllReady();
        if (!everyoneReady) {
          this.sendTo(player.ws, { type: 'ServerError', payload: { message: 'Not everyone is Ready.' } });
          return;
        }
        if (this.players.size < 2) {
          this.sendTo(player.ws, { type: 'ServerError', payload: { message: 'Need at least 2 players.' } });
          return;
        }
        if (this.mode === 'TEAM') {
          const counts = this.countTeams();
          if (counts[0] === 0 || counts[1] === 0) {
            this.sendTo(player.ws, { type: 'ServerError', payload: { message: 'TEAM mode needs players on both teams.' } });
            return;
          }
        }

        this.beginStartingCountdown();
        return;
      }
      case 'Input': {
        if (this.phase !== 'inGame') return;
        if (msg.payload.seq <= player.lastInputSeq) return;
        player.lastInputSeq = msg.payload.seq;
        player.inputDir = msg.payload.moveDir;
        if (msg.payload.placeBalloon) {
          player.placeBalloonQueued = Math.min(3, player.placeBalloonQueued + 1); // small cap
        }
        if (msg.payload.useNeedleSlot >= 0) {
          this.tryUseNeedle(player, msg.payload.useNeedleSlot);
        }
        return;
      }
      case 'Ping': {
        // Reply pong
        const pong: ServerToClientMessage = {
          type: 'Pong',
          payload: { clientTime: msg.payload.clientTime, serverTime: Date.now(), tick: this.tick }
        };
        this.sendTo(player.ws, pong);
        return;
      }
      default:
        return;
    }
  }

  private beginStartingCountdown(): void {
    this.seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.rng = new RNG(this.seed);
    this.phase = 'starting';
    this.startTick = this.tick + TICK_RATE; // ~1 second countdown

    const startMsg: ServerToClientMessage = {
      type: 'StartGame',
      payload: {
        seed: this.seed,
        mapId: this.mapId,
        startTick: this.startTick,
        mode: this.mode
      }
    };
    this.broadcast(startMsg);
    this.sendEvent('ServerNotice', { text: 'Starting game...' });

    this.log.info(`Game starting at tick=${this.startTick}, seed=${this.seed}, map=${this.mapId}, mode=${this.mode}`);
  }

  private resetToLobby(): void {
    this.phase = 'lobby';
    this.startTick = 0;
    this.items.clear();
    this.balloons.clear();
    this.balloonsByPos.clear();
    this.explosions.clear();
    this.grid = [];
    this.width = 0;
    this.height = 0;
    this.balloonCounter = 0;
    this.explosionCounter = 0;
    this.itemCounter = 0;

    // Reset readiness and in-game state
    for (const p of this.players.values()) {
      p.ready = false;
      p.state = 'Alive';
      p.stats = { ...DEFAULT_STATS };
      p.invulnUntilTick = 0;
      p.trappedUntilTick = -1;
      p.inputDir = 'None';
      p.placeBalloonQueued = 0;
      p.lastInputSeq = -1;
      p.move = { moving: false, fromX: 1, fromY: 1, toX: 1, toY: 1, dir: 'None', t: 0 };
    }

    this.sendRoomState();
  }

  private areAllReady(): boolean {
    if (this.players.size === 0) return false;
    for (const p of this.players.values()) {
      if (!p.ready) return false;
    }
    return true;
  }

  private countTeams(): Record<number, number> {
    const counts: Record<number, number> = { 0: 0, 1: 0 };
    for (const p of this.players.values()) {
      counts[p.team] = (counts[p.team] ?? 0) + 1;
    }
    return counts;
  }

  private step(): void {
    this.tick++;

    if (this.phase === 'starting' && this.tick >= this.startTick) {
      this.startGame();
    }

    if (this.phase === 'inGame') {
      this.simulate();
      this.checkWinCondition();
    }

    // 20Hz snapshot
    if (this.phase === 'inGame' || this.phase === 'starting' || this.phase === 'postGame') {
      if (this.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
        this.broadcast({ type: 'Snapshot', payload: this.buildSnapshot() });
      }
    }
  }

  private startGame(): void {
    this.phase = 'inGame';

    const preset = getMapPreset(this.mapId);
    this.buildMap(preset);

    // Spawn players
    const spawn = this.pickSpawnPoints(preset);
    let idx = 0;
    for (const p of this.players.values()) {
      const sp = spawn[idx % spawn.length];
      idx++;

      p.state = 'Alive';
      p.stats = { ...DEFAULT_STATS };
      p.invulnUntilTick = this.tick + RESCUE_INVULN_TICKS; // small spawn protection
      p.trappedUntilTick = -1;
      p.inputDir = 'None';
      p.placeBalloonQueued = 0;
      p.lastInputSeq = -1;
      p.move = {
        moving: false,
        fromX: sp.x,
        fromY: sp.y,
        toX: sp.x,
        toY: sp.y,
        dir: 'None',
        t: 0
      };
    }

    // Clear entity state
    this.items.clear();
    this.balloons.clear();
    this.balloonsByPos.clear();
    this.explosions.clear();
    this.balloonCounter = 0;
    this.explosionCounter = 0;
    this.itemCounter = 0;

    this.sendEvent('ServerNotice', { text: 'Game started!' });

    // Send an immediate snapshot
    this.broadcast({ type: 'Snapshot', payload: this.buildSnapshot() });
  }

  private pickSpawnPoints(preset: MapPreset): XY[] {
    // In TEAM mode we keep spawn points stable; in FFA shuffle
    const points = [...preset.spawnPoints];
    if (this.mode === 'FFA') {
      // Deterministic shuffle based on RNG
      for (let i = points.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        [points[i], points[j]] = [points[j], points[i]];
      }
    }
    return points;
  }

  private buildMap(preset: MapPreset): void {
    this.width = preset.width;
    this.height = preset.height;

    // Base grid: solid walls and empty
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      const row: Tile[] = [];
      const line = preset.grid[y];
      if (!line || line.length !== this.width) {
        throw new Error(`Invalid map grid row ${y}`);
      }
      for (let x = 0; x < this.width; x++) {
        const ch = line[x];
        row.push(ch === '#' ? 'SolidWall' : 'Empty');
      }
      this.grid.push(row);
    }

    // Protected cells: spawn + adjacent
    const protectedSet = new Set<string>();
    const protect = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      protectedSet.add(keyXY(x, y));
    };
    for (const sp of preset.spawnPoints) {
      protect(sp.x, sp.y);
      protect(sp.x + 1, sp.y);
      protect(sp.x - 1, sp.y);
      protect(sp.x, sp.y + 1);
      protect(sp.x, sp.y - 1);
    }

    // Fill soft blocks deterministically
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] !== 'Empty') continue;
        if (protectedSet.has(keyXY(x, y))) continue;
        if (this.rng.next() < SOFTBLOCK_FILL_PROB) {
          this.grid[y][x] = 'SoftBlock';
        }
      }
    }

    // Ensure spawn points are empty
    for (const sp of preset.spawnPoints) {
      this.grid[sp.y][sp.x] = 'Empty';
      if (sp.x + 1 < this.width) this.grid[sp.y][sp.x + 1] = 'Empty';
      if (sp.x - 1 >= 0) this.grid[sp.y][sp.x - 1] = 'Empty';
      if (sp.y + 1 < this.height) this.grid[sp.y + 1][sp.x] = 'Empty';
      if (sp.y - 1 >= 0) this.grid[sp.y - 1][sp.x] = 'Empty';
    }

    this.log.info(`Map built: ${preset.id} (${this.width}x${this.height})`);
  }

  private simulate(): void {
    // 1) Movement and placing
    for (const p of this.players.values()) {
      if (p.state !== 'Alive') continue;

      // If trapped somehow (should be state), skip
      if (this.tick < p.invulnUntilTick) {
        // still can move; invuln is only for damage
      }

      this.simulateMovement(p);

      if (p.placeBalloonQueued > 0) {
        // Consume one placement per tick max
        p.placeBalloonQueued--;
        this.tryPlaceBalloon(p);
      }
    }

    // 2) Items pickup
    for (const p of this.players.values()) {
      if (p.state !== 'Alive') continue;
      const occ = this.getPlayerOccupyTile(p);
      const itemId = this.findItemAt(occ.x, occ.y);
      if (itemId) {
        const item = this.items.get(itemId);
        if (item) {
          this.applyItem(p, item);
          this.items.delete(itemId);
          this.sendEvent('ItemPicked', { playerId: p.id, itemType: item.itemType, x: item.x, y: item.y });
        }
      }
    }

    // 3) Rescue (TEAM mode)
    if (this.mode === 'TEAM') {
      for (const trapped of this.players.values()) {
        if (trapped.state !== 'Trapped') continue;
        const tpos = this.getPlayerOccupyTile(trapped);
        for (const rescuer of this.players.values()) {
          if (rescuer.state !== 'Alive') continue;
          if (rescuer.team !== trapped.team) continue;
          const rpos = this.getPlayerOccupyTile(rescuer);
          if (rpos.x === tpos.x && rpos.y === tpos.y) {
            trapped.state = 'Alive';
            trapped.invulnUntilTick = this.tick + RESCUE_INVULN_TICKS;
            trapped.trappedUntilTick = -1;
            this.sendEvent('PlayerRescued', { playerId: trapped.id, byPlayerId: rescuer.id });
            break;
          }
        }
      }
    }

    // 4) Trapped -> Dead
    for (const p of this.players.values()) {
      if (p.state !== 'Trapped') continue;
      if (p.trappedUntilTick >= 0 && this.tick >= p.trappedUntilTick) {
        p.state = 'Dead';
        this.sendEvent('PlayerDied', { playerId: p.id });
      }
    }

    // 5) Explosions expire
    for (const [id, ex] of this.explosions.entries()) {
      if (this.tick >= ex.endTick) {
        this.explosions.delete(id);
      }
    }

    // 6) Balloon explosions (including chain)
    this.processBalloonExplosions();
  }

  private simulateMovement(p: PlayerConn): void {
    simulateMovementSystem(p, {
      width: this.width,
      height: this.height,
      grid: this.grid,
      balloonsByPos: this.balloonsByPos,
      balloons: this.balloons
    });
  }

  private canEnterTile(x: number, y: number, playerId: string): boolean {
    return canEnterTileSystem(x, y, playerId, {
      width: this.width,
      height: this.height,
      grid: this.grid,
      balloonsByPos: this.balloonsByPos,
      balloons: this.balloons
    });
  }

  private getPlayerOccupyTile(p: PlayerConn): { x: number; y: number } {
    return getPlayerOccupyTileSystem(p);
  }

  private getPlayerRenderPos(p: PlayerConn): { x: number; y: number } {
    return getPlayerRenderPosSystem(p);
  }

  private tryPlaceBalloon(p: PlayerConn): void {
    if (p.state !== 'Alive') return;
    if (p.move.moving) return; // simple rule for determinism

    const pos = this.getPlayerOccupyTile(p);
    const x = pos.x;
    const y = pos.y;

    if (this.grid[y][x] !== 'Empty') return;
    if (this.balloonsByPos.has(keyXY(x, y))) return;
    if (this.findItemAt(x, y)) return;

    const currentOwned = this.countBalloonsOwnedBy(p.id);
    if (currentOwned >= p.stats.balloonCount) return;

    const id = `b${++this.balloonCounter}`;
    const balloon: Balloon = {
      id,
      x,
      y,
      ownerId: p.id,
      explodeTick: this.tick + BALLOON_FUSE_TICKS,
      power: p.stats.power,
      passableBy: new Set([p.id])
    };

    this.balloons.set(id, balloon);
    this.balloonsByPos.set(keyXY(x, y), id);

    this.sendEvent('BalloonPlaced', { balloonId: id, ownerId: p.id, x, y, explodeTick: balloon.explodeTick });
  }

  private countBalloonsOwnedBy(playerId: string): number {
    let n = 0;
    for (const b of this.balloons.values()) {
      if (b.ownerId === playerId) n++;
    }
    return n;
  }

  private processBalloonExplosions(): void {
    // Collect due balloons
    const pending: string[] = [];
    const scheduled = new Set<string>();
    for (const b of this.balloons.values()) {
      if (b.explodeTick <= this.tick) {
        pending.push(b.id);
        scheduled.add(b.id);
      }
    }

    // Deterministic queue: sort by (y,x,id)
    const sortPending = () => {
      pending.sort((a, b) => {
        const ba = this.balloons.get(a);
        const bb = this.balloons.get(b);
        if (!ba && !bb) return a.localeCompare(b);
        if (!ba) return 1;
        if (!bb) return -1;
        if (ba.y !== bb.y) return ba.y - bb.y;
        if (ba.x !== bb.x) return ba.x - bb.x;
        return ba.id.localeCompare(bb.id);
      });
    };

    while (pending.length > 0) {
      sortPending();
      const id = pending.shift()!;
      const balloon = this.balloons.get(id);
      if (!balloon) continue; // already exploded via chain

      // Explode
      this.explodeBalloon(balloon, pending, scheduled);
    }
  }

  private explodeBalloon(balloon: Balloon, pending: string[], scheduled: Set<string>): void {
    const { x: ox, y: oy } = balloon;

    // Remove balloon first
    this.balloons.delete(balloon.id);
    this.balloonsByPos.delete(keyXY(ox, oy));

    const tiles = this.computeExplosionTiles(ox, oy, balloon.power);
    const exId = `e${++this.explosionCounter}`;
    const explosion: Explosion = {
      id: exId,
      originX: ox,
      originY: oy,
      tiles,
      endTick: this.tick + EXPLOSION_DURATION_TICKS
    };
    this.explosions.set(exId, explosion);

    this.sendEvent('BalloonExploded', { balloonId: balloon.id, x: ox, y: oy, tiles });

    // Apply effects
    for (const t of tiles) {
      // Items can be destroyed by explosions
      const itemId = this.findItemAt(t.x, t.y);
      if (itemId) {
        this.items.delete(itemId);
      }

      // Trap players
      for (const p of this.players.values()) {
        if (p.state !== 'Alive') continue;
        if (this.tick < p.invulnUntilTick) continue;
        const occ = this.getPlayerOccupyTile(p);
        if (occ.x === t.x && occ.y === t.y) {
          p.state = 'Trapped';
          p.trappedUntilTick = this.tick + TRAP_DURATION_TICKS;
          p.inputDir = 'None';
          p.placeBalloonQueued = 0;
          // Stop movement at current tile
          const occ2 = this.getPlayerOccupyTile(p);
          p.move = { moving: false, fromX: occ2.x, fromY: occ2.y, toX: occ2.x, toY: occ2.y, dir: 'None', t: 0 };
          this.sendEvent('PlayerTrapped', { playerId: p.id, x: t.x, y: t.y });
        }
      }

      // Chain reaction
      const bid = this.balloonsByPos.get(keyXY(t.x, t.y));
      if (bid) {
        const b2 = this.balloons.get(bid);
        if (b2 && !scheduled.has(b2.id)) {
          b2.explodeTick = this.tick;
          pending.push(b2.id);
          scheduled.add(b2.id);
        }
      }
    }

    // Destroy soft blocks (done after player/bomb checks for determinism)
    // NOTE: We must also stop propagation beyond a soft block, which is already handled in computeExplosionTiles.
    for (const t of tiles) {
      if (this.grid[t.y][t.x] === 'SoftBlock') {
        this.grid[t.y][t.x] = 'Empty';
        this.sendEvent('BlockDestroyed', { x: t.x, y: t.y });

        if (this.rng.next() < ITEM_DROP_CHANCE) {
          const itemType = this.rollItemType();
          const itemId = `i${++this.itemCounter}`;
          const item: Item = { id: itemId, x: t.x, y: t.y, itemType };
          this.items.set(itemId, item);
          this.sendEvent('ItemSpawned', { id: itemId, x: t.x, y: t.y, itemType });
        }
      }
    }
  }

  private computeExplosionTiles(ox: number, oy: number, power: number): XY[] {
    const tiles: XY[] = [{ x: ox, y: oy }];

    const dirs: Array<{ dx: number; dy: number }> = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const { dx, dy } of dirs) {
      for (let i = 1; i <= power; i++) {
        const x = ox + dx * i;
        const y = oy + dy * i;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) break;
        const tile = this.grid[y][x];
        if (tile === 'SolidWall') {
          break; // stop, do not include
        }
        tiles.push({ x, y });
        if (tile === 'SoftBlock') {
          break; // include soft block, stop
        }
      }
    }

    return tiles;
  }

  private rollItemType(): ItemType {
    return rollItemTypeSystem(() => this.rng.next());
  }

  private findItemAt(x: number, y: number): string | null {
    return findItemAtSystem(this.items, x, y);
  }

  private applyItem(p: PlayerConn, item: Item): void {
    applyItemSystem(p, item);
  }

  private tryUseNeedle(p: PlayerConn, slot: number): void {
    if (this.phase !== 'inGame') return;
    if (p.state !== 'Trapped') return;
    if (slot < 0 || slot > 2) return;
    if (p.stats.needle <= slot) return;
    if (p.stats.needle <= 0) return;

    p.stats.needle -= 1;
    p.state = 'Alive';
    p.trappedUntilTick = -1;
    p.invulnUntilTick = this.tick + RESCUE_INVULN_TICKS;
    p.inputDir = 'None';
    p.placeBalloonQueued = 0;

    const occ = this.getPlayerOccupyTile(p);
    p.move = { moving: false, fromX: occ.x, fromY: occ.y, toX: occ.x, toY: occ.y, dir: 'None', t: 0 };

    this.sendEvent('PlayerRescued', { playerId: p.id, byPlayerId: p.id });
  }

  private checkWinCondition(): void {
    if (this.phase !== 'inGame') return;

    const aliveOrTrapped = [...this.players.values()].filter((p) => p.state !== 'Dead');

    if (this.mode === 'FFA') {
      if (aliveOrTrapped.length <= 1) {
        const winner = aliveOrTrapped[0]?.id ?? null;
        this.phase = 'postGame';
        this.sendEvent('RoundEnded', { mode: 'FFA', winnerId: winner });
        this.log.info(`Round ended (FFA). winner=${winner}`);
        // Return to lobby after short delay
        setTimeout(() => this.resetToLobby(), 3000);
      }
      return;
    }

    // TEAM
    const teamAlive: Record<number, number> = { 0: 0, 1: 0 };
    for (const p of aliveOrTrapped) {
      teamAlive[p.team] = (teamAlive[p.team] ?? 0) + 1;
    }

    if (teamAlive[0] === 0 || teamAlive[1] === 0) {
      const winnerTeam = teamAlive[0] === 0 ? 1 : 0;
      this.phase = 'postGame';
      this.sendEvent('RoundEnded', { mode: 'TEAM', winnerTeam });
      this.log.info(`Round ended (TEAM). winnerTeam=${winnerTeam}`);
      setTimeout(() => this.resetToLobby(), 3000);
    }
  }

  private buildSnapshot(): SnapshotPayload {
    const players = [...this.players.values()].map((p) => {
      const pos = this.getPlayerRenderPos(p);
      const occ = this.getPlayerOccupyTile(p);
      return {
        id: p.id,
        name: p.name,
        x: pos.x,
        y: pos.y,
        tileX: occ.x,
        tileY: occ.y,
        state: p.state,
        team: p.team,
        stats: p.stats,
        invulnerable: this.tick < p.invulnUntilTick
      };
    });

    const balloons = [...this.balloons.values()].map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      ownerId: b.ownerId,
      explodeTick: b.explodeTick,
      power: b.power
    }));

    const explosions = [...this.explosions.values()].map((e) => ({
      id: e.id,
      originX: e.originX,
      originY: e.originY,
      tiles: e.tiles,
      endTick: e.endTick
    }));

    const items = [...this.items.values()].map((it) => ({
      id: it.id,
      x: it.x,
      y: it.y,
      itemType: it.itemType
    }));

    const blocks: Array<{ x: number; y: number; kind: BlockKind }> = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.grid[y][x];
        if (t === 'SolidWall') blocks.push({ x, y, kind: 'SolidWall' });
        if (t === 'SoftBlock') blocks.push({ x, y, kind: 'SoftBlock' });
      }
    }

    return {
      tick: this.tick,
      players,
      balloons,
      explosions,
      items,
      blocks
    };
  }

  private sendRoomState(): void {
    const payload: RoomStatePayload = {
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team })),
      readyStates: Object.fromEntries([...this.players.values()].map((p) => [p.id, p.ready])),
      hostId: this.hostId,
      mode: this.mode,
      mapId: this.mapId
    };

    this.broadcast({ type: 'RoomState', payload });
  }

  private sendEvent(type: GameEventType, payload: any): void {
    const msg: ServerToClientMessage = {
      type: 'Event',
      payload: {
        tick: this.tick,
        type,
        payload
      } as EventMessagePayload
    };
    this.broadcast(msg);
  }

  private broadcast(msg: ServerToClientMessage): void {
    const data = stringifyMessage(msg);
    for (const p of this.players.values()) {
      if (p.ws.readyState === WebSocket.OPEN) {
        try {
          p.ws.send(data);
        } catch {
          // ignore
        }
      }
    }
  }

  private sendTo(ws: WebSocket, msg: ServerToClientMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(stringifyMessage(msg));
    } catch {
      // ignore
    }
  }
}
