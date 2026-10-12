/** Feature 7 — groups items into fixed-size batches for single-pass handling. */
export function toBatches<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("Batch size must be greater than zero.");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * Feature 1 — runs tasks with a bounded number in flight at once.
 *
 * Unlike a sequential loop this overlaps the network waits, so a batch of N
 * symbols costs roughly the time of the slowest few rather than the sum.
 * Results keep input order; a rejected task resolves to its error so one bad
 * symbol cannot abort the whole batch.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<{ results: R[]; errors: unknown[] }> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  const errors = new Array<unknown>(items.length).fill(undefined);
  let cursor = 0;

  async function pump(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        errors[index] = error;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, pump));
  return { results, errors };
}

/** Feature 1 — runs every batch concurrently, bounded by `batchConcurrency`. */
export async function forEachBatchConcurrently<T>(
  batches: readonly T[][],
  batchConcurrency: number,
  worker: (batch: T[], batchIndex: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, Math.min(batchConcurrency, batches.length || 1));
  let cursor = 0;

  async function pump(): Promise<void> {
    while (cursor < batches.length) {
      const index = cursor;
      cursor += 1;
      await worker(batches[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, pump));
}