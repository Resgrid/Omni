/**
 * Promise-chain mutex. Serializes async critical sections (database statements, transactions,
 * drain passes) so no two interleave on the single connection.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
