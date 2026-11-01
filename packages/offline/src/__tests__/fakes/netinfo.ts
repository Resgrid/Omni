// NetInfo fake: tests push state changes with __emitNetInfo().
interface FakeNetInfoState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
}

type Listener = (state: FakeNetInfoState) => void;

const listeners = new Set<Listener>();
let current: FakeNetInfoState = { isConnected: true, isInternetReachable: true, type: 'wifi' };

export function __emitNetInfo(state: Partial<FakeNetInfoState>): void {
  current = { ...current, ...state };
  listeners.forEach((listener) => listener(current));
}

export function __resetNetInfoFake(): void {
  listeners.clear();
  current = { isConnected: true, isInternetReachable: true, type: 'wifi' };
}

export function __listenerCount(): number {
  return listeners.size;
}

const NetInfo = {
  addEventListener(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  fetch(): Promise<FakeNetInfoState> {
    return Promise.resolve(current);
  },
};

export default NetInfo;
