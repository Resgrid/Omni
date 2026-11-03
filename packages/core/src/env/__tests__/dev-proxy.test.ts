import { buildDevProxyUrl, DEV_PROXY_PREFIX, isDevProxyActive, toDevProxyUrl } from '../dev-proxy';

const mockPlatformOS = jest.fn<string, []>();

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS();
    },
  },
}));

interface PageWindow {
  location: { origin: string; hostname: string };
}

const setDev = (value: boolean | undefined) => Object.defineProperty(globalThis, '__DEV__', { value, writable: true, configurable: true });
const setWindow = (value: PageWindow | undefined) => Object.defineProperty(globalThis, 'window', { value, writable: true, configurable: true });

const openPage = (origin: string) => setWindow({ location: { origin, hostname: new URL(origin).hostname } });

describe('buildDevProxyUrl', () => {
  // The same literal the Metro side parses (apps/omni/__tests__/dev-api-proxy.test.ts).
  it('puts the scheme and host in the path on the page origin', () => {
    expect(buildDevProxyUrl('http://localhost:8081', 'https://api.resgrid.com/api/v4/connect/token?x=1')).toBe('http://localhost:8081/__resgrid-dev-proxy/https/api.resgrid.com/api/v4/connect/token?x=1');
    expect(DEV_PROXY_PREFIX).toBe('/__resgrid-dev-proxy');
  });

  it('keeps ports, lower-cases scheme and host, and adds the root path a bare origin lacks', () => {
    expect(buildDevProxyUrl('http://localhost:8081', 'HTTPS://QAAPI.Resgrid.dev:8443')).toBe('http://localhost:8081/__resgrid-dev-proxy/https/qaapi.resgrid.dev:8443/');
    expect(buildDevProxyUrl('http://localhost:8081', 'https://events.resgrid.com?hub=1')).toBe('http://localhost:8081/__resgrid-dev-proxy/https/events.resgrid.com/?hub=1');
  });

  it('leaves relative, non-http and same-origin URLs alone (a proxied URL is never proxied twice)', () => {
    expect(buildDevProxyUrl('http://localhost:8081', '/api/v4/Calls')).toBe('/api/v4/Calls');
    expect(buildDevProxyUrl('http://localhost:8081', 'blob:http://localhost:8081/abc')).toBe('blob:http://localhost:8081/abc');
    expect(buildDevProxyUrl('http://localhost:8081', 'pmtiles://https://x/y.pmtiles')).toBe('pmtiles://https://x/y.pmtiles');

    const once = buildDevProxyUrl('http://localhost:8081', 'https://api.resgrid.com/api/v4');

    expect(buildDevProxyUrl('http://localhost:8081', once)).toBe(once);
  });
});

describe('toDevProxyUrl', () => {
  beforeEach(() => {
    setDev(true);
    mockPlatformOS.mockReturnValue('web');
  });
  afterEach(() => {
    setWindow(undefined);
    setDev(undefined);
  });

  it('routes a web development build on localhost through the dev server', () => {
    openPage('http://localhost:8082');
    expect(isDevProxyActive()).toBe(true);
    expect(toDevProxyUrl('https://qaapi.resgrid.dev/api/v4')).toBe('http://localhost:8082/__resgrid-dev-proxy/https/qaapi.resgrid.dev/api/v4');

    openPage('http://127.0.0.1:8081');
    expect(toDevProxyUrl('https://qaapi.resgrid.dev/api/v4')).toBe('http://127.0.0.1:8081/__resgrid-dev-proxy/https/qaapi.resgrid.dev/api/v4');
  });

  it('calls servers directly from a page served from elsewhere (a phone on the LAN, a deployed web app)', () => {
    openPage('http://192.168.1.20:8081');
    expect(isDevProxyActive()).toBe(false);
    expect(toDevProxyUrl('https://qaapi.resgrid.dev/api/v4')).toBe('https://qaapi.resgrid.dev/api/v4');
  });

  it('calls servers directly outside development and on native', () => {
    openPage('http://localhost:8081');
    setDev(false);
    expect(toDevProxyUrl('https://api.resgrid.com/api/v4')).toBe('https://api.resgrid.com/api/v4');

    setDev(true);
    mockPlatformOS.mockReturnValue('ios');
    expect(isDevProxyActive()).toBe(false);
    expect(toDevProxyUrl('https://api.resgrid.com/api/v4')).toBe('https://api.resgrid.com/api/v4');
  });
});
