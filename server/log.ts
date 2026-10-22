const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
export type LogLevel = keyof typeof LEVELS;
const SECRET_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|service[-_]?role|birth_?day/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

export interface Logger {
  error(msg: string, f?: Record<string, unknown>): void;
  warn(msg: string, f?: Record<string, unknown>): void;
  info(msg: string, f?: Record<string, unknown>): void;
  debug(msg: string, f?: Record<string, unknown>): void;
  child(f: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel = 'info', base: Record<string, unknown> = {}, sink: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const emit = (lvl: Exclude<LogLevel, 'silent'>) => (msg: string, f: Record<string, unknown> = {}) => {
    if (LEVELS[lvl] > LEVELS[level]) return;
    sink(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...(redact({ ...base, ...f }) as object) }));
  };
  return {
    error: emit('error'), warn: emit('warn'), info: emit('info'), debug: emit('debug'),
    child: (f) => createLogger(level, { ...base, ...f }, sink),
  };
}
