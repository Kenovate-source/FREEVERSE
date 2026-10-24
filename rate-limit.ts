import { tooMany } from '../http/errors';

/** In-memory sliding-window limiter. Per-process; a shared store (Redis) is needed once there is more than one instance. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = () => Date.now()) {}
  check(key: string, limit: number, windowMs: number): void {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (arr.length >= limit) {
      this.hits.set(key, arr);
      throw tooMany('You are doing that too quickly. Please wait a moment and try again.', Math.ceil(windowMs / 1000));
    }
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 20000) for (const [k, v] of this.hits) if (!v.length || t - v[v.length - 1]! > windowMs * 4) this.hits.delete(k);
  }
}
