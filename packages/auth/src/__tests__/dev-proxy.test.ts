import { refreshEngine, useAuthStore } from '../session/auth-store';
import { getBaseApiUrl } from '../session/server-url';
import { Platform } from './fakes/react-native';
import { DEFAULT_API_URL, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

interface PageWindow {
  location: { origin: string; hostname: string };
}

const setDev = (value: boolean | undefined) => Object.defineProperty(globalThis, '__DEV__', { value, writable: true, configurable: true });
const setWindow = (value: PageWindow | undefined) => Object.defineProperty(globalThis, 'window', { value, writable: true, configurable: true });

// A web development build on localhost is on no server's CORS allowlist: the API context sends it through the dev
// server's proxy (apps/omni/metro/dev-api-proxy.js) and leaves the stored server as it is.
describe('sign-in from a web development build', () => {
  beforeEach(() => {
    Platform.OS = 'web';
    setDev(true);
    setWindow({ location: { origin: 'http://localhost:8081', hostname: 'localhost' } });
  });
  afterEach(() => {
    refreshEngine.endSession();
    Platform.OS = 'ios';
    setDev(undefined);
    setWindow(undefined);
  });

  it('goes through the dev server to the stored server', async () => {
    const h = setupHarness('dispatch');

    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });

    const [request] = h.server.requestsTo('POST', '/connect/token');

    expect(request.baseURL).toBe('http://localhost:8081/__resgrid-dev-proxy/https/api.resgrid.com/api/v4');
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(getBaseApiUrl()).toBe(DEFAULT_API_URL);
  });
});
