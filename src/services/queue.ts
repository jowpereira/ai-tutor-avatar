export interface QueueItem<T> { item: T; priority: number; insertedAt: number; }

export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];
  push(item: T, priority = 0) {
    this.items.push({ item, priority, insertedAt: Date.now() });
    this.items.sort((a, b) => b.priority - a.priority || a.insertedAt - b.insertedAt);
  }
  drain(): T[] {
    const out = this.items.map((q) => q.item);
    this.items = [];
    return out;
  }
  size() {
    return this.items.length;
  }
}
