/** Entity identity primitives (design §7). Entities are plain data. */

export type EntityId = number;

export interface Entity {
  readonly id: EntityId;
}

/** Monotonic id source for a single simulation world. */
export class IdAllocator {
  private next = 1;

  allocate(): EntityId {
    return this.next++;
  }

  reset(): void {
    this.next = 1;
  }
}
