// livekit-client fake: rooms whose connect can be held/failed by tests, with real event wiring.
export enum RoomEvent {
  ActiveSpeakersChanged = 'activeSpeakersChanged',
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  ParticipantDisconnected = 'participantDisconnected',
  Reconnected = 'reconnected',
  Reconnecting = 'reconnecting',
  TrackSubscribed = 'trackSubscribed',
  TrackUnsubscribed = 'trackUnsubscribed',
}

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

export const Track = { Kind: { Audio: 'audio', Video: 'video' } };

type Handler = (...args: any[]) => void;

export class FakeLocalParticipant {
  identity = 'local';
  sid = 'local-sid';
  isMicrophoneEnabled = false;
  setMicrophoneEnabled = jest.fn(async (enabled: boolean) => {
    this.isMicrophoneEnabled = enabled;
  });
  setCameraEnabled = jest.fn(async () => undefined);
}

export class Room {
  static instances: Room[] = [];
  /** Next connect behaviour for newly created rooms: 'resolve' (default), 'hold' (pending until resolveConnect) or an Error. */
  static nextConnect: ('resolve' | 'hold' | Error)[] = [];

  state: ConnectionState = ConnectionState.Disconnected;
  localParticipant = new FakeLocalParticipant();
  private handlers = new Map<string, Set<Handler>>();
  private pending: { resolve: () => void; reject: (error: unknown) => void } | null = null;

  connect = jest.fn((_url: string, _token: string) => {
    const behaviour = Room.nextConnect.shift() ?? 'resolve';
    if (behaviour instanceof Error) return Promise.reject(behaviour);
    if (behaviour === 'hold') {
      return new Promise<void>((resolve, reject) => {
        this.pending = {
          resolve: () => {
            this.state = ConnectionState.Connected;
            resolve();
          },
          reject,
        };
      });
    }
    this.state = ConnectionState.Connected;
    return Promise.resolve();
  });

  disconnect = jest.fn(async () => {
    this.state = ConnectionState.Disconnected;
    this.emit(RoomEvent.Disconnected);
  });

  /** Runs for every new room (tests adjust its mocks before the store uses it). */
  static onCreate: ((room: Room) => void) | null = null;

  constructor() {
    Room.instances.push(this);
    Room.onCreate?.(this);
  }

  resolveConnect(): void {
    this.pending?.resolve();
    this.pending = null;
  }

  on(event: string, handler: Handler): this {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler: Handler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  emit(event: string, ...args: any[]): void {
    [...(this.handlers.get(event) ?? [])].forEach((handler) => handler(...args));
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  static reset(): void {
    Room.instances = [];
    Room.nextConnect = [];
    Room.onCreate = null;
  }
}

export type Participant = { sid: string; identity: string };
export type RemoteTrack = { kind: string; sid: string; attach: () => any; detach: () => any[] };
export type RemoteTrackPublication = { trackSid: string };
