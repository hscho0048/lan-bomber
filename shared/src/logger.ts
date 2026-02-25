export type LogLevel = 'info' | 'debug';

export interface Logger {
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export function createLogger(scope: string, level: LogLevel = 'info'): Logger {
  const prefix = `[${scope}]`;
  const allowDebug = level === 'debug';

  return {
    info: (...args: any[]) => console.log(prefix, ...args),
    debug: (...args: any[]) => {
      if (allowDebug) console.log(prefix, ...args);
    },
    error: (...args: any[]) => console.error(prefix, ...args)
  };
}

export function parseLogLevel(value: unknown, fallback: LogLevel = 'info'): LogLevel {
  if (value === 'debug') return 'debug';
  if (value === 'info') return 'info';
  return fallback;
}
