/** Counts failed attempts per key in memory (one app process). After `max` failures within `windowMs`, the key is locked until the window passes. */
export class FailureLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  blocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  fail(key: string): void {
    this.hits.set(key, [...this.recent(key), this.now()]);
    if (this.hits.size > 10000) this.hits.delete(this.hits.keys().next().value!);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}
