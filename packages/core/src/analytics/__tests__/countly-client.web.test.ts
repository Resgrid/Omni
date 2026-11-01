import { countlyClient, resetWebCountlyForTests } from '../countly-client.web';

describe('web Countly sender (Dispatch/BigBoard)', () => {
  const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
  const store = new Map<string, string>();

  beforeEach(() => {
    resetWebCountlyForTests();
    fetchMock.mockClear();
    store.clear();
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } },
      configurable: true,
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true, writable: true });
  });

  it('sends nothing before init', () => {
    countlyClient.recordEvent('a', {}, 1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts events to /i in the request body (never in the URL) with a persisted device id', async () => {
    await countlyClient.init('app-key', 'https://countly.example.com/', { loggingEnabled: false });
    countlyClient.recordEvent('call_viewed', { callId: '1' }, 1);
    countlyClient.recordEvent('call_viewed', { callId: '2' }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: URLSearchParams; keepalive: boolean }];
    expect(url).toBe('https://countly.example.com/i');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.body.get('app_key')).toBe('app-key');
    expect(JSON.parse(init.body.get('events') ?? '[]')).toEqual([{ key: 'call_viewed', count: 1, segmentation: { callId: '1' } }]);
    const deviceId = init.body.get('device_id');
    expect(deviceId).toBeTruthy();
    const second = fetchMock.mock.calls[1] as unknown as [string, { body: URLSearchParams }];
    expect(second[1].body.get('device_id')).toBe(deviceId);
  });

  it('never throws, even when storage and fetch fail', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          getItem: () => {
            throw new Error('denied');
          },
        },
      },
      configurable: true,
      writable: true,
    });
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect(() => countlyClient.recordEvent('a', {}, 1)).not.toThrow();
    expect(() => countlyClient.setUserData({ a: 'b' })).not.toThrow();
    expect(() => countlyClient.endSession()).not.toThrow();
  });
});
