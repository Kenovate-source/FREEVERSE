import type { Config } from '../config';
import type { Db } from '../db';
import type { Logger } from '../log';
import type { AuthProvider } from '../auth/types';
import type { StorageProvider } from '../storage/types';
import type { AiRuntime } from '../ai/providers';
import { RateLimiter } from './rate-limit';

/** Everything a module may depend on. Tests build this with fakes (in-memory DB, fake clock, memory storage). */
export interface Services {
  config: Config;
  db: Db;
  log: Logger;
  auth: AuthProvider;
  storage: StorageProvider;
  ai: AiRuntime;
  rate: RateLimiter;
  /** Injected clock: always use this instead of `new Date()` so behaviour is testable. */
  now(): Date;
}
export { RateLimiter };
