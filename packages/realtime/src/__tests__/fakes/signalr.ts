/**
 * Controllable stand-in for @microsoft/signalr (mapped in jest.config.js). Every built connection is recorded in
 * `fakeSignalR.connections`; tests drive server pushes, automatic reconnects and closes through it.
 */

export enum HubConnectionState {
  Disconnected = 'Disconnected',
  Connecting = 'Connecting',
  Connected = 'Connected',
  Disconnecting = 'Disconnecting',
  Reconnecting = 'Reconnecting',
}

export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Information = 2,
  Warning = 3,
  Error = 4,
  Critical = 5,
  None = 6,
}

export interface FakeConnectionOptions {
  accessTokenFactory?: () => string | Promise<string>;
}

type Callback = (...args: unknown[]) => void;
type StartBehavior = 'ok' | Error | (() => Promise<void>);
type InvokeImpl = (method: string, args: unknown[], connection: FakeHubConnection) => unknown;

export class FakeHubConnection {
  public state: HubConnectionState = HubConnectionState.Disconnected;
  public connectionId: string | null = null;
  public readonly handlers = new Map<string, Set<Callback>>();
  public readonly closeCallbacks: Callback[] = [];
  public readonly reconnectingCallbacks: Callback[] = [];
  public readonly reconnectedCallbacks: Callback[] = [];
  public readonly invocations: { method: string; args: unknown[] }[] = [];
  public readonly tokensSeen: string[] = [];
  public stopCalls = 0;

  constructor(
    public readonly url: string,
    public readonly options: FakeConnectionOptions,
    public readonly automaticReconnect: readonly number[] | null,
    public readonly serverTimeoutMs: number | null,
    public readonly logLevel: LogLevel | null
  ) {}

  on(method: string, handler: Callback): void {
    const set = this.handlers.get(method) ?? new Set<Callback>();
    set.add(handler);
    this.handlers.set(method, set);
  }

  off(method: string, handler?: Callback): void {
    if (!handler) {
      this.handlers.delete(method);
      return;
    }
    this.handlers.get(method)?.delete(handler);
  }

  onclose(callback: Callback): void {
    this.closeCallbacks.push(callback);
  }

  onreconnecting(callback: Callback): void {
    this.reconnectingCallbacks.push(callback);
  }

  onreconnected(callback: Callback): void {
    this.reconnectedCallbacks.push(callback);
  }

  async start(): Promise<void> {
    this.state = HubConnectionState.Connecting;
    await this.readToken();
    const behavior = fakeSignalR.startBehaviors.shift() ?? 'ok';
    try {
      if (behavior instanceof Error) throw behavior;
      if (typeof behavior === 'function') await behavior();
    } catch (error) {
      this.state = HubConnectionState.Disconnected;
      throw error;
    }
    this.state = HubConnectionState.Connected;
    this.connectionId = `conn-${fakeSignalR.connections.indexOf(this)}`;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    if (this.state === HubConnectionState.Disconnected) return;
    this.state = HubConnectionState.Disconnected;
    this.closeCallbacks.forEach((callback) => callback(undefined));
  }

  async invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    this.invocations.push({ method, args });
    if (this.state !== HubConnectionState.Connected) {
      throw new Error(`Cannot send data if the connection is not in the 'Connected' State.`);
    }
    return (await fakeSignalR.invokeImpl(method, args, this)) as T;
  }

  // ---- test controls ----

  /** What the transport would send as the bearer token right now (the client calls the factory per transport connect). */
  async readToken(): Promise<string> {
    const token = this.options.accessTokenFactory ? await this.options.accessTokenFactory() : '';
    this.tokensSeen.push(token);
    return token;
  }

  /** A server → client message. */
  serverPush(method: string, ...args: unknown[]): void {
    this.handlers.get(method)?.forEach((handler) => handler(...args));
  }

  /** The transport dropped and the client's automatic reconnect started. */
  simulateReconnecting(error?: Error): void {
    this.state = HubConnectionState.Reconnecting;
    this.reconnectingCallbacks.forEach((callback) => callback(error));
  }

  /** The automatic reconnect succeeded (re-reads the token like the real client). */
  async simulateReconnected(): Promise<void> {
    await this.readToken();
    this.state = HubConnectionState.Connected;
    this.connectionId = `${this.connectionId ?? 'conn'}-r`;
    this.reconnectedCallbacks.forEach((callback) => callback(this.connectionId));
  }

  /** The connection closed for good (automatic reconnect gave up, or the server closed on token expiry). */
  simulateClose(error?: Error): void {
    this.state = HubConnectionState.Disconnected;
    this.closeCallbacks.forEach((callback) => callback(error));
  }

  invocationsOf(method: string): unknown[][] {
    return this.invocations.filter((invocation) => invocation.method === method).map((invocation) => invocation.args);
  }
}

export type HubConnection = FakeHubConnection;

export class HubConnectionBuilder {
  private url = '';
  private options: FakeConnectionOptions = {};
  private reconnect: readonly number[] | null = null;
  private serverTimeout: number | null = null;
  private logLevel: LogLevel | null = null;

  withUrl(url: string, options?: FakeConnectionOptions): this {
    this.url = url;
    this.options = options ?? {};
    return this;
  }

  withAutomaticReconnect(delays?: readonly number[]): this {
    this.reconnect = delays ?? [0, 2000, 10000, 30000];
    return this;
  }

  withServerTimeout(ms: number): this {
    this.serverTimeout = ms;
    return this;
  }

  configureLogging(level: LogLevel): this {
    this.logLevel = level;
    return this;
  }

  build(): FakeHubConnection {
    const connection = new FakeHubConnection(this.url, this.options, this.reconnect, this.serverTimeout, this.logLevel);
    fakeSignalR.connections.push(connection);
    return connection;
  }
}

const defaultInvoke: InvokeImpl = () => undefined;

export const fakeSignalR = {
  connections: [] as FakeHubConnection[],
  /** Consumed one per `start()`; empty means success. */
  startBehaviors: [] as StartBehavior[],
  invokeImpl: defaultInvoke,
  reset(): void {
    this.connections.length = 0;
    this.startBehaviors.length = 0;
    this.invokeImpl = defaultInvoke;
  },
  /** Connections built for a hub path (`.../eventingHub`). */
  forHub(hubName: string): FakeHubConnection[] {
    return this.connections.filter((connection) => connection.url.split('?')[0].endsWith(`/${hubName}`));
  },
  latest(hubName: string): FakeHubConnection {
    const list = this.forHub(hubName);
    const connection = list[list.length - 1];
    if (!connection) throw new Error(`No connection built for ${hubName}`);
    return connection;
  },
};
