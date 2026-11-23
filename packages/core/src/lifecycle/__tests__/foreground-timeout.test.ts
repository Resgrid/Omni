// A timeout that only counts with the app in front: a member answering an OS permission prompt or Android's
// "Allow all the time" Settings page is never mistaken for a request that hung.
import { BROWSER_PROMPT_TIMEOUT_MS, FOREGROUND_TIMED_OUT, settleWithinForeground } from '../foreground-timeout';

jest.mock('react-native', () => {
  const handlers: ((state: string) => void)[] = [];

  const AppState = {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
      handlers.push(handler);

      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    }),
    // As React Native does: currentState first, then the listeners.
    mockEmit: (state: string) => {
      AppState.currentState = state;
      [...handlers].forEach((handler) => handler(state));
    },
    mockCount: () => handlers.length,
  };

  return { Platform: { OS: 'android' }, AppState };
});

interface MockReactNative {
  Platform: { OS: string };
  AppState: { currentState: string; addEventListener: jest.Mock; mockEmit: (state: string) => void; mockCount: () => number };
}

// SAFETY: the factory above builds exactly this shape.
const rnState = jest.requireMock('react-native') as MockReactNative;

const MS = 1_000;

interface Deferred {
  promise: Promise<string>;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

const deferred = (): Deferred => {
  let resolve: (value: string) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;

  const promise = new Promise<string>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.useFakeTimers();
  rnState.Platform.OS = 'android';
  rnState.AppState.currentState = 'active';
  rnState.AppState.addEventListener.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('settleWithinForeground', () => {
  it('passes the value through and releases its listener and timer', async () => {
    const pending = deferred();
    const result = settleWithinForeground(pending.promise, MS);
    expect(rnState.AppState.mockCount()).toBe(1);

    pending.resolve('granted');
    await expect(result).resolves.toBe('granted');
    expect(rnState.AppState.mockCount()).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('passes a rejection through and releases its listener', async () => {
    const pending = deferred();
    const result = settleWithinForeground(pending.promise, MS);

    pending.reject(new Error('request failed'));
    await expect(result).rejects.toThrow('request failed');
    expect(rnState.AppState.mockCount()).toBe(0);
  });

  it('times out a request that never settles while the app stays in front', async () => {
    const result = settleWithinForeground(deferred().promise, MS);

    await jest.advanceTimersByTimeAsync(MS);
    await expect(result).resolves.toBe(FOREGROUND_TIMED_OUT);
    expect(rnState.AppState.mockCount()).toBe(0);
  });

  it('does not count time behind the OS prompt or Settings, and restarts the full window on return', async () => {
    const pending = deferred();
    let settled: string | symbol | null = null;
    void settleWithinForeground(pending.promise, MS).then((value) => {
      settled = value;
    });

    await jest.advanceTimersByTimeAsync(MS - 100);
    rnState.AppState.mockEmit('background');
    await jest.advanceTimersByTimeAsync(MS * 120);
    expect(settled).toBeNull();

    rnState.AppState.mockEmit('active');
    await jest.advanceTimersByTimeAsync(MS - 100);
    expect(settled).toBeNull();

    pending.resolve('granted');
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe('granted');
  });

  it('treats iOS "inactive" (the system alert) as behind the system', async () => {
    rnState.Platform.OS = 'ios';
    const result = settleWithinForeground(deferred().promise, MS);

    rnState.AppState.mockEmit('inactive');
    await jest.advanceTimersByTimeAsync(MS * 10);
    rnState.AppState.mockEmit('active');
    await jest.advanceTimersByTimeAsync(MS);
    await expect(result).resolves.toBe(FOREGROUND_TIMED_OUT);
  });

  it('keeps counting through a repeated "active"', async () => {
    const result = settleWithinForeground(deferred().promise, MS);

    await jest.advanceTimersByTimeAsync(MS / 2);
    rnState.AppState.mockEmit('active');
    await jest.advanceTimersByTimeAsync(MS / 2);
    await expect(result).resolves.toBe(FOREGROUND_TIMED_OUT);
  });

  it('waits for the app to come to the front when started behind the system', async () => {
    rnState.AppState.currentState = 'background';
    let settled: string | symbol | null = null;
    void settleWithinForeground(deferred().promise, MS).then((value) => {
      settled = value;
    });

    await jest.advanceTimersByTimeAsync(MS * 10);
    expect(settled).toBeNull();

    rnState.AppState.mockEmit('active');
    await jest.advanceTimersByTimeAsync(MS);
    expect(settled).toBe(FOREGROUND_TIMED_OUT);
  });

  it('uses a plain timer on web, without an AppState listener', async () => {
    rnState.Platform.OS = 'web';
    const result = settleWithinForeground(deferred().promise, MS);
    expect(rnState.AppState.addEventListener).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(MS);
    await expect(result).resolves.toBe(FOREGROUND_TIMED_OUT);
  });
});

describe('settleWithinForeground on web, for a browser permission', () => {
  // The browser's prompt leaves the page in front: while the member may be answering it (the permission undecided, or
  // the page without focus under a system dialog) the limit is BROWSER_PROMPT_TIMEOUT_MS; decided and in focus, `ms`.
  const fakeStatus = (initial: PermissionState) => {
    const listeners = new Set<() => void>();

    return {
      state: initial,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      mockSet(next: PermissionState) {
        this.state = next;
        [...listeners].forEach((listener) => listener());
      },
      mockCount: () => listeners.size,
    };
  };

  const pageListeners = new Map<string, Set<() => void>>();

  const page = {
    addEventListener: (type: string, listener: () => void) => pageListeners.set(type, (pageListeners.get(type) ?? new Set()).add(listener)),
    removeEventListener: (type: string, listener: () => void) => pageListeners.get(type)?.delete(listener),
    mockEmit: (type: 'focus' | 'blur') => [...(pageListeners.get(type) ?? [])].forEach((listener) => listener()),
    mockCount: () => [...pageListeners.values()].reduce((count, set) => count + set.size, 0),
  };

  const browserDocument = { focused: true, hasFocus: () => browserDocument.focused };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const query = jest.fn();

  interface FakeNavigator {
    permissions?: { query: jest.Mock };
  }

  const setGlobal = (name: 'navigator' | 'window' | 'document', value: FakeNavigator | typeof page | typeof browserDocument): void => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };

  interface Settled {
    value: string | symbol | null;
  }

  const track = (result: Promise<string | symbol>): Settled => {
    const settled: Settled = { value: null };
    void result.then((value) => {
      settled.value = value;
    });

    return settled;
  };

  beforeEach(() => {
    rnState.Platform.OS = 'web';
    browserDocument.focused = true;
    pageListeners.clear();
    query.mockReset();
    setGlobal('navigator', { permissions: { query } });
    setGlobal('window', page);
    setGlobal('document', browserDocument);
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');

    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });

  it('waits for a slow answer to the browser prompt, well past the short limit', async () => {
    const status = fakeStatus('prompt');
    query.mockResolvedValue(status);
    const pending = deferred();
    const settled = track(settleWithinForeground(pending.promise, MS, 'microphone'));
    await jest.advanceTimersByTimeAsync(0);
    expect(query).toHaveBeenCalledWith({ name: 'microphone' });

    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS - 100);
    expect(settled.value).toBeNull();

    status.mockSet('granted');
    pending.resolve('granted');
    await jest.advanceTimersByTimeAsync(0);
    expect(settled.value).toBe('granted');
    expect(status.mockCount()).toBe(0);
    expect(page.mockCount()).toBe(0);
    expect(rnState.AppState.addEventListener).not.toHaveBeenCalled();
  });

  it('still times out a prompt left unanswered, after BROWSER_PROMPT_TIMEOUT_MS', async () => {
    query.mockResolvedValue(fakeStatus('prompt'));
    const settled = track(settleWithinForeground(deferred().promise, MS, 'microphone'));

    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS - 1);
    expect(settled.value).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(settled.value).toBe(FOREGROUND_TIMED_OUT);
  });

  it('counts the short limit from the answer when the request still hangs after it', async () => {
    const status = fakeStatus('prompt');
    query.mockResolvedValue(status);
    const settled = track(settleWithinForeground(deferred().promise, MS, 'microphone'));

    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS / 2);
    status.mockSet('granted');
    await jest.advanceTimersByTimeAsync(MS - 1);
    expect(settled.value).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(settled.value).toBe(FOREGROUND_TIMED_OUT);
  });

  it('keeps the short limit when the permission is already decided: nothing waits on the member', async () => {
    query.mockResolvedValue(fakeStatus('granted'));
    const settled = track(settleWithinForeground(deferred().promise, MS, 'microphone'));

    await jest.advanceTimersByTimeAsync(MS);
    expect(settled.value).toBe(FOREGROUND_TIMED_OUT);
  });

  it('gives the prompt limit when the browser cannot say (no Permissions API, or a name it does not know)', async () => {
    query.mockRejectedValue(new TypeError("'microphone' is not a valid value for enumeration PermissionName"));
    const unknownName = track(settleWithinForeground(deferred().promise, MS, 'microphone'));

    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS - 1);
    expect(unknownName.value).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(unknownName.value).toBe(FOREGROUND_TIMED_OUT);

    setGlobal('navigator', {});
    const noApi = track(settleWithinForeground(deferred().promise, MS, 'microphone'));
    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS - 1);
    expect(noApi.value).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(noApi.value).toBe(FOREGROUND_TIMED_OUT);
  });

  it('treats a status it cannot watch as unknown, and still passes the answer through', async () => {
    query.mockResolvedValue({ state: 'granted' });
    const pending = deferred();
    const settled = track(settleWithinForeground(pending.promise, MS, 'microphone'));

    await jest.advanceTimersByTimeAsync(MS * 5);
    expect(settled.value).toBeNull();

    pending.resolve('granted');
    await jest.advanceTimersByTimeAsync(0);
    expect(settled.value).toBe('granted');
    expect(page.mockCount()).toBe(0);
  });

  it('treats a page without focus as answering (the system microphone dialog over Electron), and restarts on return', async () => {
    query.mockResolvedValue(fakeStatus('granted'));
    const settled = track(settleWithinForeground(deferred().promise, MS, 'microphone'));
    await jest.advanceTimersByTimeAsync(0);

    browserDocument.focused = false;
    page.mockEmit('blur');
    await jest.advanceTimersByTimeAsync(BROWSER_PROMPT_TIMEOUT_MS - 100);
    expect(settled.value).toBeNull();

    browserDocument.focused = true;
    page.mockEmit('focus');
    await jest.advanceTimersByTimeAsync(MS - 1);
    expect(settled.value).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(settled.value).toBe(FOREGROUND_TIMED_OUT);
  });
});
