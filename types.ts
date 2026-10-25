import type { Router } from '../http/router';
import type { Services } from '../services';

export interface ModuleDef {
  name: string;
  /** Registers HTTP routes. Must not do I/O at import time. */
  register(router: Router, s: Services): void;
  /** Optional idempotent seed (reference data / demo data). Called at start-up after migrations. */
  seed?(s: Services): Promise<void>;
}
