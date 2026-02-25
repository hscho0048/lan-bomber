declare module 'express' {
  import type http from 'node:http';

  interface ResponseLike {
    status(code: number): ResponseLike;
    send(body: string): void;
    sendFile(filePath: string): void;
    setHeader(name: string, value: string): void;
  }

  interface AppLike {
    (req: any, res: any): void;
    use(handler: any): void;
    use(path: string, handler: any): void;
    get(path: string, handler: (req: any, res: ResponseLike) => void): void;
    options(path: string, handler: (req: any, res: ResponseLike) => void): void;
  }

  interface ExpressStatic {
    (root: string): any;
  }

  interface ExpressFactory {
    (): AppLike;
    static: ExpressStatic;
  }

  const express: ExpressFactory;
  export default express;
}
