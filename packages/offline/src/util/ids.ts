import { getRandomBytes, randomUUID } from 'expo-crypto';

/** Client UUID (v4). Outbox event ids are generated once and reused as the idempotency key on every retry. */
export function generateUuid(): string {
  return randomUUID();
}

export function generateRandomBytes(count: number): Uint8Array {
  return getRandomBytes(count);
}

export type IdGenerator = () => string;
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
