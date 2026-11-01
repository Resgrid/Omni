import type { HttpClient } from '@resgrid/api';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

export interface RecordedRequest {
  method: string;
  url: string;
  baseURL: string;
  headers: Record<string, string>;
  /** Parsed body: form fields or JSON. */
  body: Record<string, unknown>;
}

export interface FakeReply {
  status?: number;
  data?: unknown;
  /** No HTTP answer at all (offline). */
  network?: boolean;
}

type Handler = (request: RecordedRequest) => FakeReply | Promise<FakeReply>;

const parseBody = (data: unknown): Record<string, unknown> => {
  if (data === undefined || data === null || data === '') {
    return {};
  }
  if (data instanceof URLSearchParams) {
    return Object.fromEntries(data.entries());
  }
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return Object.fromEntries(new URLSearchParams(data).entries());
    }
  }
  return typeof data === 'object' ? (data as Record<string, unknown>) : {};
};

/**
 * A scripted Core: routes `METHOD /path` to handlers and records every request (headers and parsed body), so tests can
 * assert what went on the wire — without any network.
 */
export class FakeServer {
  readonly requests: RecordedRequest[] = [];
  private readonly routes = new Map<string, Handler>();
  private readonly oneShots = new Map<string, Handler[]>();

  constructor(http: HttpClient) {
    http.axios.defaults.adapter = (async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(config.headers?.toJSON?.() ?? {})) {
        if (typeof value === 'string') {
          headers[name] = value;
        }
      }
      const request: RecordedRequest = { method: (config.method ?? 'get').toUpperCase(), url: config.url ?? '', baseURL: config.baseURL ?? '', headers, body: parseBody(config.data) };
      this.requests.push(request);
      const path = request.url.split('?')[0];
      const key = `${request.method} ${path}`;
      const handler = this.oneShots.get(key)?.shift() ?? this.routes.get(key);
      const reply: FakeReply = handler ? await handler(request) : { status: 404, data: { error: 'not_routed' } };
      if (reply.network) {
        throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
      }
      const response: AxiosResponse = { data: reply.data ?? {}, status: reply.status ?? 200, statusText: '', headers: {}, config };
      if (response.status >= 400) {
        throw new AxiosError(`Request failed with status code ${response.status}`, response.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, {}, response);
      }
      return response;
    }) as never;
  }

  /** Every later call to the route uses this handler (replacing the previous one). */
  on(method: string, path: string, handler: Handler | FakeReply): this {
    this.routes.set(`${method.toUpperCase()} ${path}`, typeof handler === 'function' ? handler : () => handler);
    return this;
  }

  /** The next call to the route (only) uses this handler; one-shots queue in order, before the `on()` handler. */
  once(method: string, path: string, handler: Handler | FakeReply): this {
    const key = `${method.toUpperCase()} ${path}`;
    const queue = this.oneShots.get(key) ?? [];
    queue.push(typeof handler === 'function' ? handler : () => handler);
    this.oneShots.set(key, queue);
    return this;
  }

  reset(method: string, path: string): this {
    this.routes.delete(`${method.toUpperCase()} ${path}`);
    this.oneShots.delete(`${method.toUpperCase()} ${path}`);
    return this;
  }

  requestsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method.toUpperCase() && r.url.split('?')[0] === path);
  }
}

/** A v4 envelope. */
export const v4 = <T>(data: T): { Data: T; Status: string } => ({ Data: data, Status: 'success' });
