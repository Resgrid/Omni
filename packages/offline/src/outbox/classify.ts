import type { OutboxError, OutboxErrorClass } from './types';

interface ErrorShape {
  response?: { status?: unknown };
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  isAxiosError?: unknown;
  request?: unknown;
}

const asShape = (error: unknown): ErrorShape => (error !== null && typeof error === 'object' ? (error as ErrorShape) : {});

/** HTTP status from an axios-style (`response.status`) or fetch-style (`status`) error. */
export function getHttpStatus(error: unknown): number | undefined {
  const shape = asShape(error);
  const candidates = [shape.response?.status, shape.status, shape.statusCode];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate >= 100 && candidate < 600) return candidate;
  }
  return undefined;
}

const NETWORK_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_CANCELED']);

/** True when the request never got an HTTP answer (no network, DNS, timeout, aborted). */
export function isNetworkError(error: unknown): boolean {
  if (getHttpStatus(error) !== undefined) return false;
  const shape = asShape(error);
  if (typeof shape.code === 'string' && NETWORK_CODES.has(shape.code)) return true;
  if (shape.isAxiosError === true && shape.response === undefined) return true;
  const message = typeof shape.message === 'string' ? shape.message : '';
  return message === 'Network Error' || message === 'Network request failed' || message === 'Failed to fetch';
}

/**
 * Default classification (Unit's rules): 401 → auth (refresh then resend); 408/429 → retry;
 * other 4xx → permanent; 5xx → retry; no answer → network; anything else → retry.
 */
export function defaultClassify(error: unknown): OutboxErrorClass {
  const status = getHttpStatus(error);
  if (status === 401) return 'auth';
  if (status === 408 || status === 429) return 'retry';
  if (status !== undefined && status >= 400 && status < 500) return 'permanent';
  if (status !== undefined && status >= 500) return 'retry';
  if (isNetworkError(error)) return 'network';
  return 'retry';
}

const MAX_MESSAGE_LENGTH = 300;

/** What is stored as `lastError`: status, code and a short message — never request or response bodies. */
export function toOutboxError(error: unknown): OutboxError {
  const shape = asShape(error);
  const status = getHttpStatus(error);
  const code = typeof shape.code === 'string' ? shape.code : undefined;
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const message = rawMessage.length > MAX_MESSAGE_LENGTH ? `${rawMessage.slice(0, MAX_MESSAGE_LENGTH)}…` : rawMessage;
  return { ...(status !== undefined ? { status } : {}), ...(code !== undefined ? { code } : {}), message };
}
