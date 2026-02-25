type DiscoveryRoomInfo = {
  roomName: string;
  playerCount: number;
  wsPort: number;
  hostIpHint: string;
  mode: string;
  mapId: string;
  remoteAddress: string;
  lastSeen: number;
};

declare global {
  interface Window {
    lanApi?: {
      startServer: (opts: { port: number; roomName: string; udpPort?: number; logLevel?: string }) => Promise<any>;
      stopServer: () => Promise<any>;
      startDiscovery: (port: number) => Promise<any>;
      stopDiscovery: () => Promise<any>;
      onDiscoveryUpdate: (cb: (rooms: DiscoveryRoomInfo[]) => void) => () => void;
      getLocalIps: () => Promise<string[]>;
    };
  }
}

export {};
