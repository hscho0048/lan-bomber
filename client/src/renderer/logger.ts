export type LogLevel = 'info' | 'debug';

export function createLogger(logEl: HTMLPreElement, level: LogLevel = 'info') {
  return (msgLevel: LogLevel, msg: string) => {
    if (msgLevel === 'debug' && level !== 'debug') return;
    const time = new Date().toLocaleTimeString();
    logEl.textContent = `[${time}] ${msg}\n` + (logEl.textContent ?? '');
  };
}
