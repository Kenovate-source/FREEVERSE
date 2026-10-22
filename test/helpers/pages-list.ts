// The route ids that src/pages/index.tsx registers, read from source so this test needs no DOM or React runtime.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../src/pages/index.tsx', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export const PAGES'));
export const PAGES_FOR_TEST: string[] = [...body.matchAll(/(?:^|[\s,{])'?([a-z][a-z-]*)'?\s*:\s*(?:w\()?[A-Z]/g)].map((m) => m[1]!);
