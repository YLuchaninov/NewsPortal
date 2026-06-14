export type SettledTaskResult<T, R> =
  | {
      item: T;
      status: "fulfilled";
      value: R;
    }
  | {
      item: T;
      status: "rejected";
      reason: unknown;
    };

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<Array<SettledTaskResult<T, R>>> {
  if (items.length === 0) {
    return [];
  }

  const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
  const results: Array<SettledTaskResult<T, R>> = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      const item = items[currentIndex];
      try {
        results[currentIndex] = {
          item,
          status: "fulfilled",
          value: await task(item, currentIndex)
        };
      } catch (reason) {
        results[currentIndex] = {
          item,
          status: "rejected",
          reason
        };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
