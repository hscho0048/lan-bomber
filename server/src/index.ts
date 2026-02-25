import { DEFAULT_UDP_ANNOUNCE_PORT, DEFAULT_WS_PORT, parseLogLevel } from '@lan-bomber/shared';
import { LanBomberServer } from './game/LanBomberServer';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

const wsPort = Number(getArg('--port') ?? process.env.WS_PORT ?? DEFAULT_WS_PORT);
const roomName = (getArg('--room') ?? process.env.ROOM_NAME ?? 'LAN Bomber Room').toString();
const udpPort = Number(getArg('--udpPort') ?? process.env.UDP_PORT ?? DEFAULT_UDP_ANNOUNCE_PORT);
const udpEnabled = !hasFlag('--no-udp');
const logLevel = parseLogLevel(getArg('--log') ?? process.env.LOG_LEVEL ?? 'info');

const server = new LanBomberServer({
  wsPort,
  roomName,
  udp: udpEnabled,
  udpPort,
  logLevel
});

server.start();

process.on('SIGINT', () => {
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
