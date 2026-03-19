export class ResidentSpritePool<T> {
  private readonly available: T[] = []
  private readonly factory: () => T

  constructor(factory: () => T) {
    this.factory = factory
  }

  acquire(): T {
    return this.available.pop() ?? this.factory()
  }

  release(item: T): void {
    this.available.push(item)
  }

  drain(destroy?: (item: T) => void): void {
    while (this.available.length > 0) {
      const item = this.available.pop()
      if (item !== undefined) {
        destroy?.(item)
      }
    }
  }
}
