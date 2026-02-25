import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dgram from 'node:dgram';
import { spawn } from 'node:child_process';
import { parseServerAnnounceMessage, type ServerAnnouncePayload, DEFAULT_UDP_ANNOUNCE_PORT } from '@lan-bomber/shared';

let mainWindow: BrowserWindow | null = null;
const serverProcs = new Map<number, ReturnType<typeof spawn>>();

let discoverySocket: dgram.Socket | null = null;
let discoveryPruneTimer: NodeJS.Timeout | null = null;

type DiscoveredRoom = ServerAnnouncePayload & {
  key: string;
  lastSeen: number;
  remoteAddress: string;
};

const discoveredRooms = new Map<string, DiscoveredRoom>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    setupDevAutoReload();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupDevAutoReload() {
  if (!mainWindow) return;
  const distDir = __dirname;
  let t: NodeJS.Timeout | null = null;

  try {
    fs.watch(distDir, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.js') && !filename.endsWith('.html') && !filename.endsWith('.css')) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (!mainWindow) return;
        mainWindow.webContents.reloadIgnoringCache();
      }, 150);
    });
  } catch {
    // ignore
  }
}

function getLocalIps(): string[] {
  const nets = os.networkInterfaces();
  const out: Array<{ name: string; ip: string }> = [];
  for (const name of Object.keys(nets)) {
    const list = nets[name];
    if (!list) continue;
    for (const net of list) {
      if (net.family !== 'IPv4') continue;
      if (net.internal) continue;
      if (net.address.startsWith('169.254.')) continue;
      out.push({ name, ip: net.address });
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

  out.sort((a, b) => {
    const lanA = isPrivateLan(a.ip) ? 0 : 1;
    const lanB = isPrivateLan(b.ip) ? 0 : 1;
    if (lanA !== lanB) return lanA - lanB;
    const scoreA = adapterScore(a.name);
    const scoreB = adapterScore(b.name);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.name.localeCompare(b.name);
  });

  return out.map((x) => x.ip);
}

async function startServer(opts: { port: number; roomName: string; udpPort?: number; logLevel?: string }) {
  if (serverProcs.has(opts.port)) {
    return { ok: true, alreadyRunning: true };
  }

  const appPath = app.getAppPath();
  const script = path.resolve(appPath, '..', 'server', 'dist', 'index.js');

  if (!fs.existsSync(script)) {
    return { ok: false, error: `Server build not found at ${script}. Run: npm run dev:server OR npm run dev:client (from repo root).` };
  }

  const udpPort = opts.udpPort ?? DEFAULT_UDP_ANNOUNCE_PORT;
  const args = [script, '--port', String(opts.port), '--room', opts.roomName, '--udpPort', String(udpPort)];

  const proc = spawn(process.execPath, args, {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      LOG_LEVEL: opts.logLevel ?? process.env.LOG_LEVEL ?? 'info'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcs.set(opts.port, proc);

  proc.stdout.on('data', (d) => {
    const s = d.toString('utf8');
    console.log('[server]', s.trimEnd());
  });
  proc.stderr.on('data', (d) => {
    const s = d.toString('utf8');
    console.error('[server]', s.trimEnd());
  });

  proc.on('exit', (code) => {
    console.log('[server] exited', code);
    serverProcs.delete(opts.port);
  });

  return { ok: true, alreadyRunning: false };
}

async function stopServer(port?: number) {
  if (port !== undefined) {
    const proc = serverProcs.get(port);
    if (proc) { try { proc.kill('SIGINT'); } catch { /* ignore */ } serverProcs.delete(port); }
  } else {
    for (const [, proc] of serverProcs) { try { proc.kill('SIGINT'); } catch { /* ignore */ } }
    serverProcs.clear();
  }
  return { ok: true };
}

function sendDiscoveryUpdate() {
  if (!mainWindow) return;
  const list = [...discoveredRooms.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((r) => ({
      roomName: r.roomName,
      playerCount: r.playerCount,
      wsPort: r.wsPort,
      hostIpHint: r.hostIpHint,
      mode: r.mode,
      mapId: r.mapId,
      remoteAddress: r.remoteAddress,
      lastSeen: r.lastSeen
    }));

  mainWindow.webContents.send('discovery:update', list);
}

async function startDiscovery(port: number) {
  if (discoverySocket) return { ok: true, alreadyRunning: true };

  discoveredRooms.clear();
  sendDiscoveryUpdate();

  discoverySocket = dgram.createSocket('udp4');
  discoverySocket.on('message', (msg, rinfo) => {
    const str = msg.toString('utf8');
    const parsed = parseServerAnnounceMessage(str);
    if (!parsed) return;
    const payload = parsed.payload;

    const now = Date.now();
    const key = `${rinfo.address}:${payload.wsPort}`;
    discoveredRooms.set(key, {
      ...payload,
      key,
      lastSeen: now,
      remoteAddress: rinfo.address
    });
    sendDiscoveryUpdate();
  });

  await new Promise<void>((resolve, reject) => {
    if (!discoverySocket) return reject(new Error('no socket'));
    discoverySocket.once('error', reject);
    discoverySocket.bind(port, () => resolve());
  });

  discoveryPruneTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of discoveredRooms.entries()) {
      if (now - v.lastSeen > 3500) {
        discoveredRooms.delete(k);
        changed = true;
      }
    }
    if (changed) sendDiscoveryUpdate();
  }, 1000);

  return { ok: true, alreadyRunning: false };
}

async function stopDiscovery() {
  if (discoveryPruneTimer) {
    clearInterval(discoveryPruneTimer);
    discoveryPruneTimer = null;
  }
  if (discoverySocket) {
    try {
      discoverySocket.close();
    } catch {
      // ignore
    }
    discoverySocket = null;
  }
  discoveredRooms.clear();
  sendDiscoveryUpdate();
  return { ok: true };
}

ipcMain.handle('host:startServer', async (_evt, opts) => startServer(opts));
ipcMain.handle('host:stopServer', async (_evt, port?: number) => stopServer(port));
ipcMain.handle('discovery:start', async (_evt, port) => startDiscovery(port));
ipcMain.handle('discovery:stop', async () => stopDiscovery());
ipcMain.handle('net:getLocalIps', async () => getLocalIps());

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await stopDiscovery();
  await stopServer();
});
