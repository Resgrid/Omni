/** Rejects with a descriptive error when `promise` has not settled within `ms` (Unit livekit-store). The work itself is not cancelled. */
export const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new VoiceTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

export class VoiceTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number
  ) {
    super(`${label} timed out after ${ms / 1000}s`);
    this.name = 'VoiceTimeoutError';
  }
}

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a side effect whose failure must never break the caller (sounds, routing, CallKeep, FGS). */
export const settle = async (work: () => Promise<unknown> | unknown, onError: (error: unknown) => void): Promise<void> => {
  try {
    await work();
  } catch (error) {
    onError(error);
  }
};

export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') return (error as { message: string }).message;
  return 'Unknown error';
};

export const errorName = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'name' in error && typeof (error as { name: unknown }).name === 'string' ? (error as { name: string }).name : null;

/** RFC 4122 v4 id: `crypto.randomUUID` (Hermes/JSI, browsers) with the legacy Math.random fallback. */
export const generateUuid = (): string => {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const fromCrypto = cryptoLike?.randomUUID?.();
  if (typeof fromCrypto === 'string') return fromCrypto;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
