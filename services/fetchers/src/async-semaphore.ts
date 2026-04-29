export class AsyncSemaphore {
  private readonly waiting: Array<() => void> = [];
  private available: number;

  constructor(initialCapacity: number) {
    this.available = Math.max(1, Math.floor(initialCapacity) || 1);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
    this.available -= 1;
    return () => this.release();
  }

  private release(): void {
    this.available += 1;
    const next = this.waiting.shift();
    if (next) {
      next();
    }
  }
}
