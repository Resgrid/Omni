import { resetEnvForTests } from '../../env/env';
import { countlyClient, resetWebCountlyForTests } from '../countly-client.web';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { version: { version: '8.12', buildNumber: 10012 } } } } }));

type Listener = (event?: unknown) => void;
type PostInit = { method: string; body: URLSearchParams; keepalive: boolean };

describe('web Countly sender (Dispatch/BigBoard)', () => {
  const fetchMock = jest.fn((_url: string, _init: PostInit) => Promise.resolve({ ok: true }));
  const store = new Map<string, string>();
  const windowListeners = new Map<string, Listener>();
  const documentListeners = new Map<string, Listener>();
  const page = { visibilityState: 'visible' };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const define = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const bodies = (): URLSearchParams[] => fetchMock.mock.calls.map(([, init]) => init.body);
  const lastBody = (): URLSearchParams => bodies()[bodies().length - 1];
  const eventsIn = (body: URLSearchParams): Record<string, unknown>[] => JSON.parse(body.get('events') ?? '[]') as Record<string, unknown>[];

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-02T14:00:00Z') });
    resetWebCountlyForTests();
    resetEnvForTests();
    fetchMock.mockClear();
    store.clear();
    windowListeners.clear();
    documentListeners.clear();
    page.visibilityState = 'visible';
    define('fetch', fetchMock);
    define('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      screen: { width: 1920, height: 1080 },
      devicePixelRatio: 2,
      addEventListener: (type: string, listener: Listener) => windowListeners.set(type, listener),
      removeEventListener: (type: string) => windowListeners.delete(type),
    });
    define('document', {
      get visibilityState() {
        return page.visibilityState;
      },
      addEventListener: (type: string, listener: Listener) => documentListeners.set(type, listener),
      removeEventListener: (type: string) => documentListeners.delete(type),
    });
    define('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/142.0', language: 'de-DE' });
  });

  afterEach(() => {
    resetWebCountlyForTests();
    jest.useRealTimers();
  });

  afterAll(() => {
    define('window', undefined);
    define('document', undefined);
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  });

  it('sends nothing before init', () => {
    countlyClient.recordEvent('a', {}, 1);
    countlyClient.recordView('/a', {});
    countlyClient.appLoaded();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('begins a session with device metrics at init, posted to /i in the body (never in the URL)', async () => {
    await countlyClient.init('app-key', 'https://countly.example.com/', { loggingEnabled: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://countly.example.com/i');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    const body = init.body;
    expect(body.get('app_key')).toBe('app-key');
    expect(body.get('device_id')).toBeTruthy();
    expect(body.get('begin_session')).toBe('1');
    expect(body.get('sdk_name')).toBe('resgrid-omni-web');
    expect(body.get('timestamp')).toBe(String(Date.now()));
    expect(body.get('hour')).toBe(String(new Date().getHours()));
    expect(body.get('dow')).toBe(String(new Date().getDay()));
    expect(body.get('tz')).toBe(String(-new Date().getTimezoneOffset()));
    expect(JSON.parse(body.get('metrics') ?? '{}')).toEqual({ _app_version: '8.12', _ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/142.0', _locale: 'de-DE', _resolution: '1920x1080', _density: '2' });
  });

  it('posts events with their time and the same persisted device id', async () => {
    await countlyClient.init('app-key', 'https://countly.example.com', { loggingEnabled: false });
    countlyClient.recordEvent('call_viewed', { callId: '1' }, 1);
    countlyClient.recordEvent('call_viewed', { callId: '2' }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(eventsIn(bodies()[1])).toEqual([{ key: 'call_viewed', count: 1, segmentation: { callId: '1' }, timestamp: Date.now(), hour: new Date().getHours(), dow: new Date().getDay() }]);
    const deviceIds = new Set(bodies().map((body) => body.get('device_id')));
    expect(deviceIds.size).toBe(1);
  });

  it('records views: the first of the session is marked as the start, and each view change reports the duration of the last', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    countlyClient.recordView('/home', {});
    expect(eventsIn(lastBody())).toEqual([expect.objectContaining({ key: '[CLY]_view', count: 1, segmentation: { name: '/home', segment: 'Web', visit: 1, start: 1 } })]);

    jest.advanceTimersByTime(12_000);
    countlyClient.recordView('/calls/[id]', { tab: 'notes' });
    const [stop, start] = eventsIn(lastBody());
    expect(stop).toEqual(expect.objectContaining({ key: '[CLY]_view', dur: 12, segmentation: { name: '/home', segment: 'Web' } }));
    expect(start).toEqual(expect.objectContaining({ key: '[CLY]_view', segmentation: { tab: 'notes', name: '/calls/[id]', segment: 'Web', visit: 1 } }));
  });

  it('reports visible session time every minute, pauses while the page is hidden, and ends the session on page hide', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    countlyClient.recordView('/home', {});

    jest.advanceTimersByTime(60_000);
    expect(lastBody().get('session_duration')).toBe('60');

    jest.advanceTimersByTime(30_000);
    page.visibilityState = 'hidden';
    documentListeners.get('visibilitychange')?.();
    expect(lastBody().get('session_duration')).toBe('30');

    const callsWhileHidden = fetchMock.mock.calls.length;
    jest.advanceTimersByTime(5 * 60_000);
    expect(fetchMock.mock.calls.length).toBe(callsWhileHidden);

    page.visibilityState = 'visible';
    documentListeners.get('visibilitychange')?.();
    jest.advanceTimersByTime(20_000);
    windowListeners.get('pagehide')?.();

    const [viewStop, end] = bodies().slice(-2);
    expect(eventsIn(viewStop)).toEqual([expect.objectContaining({ key: '[CLY]_view', segmentation: { name: '/home', segment: 'Web' } })]);
    expect(end.get('end_session')).toBe('1');
    expect(end.get('session_duration')).toBe('20');

    const afterEnd = fetchMock.mock.calls.length;
    jest.advanceTimersByTime(5 * 60_000);
    expect(fetchMock.mock.calls.length).toBe(afterEnd);
  });

  it('starts a new session and restarts the view when the page comes back from the back/forward cache', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    countlyClient.recordView('/home', {});
    windowListeners.get('pagehide')?.();
    windowListeners.get('pageshow')?.({ persisted: true });

    const [begin, view] = bodies().slice(-2);
    expect(begin.get('begin_session')).toBe('1');
    expect(eventsIn(view)).toEqual([expect.objectContaining({ segmentation: { name: '/home', segment: 'Web', visit: 1, start: 1 } })]);
  });

  it('reports the launch time once, from navigation start', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    jest.spyOn(performance, 'now').mockReturnValue(2345.4);
    countlyClient.appLoaded();
    countlyClient.appLoaded();

    const apmBodies = bodies().filter((body) => body.has('apm'));
    expect(apmBodies).toHaveLength(1);
    expect(JSON.parse(apmBodies[0].get('apm') ?? '{}')).toEqual({ type: 'device', name: 'app_start', apm_metrics: { duration: 2345 }, stz: Date.now() - 2345, etz: Date.now() });
  });

  it('ends the signed-in session at sign-out and begins the next one', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    jest.advanceTimersByTime(10_000);
    countlyClient.endSession();
    const [end, begin] = bodies().slice(-2);
    expect(end.get('end_session')).toBe('1');
    expect(end.get('session_duration')).toBe('10');
    expect(begin.get('begin_session')).toBe('1');
  });

  it('sends custom user data', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    countlyClient.setUserData({ user_id: 'u-1' });
    expect(JSON.parse(lastBody().get('user_details') ?? '{}')).toEqual({ custom: { user_id: 'u-1' } });
  });

  it('never throws, even when storage and fetch fail', async () => {
    await countlyClient.init('k', 'https://c', { loggingEnabled: false });
    define('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
      },
    });
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect(() => countlyClient.recordEvent('a', {}, 1)).not.toThrow();
    expect(() => countlyClient.recordView('/a', {})).not.toThrow();
    expect(() => countlyClient.setUserData({ a: 'b' })).not.toThrow();
    expect(() => countlyClient.endSession()).not.toThrow();
  });
});
