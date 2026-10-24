import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { StorageProvider } from './types';

/** Disk storage for local development. Keys are validated so a key can never escape the storage directory. */
export function createLocalStorage(dir: string): StorageProvider {
  const root = resolve(dir);
  const path = (key: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,200}$/.test(key) || key.includes('..')) throw new Error('invalid storage key');
    const p = resolve(join(root, key));
    if (!p.startsWith(root + sep)) throw new Error('invalid storage key');
    return p;
  };
  return {
    kind: 'local',
    async put(key, data, mime) {
      const p = path(key);
      await mkdir(resolve(p, '..'), { recursive: true });
      await writeFile(p, data);
      await writeFile(p + '.mime', mime);
    },
    async get(key) {
      try {
        const p = path(key);
        return { data: await readFile(p), mime: (await readFile(p + '.mime', 'utf8')).trim() };
      } catch { return null; }
    },
    async delete(key) {
      const p = path(key);
      await rm(p, { force: true });
      await rm(p + '.mime', { force: true });
    },
  };
}

/** In-memory storage for tests. */
export function createMemoryStorage(): StorageProvider & { size(): number } {
  const m = new Map<string, { data: Buffer; mime: string }>();
  return {
    kind: 'local',
    async put(k, d, mime) { m.set(k, { data: d, mime }); },
    async get(k) { return m.get(k) ?? null; },
    async delete(k) { m.delete(k); },
    size: () => m.size,
  };
}
