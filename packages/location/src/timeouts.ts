export const TIMED_OUT: unique symbol = Symbol('location-timed-out');

/**
 * Resolves with the promise's value, or `TIMED_OUT` when it has not settled within `ms` (Responder). The timer is
 * cleared either way: a pending one keeps a Jest fake-timer test from settling and holds a needless reference.
 */
export const settleWithin = <T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
