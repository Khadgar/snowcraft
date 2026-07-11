import { Vector2 } from './Vector2';

/**
 * Generic object pool to avoid runtime allocations (design §26).
 *
 * `factory` creates a fresh instance, `reset` returns an instance to a neutral
 * state before reuse. Released objects must not be referenced afterwards.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset?: (obj: T) => void,
    initialSize = 0,
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.free.push(factory());
    }
  }

  acquire(): T {
    const obj = this.free.pop();
    return obj ?? this.factory();
  }

  release(obj: T): void {
    this.reset?.(obj);
    this.free.push(obj);
  }

  get available(): number {
    return this.free.length;
  }
}

/**
 * Shared pool of scratch {@link Vector2} instances for temporary math inside a
 * single function scope. Always release what you acquire.
 */
class Vec2PoolImpl {
  private readonly pool = new ObjectPool<Vector2>(
    () => new Vector2(),
    (v) => v.set(0, 0),
    32,
  );

  acquire(x = 0, y = 0): Vector2 {
    return this.pool.acquire().set(x, y);
  }

  release(...vecs: Vector2[]): void {
    for (const v of vecs) {
      this.pool.release(v);
    }
  }
}

export const Vec2Pool = new Vec2PoolImpl();
