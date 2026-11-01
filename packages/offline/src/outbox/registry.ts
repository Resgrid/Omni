import { getOfflineLogger } from '../util/logger';
import type { OutboxHandler } from './types';

export interface OutboxHandlerRegistry {
  register<P, R>(handler: OutboxHandler<P, R>): () => void;
  get(type: string): OutboxHandler | undefined;
  has(type: string): boolean;
  types(): string[];
  clear(): void;
}

export function createOutboxHandlerRegistry(): OutboxHandlerRegistry {
  const handlers = new Map<string, OutboxHandler>();
  return {
    register<P, R>(handler: OutboxHandler<P, R>) {
      if (!handler.type) throw new Error('Outbox handler needs a type.');
      if (handlers.has(handler.type)) {
        // Fast refresh re-evaluates feature modules; the newest registration wins.
        getOfflineLogger().warn({ message: 'Outbox handler replaced', context: { type: handler.type } });
      }
      const stored = handler as unknown as OutboxHandler;
      handlers.set(handler.type, stored);
      return () => {
        if (handlers.get(handler.type) === stored) handlers.delete(handler.type);
      };
    },
    get: (type) => handlers.get(type),
    has: (type) => handlers.has(type),
    types: () => Array.from(handlers.keys()),
    clear: () => handlers.clear(),
  };
}

/** Process-wide registry used by `createOutbox()` unless one is injected. */
export const defaultOutboxHandlerRegistry = createOutboxHandlerRegistry();

/**
 * Register a handler for one outbox event type (plan §8.3). Variants register only the handlers in
 * their offline scope. Returns an unregister function.
 */
export function registerOutboxHandler<P = unknown, R = unknown>(handler: OutboxHandler<P, R>): () => void {
  return defaultOutboxHandlerRegistry.register(handler);
}
