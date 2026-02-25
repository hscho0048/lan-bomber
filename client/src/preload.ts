import { contextBridge, ipcRenderer } from 'electron';

export type DiscoveryRoomInfo = {
  roomName: string;
  playerCount: number;
  wsPort: number;
  hostIpHint: string;
  mode: string;
  mapId: string;
  remoteAddress: string;
  lastSeen: number;
};

contextBridge.exposeInMainWorld('lanApi', {
  startServer: (opts: { port: number; roomName: string; udpPort?: number; logLevel?: string }) =>
    ipcRenderer.invoke('host:startServer', opts),
  stopServer: (port?: number) => ipcRenderer.invoke('host:stopServer', port),

  startDiscovery: (port: number) => ipcRenderer.invoke('discovery:start', port),
  stopDiscovery: () => ipcRenderer.invoke('discovery:stop'),
  onDiscoveryUpdate: (cb: (rooms: DiscoveryRoomInfo[]) => void) => {
    const listener = (_: any, rooms: DiscoveryRoomInfo[]) => cb(rooms);
    ipcRenderer.on('discovery:update', listener);
    return () => ipcRenderer.off('discovery:update', listener);
  },

  getLocalIps: () => ipcRenderer.invoke('net:getLocalIps')
});
