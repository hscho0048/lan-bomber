declare module 'ws' {
  export class WebSocket {
    static readonly OPEN: number;
    readyState: number;
    send(data: string | Buffer): void;
    close(): void;
    on(event: 'message', listener: (data: Buffer | string) => void): this;
    on(event: 'close', listener: () => void): this;
  }

  export class WebSocketServer {
    constructor(options: { port: number } | { server: any });
    on(event: 'connection', listener: (ws: WebSocket, req: { socket: { remoteAddress?: string } }) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    close(): void;
  }
}
